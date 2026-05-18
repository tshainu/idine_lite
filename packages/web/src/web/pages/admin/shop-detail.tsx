import { useEffect, useState, useRef } from "react";
import { useLocation, useRoute, Link } from "wouter";
import AdminLayout from "./layout";
import { adminApi } from "../../lib/admin-api";

interface Shop {
  id: number; name: string; code: string; address: string | null; phone: string | null;
  isActive: boolean; suspendReason: string | null;
  ownerName: string | null; ownerMobile: string | null; businessType: string | null; remarks: string | null;
}
interface User { id: number; username: string; role: string; isActive: boolean; createdAt: string; }
interface Stats { revenue: number; orders: number; }

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm
                 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                 placeholder-gray-400"
    />
  );
}

function MiniBarChart({ data }: { data: { date: string; total: number }[] }) {
  if (!data.length) return <p className="text-sm text-gray-400 text-center py-8">No orders yet</p>;
  const max = Math.max(...data.map((d) => d.total), 1);
  return (
    <div className="flex items-end gap-2 h-28">
      {data.map((d) => {
        const pct = (d.total / max) * 100;
        const label = d.date?.slice(5) ?? "";
        return (
          <div key={d.date} className="flex flex-col items-center flex-1 gap-1">
            <div
              className="w-full bg-indigo-500 rounded-t-sm"
              style={{ height: `${Math.max(pct, 2)}%` }}
              title={`Rs. ${fmt(d.total)}`}
            />
            <span className="text-[10px] text-gray-400">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function ShopDetail() {
  const [, nav] = useLocation();
  const [, params] = useRoute("/admin/shops/:id");
  const shopId = parseInt(params?.id ?? "0");

  const [shop, setShop] = useState<Shop | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<{ today: Stats; thisWeek: Stats; thisMonth: Stats } | null>(null);
  const [chart, setChart] = useState<{ date: string; total: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modals
  const [showEdit, setShowEdit] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [showSuspend, setShowSuspend] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");

  // Edit shop form
  const [editForm, setEditForm] = useState({ name: "", code: "", address: "", phone: "" });
  const [codeError, setCodeError] = useState("");
  const codeCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Add user form
  const [userForm, setUserForm] = useState({ username: "", password: "", role: "cashier" });
  const [showUserPw, setShowUserPw] = useState(false);
  // Edit user form
  const [editUserForm, setEditUserForm] = useState({ role: "cashier", isActive: true, password: "" });
  const [showEditUserPw, setShowEditUserPw] = useState(false);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => { load(); }, [shopId]);

  async function load() {
    try {
      const data = await adminApi.shops.get(shopId);
      setShop(data.shop);
      setUsers(data.users);
      setStats(data.stats);
      setChart(data.dailyChart);
      setEditForm({
        name: data.shop.name,
        code: data.shop.code,
        address: data.shop.address ?? "",
        phone: data.shop.phone ?? "",
      });
    } catch (e: any) {
      if (e.message === "Unauthorized") { localStorage.removeItem("admin_token"); nav("/admin/login"); }
      else setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleEditShop(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      await adminApi.shops.update(shopId, editForm);
      setShowEdit(false);
      await load();
    } catch (e: any) { setFormError(e.message); }
    finally { setSaving(false); }
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      await adminApi.users.create(shopId, userForm);
      setShowAddUser(false);
      setUserForm({ username: "", password: "", role: "cashier" });
      await load();
    } catch (e: any) { setFormError(e.message); }
    finally { setSaving(false); }
  }

  async function handleEditUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setFormError("");
    setSaving(true);
    try {
      const payload: any = { role: editUserForm.role, isActive: editUserForm.isActive };
      if (editUserForm.password) payload.password = editUserForm.password;
      await adminApi.users.update(shopId, editUser.id, payload);
      setEditUser(null);
      await load();
    } catch (e: any) { setFormError(e.message); }
    finally { setSaving(false); }
  }

  async function handleDeactivate(user: User) {
    if (!confirm(`Deactivate user "${user.username}"?`)) return;
    try {
      await adminApi.users.deactivate(shopId, user.id);
      await load();
    } catch (e: any) { setError(e.message); }
  }

  function handleCodeChange(val: string) {
    const code = val.toUpperCase();
    setEditForm(f => ({ ...f, code }));
    setCodeError("");
    if (codeCheckRef.current) clearTimeout(codeCheckRef.current);
    if (!code) return;
    codeCheckRef.current = setTimeout(async () => {
      try {
        const data = await adminApi.shops.list();
        const taken = data.shops.find((s: any) => s.code === code && s.id !== shopId);
        if (taken) setCodeError(`"${code}" is already used by ${taken.name}`);
      } catch {}
    }, 400);
  }

  async function handleSuspend(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await adminApi.shops.suspend(shopId, true, suspendReason.trim() || undefined);
      setShowSuspend(false);
      setSuspendReason("");
      await load();
    } catch (e: any) { setFormError(e.message); }
    finally { setSaving(false); }
  }

  async function handleReactivate() {
    if (!confirm("Reactivate this shop? The suspension will be lifted.")) return;
    try {
      await adminApi.shops.suspend(shopId, false);
      await load();
    } catch (e: any) { setError(e.message); }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  if (error || !shop) {
    return (
      <AdminLayout title="Shop Not Found">
        <p className="text-sm text-red-600">{error || "Shop not found"}</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-4xl space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <Link href="/admin/shops">
            <a className="text-gray-400 hover:text-gray-600">Shops</a>
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-900 font-medium">{shop.name}</span>
        </div>

        {/* Shop header */}
        <div className={`bg-white rounded-xl border p-6 ${!shop.isActive ? "border-red-200 bg-red-50/30" : "border-gray-200"}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl font-bold text-gray-900">{shop.name}</h2>
                {!shop.isActive && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-700 font-semibold">
                    Suspended
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400 mt-0.5">
                Code: <span className="font-mono text-gray-600">{shop.code}</span>
                {shop.address ? ` · ${shop.address}` : ""}
                {shop.phone ? ` · ${shop.phone}` : ""}
              </p>
              {!shop.isActive && shop.suspendReason && (
                <p className="mt-2 text-sm text-red-600 bg-red-100 rounded-lg px-3 py-2">
                  <span className="font-medium">Reason:</span> {shop.suspendReason}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {shop.isActive ? (
                <button
                  onClick={() => { setShowSuspend(true); setSuspendReason(""); setFormError(""); }}
                  className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700
                             border border-red-200 hover:border-red-400 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  Suspend
                </button>
              ) : (
                <button
                  onClick={handleReactivate}
                  className="flex items-center gap-2 text-sm text-green-700 hover:text-green-800
                             border border-green-300 hover:border-green-500 hover:bg-green-50 px-3 py-2 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Reactivate
                </button>
              )}
              <button
                onClick={() => setShowEdit(true)}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900
                           border border-gray-300 hover:border-gray-400 px-3 py-2 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Today", ...stats.today },
              { label: "This Week", ...stats.thisWeek },
              { label: "This Month", ...stats.thisMonth },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-xs text-gray-500 font-medium">{s.label}</p>
                <p className="text-xl font-bold text-gray-900 mt-1">Rs. {fmt(s.revenue)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.orders} orders</p>
              </div>
            ))}
          </div>
        )}

        {/* Chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Revenue — Last 7 Days</h3>
          <MiniBarChart data={chart} />
        </div>

        {/* Users */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800 text-sm">Users</h3>
            <button
              onClick={() => { setShowAddUser(true); setFormError(""); }}
              className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add User
            </button>
          </div>

          {users.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-sm text-gray-400">No users yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between px-6 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-medium text-gray-500 uppercase">
                        {u.username.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">{u.username}</p>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            u.role === "admin"
                              ? "bg-indigo-50 text-indigo-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {u.role}
                        </span>
                        {!u.isActive && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">
                            inactive
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditUser(u);
                        setEditUserForm({ role: u.role, isActive: u.isActive, password: "" });
                        setFormError("");
                      }}
                      className="text-xs text-gray-500 hover:text-indigo-600 px-3 py-1.5
                                 rounded-lg hover:bg-indigo-50 transition-colors"
                    >
                      Edit
                    </button>
                    {u.isActive && (
                      <button
                        onClick={() => handleDeactivate(u)}
                        className="text-xs text-red-500 hover:text-red-700 px-3 py-1.5
                                   rounded-lg hover:bg-red-50 transition-colors"
                      >
                        Deactivate
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit shop modal */}
      {showEdit && (
        <Modal title="Edit Shop" onClose={() => { setShowEdit(false); setFormError(""); setCodeError(""); }}>
          <form onSubmit={handleEditShop} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Shop Name *">
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
              </Field>
              <Field label="Shop Code *">
                <div>
                  <Input
                    value={editForm.code}
                    onChange={(e) => handleCodeChange(e.target.value)}
                    required
                    className={codeError ? "border-red-400 focus:ring-red-500" : ""}
                  />
                  {codeError && (
                    <p className="text-xs text-red-600 mt-1">{codeError}</p>
                  )}
                </div>
              </Field>
            </div>
            <Field label="Address">
              <Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} placeholder="Street, City" />
            </Field>
            <Field label="Phone">
              <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="07XXXXXXXX" />
            </Field>
            {formError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</div>
            )}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => { setShowEdit(false); setFormError(""); setCodeError(""); }}
                className="flex-1 px-4 py-2.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving || !!codeError}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded-lg transition-colors">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add user modal */}
      {showAddUser && (
        <Modal title="Add User" onClose={() => { setShowAddUser(false); setFormError(""); }}>
          <form onSubmit={handleAddUser} className="space-y-4">
            <Field label="Username *">
              <Input value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} placeholder="cashier1" required />
            </Field>
            <Field label="Password *">
              <div className="relative">
                <Input type={showUserPw ? "text" : "password"} value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} placeholder="••••••••" required />
                <button type="button" onClick={() => setShowUserPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showUserPw
                    ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                    : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  }
                </button>
              </div>
            </Field>
            <Field label="Role">
              <select
                value={userForm.role}
                onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="cashier">Cashier</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            {formError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</div>
            )}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => { setShowAddUser(false); setFormError(""); }}
                className="flex-1 px-4 py-2.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded-lg transition-colors">
                {saving ? "Adding..." : "Add User"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Suspend shop modal */}
      {showSuspend && (
        <Modal title="Suspend Shop" onClose={() => { setShowSuspend(false); setFormError(""); }}>
          <form onSubmit={handleSuspend} className="space-y-4">
            <p className="text-sm text-gray-600">
              Suspending <span className="font-semibold text-gray-900">{shop.name}</span> will block all logins for this shop.
            </p>
            <Field label="Reason (optional)">
              <textarea
                value={suspendReason}
                onChange={e => setSuspendReason(e.target.value)}
                placeholder="e.g. Overdue payment, policy violation..."
                rows={3}
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder-gray-400 resize-none"
              />
            </Field>
            {formError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</div>
            )}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => { setShowSuspend(false); setFormError(""); }}
                className="flex-1 px-4 py-2.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-lg transition-colors">
                {saving ? "Suspending..." : "Suspend Shop"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit user modal */}
      {editUser && (
        <Modal title={`Edit User — ${editUser.username}`} onClose={() => { setEditUser(null); setFormError(""); }}>
          <form onSubmit={handleEditUser} className="space-y-4">
            <Field label="Role">
              <select
                value={editUserForm.role}
                onChange={(e) => setEditUserForm({ ...editUserForm, role: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="cashier">Cashier</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            <Field label="Status">
              <select
                value={editUserForm.isActive ? "active" : "inactive"}
                onChange={(e) => setEditUserForm({ ...editUserForm, isActive: e.target.value === "active" })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
            <Field label="New Password (leave blank to keep)">
              <div className="relative">
                <Input type={showEditUserPw ? "text" : "password"} value={editUserForm.password}
                  onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })}
                  placeholder="••••••••" />
                <button type="button" onClick={() => setShowEditUserPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showEditUserPw
                    ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                    : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  }
                </button>
              </div>
            </Field>
            {formError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</div>
            )}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => { setEditUser(null); setFormError(""); }}
                className="flex-1 px-4 py-2.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded-lg transition-colors">
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </AdminLayout>
  );
}
