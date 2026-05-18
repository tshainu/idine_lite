import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
  AUTH_TOKEN: "idine_auth_token",
  AUTH_USER: "idine_auth_user",
  AUTH_SHOP: "idine_auth_shop",
  LAST_SYNC: "idine_last_sync",
  API_URL: "idine_api_url",
  PRINTER_ADDRESS: "idine_printer_address",
  WIFI_PRINTER_IP: "idine_wifi_printer_ip",
  WIFI_PRINTER_PORT: "idine_wifi_printer_port",
  PRINTER_TYPE: "idine_printer_type",
  PAPER_SIZE: "idine_paper_size",
  RECEIPT_FOOTER: "idine_receipt_footer",
  KOT_PRINTER_ENABLED: "idine_kot_printer_enabled",
  KOT_PRINTER_IP: "idine_kot_printer_ip",
  KOT_PRINTER_PORT: "idine_kot_printer_port",
};

export interface AuthUser {
  id: number;
  username: string;
  role: "admin" | "cashier";
}

export interface AuthShop {
  id: number;
  name: string;
  code: string;
  address?: string;
  phone?: string;
}

export const store = {
  async getToken(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.AUTH_TOKEN);
  },
  async setToken(token: string) {
    return AsyncStorage.setItem(KEYS.AUTH_TOKEN, token);
  },
  async getUser(): Promise<AuthUser | null> {
    const val = await AsyncStorage.getItem(KEYS.AUTH_USER);
    return val ? JSON.parse(val) : null;
  },
  async setUser(user: AuthUser) {
    return AsyncStorage.setItem(KEYS.AUTH_USER, JSON.stringify(user));
  },
  async getShop(): Promise<AuthShop | null> {
    const val = await AsyncStorage.getItem(KEYS.AUTH_SHOP);
    return val ? JSON.parse(val) : null;
  },
  async setShop(shop: AuthShop) {
    return AsyncStorage.setItem(KEYS.AUTH_SHOP, JSON.stringify(shop));
  },
  async getLastSync(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.LAST_SYNC);
  },
  async setLastSync(iso: string) {
    return AsyncStorage.setItem(KEYS.LAST_SYNC, iso);
  },
  async getApiUrl(): Promise<string> {
    const val = await AsyncStorage.getItem(KEYS.API_URL);
    return val ?? "https://j7j5e2adzj0r7hr6tyiah-preview-4200.runable.site";
  },
  async setApiUrl(url: string) {
    return AsyncStorage.setItem(KEYS.API_URL, url);
  },
  async getPrinterAddress(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.PRINTER_ADDRESS);
  },
  async setPrinterAddress(addr: string) {
    return AsyncStorage.setItem(KEYS.PRINTER_ADDRESS, addr);
  },
  async getWifiPrinterIp(): Promise<string> {
    const val = await AsyncStorage.getItem(KEYS.WIFI_PRINTER_IP);
    return val ?? "";
  },
  async setWifiPrinterIp(ip: string) {
    return AsyncStorage.setItem(KEYS.WIFI_PRINTER_IP, ip);
  },
  async getWifiPrinterPort(): Promise<string> {
    const val = await AsyncStorage.getItem(KEYS.WIFI_PRINTER_PORT);
    return val ?? "9100";
  },
  async setWifiPrinterPort(port: string) {
    return AsyncStorage.setItem(KEYS.WIFI_PRINTER_PORT, port);
  },
  async getPrinterType(): Promise<"bluetooth" | "wifi"> {
    const val = await AsyncStorage.getItem(KEYS.PRINTER_TYPE);
    return (val as "bluetooth" | "wifi") ?? "bluetooth";
  },
  async setPrinterType(type: "bluetooth" | "wifi") {
    return AsyncStorage.setItem(KEYS.PRINTER_TYPE, type);
  },
  async getPaperSize(): Promise<"58" | "80"> {
    const val = await AsyncStorage.getItem(KEYS.PAPER_SIZE);
    return (val as "58" | "80") ?? "58";
  },
  async setPaperSize(size: "58" | "80") {
    return AsyncStorage.setItem(KEYS.PAPER_SIZE, size);
  },
  async getReceiptFooter(): Promise<string> {
    const val = await AsyncStorage.getItem(KEYS.RECEIPT_FOOTER);
    return val ?? "Thank you! Come again";
  },
  async setReceiptFooter(text: string) {
    return AsyncStorage.setItem(KEYS.RECEIPT_FOOTER, text);
  },
  async getKotPrinterEnabled(): Promise<boolean> {
    const val = await AsyncStorage.getItem(KEYS.KOT_PRINTER_ENABLED);
    return val === "true";
  },
  async setKotPrinterEnabled(enabled: boolean) {
    return AsyncStorage.setItem(KEYS.KOT_PRINTER_ENABLED, enabled ? "true" : "false");
  },
  async getKotPrinterIp(): Promise<string> {
    const val = await AsyncStorage.getItem(KEYS.KOT_PRINTER_IP);
    return val ?? "";
  },
  async setKotPrinterIp(ip: string) {
    return AsyncStorage.setItem(KEYS.KOT_PRINTER_IP, ip);
  },
  async getKotPrinterPort(): Promise<string> {
    const val = await AsyncStorage.getItem(KEYS.KOT_PRINTER_PORT);
    return val ?? "9100";
  },
  async setKotPrinterPort(port: string) {
    return AsyncStorage.setItem(KEYS.KOT_PRINTER_PORT, port);
  },
  async clearAuth() {
    return AsyncStorage.multiRemove([KEYS.AUTH_TOKEN, KEYS.AUTH_USER, KEYS.AUTH_SHOP]);
  },
};
