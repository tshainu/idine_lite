import { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft, ChartBar, Receipt, TrendUp, CurrencyDollar } from "phosphor-react-native";
import { Colors, Spacing, Radius, Typography } from "../lib/theme";
import db from "../lib/database";


type Period = "today" | "yesterday" | "week" | "month";

interface DaySales { date: string; total: number; count: number; }
interface Summary { total: number; count: number; avgOrder: number; }

export default function ReportsScreen() {
  const [period, setPeriod] = useState<Period>("today");
  const [summary, setSummary] = useState<Summary>({ total: 0, count: 0, avgOrder: 0 });
  const [dailyData, setDailyData] = useState<DaySales[]>([]);
  const [topItems, setTopItems] = useState<any[]>([]);

  useEffect(() => { loadReport(); }, [period]);

  const getDateRange = (): [number, number] => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    switch (period) {
      case "today": return [todayStart, Date.now()];
      case "yesterday": return [todayStart - 86400000, todayStart];
      case "week": return [todayStart - 6 * 86400000, Date.now()];
      case "month": return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), Date.now()];
    }
  };

  const loadReport = () => {
    if (Platform.OS === "web") return;
    const [from, to] = getDateRange();

    const row = db.getFirstSync(
      `SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count
       FROM orders WHERE created_at >= ? AND created_at <= ? AND status != 'cancelled'`,
      [from, to]
    ) as any;

    const total = row?.total ?? 0;
    const count = row?.count ?? 0;
    setSummary({ total, count, avgOrder: count > 0 ? total / count : 0 });

    // Daily breakdown
    const daily = db.getAllSync(
      `SELECT date(created_at / 1000, 'unixepoch', 'localtime') as date,
              SUM(total) as total, COUNT(*) as count
       FROM orders WHERE created_at >= ? AND created_at <= ? AND status != 'cancelled'
       GROUP BY date ORDER BY date`,
      [from, to]
    ) as DaySales[];
    setDailyData(daily);

    // Top items
    const top = db.getAllSync(
      `SELECT oi.product_name, SUM(oi.qty) as qty, SUM(oi.line_total) as revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.created_at >= ? AND o.created_at <= ? AND o.status != 'cancelled'
       GROUP BY oi.product_name ORDER BY revenue DESC LIMIT 5`,
      [from, to]
    ) as any[];
    setTopItems(top);
  };

  const maxBar = Math.max(...dailyData.map((d) => d.total), 1);

  const tabs: { key: Period; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "yesterday", label: "Yesterday" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft size={22} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sales Reports</Text>
      </View>

      {/* Period Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodScroll}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.periodTab, period === t.key && styles.periodTabActive]}
            onPress={() => setPeriod(t.key)}
          >
            <Text style={[styles.periodTabText, period === t.key && styles.periodTabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.scroll}>
        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { borderTopColor: Colors.primary }]}>
            <CurrencyDollar size={24} color={Colors.primary} weight="duotone" />
            <Text style={styles.summaryValue}>Rs. {summary.total.toFixed(2)}</Text>
            <Text style={styles.summaryLabel}>Total Sales</Text>
          </View>
          <View style={[styles.summaryCard, { borderTopColor: Colors.green }]}>
            <Receipt size={24} color={Colors.green} weight="duotone" />
            <Text style={styles.summaryValue}>{summary.count}</Text>
            <Text style={styles.summaryLabel}>Orders</Text>
          </View>
          <View style={[styles.summaryCard, { borderTopColor: Colors.orange }]}>
            <TrendUp size={24} color={Colors.orange} weight="duotone" />
            <Text style={styles.summaryValue}>Rs. {summary.avgOrder.toFixed(2)}</Text>
            <Text style={styles.summaryLabel}>Avg Order</Text>
          </View>
        </View>

        {/* Bar Chart */}
        {dailyData.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Sales by Day</Text>
            <View style={styles.chart}>
              {dailyData.map((d) => (
                <View key={d.date} style={styles.barGroup}>
                  <Text style={styles.barValue}>
                    {d.total >= 1000 ? `${(d.total / 1000).toFixed(1)}k` : d.total.toFixed(0)}
                  </Text>
                  <View style={styles.barWrapper}>
                    <View style={[styles.bar, { height: Math.max(4, (d.total / maxBar) * 120) }]} />
                  </View>
                  <Text style={styles.barLabel}>{d.date.slice(5)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Top Items */}
        {topItems.length > 0 && (
          <View style={styles.topCard}>
            <Text style={styles.chartTitle}>Top Selling Items</Text>
            {topItems.map((item, i) => (
              <View key={i} style={styles.topRow}>
                <View style={styles.topRank}>
                  <Text style={styles.topRankText}>{i + 1}</Text>
                </View>
                <Text style={styles.topName}>{item.product_name}</Text>
                <Text style={styles.topQty}>{item.qty} sold</Text>
                <Text style={styles.topRevenue}>Rs. {(item.revenue ?? 0).toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}

        {summary.count === 0 && (
          <View style={styles.empty}>
            <ChartBar size={48} color={Colors.textMuted} weight="duotone" />
            <Text style={styles.emptyText}>No orders for this period</Text>
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.primary, paddingHorizontal: Spacing.lg,
    paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 12,
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: Colors.white },
  periodScroll: { backgroundColor: Colors.white, maxHeight: 48, borderBottomWidth: 1, borderBottomColor: Colors.border },
  periodTab: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  periodTabActive: { borderBottomColor: Colors.primary },
  periodTabText: { fontSize: 13, color: Colors.textSecondary, fontWeight: "500" },
  periodTabTextActive: { color: Colors.primary, fontWeight: "600" },
  scroll: { flex: 1 },
  summaryRow: { flexDirection: "row", padding: Spacing.md, gap: Spacing.sm },
  summaryCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: Radius.md,
    padding: Spacing.md, alignItems: "center", gap: 4,
    borderTopWidth: 3, elevation: 2,
  },
  summaryValue: { fontSize: 15, fontWeight: "700", color: Colors.text },
  summaryLabel: { fontSize: 10, color: Colors.textSecondary },
  chartCard: {
    backgroundColor: Colors.white, marginHorizontal: Spacing.md,
    borderRadius: Radius.md, padding: Spacing.lg, marginBottom: Spacing.md, elevation: 2,
  },
  chartTitle: { ...Typography.h4, color: Colors.text, marginBottom: Spacing.md },
  chart: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around", height: 160 },
  barGroup: { alignItems: "center", gap: 4 },
  barValue: { fontSize: 9, color: Colors.textSecondary },
  barWrapper: { height: 120, justifyContent: "flex-end" },
  bar: { width: 24, backgroundColor: Colors.primary, borderRadius: 4 },
  barLabel: { fontSize: 10, color: Colors.textMuted },
  topCard: {
    backgroundColor: Colors.white, marginHorizontal: Spacing.md,
    borderRadius: Radius.md, padding: Spacing.lg, marginBottom: Spacing.md, elevation: 2,
  },
  topRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  topRank: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.primaryLight, alignItems: "center", justifyContent: "center", marginRight: 10,
  },
  topRankText: { fontSize: 12, fontWeight: "700", color: Colors.primary },
  topName: { flex: 1, fontSize: 13, fontWeight: "500", color: Colors.text },
  topQty: { fontSize: 12, color: Colors.textSecondary, marginRight: 8 },
  topRevenue: { fontSize: 13, fontWeight: "700", color: Colors.primary },
  empty: { flex: 1, alignItems: "center", padding: 60, gap: 12 },
  emptyText: { fontSize: 14, color: Colors.textMuted },
});
