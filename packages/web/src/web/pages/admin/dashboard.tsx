import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import AdminLayout from "./layout";
import { adminApi } from "../../lib/admin-api";

interface TopShop {
  shopId: number;
  shopName: string;
  shopCode: string;
  totalOrders: number;
  totalRevenue: number;
  lastLoginAt: string | null;
  isActive: boolean;
}

interface ChartPoint {
  period: string;
  count: number;
}

interface DashData {
  totalShops: number;
  activeShops: number;
  suspendedShops: number;
  inactiveShops: number;
  topShops: TopShop[];
  newShopsChart: ChartPoint[];
}

type Range = "this_month" | "last_month" | "this_year" | "custom";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatCard({
  label, value, sub, color,
}: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className={`bg-white rounded-xl border p-5 ${color ?? "border-gray-200"}`}>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function BarChart({ data, labelKey, valueKey }: {
  data: Record<string, any>[];
  labelKey: string;
  valueKey: string;
}) {
  if (!data.length) return (
    <div className="flex items-center justify-center h-40 text-sm text-gray-400">No data for this period</div>
  );
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  return (
    <div className="flex items-end gap-1 h-40">
      {data.map((d, i) => {
        const pct = (d[valueKey] / max) * 100;
        const label = String(d[labelKey]);
        // shorten label: "2026-05-17" → "17", "2026-05" → "May"
        let short = label;
        if (/^\d{4}-\d{2}-\d{2}$/.test(label)) short = label.slice(8);
        else if (/^\d{4}-\d{2}$/.test(label)) {
          const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          short = months[parseInt(label.slice(5)) - 1] ?? label.slice(5);
        }
        return (
          <div key={i} className="flex flex-col items-center flex-1 gap-1 min-w-0">
            <span className="text-[10px] text-indigo-700 font-semibold">{d[valueKey] > 0 ? d[valueKey] : ""}</span>
            <div
              className="w-full bg-indigo-500 rounded-t transition-all hover:bg-indigo-600"
              style={{ height: `${Math.max(pct, 3)}%` }}
              title={`${label}: ${d[valueKey]} shops`}
            />
            <span className="text-[10px] text-gray-400 truncate w-full text-center">{short}</span>
          </div>
        );
      })}
    </div>
  );
}

function timeAgo(dt: string | null): string {
  if (!dt) return "Never";
  const diff = Date.now() - new Date(dt).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function AdminDashboard() {
  const [, nav] = useLocation();
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState<Range>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [chartLoading, setChartLoading] = useState(false);

  const load = (r: Range, cf?: string, ct?: string) => {
    setChartLoading(true);
    adminApi
      .dashboard(r, cf, ct)
      .then((d: DashData) => {
        setData(d);
        setError("");
      })
      .catch((e: Error) => {
        if (e.message === "Unauthorized") {
          localStorage.removeItem("admin_token");
          nav("/admin/login");
        } else {
          setError(e.message);
        }
      })
      .finally(() => {
        setLoading(false);
        setChartLoading(false);
      });
  };

  useEffect(() => { load("this_month"); }, []);

  const handleRange = (r: Range) => {
    setRange(r);
    if (r !== "custom") load(r);
  };

  const handleCustomApply = () => {
    if (customFrom && customTo) load("custom", customFrom, customTo);
  };

  return (
    <AdminLayout title="Dashboard">
      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>
      )}

      {data && (
        <div className="space-y-6 max-w-6xl">

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Customers"
              value={data.totalShops}
              sub="registered shops"
            />
            <StatCard
              label="Active Shops"
              value={data.activeShops}
              sub="not suspended"
              color="border-green-200"
            />
            <StatCard
              label="Inactive > 7 Days"
              value={data.inactiveShops}
              sub="no login in 7 days"
              color="border-yellow-200"
            />
            <StatCard
              label="Suspended Shops"
              value={data.suspendedShops}
              sub="manually suspended"
              color="border-red-200"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* New shops chart */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="font-semibold text-gray-800 text-sm">New Shops Added</h3>
                <div className="flex gap-1 flex-wrap">
                  {(["this_month", "last_month", "this_year", "custom"] as Range[]).map(r => (
                    <button
                      key={r}
                      onClick={() => handleRange(r)}
                      className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                        range === r
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {r === "this_month" ? "This Month"
                        : r === "last_month" ? "Last Month"
                        : r === "this_year" ? "This Year"
                        : "Custom"}
                    </button>
                  ))}
                </div>
              </div>

              {range === "custom" && (
                <div className="flex gap-2 mb-4 items-end flex-wrap">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">From</label>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={e => setCustomFrom(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">To</label>
                    <input
                      type="date"
                      value={customTo}
                      onChange={e => setCustomTo(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-xs"
                    />
                  </div>
                  <button
                    onClick={handleCustomApply}
                    className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded font-medium hover:bg-indigo-700"
                  >
                    Apply
                  </button>
                </div>
              )}

              {chartLoading ? (
                <div className="flex items-center justify-center h-40">
                  <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <BarChart data={data.newShopsChart} labelKey="period" valueKey="count" />
              )}
            </div>

            {/* Top 10 shops */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-800 text-sm mb-4">Top 10 Active Shops</h3>
              {data.topShops.length === 0 ? (
                <p className="text-sm text-gray-400">No orders recorded yet</p>
              ) : (
                <div className="space-y-2">
                  {data.topShops.map((s, i) => (
                    <div
                      key={s.shopId}
                      className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 -mx-2 px-2 py-2 rounded-lg transition-colors"
                      onClick={() => nav(`/admin/shops/${s.shopId}`)}
                    >
                      <span className="text-xs font-bold text-gray-400 w-5 text-center">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{s.shopName}</p>
                        <p className="text-xs text-gray-400">{s.shopCode} · Last login: {timeAgo(s.lastLoginAt)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-gray-900">{s.totalOrders.toLocaleString()} orders</p>
                        <p className="text-xs text-gray-400">Rs. {fmt(s.totalRevenue)}</p>
                      </div>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${s.isActive ? "bg-green-400" : "bg-red-400"}`} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
