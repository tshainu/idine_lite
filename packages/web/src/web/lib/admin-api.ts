// Simple fetch wrapper for admin API calls
const BASE = "/api/admin";

function getToken(): string {
  return localStorage.getItem("admin_token") ?? "";
}

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}

export const adminApi = {
  login: (password: string) =>
    request("/login", { method: "POST", body: JSON.stringify({ password }) }),

  logout: () =>
    request("/logout", { method: "POST" }),

  dashboard: (range?: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (range) params.set("range", range);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return request(`/dashboard${qs ? "?" + qs : ""}`);
  },

  shops: {
    list: () => request("/shops"),
    get: (id: number) => request(`/shops/${id}`),
    create: (data: any) => request("/shops", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: any) =>
      request(`/shops/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number) => request(`/shops/${id}`, { method: "DELETE" }),
    suspend: (id: number, suspend: boolean, reason?: string) =>
      request(`/shops/${id}/suspend`, { method: "PATCH", body: JSON.stringify({ suspend, reason }) }),
    uploadReceiptHeader: (id: number, image: string | null) =>
      request(`/shops/${id}/receipt-header`, { method: "PATCH", body: JSON.stringify({ image }) }),
  },

  users: {
    create: (shopId: number, data: any) =>
      request(`/shops/${shopId}/users`, { method: "POST", body: JSON.stringify(data) }),
    update: (shopId: number, userId: number, data: any) =>
      request(`/shops/${shopId}/users/${userId}`, { method: "PUT", body: JSON.stringify(data) }),
    deactivate: (shopId: number, userId: number) =>
      request(`/shops/${shopId}/users/${userId}`, { method: "DELETE" }),
  },
};
