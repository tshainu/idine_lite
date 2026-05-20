import { Platform } from "react-native";
import { store } from "./store";
import db, { initDatabase } from "./database";
import { pullAllFromServer } from "./serverApi";

export const loginUser = async (shopCode: string, username: string, password: string) => {
  const apiUrl = await store.getApiUrl();

  const res = await fetch(`${apiUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shopCode, username, password }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? "Login failed");
  }

  const data = await res.json();

  // Save to async storage
  await store.setToken(data.token);
  await store.setUser(data.user);
  await store.setShop(data.shop);
  // Save receipt header image (may be null if not set)
  await store.setReceiptHeaderImage(data.shop?.receiptHeaderImage ?? null);

  // Cache shop + user locally (native only)
  if (Platform.OS !== "web") {
    db.runSync(
      "INSERT OR REPLACE INTO shops (id, code, name) VALUES (?, ?, ?)",
      [data.shop.id, data.shop.code, data.shop.name]
    );
    db.runSync(
      "INSERT OR REPLACE INTO users (id, shop_id, username, role) VALUES (?, ?, ?, ?)",
      [data.user.id, data.shop.id, data.user.username, data.user.role]
    );

    // Pull all shop data from server into local DB
    await pullAllFromServer(data.shop.id);
  }

  return data;
};

export const logoutUser = async () => {
  await store.clearAuth();
};

export const getSession = async () => {
  const [token, user, shop] = await Promise.all([
    store.getToken(),
    store.getUser(),
    store.getShop(),
  ]);
  if (!token || !user || !shop) return null;
  return { token, user, shop };
};
