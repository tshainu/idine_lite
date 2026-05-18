import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import AdminLayout from "./layout";
import { adminApi } from "../../lib/admin-api";

const BUSINESS_TYPES = [
  "Restaurant",
  "Cafe / Coffee Shop",
  "Fast Food",
  "Bakery",
  "Food Court",
  "Bar / Pub",
  "Hotel Restaurant",
  "Catering",
  "Cloud Kitchen",
  "Juice Bar",
  "Ice Cream Shop",
  "Pizzeria",
  "Other",
];

interface Shop {
  id: number;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  ownerName: string | null;
  businessType: string | null;
  isActive: boolean;
  createdAt: string;
}

function genShopCode(): string {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // skip I, O
  const letter = alpha[Math.floor(Math.random() * alpha.length)];
  const digits = String(Math.floor(100 + Math.random() * 900));
  return letter + digits;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
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

const inputCls = `w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm
  focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
  placeholder-gray-400 bg-white`;

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${inputCls} ${props.className ?? ""}`}>
      {props.children}
    </select>
  );
}

const emptyForm = () => ({
  name: "",
  code: genShopCode(),
  address: "",
  phone: "",
  ownerName: "",
  ownerMobile: "",
  businessType: "",
  remarks: "",
  adminUsername: "",
  adminPassword: "",
});

export default function AdminShops() {
  const [, nav] = useLocation();
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showCreatePw, setShowCreatePw] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Shop | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [search, setSearch] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await adminApi.shops.list();
      setShops(data.shops);
    } catch (e: any) {
      if (e.message === "Unauthorized") {
        localStorage.removeItem("admin_token");
        nav("/admin/login");
      }
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setForm(emptyForm());
    setError("");
    setShowCreate(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await adminApi.shops.create(form);
      setShowCreate(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await adminApi.shops.delete(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const q = search.toLowerCase().trim();
  const filtered = q
    ? shops.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.address ?? "").toLowerCase().includes(q) ||
        (s.ownerName ?? "").toLowerCase().includes(q) ||
        (s.phone ?? "").toLowerCase().includes(q) ||
        (s.businessType ?? "").toLowerCase().includes(q)
      )
    : shops;

  return (
    <AdminLayout title="Shops">
      <div className="max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, code, address, owner..."
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-300 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                         placeholder-gray-400"
            />
            {search && (
              <button onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white
                       text-sm font-medium px-4 py-2.5 rounded-lg transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Shop
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : shops.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <p className="text-sm text-gray-500">No shops yet</p>
            <button onClick={openCreate} className="mt-4 text-sm text-indigo-600 hover:text-indigo-700 font-medium">
              Create your first shop →
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {filtered.length === 0 && (
              <div className="px-6 py-10 text-center">
                <p className="text-sm text-gray-400">No shops match "{search}"</p>
                <button onClick={() => setSearch("")} className="mt-2 text-xs text-indigo-600 hover:text-indigo-700">Clear search</button>
              </div>
            )}
            {filtered.map((shop) => (
              <div key={shop.id} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex-1 cursor-pointer" onClick={() => nav(`/admin/shops/${shop.id}`)}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16" />
                      </svg>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">{shop.name}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          shop.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                        }`}>
                          {shop.isActive ? "Active" : "Suspended"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        <span className="font-mono font-semibold text-gray-600">{shop.code}</span>
                        {shop.address ? <> · <span className="text-gray-500">{shop.address}</span></> : ""}
                        {shop.ownerName ? ` · ${shop.ownerName}` : ""}
                        {shop.businessType ? ` · ${shop.businessType}` : ""}
                        {shop.phone ? ` · ${shop.phone}` : ""}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => nav(`/admin/shops/${shop.id}`)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                  >
                    Manage
                  </button>
                  <button
                    onClick={() => { setError(""); setDeleteTarget(shop); }}
                    className="text-xs text-red-500 hover:text-red-700 font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Create modal ── */}
      {showCreate && (
        <Modal title="Add New Shop" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="space-y-4">

            {/* Shop ID — auto generated, read-only with regenerate button */}
            <Field label="Shop ID">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    value={form.code}
                    readOnly
                    className="font-mono font-bold text-indigo-700 bg-indigo-50 border-indigo-200 cursor-default"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => set("code", genShopCode())}
                  title="Regenerate ID"
                  className="px-3 py-2 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-100 transition-colors text-sm"
                >
                  ↻
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Auto-generated. Click ↻ to regenerate.</p>
            </Field>

            <Field label="Shop / Branch Name *">
              <Input
                value={form.name}
                onChange={e => set("name", e.target.value)}
                placeholder="e.g. Main Branch"
                required
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Owner's Name">
                <Input
                  value={form.ownerName}
                  onChange={e => set("ownerName", e.target.value)}
                  placeholder="Full name"
                />
              </Field>
              <Field label="Owner's Mobile">
                <Input
                  value={form.ownerMobile}
                  onChange={e => set("ownerMobile", e.target.value)}
                  placeholder="07XXXXXXXX"
                  type="tel"
                />
              </Field>
            </div>

            <Field label="Business Type">
              <Select
                value={form.businessType}
                onChange={e => set("businessType", e.target.value)}
              >
                <option value="">— Select type —</option>
                {BUSINESS_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Phone">
                <Input
                  value={form.phone}
                  onChange={e => set("phone", e.target.value)}
                  placeholder="07XXXXXXXX"
                />
              </Field>
              <Field label="Address">
                <Input
                  value={form.address}
                  onChange={e => set("address", e.target.value)}
                  placeholder="Street, City"
                />
              </Field>
            </div>

            <Field label="Remarks">
              <textarea
                value={form.remarks}
                onChange={e => set("remarks", e.target.value)}
                placeholder="Any notes about this shop or customer..."
                rows={3}
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-400 resize-none"
              />
            </Field>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">
                Initial Admin User (optional)
              </p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Username">
                  <Input
                    value={form.adminUsername}
                    onChange={e => set("adminUsername", e.target.value)}
                    placeholder="admin"
                  />
                </Field>
                <Field label="Password">
                  <div className="relative">
                    <Input
                      type={showCreatePw ? "text" : "password"}
                      value={form.adminPassword}
                      onChange={e => set("adminPassword", e.target.value)}
                      placeholder="••••••••"
                    />
                    <button type="button" onClick={() => setShowCreatePw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showCreatePw
                        ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                        : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      }
                    </button>
                  </div>
                </Field>
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="flex-1 px-4 py-2.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded-lg transition-colors"
              >
                {saving ? "Creating..." : "Create Shop"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Delete confirm ── */}
      {deleteTarget && (
        <Modal title="Delete Shop" onClose={() => setDeleteTarget(null)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to delete <span className="font-semibold">{deleteTarget.name}</span>?
              This cannot be undone.
            </p>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-lg transition-colors"
              >
                {saving ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
