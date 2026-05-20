import { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  ArrowLeft, ChartBar, Receipt, TrendUp, CurrencyDollar,
  ForkKnife, Clock, Table, X, CalendarBlank,
} from "phosphor-react-native";
import { Colors, Spacing, Radius, Typography } from "../lib/theme";
import db from "../lib/database";

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = "sales" | "topselling" | "category" | "hourly";
type Period = "today" | "week" | "month" | "year" | "custom";

interface Bill {
  id: number;
  order_no: string;
  created_at: number;
  total: number;
  order_type: string;
  item_count: number;
  items_summary: string;
}
interface TopItem { product_name: string; qty: number; revenue: number; }
interface CatSales { category: string; revenue: number; qty: number; }
interface HourSales { hour: number; total: number; count: number; }
interface Summary { total: number; count: number; avgOrder: number; dineIn: number; takeaway: number; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => `Rs. ${n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtShort = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
const fmtDate = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};
const fmtTime = (ts: number) => {
  const d = new Date(ts);
  const h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
};
const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ─── Custom Date Picker (simple modal) ───────────────────────────────────────
function DateInput({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 11, color: Colors.textSecondary, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={Colors.textMuted}
        style={{
          borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
          paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: Colors.text,
          backgroundColor: Colors.white,
        }}
      />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ReportsScreen() {
  const [tab, setTab] = useState<Tab>("sales");
  const [period, setPeriod] = useState<Period>("today");
  const [customFrom, setCustomFrom] = useState(toDateStr(new Date()));
  const [customTo, setCustomTo] = useState(toDateStr(new Date()));
  const [customApplied, setCustomApplied] = useState(false);

  // Data
  const [summary, setSummary] = useState<Summary>({ total: 0, count: 0, avgOrder: 0, dineIn: 0, takeaway: 0 });
  const [bills, setBills] = useState<Bill[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [catSales, setCatSales] = useState<CatSales[]>([]);
  const [hourlySales, setHourlySales] = useState<HourSales[]>([]);

  const getDateRange = useCallback((): [number, number] => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (period === "today") return [todayStart, Date.now()];
    if (period === "week") return [todayStart - 6 * 86400000, Date.now()];
    if (period === "month") return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), Date.now()];
    if (period === "year") return [new Date(now.getFullYear(), 0, 1).getTime(), Date.now()];
    if (period === "custom") {
      const from = new Date(customFrom + "T00:00:00").getTime();
      const to = new Date(customTo + "T23:59:59").getTime();
      return [isNaN(from) ? todayStart : from, isNaN(to) ? Date.now() : to];
    }
    return [todayStart, Date.now()];
  }, [period, customFrom, customTo]);

  const loadReport = useCallback(() => {
    if (Platform.OS === "web") return;
    const [from, to] = getDateRange();

    // Summary
    const s = db.getFirstSync(
      `SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count,
              SUM(CASE WHEN order_type='dine-in' THEN 1 ELSE 0 END) as dineIn,
              SUM(CASE WHEN order_type='takeaway' THEN 1 ELSE 0 END) as takeaway
       FROM orders WHERE created_at >= ? AND created_at <= ? AND status != 'cancelled'`,
      [from, to]
    ) as any;
    const total = s?.total ?? 0;
    const count = s?.count ?? 0;
    setSummary({
      total, count,
      avgOrder: count > 0 ? total / count : 0,
      dineIn: s?.dineIn ?? 0,
      takeaway: s?.takeaway ?? 0,
    });

    // Bills detail
    const b = db.getAllSync(
      `SELECT o.id, o.order_no, o.created_at, o.total, o.order_type,
              COUNT(oi.id) as item_count,
              GROUP_CONCAT(oi.product_name || ' x' || oi.qty, ', ') as items_summary
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.created_at >= ? AND o.created_at <= ? AND o.status != 'cancelled'
       GROUP BY o.id ORDER BY o.created_at DESC`,
      [from, to]
    ) as Bill[];
    setBills(b);

    // Top items (top 10)
    const top = db.getAllSync(
      `SELECT oi.product_name, SUM(oi.qty) as qty, SUM(oi.line_total) as revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.created_at >= ? AND o.created_at <= ? AND o.status != 'cancelled'
       GROUP BY oi.product_name ORDER BY revenue DESC LIMIT 10`,
      [from, to]
    ) as TopItem[];
    setTopItems(top);

    // Category sales
    const cats = db.getAllSync(
      `SELECT COALESCE(c.name, 'Uncategorized') as category,
              SUM(oi.line_total) as revenue, SUM(oi.qty) as qty
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE o.created_at >= ? AND o.created_at <= ? AND o.status != 'cancelled'
       GROUP BY c.name ORDER BY revenue DESC`,
      [from, to]
    ) as CatSales[];
    setCatSales(cats);

    // Hourly
    const hourly = db.getAllSync(
      `SELECT strftime('%H', created_at/1000, 'unixepoch', 'localtime') as hour,
              SUM(total) as total, COUNT(*) as count
       FROM orders
       WHERE created_at >= ? AND created_at <= ? AND status != 'cancelled'
       GROUP BY hour ORDER BY hour`,
      [from, to]
    ) as any[];
    setHourlySales(
      hourly.map((h) => ({ hour: parseInt(h.hour), total: h.total, count: h.count }))
    );
  }, [getDateRange]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const periodTabs: { key: Period; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "year", label: "This Year" },
    { key: "custom", label: "Custom" },
  ];

  const reportTabs: { key: Tab; label: string; icon: any }[] = [
    { key: "sales", label: "Sales", icon: Receipt },
    { key: "topselling", label: "Top Items", icon: TrendUp },
    { key: "category", label: "Category", icon: ForkKnife },
    { key: "hourly", label: "Peak Hours", icon: Clock },
  ];

  const periodLabel = (() => {
    if (period === "today") return "Today";
    if (period === "week") return "This Week";
    if (period === "month") return "This Month";
    if (period === "year") return "This Year";
    return `${customFrom} → ${customTo}`;
  })();

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft size={22} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reports</Text>
        <Text style={styles.headerPeriod}>{periodLabel}</Text>
      </View>

      {/* Period tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodScroll} contentContainerStyle={{ paddingHorizontal: 8 }}>
        {periodTabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.periodTab, period === t.key && styles.periodTabActive]}
            onPress={() => setPeriod(t.key)}
          >
            <Text style={[styles.periodTabText, period === t.key && styles.periodTabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Custom date inputs */}
      {period === "custom" && (
        <View style={styles.customBar}>
          <DateInput label="From" value={customFrom} onChange={setCustomFrom} />
          <Text style={{ color: Colors.textMuted, paddingTop: 20, paddingHorizontal: 4 }}>→</Text>
          <DateInput label="To" value={customTo} onChange={setCustomTo} />
          <TouchableOpacity style={styles.applyBtn} onPress={loadReport}>
            <Text style={styles.applyBtnText}>Apply</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Summary strip */}
      <View style={styles.summaryStrip}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryVal}>{fmt(summary.total)}</Text>
          <Text style={styles.summaryLbl}>Total Sales</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryVal}>{summary.count}</Text>
          <Text style={styles.summaryLbl}>Bills</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryVal}>{fmt(summary.avgOrder)}</Text>
          <Text style={styles.summaryLbl}>Avg Bill</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryVal, { color: Colors.green }]}>{summary.dineIn}</Text>
          <Text style={styles.summaryLbl}>Dine-In</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryVal, { color: Colors.orange }]}>{summary.takeaway}</Text>
          <Text style={styles.summaryLbl}>Takeaway</Text>
        </View>
      </View>

      {/* Report type tabs */}
      <View style={styles.tabBar}>
        {reportTabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <TouchableOpacity key={t.key} style={[styles.tabBtn, active && styles.tabBtnActive]} onPress={() => setTab(t.key)}>
              <Icon size={16} color={active ? Colors.primary : Colors.textMuted} weight={active ? "fill" : "regular"} />
              <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* ── SALES REPORT ─────────────────────────────────────────────── */}
        {tab === "sales" && (
          <View>
            {/* Total amount banner */}
            <View style={styles.totalBanner}>
              <CurrencyDollar size={22} color={Colors.white} weight="duotone" />
              <View>
                <Text style={styles.totalBannerLabel}>Total Sales Amount</Text>
                <Text style={styles.totalBannerValue}>{fmt(summary.total)}</Text>
              </View>
              <View style={{ flex: 1 }} />
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.totalBannerLabel}>Bills: {summary.count}</Text>
                <Text style={styles.totalBannerLabel}>Avg: {fmt(summary.avgOrder)}</Text>
              </View>
            </View>

            {/* Type badges */}
            <View style={styles.typeBadgeRow}>
              <View style={[styles.typeBadge, { backgroundColor: Colors.greenLight }]}>
                <Table size={14} color={Colors.green} />
                <Text style={[styles.typeBadgeText, { color: Colors.green }]}>Dine-In: {summary.dineIn}</Text>
              </View>
              <View style={[styles.typeBadge, { backgroundColor: "#FFF3E0" }]}>
                <Receipt size={14} color={Colors.orange} />
                <Text style={[styles.typeBadgeText, { color: Colors.orange }]}>Takeaway: {summary.takeaway}</Text>
              </View>
            </View>

            {bills.length === 0 ? (
              <EmptyState />
            ) : (
              <View style={styles.card}>
                {/* Table header */}
                <View style={styles.tableHeader}>
                  <Text style={[styles.thCell, { width: 36 }]}>#</Text>
                  <Text style={[styles.thCell, { flex: 1 }]}>Bill No / Date</Text>
                  <Text style={[styles.thCell, { width: 60, textAlign: "center" }]}>Type</Text>
                  <Text style={[styles.thCell, { width: 80, textAlign: "right" }]}>Amount</Text>
                </View>
                {bills.map((bill, i) => (
                  <View key={bill.id} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                    <Text style={[styles.tdCell, { width: 36, color: Colors.textMuted }]}>{i + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.tdCell, { fontWeight: "600" }]}>
                        #{bill.order_no || String(bill.id).padStart(3, "0")}
                      </Text>
                      <Text style={[styles.tdCell, { fontSize: 10, color: Colors.textMuted }]}>
                        {fmtDate(bill.created_at)}  {fmtTime(bill.created_at)}
                      </Text>
                      {bill.items_summary ? (
                        <Text style={[styles.tdCell, { fontSize: 10, color: Colors.textSecondary }]} numberOfLines={1}>
                          {bill.items_summary}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ width: 60, alignItems: "center" }}>
                      <View style={[
                        styles.typeChip,
                        bill.order_type === "takeaway" ? styles.typeChipTakeaway : styles.typeChipDineIn,
                      ]}>
                        <Text style={[
                          styles.typeChipText,
                          bill.order_type === "takeaway" ? { color: Colors.orange } : { color: Colors.green },
                        ]}>
                          {bill.order_type === "takeaway" ? "T/A" : "D/I"}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.tdCell, { width: 80, textAlign: "right", fontWeight: "700", color: Colors.primary }]}>
                      Rs.{bill.total.toLocaleString("en-LK")}
                    </Text>
                  </View>
                ))}
                {/* Footer total */}
                <View style={styles.tableFooter}>
                  <Text style={styles.tableFooterText}>Total ({bills.length} bills)</Text>
                  <Text style={styles.tableFooterAmount}>{fmt(summary.total)}</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── TOP SELLING ──────────────────────────────────────────────── */}
        {tab === "topselling" && (
          <View>
            {topItems.length === 0 ? <EmptyState /> : (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Top Selling Items</Text>
                <View style={styles.tableHeader}>
                  <Text style={[styles.thCell, { width: 32 }]}>Rank</Text>
                  <Text style={[styles.thCell, { flex: 1 }]}>Item</Text>
                  <Text style={[styles.thCell, { width: 56, textAlign: "center" }]}>Qty</Text>
                  <Text style={[styles.thCell, { width: 90, textAlign: "right" }]}>Revenue</Text>
                </View>
                {topItems.map((item, i) => {
                  const maxRev = topItems[0]?.revenue ?? 1;
                  const pct = (item.revenue / maxRev) * 100;
                  return (
                    <View key={i} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                      <View style={[styles.rankBadge, i < 3 && styles.rankBadgeTop]}>
                        <Text style={[styles.rankText, i < 3 && styles.rankTextTop]}>{i + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.tdCell, { fontWeight: "600" }]}>{item.product_name}</Text>
                        {/* Progress bar */}
                        <View style={styles.progressBg}>
                          <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
                        </View>
                      </View>
                      <Text style={[styles.tdCell, { width: 56, textAlign: "center", color: Colors.textSecondary }]}>
                        {item.qty}
                      </Text>
                      <Text style={[styles.tdCell, { width: 90, textAlign: "right", fontWeight: "700", color: Colors.primary }]}>
                        Rs.{(item.revenue ?? 0).toLocaleString("en-LK")}
                      </Text>
                    </View>
                  );
                })}
                <View style={styles.tableFooter}>
                  <Text style={styles.tableFooterText}>Total Revenue</Text>
                  <Text style={styles.tableFooterAmount}>{fmt(topItems.reduce((s, i) => s + i.revenue, 0))}</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── CATEGORY SALES ───────────────────────────────────────────── */}
        {tab === "category" && (
          <View>
            {catSales.length === 0 ? <EmptyState /> : (
              <View>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Sales by Category</Text>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.thCell, { flex: 1 }]}>Category</Text>
                    <Text style={[styles.thCell, { width: 56, textAlign: "center" }]}>Items</Text>
                    <Text style={[styles.thCell, { width: 90, textAlign: "right" }]}>Revenue</Text>
                  </View>
                  {catSales.map((cat, i) => {
                    const maxRev = catSales[0]?.revenue ?? 1;
                    const pct = (cat.revenue / maxRev) * 100;
                    const totalRev = catSales.reduce((s, c) => s + c.revenue, 0);
                    const share = totalRev > 0 ? ((cat.revenue / totalRev) * 100).toFixed(1) : "0";
                    return (
                      <View key={i} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <View style={[styles.catDot, { backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }]} />
                            <Text style={[styles.tdCell, { fontWeight: "600" }]}>{cat.category}</Text>
                            <Text style={[styles.tdCell, { fontSize: 10, color: Colors.textMuted }]}>{share}%</Text>
                          </View>
                          <View style={styles.progressBg}>
                            <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }]} />
                          </View>
                        </View>
                        <Text style={[styles.tdCell, { width: 56, textAlign: "center", color: Colors.textSecondary }]}>
                          {cat.qty}
                        </Text>
                        <Text style={[styles.tdCell, { width: 90, textAlign: "right", fontWeight: "700", color: Colors.primary }]}>
                          Rs.{(cat.revenue ?? 0).toLocaleString("en-LK")}
                        </Text>
                      </View>
                    );
                  })}
                  <View style={styles.tableFooter}>
                    <Text style={styles.tableFooterText}>Total</Text>
                    <Text style={styles.tableFooterAmount}>{fmt(catSales.reduce((s, c) => s + c.revenue, 0))}</Text>
                  </View>
                </View>

                {/* Pie-like visual bars */}
                <View style={[styles.card, { marginTop: 0 }]}>
                  <Text style={styles.cardTitle}>Category Share</Text>
                  <View style={{ flexDirection: "row", height: 16, borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
                    {catSales.map((cat, i) => {
                      const totalRev = catSales.reduce((s, c) => s + c.revenue, 0);
                      const pct = totalRev > 0 ? (cat.revenue / totalRev) * 100 : 0;
                      return <View key={i} style={{ flex: pct, backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }} />;
                    })}
                  </View>
                  {catSales.map((cat, i) => {
                    const totalRev = catSales.reduce((s, c) => s + c.revenue, 0);
                    const pct = totalRev > 0 ? ((cat.revenue / totalRev) * 100).toFixed(1) : "0";
                    return (
                      <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
                        <View style={[styles.catDot, { backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }]} />
                        <Text style={{ flex: 1, fontSize: 12, color: Colors.text }}>{cat.category}</Text>
                        <Text style={{ fontSize: 12, color: Colors.textSecondary, fontWeight: "600" }}>{pct}%</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── PEAK HOURS ───────────────────────────────────────────────── */}
        {tab === "hourly" && (
          <View>
            {hourlySales.length === 0 ? <EmptyState /> : (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Peak Hours</Text>
                <Text style={{ fontSize: 11, color: Colors.textMuted, marginBottom: 12 }}>Orders & revenue by hour of day</Text>
                {(() => {
                  const maxTotal = Math.max(...hourlySales.map((h) => h.total), 1);
                  return hourlySales.map((h) => {
                    const pct = (h.total / maxTotal) * 100;
                    const label = h.hour < 12
                      ? `${h.hour === 0 ? 12 : h.hour} AM`
                      : `${h.hour === 12 ? 12 : h.hour - 12} PM`;
                    return (
                      <View key={h.hour} style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 }}>
                        <Text style={{ width: 44, fontSize: 11, color: Colors.textSecondary, textAlign: "right" }}>{label}</Text>
                        <View style={{ flex: 1, height: 22, backgroundColor: Colors.surface, borderRadius: 4, overflow: "hidden" }}>
                          <View style={{
                            width: `${pct}%` as any, height: "100%",
                            backgroundColor: pct > 70 ? Colors.primary : pct > 40 ? "#3A6BC9" : Colors.primaryLight,
                            borderRadius: 4,
                            justifyContent: "center", paddingLeft: 6,
                          }}>
                            {pct > 20 && (
                              <Text style={{ fontSize: 10, color: Colors.white, fontWeight: "600" }}>
                                {h.count} orders
                              </Text>
                            )}
                          </View>
                        </View>
                        <Text style={{ width: 68, fontSize: 11, color: Colors.text, fontWeight: "600", textAlign: "right" }}>
                          Rs.{fmtShort(h.total)}
                        </Text>
                      </View>
                    );
                  });
                })()}
                {/* Best hour callout */}
                {hourlySales.length > 0 && (() => {
                  const best = hourlySales.reduce((a, b) => a.total > b.total ? a : b);
                  const label = best.hour < 12
                    ? `${best.hour === 0 ? 12 : best.hour} AM`
                    : `${best.hour === 12 ? 12 : best.hour - 12} PM`;
                  return (
                    <View style={styles.peakCallout}>
                      <Clock size={16} color={Colors.primary} weight="fill" />
                      <Text style={styles.peakCalloutText}>
                        Peak hour: <Text style={{ fontWeight: "700" }}>{label}</Text> — {best.count} orders · {fmt(best.total)}
                      </Text>
                    </View>
                  );
                })()}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <View style={styles.empty}>
      <ChartBar size={48} color={Colors.textMuted} weight="duotone" />
      <Text style={styles.emptyText}>No data for this period</Text>
    </View>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CAT_COLORS = ["#0A1F44", "#1B6B3A", "#C84B00", "#7B2D8B", "#1565C0", "#AD1457"];

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    backgroundColor: Colors.primary, paddingHorizontal: Spacing.lg,
    paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 10,
  },
  headerTitle: { fontSize: 17, fontWeight: "700", color: Colors.white },
  headerPeriod: { flex: 1, fontSize: 11, color: "rgba(255,255,255,0.65)", textAlign: "right" },

  periodScroll: {
    backgroundColor: Colors.white, maxHeight: 44,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  periodTab: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: "transparent" },
  periodTabActive: { borderBottomColor: Colors.primary },
  periodTabText: { fontSize: 12, color: Colors.textSecondary, fontWeight: "500" },
  periodTabTextActive: { color: Colors.primary, fontWeight: "700" },

  customBar: {
    backgroundColor: Colors.white, flexDirection: "row", alignItems: "flex-end",
    paddingHorizontal: 12, paddingVertical: 10, gap: 6,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  applyBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.sm,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  applyBtnText: { color: Colors.white, fontSize: 13, fontWeight: "600" },

  summaryStrip: {
    backgroundColor: Colors.primary, flexDirection: "row",
    paddingVertical: 10, paddingHorizontal: 8,
  },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryVal: { fontSize: 12, fontWeight: "700", color: Colors.white },
  summaryLbl: { fontSize: 9, color: "rgba(255,255,255,0.6)", marginTop: 1 },
  summaryDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.2)" },

  tabBar: {
    flexDirection: "row", backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tabBtn: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingVertical: 9, gap: 3, borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabBtnActive: { borderBottomColor: Colors.primary },
  tabBtnText: { fontSize: 10, color: Colors.textMuted, fontWeight: "500" },
  tabBtnTextActive: { color: Colors.primary, fontWeight: "700" },

  scroll: { flex: 1 },

  totalBanner: {
    backgroundColor: Colors.primary, margin: Spacing.md, borderRadius: Radius.md,
    padding: Spacing.md, flexDirection: "row", alignItems: "center", gap: 12,
  },
  totalBannerLabel: { fontSize: 10, color: "rgba(255,255,255,0.65)" },
  totalBannerValue: { fontSize: 20, fontWeight: "800", color: Colors.white },

  typeBadgeRow: {
    flexDirection: "row", gap: 8, marginHorizontal: Spacing.md, marginBottom: Spacing.sm,
  },
  typeBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
  },
  typeBadgeText: { fontSize: 12, fontWeight: "600" },

  card: {
    backgroundColor: Colors.white, marginHorizontal: Spacing.md,
    marginBottom: Spacing.md, borderRadius: Radius.md, overflow: "hidden",
    elevation: 1,
  },
  cardTitle: { ...Typography.h4, color: Colors.text, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },

  tableHeader: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: Colors.surface, paddingHorizontal: 10, paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  thCell: { fontSize: 10, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase" },
  tableRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 8 },
  tableRowAlt: { backgroundColor: Colors.surface },
  tdCell: { fontSize: 12, color: Colors.text },
  tableFooter: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.primaryLight, paddingHorizontal: 10, paddingVertical: 10,
  },
  tableFooterText: { fontSize: 12, fontWeight: "600", color: Colors.textSecondary },
  tableFooterAmount: { fontSize: 14, fontWeight: "800", color: Colors.primary },

  typeChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm },
  typeChipDineIn: { backgroundColor: Colors.greenLight },
  typeChipTakeaway: { backgroundColor: "#FFF3E0" },
  typeChipText: { fontSize: 10, fontWeight: "700" },

  rankBadge: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center", marginRight: 8,
  },
  rankBadgeTop: { backgroundColor: Colors.primaryLight },
  rankText: { fontSize: 11, fontWeight: "600", color: Colors.textSecondary },
  rankTextTop: { color: Colors.primary, fontWeight: "800" },

  progressBg: { height: 4, backgroundColor: Colors.surface, borderRadius: 2, marginTop: 4, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: Colors.primary, borderRadius: 2 },

  catDot: { width: 10, height: 10, borderRadius: 5 },

  peakCallout: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.primaryLight, borderRadius: Radius.sm,
    padding: 10, marginTop: 10,
  },
  peakCalloutText: { fontSize: 12, color: Colors.text, flex: 1 },

  empty: { alignItems: "center", padding: 60, gap: 12 },
  emptyText: { fontSize: 14, color: Colors.textMuted },
});
