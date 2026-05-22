import { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Platform, useWindowDimensions, Image,
  Animated, LayoutChangeEvent,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import Svg, { Polyline, Circle, Line, Text as SvgText } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { List } from "phosphor-react-native";
import { Colors, Spacing, Radius } from "../lib/theme";
import { getSession } from "../lib/auth";
import db from "../lib/database";
import { syncWithServer } from "../lib/sync";
import { store } from "../lib/store";

interface SalesData {
  today: number;
  yesterday: number;
  thisWeek: number;
  thisMonth: number;
  todayCount: number;
}

type ChartPeriod = "today" | "week" | "month" | "year";
interface ChartPoint { label: string; total: number; }

// Format Y-axis numbers compactly
function fmtY(n: number): string {
  if (n >= 100000) return `${(n / 1000).toFixed(0)}K`;
  if (n >= 10000) return `${(n / 1000).toFixed(1)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function SalesChart({ period, onPeriodChange, refreshKey }: {
  period: ChartPeriod;
  onPeriodChange: (p: ChartPeriod) => void;
  refreshKey?: number;
}) {
  const [data, setData] = useState<ChartPoint[]>([]);
  const [svgW, setSvgW] = useState(0);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const PAD_L = 46;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 28;
  const chartW = svgW - PAD_L - PAD_R;
  const chartH = 130;
  const svgH = chartH + PAD_T + PAD_B;

  const TABS: { key: ChartPeriod; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week",  label: "Week"  },
    { key: "month", label: "Month" },
    { key: "year",  label: "Year"  },
  ];

  const PERIOD_LABELS: Record<ChartPeriod, string> = {
    today: "Today (Hourly)",
    week: "This Week",
    month: "This Month",
    year: "This Year",
  };

  const loadData = useCallback(() => {
    if (Platform.OS === "web") {
      const demo: Record<ChartPeriod, ChartPoint[]> = {
        today: Array.from({ length: 12 }, (_, i) => ({ label: `${i * 2}h`, total: Math.round(Math.random() * 5000 + 500) })),
        week:  ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(l => ({ label: l, total: Math.round(Math.random() * 30000 + 3000) })),
        month: Array.from({ length: 30 }, (_, i) => ({ label: `${i+1}`, total: Math.round(Math.random() * 15000 + 1000) })),
        year:  ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map(l => ({ label: l, total: Math.round(Math.random() * 200000 + 10000) })),
      };
      setData(demo[period]);
      setErrMsg(null);
      return;
    }
    try {
      const now = new Date();
      let rows: ChartPoint[] = [];

      if (period === "today") {
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const raw = db.getAllSync(
          `SELECT CAST(strftime('%H', created_at/1000, 'unixepoch', 'localtime') AS INTEGER) as hr,
                  COALESCE(SUM(total),0) as total
           FROM orders WHERE created_at >= ? AND created_at IS NOT NULL AND status != 'cancelled'
           GROUP BY hr ORDER BY hr`,
          [dayStart]
        ) as { hr: number; total: number }[];
        rows = raw.map(r => ({ label: `${r.hr}h`, total: r.total }));

      } else if (period === "week") {
        // Start from Monday of current week
        const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dayOfWeek = todayMidnight.getDay(); // 0=Sun,1=Mon,...
        const diffToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const weekStart = todayMidnight.getTime() - diffToMon * 86400000;
        const raw = db.getAllSync(
          `SELECT strftime('%Y-%m-%d', created_at/1000, 'unixepoch', 'localtime') as day_str,
                  CAST(strftime('%w', created_at/1000, 'unixepoch', 'localtime') AS INTEGER) as dow,
                  COALESCE(SUM(total),0) as total
           FROM orders WHERE created_at >= ? AND created_at IS NOT NULL AND status != 'cancelled'
           GROUP BY day_str ORDER BY day_str`,
          [weekStart]
        ) as { day_str: string; dow: number; total: number }[];
        const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
        // Fill all 7 days Mon–Sun with 0 if no data
        const dayMap: Record<string, number> = {};
        raw.forEach(r => { dayMap[r.day_str] = r.total; });
        rows = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(weekStart + i * 86400000);
          const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
          const dow = d.getDay();
          return { label: days[dow], total: dayMap[key] ?? 0 };
        });

      } else if (period === "month") {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const raw = db.getAllSync(
          `SELECT CAST(strftime('%d', created_at/1000, 'unixepoch', 'localtime') AS INTEGER) as day,
                  COALESCE(SUM(total),0) as total
           FROM orders WHERE created_at >= ? AND created_at IS NOT NULL AND status != 'cancelled'
           GROUP BY day ORDER BY day`,
          [monthStart]
        ) as { day: number; total: number }[];
        rows = raw.map(r => ({ label: `${r.day}`, total: r.total }));

      } else if (period === "year") {
        const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
        const raw = db.getAllSync(
          `SELECT CAST(strftime('%m', created_at/1000, 'unixepoch', 'localtime') AS INTEGER) as mon,
                  COALESCE(SUM(total),0) as total
           FROM orders WHERE created_at >= ? AND created_at IS NOT NULL AND status != 'cancelled'
           GROUP BY mon ORDER BY mon`,
          [yearStart]
        ) as { mon: number; total: number }[];
        const months = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        rows = raw.map(r => ({ label: months[r.mon] ?? `${r.mon}`, total: r.total }));
      }

      setData(rows);
      setErrMsg(null);
    } catch (e: any) {
      console.error("[SalesChart] DB error:", e?.message ?? e);
      setErrMsg(e?.message ?? "DB error");
      setData([]);
    }
  }, [period]);

  useEffect(() => { loadData(); }, [loadData, refreshKey]);

  const max = Math.max(...data.map(d => d.total), 1);

  const effectiveData = data.length === 1
    ? [data[0], { ...data[0], label: "" }]
    : data;

  const pts = svgW > 0 ? effectiveData.map((d, i) => ({
    x: PAD_L + (effectiveData.length > 1 ? (i / (effectiveData.length - 1)) : 0.5) * chartW,
    y: PAD_T + chartH - (d.total / max) * chartH,
    label: d.label,
    total: d.total,
  })) : [];

  const polylinePoints = pts.map(p => `${p.x},${p.y}`).join(" ");

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    y: PAD_T + chartH - f * chartH,
    label: fmtY(Math.round(max * f)),
  }));

  const step = Math.ceil(effectiveData.length / 8);
  const xLabels = effectiveData
    .map((d, i) => ({ ...d, i }))
    .filter((_, i) => i % step === 0 || i === effectiveData.length - 1);

  return (
    <View
      style={[lc.wrapper, { marginHorizontal: Spacing.lg }]}
      onLayout={(e: LayoutChangeEvent) => setSvgW(e.nativeEvent.layout.width)}
    >
      {/* Period tabs */}
      <View style={lc.tabs}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[lc.tab, period === t.key && lc.tabActive]}
            onPress={() => onPeriodChange(t.key)}
          >
            <Text style={[lc.tabTxt, period === t.key && lc.tabTxtActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={lc.title}>{PERIOD_LABELS[period]}</Text>

      {errMsg ? (
        <View style={lc.empty}><Text style={[lc.emptyText, { color: "#E53935", fontSize: 11 }]}>{errMsg}</Text></View>
      ) : data.length === 0 ? (
        <View style={lc.empty}><Text style={lc.emptyText}>No sales data yet</Text></View>
      ) : svgW === 0 ? (
        <View style={lc.empty} />
      ) : (
        <Svg width={svgW} height={svgH}>
          {/* Grid lines */}
          {yTicks.map((t, i) => (
            <Line key={i} x1={PAD_L} y1={t.y} x2={svgW - PAD_R} y2={t.y} stroke="#EFEFEF" strokeWidth={1} />
          ))}
          {/* Y labels */}
          {yTicks.map((t, i) => (
            <SvgText key={i} x={PAD_L - 4} y={t.y + 4} fontSize={8} fill="#AAA" textAnchor="end">{t.label}</SvgText>
          ))}
          {/* Gradient fill area */}
          <Polyline
            points={`${pts[0]?.x ?? PAD_L},${PAD_T + chartH} ${polylinePoints} ${pts[pts.length - 1]?.x ?? svgW - PAD_R},${PAD_T + chartH}`}
            fill="rgba(26,115,200,0.08)"
            stroke="none"
          />
          {/* Line */}
          <Polyline
            points={polylinePoints}
            fill="none"
            stroke="#0A1F44"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Dots */}
          {data.length <= 15 && pts.filter((_, i) => i < data.length).map((pt, i) => (
            <Circle key={i} cx={pt.x} cy={pt.y} r={3.5} fill="#0A1F44" stroke="#fff" strokeWidth={1.5} />
          ))}
          {/* X labels */}
          {xLabels.map((d) => (
            <SvgText key={d.i} x={pts[d.i]?.x ?? 0} y={svgH - 6} fontSize={8} fill="#AAA" textAnchor="middle">
              {d.label}
            </SvgText>
          ))}
        </Svg>
      )}
    </View>
  );
}

const lc = StyleSheet.create({
  wrapper: {
    backgroundColor: "#fff",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    paddingTop: 8,
    paddingBottom: 4,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    overflow: "hidden",
  },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#F0F0F0" },
  tab: { flex: 1, paddingVertical: 8, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: "#0A1F44" },
  tabTxt: { fontSize: 12, color: "#AAA", fontWeight: "600" },
  tabTxtActive: { color: "#0A1F44" },
  title: { fontSize: 11, color: "#999", paddingHorizontal: 14, marginTop: 6, marginBottom: 2 },
  empty: { height: 130, alignItems: "center", justifyContent: "center" },
  emptyText: { color: "#AAA", fontSize: 13 },
});

// ── Side Drawer ───────────────────────────────────────────────
function DrawerMenu({ session, onClose, onNavigate }: {
  session: any; onClose: () => void; onNavigate: (r: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>("items");
  const nav = (r: string) => onNavigate(r);
  return (
    <View style={dd.drawer}>
      <View style={dd.profile}>
        <View style={dd.avatar}>
          <Text style={dd.avatarTxt}>{(session?.user?.name || session?.user?.username || "U").charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={dd.userName}>{session?.user?.name || session?.user?.username || "User"} <Text style={dd.role}>({session?.user?.role || "Admin"})</Text></Text>
        {session?.shop?.name && <Text style={dd.shopName}>{session.shop.name}</Text>}
        {session?.shop?.phone && <Text style={dd.shopInfo}>{session.shop.phone}</Text>}
      </View>
      <ScrollView style={dd.list} showsVerticalScrollIndicator={false}>
        {/* Item Management — admin only */}
        {session?.user?.role === "admin" && (
          <>
            <TouchableOpacity style={dd.section} onPress={() => setExpanded(e => e === "items" ? null : "items")}>
              <Text style={dd.secNum}>1.</Text>
              <Text style={dd.secLabel}>Item Management</Text>
              <Text style={dd.chevron}>{expanded === "items" ? "▲" : "▼"}</Text>
            </TouchableOpacity>
            {expanded === "items" && (
              <View style={dd.sub}>
                {([["Add Item","/add-item"],["List Items","/items"],["Categories","/categories"],["Portions","/portions"],["Units","/units"]] as [string,string][]).map(([l,r]) => (
                  <TouchableOpacity key={r} style={dd.subItem} onPress={() => nav(r)}><Text style={dd.subDot}>›</Text><Text style={dd.subLabel}>{l}</Text></TouchableOpacity>
                ))}
              </View>
            )}
            <View style={dd.divider} />
          </>
        )}

        <TouchableOpacity style={[dd.section, { backgroundColor: "#1a6b3c" }]} onPress={() => nav("/billing")}>
          <Text style={[dd.secNum, { color: "#fff" }]}>🧾</Text>
          <Text style={[dd.secLabel, { color: "#fff", fontWeight: "800" }]}>New Bill</Text>
          <Text style={[dd.chevron, { color: "#fff" }]}>›</Text>
        </TouchableOpacity>
        <View style={dd.divider} />

        {/* User Management — admin only */}
        {session?.user?.role === "admin" && (
          <>
            <TouchableOpacity style={dd.section} onPress={() => nav("/users")}><Text style={dd.secNum}>2.</Text><Text style={dd.secLabel}>User Management</Text><Text style={dd.chevron}>›</Text></TouchableOpacity>
            <View style={dd.divider} />
          </>
        )}

        <TouchableOpacity style={dd.section} onPress={() => nav("/settings")}><Text style={dd.secNum}>{session?.user?.role === "admin" ? "3." : "2."}</Text><Text style={dd.secLabel}>Settings</Text><Text style={dd.chevron}>›</Text></TouchableOpacity>
      </ScrollView>
      <TouchableOpacity style={dd.closeBtn} onPress={onClose}><Text style={dd.closeTxt}>Close</Text></TouchableOpacity>
    </View>
  );
}

export default function DashboardScreen() {
  const { width } = useWindowDimensions();
  const GAP = 10;
  const CARD_W = (width - Spacing.lg * 2 - GAP) / 2;

  const [session, setSession] = useState<any>(null);
  const [sales, setSales] = useState<SalesData>({
    today: 0, yesterday: 0, thisWeek: 0, thisMonth: 0, todayCount: 0,
  });
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("week");
  const [chartRefreshKey, setChartRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [printerOnline, setPrinterOnline] = useState<boolean | null>(null); // null = unknown

  // Printer connectivity check
  const checkPrinter = useCallback(async () => {
    if (Platform.OS === "web") { setPrinterOnline(true); return; }
    try {
      const type = await store.getPrinterType();
      if (type === "wifi") {
        const ip = await store.getWifiPrinterIp();
        const port = await store.getWifiPrinterPort();
        if (!ip) { setPrinterOnline(false); return; }
        // TCP ping with longer timeout and proper event handling
        const TcpSocket = require("react-native-tcp-socket");
        const online = await new Promise<boolean>((resolve) => {
          let done = false;
          let client: any = null;
          const finish = (result: boolean) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            try { if (client) client.destroy(); } catch {}
            resolve(result);
          };
          const timer = setTimeout(() => finish(false), 5000);
          client = TcpSocket.createConnection(
            { host: ip, port: parseInt(port || "9100"), timeout: 5000 },
            () => finish(true)
          );
          client.on("connect", () => finish(true));
          client.on("error", () => finish(false));
          client.on("timeout", () => finish(false));
        });
        setPrinterOnline(online);
      } else {
        const addr = await store.getPrinterAddress();
        if (!addr) { setPrinterOnline(false); return; }
        // For Bluetooth: isDeviceConnected only returns true when socket is open.
        // Try connecting first, then check — or simply treat "paired & configured" as online.
        try {
          const RNBt = require("react-native-bluetooth-classic").default;
          if (!RNBt || typeof RNBt.isDeviceConnected !== "function") {
            // Module unavailable — assume online if address is configured
            setPrinterOnline(true); return;
          }
          // Try to open a connection so isDeviceConnected returns true
          try {
            const alreadyConnected = await RNBt.isDeviceConnected(addr);
            if (alreadyConnected) { setPrinterOnline(true); return; }
            // Not connected — attempt connection
            await Promise.race([
              RNBt.connectToDevice(addr),
              new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
            ]);
            setPrinterOnline(true);
          } catch {
            // Connection failed — check one more time
            const stillConnected = await RNBt.isDeviceConnected(addr).catch(() => false);
            setPrinterOnline(stillConnected);
          }
        } catch {
          // If module crashes entirely, assume online if address configured
          setPrinterOnline(true);
        }
      }
    } catch {
      setPrinterOnline(false);
    }
  }, []);

  // Drawer
  const slideAnim = useRef(new Animated.Value(-300)).current;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSlid, setDrawerSlid] = useState(false);

  const openDrawer = () => {
    if (Platform.OS === "web") {
      setDrawerOpen(true); setDrawerSlid(false);
      setTimeout(() => setDrawerSlid(true), 20);
    } else {
      slideAnim.setValue(-300); setDrawerOpen(true);
      Animated.timing(slideAnim, { toValue: 0, duration: 260, useNativeDriver: true }).start();
    }
  };
  const closeDrawer = () => {
    if (Platform.OS === "web") {
      setDrawerSlid(false);
      setTimeout(() => setDrawerOpen(false), 260);
    } else {
      Animated.timing(slideAnim, { toValue: -300, duration: 220, useNativeDriver: true }).start(() => setDrawerOpen(false));
    }
  };

  const loadSession = async () => {
    const s = await getSession();
    setSession(s);
  };

  const loadSales = useCallback(() => {
    if (Platform.OS === "web") {
      // Demo data for web preview
      setSales({ today: 12500, yesterday: 9800, thisWeek: 54000, thisMonth: 198000, todayCount: 14 });
      return;
    }
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86400000;
    const weekStart = todayStart - 6 * 86400000;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const todayRow = db.getFirstSync(
      "SELECT COALESCE(SUM(total),0) as total, COUNT(*) as cnt FROM orders WHERE created_at >= ? AND status != 'cancelled'",
      [todayStart]
    ) as any;
    const yesterdayRow = db.getFirstSync(
      "SELECT COALESCE(SUM(total),0) as total FROM orders WHERE created_at >= ? AND created_at < ? AND status != 'cancelled'",
      [yesterdayStart, todayStart]
    ) as any;
    const weekRow = db.getFirstSync(
      "SELECT COALESCE(SUM(total),0) as total FROM orders WHERE created_at >= ? AND status != 'cancelled'",
      [weekStart]
    ) as any;
    const monthRow = db.getFirstSync(
      "SELECT COALESCE(SUM(total),0) as total FROM orders WHERE created_at >= ? AND status != 'cancelled'",
      [monthStart]
    ) as any;

    setSales({
      today: todayRow?.total ?? 0,
      yesterday: yesterdayRow?.total ?? 0,
      thisWeek: weekRow?.total ?? 0,
      thisMonth: monthRow?.total ?? 0,
      todayCount: todayRow?.cnt ?? 0,
    });
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    loadSales();
    setChartRefreshKey(k => k + 1);
    if (Platform.OS !== "web") await syncWithServer();
    setRefreshing(false);
  };

  // Reload chart data when screen comes back into focus (e.g. after billing)
  useFocusEffect(useCallback(() => {
    loadSales();
    setChartRefreshKey(k => k + 1);
    checkPrinter();
  }, []));

  useEffect(() => {
    loadSession();
    loadSales();
    checkPrinter();
  }, []);

  const fmt = (n: number) => n.toLocaleString();

  const statCards = [
    { label: "Today",      value: sales.today,     img: require("../assets/icon_today.png"),     bg: "#4DD0C4" },
    { label: "Yesterday",  value: sales.yesterday,  img: require("../assets/icon_yesterday.png"), bg: "#C8C84A" },
    { label: "This Week",  value: sales.thisWeek,   img: require("../assets/icon_week.png"),      bg: "#E06090" },
    { label: "This Month", value: sales.thisMonth,  img: require("../assets/icon_month.png"),     bg: "#5CC85C" },
  ];

  const ops = [
    { label: "Item List", img: require("../assets/op_items.gif"),   route: "/items"   },
    { label: "Billing",   img: require("../assets/op_billing.gif"), route: "/billing" },
    { label: "Reports",   img: require("../assets/op_reports.gif"), route: "/reports" },
  ];

  return (
    <SafeAreaView style={s.root} edges={["top", "left", "right", "bottom"]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.headerIcon} onPress={openDrawer}>
          <List size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>
          {session?.shop?.name ? `iDine Lite - ${session.shop.name}` : "iDine Lite"}
        </Text>
        <TouchableOpacity style={s.headerIcon} onPress={checkPrinter}>
          <View style={{ position: "relative" }}>
            <Image source={require("../assets/icon_home.png")} style={{ width: 28, height: 28 }} resizeMode="contain" />
            {printerOnline !== null && (
              <View style={{
                position: "absolute", bottom: 0, right: 0,
                width: 9, height: 9, borderRadius: 5,
                backgroundColor: printerOnline ? "#4CAF50" : "#F44336",
                borderWidth: 1.5, borderColor: Colors.primary,
              }} />
            )}
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0A1F44" />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* 2x2 stat cards */}
        <View style={[s.cardGrid, { paddingHorizontal: Spacing.lg, gap: GAP }]}>
          {statCards.map((c) => (
            <View key={c.label} style={[s.card, { width: CARD_W, backgroundColor: c.bg }]}>
              <View style={s.cardTop}>
                <Image source={c.img} style={s.cardIcon} resizeMode="contain" />
                <Text style={s.cardLabel}>{c.label}</Text>
              </View>
              <Text style={s.cardValue}>Rs.{fmt(Math.round(c.value))}</Text>
              {c.label === "Today" && (
                <Text style={s.cardSub}>{sales.todayCount} bill{sales.todayCount !== 1 ? "s" : ""}</Text>
              )}
            </View>
          ))}
        </View>

        {/* Sales chart with period tabs */}
        <SalesChart period={chartPeriod} onPeriodChange={setChartPeriod} refreshKey={chartRefreshKey} />

        {/* Operations section */}
        <View style={s.opsSection}>
          <Text style={s.opsHeading}>Operations</Text>
          <View style={s.opsBox}>
            {ops.map((op) => (
              <TouchableOpacity
                key={op.label}
                style={s.opBtn}
                onPress={() => router.push(op.route as any)}
              >
                <Image source={op.img} style={s.opGif} resizeMode="contain" />
                <Text style={s.opLabel}>{op.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── Side Drawer ── */}
      {drawerOpen && (
        <View style={s.drawerWrap}>
          <TouchableOpacity style={s.drawerBackdrop} activeOpacity={1} onPress={closeDrawer} />
          {Platform.OS === "web" ? (
            <View style={[s.drawerPanel, { transform: [{ translateX: drawerSlid ? 0 : -300 }] } as any, ({ transition: "transform 260ms ease" } as any)]}>
              <DrawerMenu session={session} onClose={closeDrawer} onNavigate={(r) => { closeDrawer(); setTimeout(() => router.push(r as any), 260); }} />
            </View>
          ) : (
            <Animated.View style={[s.drawerPanel, { transform: [{ translateX: slideAnim }] }]}>
              <DrawerMenu session={session} onClose={closeDrawer} onNavigate={(r) => { closeDrawer(); setTimeout(() => router.push(r as any), 240); }} />
            </Animated.View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5F5F5" },
  header: {
    backgroundColor: "#0A1F44",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  headerIcon: { padding: 4, width: 36, alignItems: "center" },
  headerTitle: {
    flex: 1, textAlign: "center", color: "#fff",
    fontSize: 17, fontWeight: "700", marginHorizontal: 8,
  },
  scroll: { flex: 1 },
  pageTitle: {
    textAlign: "center",
    fontSize: 20,
    fontWeight: "600",
    color: "#0A1F44",
    marginVertical: 14,
  },
  cardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 14,
    marginTop: 16,
  },
  card: {
    borderRadius: 12,
    padding: 14,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  cardIcon: { width: 28, height: 28 },
  cardLabel: { fontSize: 14, fontWeight: "600", color: "#fff" },
  cardValue: { fontSize: 22, fontWeight: "800", color: "#fff", letterSpacing: 0.5 },
  cardSub: { fontSize: 11, color: "rgba(255,255,255,0.85)", marginTop: 2, fontWeight: "600" },
  opsSection: {
    marginHorizontal: Spacing.lg,
    marginTop: 4,
  },
  opsHeading: {
    fontSize: 14,
    fontWeight: "700",
    color: "#555",
    marginBottom: 6,
    marginLeft: 4,
  },
  opsBox: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#D0D0D0",
    // top-left + bottom-right rounded, top-right + bottom-left sharp
    borderTopLeftRadius: 18,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 8,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  opBtn: { alignItems: "center", gap: 6 },
  opGif: { width: 70, height: 70 },
  opLabel: { fontSize: 13, fontWeight: "700", color: "#0A1F44" },
  drawerWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 },
  drawerBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" },
  drawerPanel: { width: 280, position: "absolute", top: 0, left: 0, bottom: 0, zIndex: 1000 },
});

const dd = StyleSheet.create({
  drawer: { flex: 1, backgroundColor: "#0A1F44" },
  profile: { paddingTop: 40, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.2)" },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  avatarTxt: { fontSize: 22, fontWeight: "700", color: "#fff" },
  userName: { fontSize: 15, fontWeight: "700", color: "#fff" },
  role: { fontSize: 12, color: "rgba(255,255,255,0.7)" },
  shopName: { fontSize: 13, color: "#fff", marginTop: 2 },
  shopInfo: { fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 1 },
  list: { flex: 1 },
  section: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  secNum: { fontSize: 13, color: "rgba(255,255,255,0.6)", width: 24 },
  secLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: "#fff" },
  chevron: { fontSize: 13, color: "rgba(255,255,255,0.7)" },
  sub: { backgroundColor: "rgba(0,0,0,0.15)" },
  subItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 11 },
  subDot: { fontSize: 16, color: "rgba(255,255,255,0.6)", width: 20 },
  subLabel: { fontSize: 13, color: "#fff" },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.15)", marginHorizontal: 16 },
  closeBtn: { margin: 16, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  closeTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
