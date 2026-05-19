import {
  BackHandler, useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  FlatList, Modal, TextInput, Alert, Platform, useWindowDimensions, Image,
  Animated, RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  List, MagnifyingGlass, X, Check, Printer, CookingPot,
} from "phosphor-react-native";
import { Colors, Spacing, Radius } from "../lib/theme";
import db from "../lib/database";
import { getSession } from "../lib/auth";
import { store } from "../lib/store";
import * as Crypto from "expo-crypto";
import { printWifi, printBluetooth, buildReceiptEsc, buildKotEsc, type PaperSize } from "../lib/printer";

interface Category { id: number; name: string; }
interface Product { id: number; name: string; price: number; category_id: number; image_url?: string; description?: string; portions: Portion[]; }
interface Portion { id: number; name: string; price: number; }
interface CartItem {
  productId: number;
  portionId?: number;
  productName: string;
  portionName?: string;
  qty: number;
  unitPrice: number;
}
interface RecentOrder {
  id: number;
  created_at: number;
  total: number;
  discount: number;
  status: string;
  order_type?: "dine-in" | "takeaway";
  items: { product_name: string; portion_name?: string; qty: number; unit_price: number; line_total: number; }[];
}

// Web demo data
const DEMO_CATS: Category[] = [
  { id: -2, name: "Popular" }, { id: -3, name: "All Items" },
  { id: 1, name: "Sri Lankan" }, { id: 2, name: "Indian" },
  { id: 3, name: "Chinees" }, { id: 4, name: "Beverages" },
];
const DEMO_PRODS: Product[] = [
  { id: 1, name: "Poori set", price: 600, category_id: 1, description: "3 pooris with spicy side dishes", portions: [{ id: 1, name: "Full Set", price: 850 }, { id: 2, name: "Regular", price: 600 }] },
  { id: 2, name: "Ittaly", price: 300, category_id: 1, description: "Soft steamed rice cakes", portions: [] },
  { id: 3, name: "Pongal", price: 180, category_id: 1, description: "Rice & lentil dish", portions: [] },
  { id: 4, name: "Rava Ittaly", price: 300, category_id: 1, description: "Semolina steamed cakes", portions: [] },
  { id: 5, name: "Vadai", price: 230, category_id: 1, description: "Crispy lentil fritters", portions: [] },
  { id: 6, name: "Dosai", price: 200, category_id: 1, description: "Crispy rice crepe", portions: [{ id: 3, name: "Reg.", price: 200 }, { id: 4, name: "Full", price: 350 }] },
  { id: 7, name: "Parota", price: 240, category_id: 1, description: "Layered flatbread", portions: [] },
  { id: 8, name: "Adam", price: 420, category_id: 1, description: "Spicy dish", portions: [] },
  { id: 9, name: "Uttapam", price: 450, category_id: 1, description: "Thick savory pancake", portions: [] },
  { id: 10, name: "Onion Dosa", price: 650, category_id: 2, description: "Crispy dosa with onion", portions: [] },
  { id: 11, name: "Kadalai", price: 200, category_id: 2, description: "Spiced chickpeas", portions: [] },
];

const DEMO_ORDERS: RecentOrder[] = [
  {
    id: 2322, created_at: Date.now() - 1000 * 60 * 15, total: 2700, discount: 200, status: "billed",
    items: [
      { product_name: "Poori set", portion_name: "Reg", qty: 1, unit_price: 600, line_total: 600 },
      { product_name: "Chik kothu", portion_name: "Full", qty: 1, unit_price: 1300, line_total: 1300 },
      { product_name: "Pepsi", portion_name: "Meg", qty: 2, unit_price: 850, line_total: 1700 },
    ],
  },
  {
    id: 2321, created_at: Date.now() - 1000 * 60 * 45, total: 1200, discount: 0, status: "billed",
    items: [
      { product_name: "Dosai", portion_name: "Reg", qty: 2, unit_price: 200, line_total: 400 },
      { product_name: "Adam", portion_name: undefined, qty: 2, unit_price: 420, line_total: 840 },
    ],
  },
];

// ── Portion qty tracker ──────────────────────────────────────
type PortionQtyMap = Record<number, number>; // portionId → qty; -1 = base price

// ── Side Drawer Component ─────────────────────────────────────
function DrawerMenu({ session, onClose, onNavigate }: {
  session: any;
  onClose: () => void;
  onNavigate: (route: string) => void;
}) {
  const [expandedSection, setExpandedSection] = useState<string | null>("items");

  const toggleSection = (key: string) => {
    setExpandedSection((prev) => (prev === key ? null : key));
  };

  const nav = (route: string) => onNavigate(route);

  return (
    <View style={ds.drawer}>
      {/* Profile header */}
      <View style={ds.profileSection}>
        <View style={ds.avatar}>
          <Text style={ds.avatarText}>
            {(session?.user?.name || session?.user?.username || "U").charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={ds.userName}>
          {session?.user?.name || session?.user?.username || "User"}{" "}
          <Text style={ds.userRole}>({session?.user?.role || "Admin"})</Text>
        </Text>
        {session?.shop?.name && <Text style={ds.shopName}>{session.shop.name}</Text>}
        {session?.shop?.phone && <Text style={ds.shopInfo}>{session.shop.phone}</Text>}
        {session?.user?.username && <Text style={ds.shopInfo}>Username: {session.user.username}</Text>}
      </View>

      <ScrollView style={ds.menuList} showsVerticalScrollIndicator={false}>

        {/* ── 1. Item Management ── */}
        <TouchableOpacity style={ds.sectionHeader} onPress={() => toggleSection("items")}>
          <Text style={ds.sectionNum}>1.</Text>
          <Text style={ds.sectionLabel}>Item Management</Text>
          <Text style={ds.chevron}>{expandedSection === "items" ? "▲" : "▼"}</Text>
        </TouchableOpacity>
        {expandedSection === "items" && (
          <View style={ds.subList}>
            <TouchableOpacity style={ds.subItem} onPress={() => nav("/add-item")}>
              <Text style={ds.subDot}>›</Text>
              <Text style={ds.subLabel}>Add Item</Text>
            </TouchableOpacity>
            <TouchableOpacity style={ds.subItem} onPress={() => nav("/items")}>
              <Text style={ds.subDot}>›</Text>
              <Text style={ds.subLabel}>List Items</Text>
            </TouchableOpacity>
            <TouchableOpacity style={ds.subItem} onPress={() => nav("/categories")}>
              <Text style={ds.subDot}>›</Text>
              <Text style={ds.subLabel}>Categories</Text>
            </TouchableOpacity>
            <TouchableOpacity style={ds.subItem} onPress={() => nav("/portions")}>
              <Text style={ds.subDot}>›</Text>
              <Text style={ds.subLabel}>Portions</Text>
            </TouchableOpacity>
            <TouchableOpacity style={ds.subItem} onPress={() => nav("/units")}>
              <Text style={ds.subDot}>›</Text>
              <Text style={ds.subLabel}>Units</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={ds.menuDivider} />

        {/* ── 2. User Management ── */}
        <TouchableOpacity style={ds.sectionHeader} onPress={() => nav("/users")}>
          <Text style={ds.sectionNum}>2.</Text>
          <Text style={ds.sectionLabel}>User Management</Text>
          <Text style={ds.chevron}>›</Text>
        </TouchableOpacity>

        <View style={ds.menuDivider} />

        {/* ── 3. Settings ── */}
        <TouchableOpacity style={ds.sectionHeader} onPress={() => nav("/settings")}>
          <Text style={ds.sectionNum}>3.</Text>
          <Text style={ds.sectionLabel}>Settings</Text>
          <Text style={ds.chevron}>›</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Close */}
      <TouchableOpacity style={ds.closeBtn} onPress={onClose}>
        <Text style={ds.closeBtnText}>Close</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Reusable NumPad ──────────────────────────────────────────────────────────
function NumPad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const press = (key: string) => {
    if (key === "⌫") { onChange(value.slice(0, -1)); return; }
    if (key === "." && value.includes(".")) return;
    if (key === "." && value === "") { onChange("0."); return; }
    onChange(value + key);
  };
  const keys = ["1","2","3","4","5","6","7","8","9",".","0","⌫"];
  return (
    <View style={np.grid}>
      {keys.map((k) => (
        <TouchableOpacity key={k} style={[np.key, k === "⌫" && np.keyDel]} onPress={() => press(k)} activeOpacity={0.6}>
          <Text style={[np.keyTxt, k === "⌫" && np.keyDelTxt]}>{k}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
const np = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 12, gap: 8 },
  key: {
    width: "30%", paddingVertical: 14, borderRadius: 10,
    backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center",
    flexGrow: 1,
  },
  keyDel: { backgroundColor: "#FFE8E8" },
  keyTxt: { fontSize: 20, fontWeight: "600", color: "#222" },
  keyDelTxt: { color: "#C0392B" },
});
// ── Cash NumPad (layout matches design: 1-9, < 0 .) ────────────────────────
function NumPadCash({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const press = (key: string) => {
    if (key === "<") { onChange(value.slice(0, -1)); return; }
    if (key === "." && value.includes(".")) return;
    if (key === "." && value === "") { onChange("0."); return; }
    onChange(value + key);
  };
  const rows = [["1","2","3"],["4","5","6"],["7","8","9"],["<","0","."]];
  return (
    <View style={npc.wrap}>
      {rows.map((row, ri) => (
        <View key={ri} style={npc.row}>
          {row.map((k) => (
            <TouchableOpacity key={k} style={[npc.key, k === "<" && npc.keyDel]} onPress={() => press(k)} activeOpacity={0.55}>
              <Text style={[npc.keyTxt, k === "<" && npc.keyDelTxt]}>{k}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
}
const npc = StyleSheet.create({
  wrap: { marginTop: 10, gap: 8 },
  row: { flexDirection: "row", gap: 8 },
  key: {
    flex: 1, paddingVertical: 13, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.green,
    alignItems: "center", justifyContent: "center", backgroundColor: "#fff",
  },
  keyDel: { borderColor: "#CCC", backgroundColor: "#F5F5F5" },
  keyTxt: { fontSize: 20, fontWeight: "700", color: "#222" },
  keyDelTxt: { color: "#888" },
});
// ─────────────────────────────────────────────────────────────────────────────

export default function BillingScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const ITEM_W = (width - Spacing.sm * 5) / 4;

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [soldCounts, setSoldCounts] = useState<Record<number, number>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCat, setSelectedCat] = useState<number>(-2);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [session, setSession] = useState<any>(null);
  const [billNo, setBillNo] = useState(1);
  const [printerType, setPrinterType] = useState<"bluetooth" | "wifi">("bluetooth");
  const [printerAddr, setPrinterAddr] = useState("");
  const [wifiPrinterIp, setWifiPrinterIp] = useState("");
  const [wifiPrinterPort, setWifiPrinterPort] = useState("9100");
  const [paperSize, setPaperSize] = useState<PaperSize>("58");
  const [receiptFooter, setReceiptFooter] = useState("Thank you! Come again");
  const [kotPrinterEnabled, setKotPrinterEnabled] = useState(false);
  const [kotPrinterIp, setKotPrinterIp] = useState("");
  const [kotPrinterPort, setKotPrinterPort] = useState("9100");

  // Drawer animation
  const slideAnim = useRef(new Animated.Value(-300)).current;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSlid, setDrawerSlid] = useState(false); // web: CSS transition trigger

  const openDrawer = () => {
    if (Platform.OS === "web") {
      setDrawerOpen(true);
      setDrawerSlid(false);
      setTimeout(() => setDrawerSlid(true), 20);
    } else {
      slideAnim.setValue(-300);
      setDrawerOpen(true);
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
  const [portionModal, setPortionModal] = useState<Product | null>(null);
  const [portionQtys, setPortionQtys] = useState<PortionQtyMap>({});
  const [cashModal, setCashModal] = useState(false);
  const [discountModal, setDiscountModal] = useState(false);
  const [foodItemModal, setFoodItemModal] = useState(false);  // 1st icon = "just bill"
  const [kotModal, setKotModal] = useState(false);
  const [recentModal, setRecentModal] = useState(false);
  const [receiptModal, setReceiptModal] = useState(false);
  const [orderType, setOrderType] = useState<"dine-in" | "takeaway">("dine-in");
  const [receiptData, setReceiptData] = useState<{
    billNo: number; date: string; time: string;
    shopName: string; shopAddress: string; shopPhone: string;
    cashier: string; orderType: "dine-in" | "takeaway";
    items: { name: string; portionName?: string; qty: number; price: number; amt: number }[];
    subtotal: number; discount: number; total: number; paid: number; balance: number;
  } | null>(null);

  const [collected, setCollected] = useState("");
  const [discountInput, setDiscountInput] = useState("");
  const [foodItemPrice, setFoodItemPrice] = useState("");
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);

  // Hardware back button — close receipt modal if open
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (receiptModal) { setReceiptModal(false); return true; }
      return false;
    });
    return () => sub.remove();
  }, [receiptModal]);

  useEffect(() => {
    getSession().then(setSession);
    loadData();
    // Load printer config
    Promise.all([
      store.getPrinterType(),
      store.getPrinterAddress(),
      store.getWifiPrinterIp(),
      store.getWifiPrinterPort(),
      store.getPaperSize(),
      store.getReceiptFooter(),
      store.getKotPrinterEnabled(),
      store.getKotPrinterIp(),
      store.getKotPrinterPort(),
    ]).then(([ptype, addr, ip, port, paper, footer, kotEnabled, kotIp, kotPort]) => {
      setPrinterType(ptype);
      setPrinterAddr(addr ?? "");
      setWifiPrinterIp(ip);
      setWifiPrinterPort(port);
      setPaperSize(paper);
      setReceiptFooter(footer);
      setKotPrinterEnabled(kotEnabled);
      setKotPrinterIp(kotIp);
      setKotPrinterPort(kotPort);
    });
  }, []);

  const loadData = () => {
    if (Platform.OS === "web") {
      setCategories(DEMO_CATS);
      setProducts(DEMO_PRODS);
      setBillNo(34);
      return;
    }
    try {
      const cats = db.getAllSync("SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order") as Category[];
      const prods = db.getAllSync("SELECT * FROM products WHERE deleted_at IS NULL AND is_available = 1") as Product[];
      const portions = db.getAllSync("SELECT * FROM portions WHERE deleted_at IS NULL") as any[];
      const prodsWithPortions = prods.map((p) => ({
        ...p,
        portions: portions.filter((po) => po.product_id === p.id),
      }));
      const lastOrder = db.getFirstSync("SELECT MAX(id) as maxId FROM orders") as any;
      setBillNo((lastOrder?.maxId ?? 0) + 1);
      // Load sold counts per product
      const sold = db.getAllSync(
        "SELECT product_id, SUM(qty) as total FROM order_items GROUP BY product_id"
      ) as { product_id: number; total: number }[];
      const countMap: Record<number, number> = {};
      sold.forEach((r) => { countMap[r.product_id] = r.total; });
      setSoldCounts(countMap);
      setCategories([{ id: -2, name: "Popular" }, { id: -3, name: "All Items" }, ...cats]);
      setProducts(prodsWithPortions);
    } catch (e) {
      console.warn("DB load failed", e);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
    setRefreshing(false);
  };

  const loadRecentOrders = () => {
    if (Platform.OS === "web") {
      setRecentOrders(DEMO_ORDERS);
      return;
    }
    try {
      const orders = db.getAllSync(
        "SELECT * FROM orders ORDER BY created_at DESC LIMIT 20"
      ) as any[];
      const result: RecentOrder[] = orders.map((o) => {
        const items = (db.getAllSync(
          "SELECT * FROM order_items WHERE order_id = ?", [o.id]
        ) as any[]).map(it => ({
          ...it,
          unit_price: parseFloat(it.unit_price) || 0,
          line_total: parseFloat(it.line_total) || 0,
          qty: parseInt(it.qty) || 0,
        }));
        return {
          ...o,
          total: parseFloat(o.total) || 0,
          discount: parseFloat(o.discount) || 0,
          items,
        };
      });
      setRecentOrders(result);
    } catch (e) {
      setRecentOrders([]);
    }
  };

  const filteredProducts = (() => {
    const filtered = products.filter((p) => {
      const matchCat = selectedCat === -2 || selectedCat === -3 || p.category_id === selectedCat;
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
    if (selectedCat === -2) {
      // Sort by most sold, unsold items go last
      return [...filtered].sort((a, b) => (soldCounts[b.id] ?? 0) - (soldCounts[a.id] ?? 0));
    }
    if (selectedCat === -3) {
      // All items alphabetical
      return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    }
    return filtered;
  })();

  // ── Portion modal: open with empty qty map ──
  const openPortionModal = (product: Product) => {
    const initQtys: PortionQtyMap = {};
    // base price (key -1)
    initQtys[-1] = 0;
    product.portions.forEach((p) => { initQtys[p.id] = 0; });
    setPortionQtys(initQtys);
    setPortionModal(product);
  };

  const changePortionQty = (key: number, delta: number) => {
    setPortionQtys((prev) => ({
      ...prev,
      [key]: Math.max(0, (prev[key] ?? 0) + delta),
    }));
  };

  const confirmPortionSelection = () => {
    if (!portionModal) return;
    let added = false;
    // base price
    const baseQty = portionQtys[-1] ?? 0;
    if (baseQty > 0) {
      for (let i = 0; i < baseQty; i++) addToCart(portionModal);
      added = true;
    }
    // each portion
    portionModal.portions.forEach((p) => {
      const qty = portionQtys[p.id] ?? 0;
      if (qty > 0) {
        for (let i = 0; i < qty; i++) addToCart(portionModal, p);
        added = true;
      }
    });
    if (!added) Alert.alert("Select at least one item");
    else setPortionModal(null);
  };

  const addToCart = (product: Product, portion?: Portion) => {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.productId === product.id && i.portionId === (portion?.id));
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], qty: updated[idx].qty + 1 };
        return updated;
      }
      return [...prev, {
        productId: product.id,
        portionId: portion?.id,
        productName: product.name,
        portionName: portion?.name,
        qty: 1,
        unitPrice: portion?.price ?? product.price,
      }];
    });
  };

  const handleSelectProduct = (product: Product) => {
    if (product.portions.length === 1) {
      // Only one portion — add it directly without showing modal
      addToCart(product, product.portions[0]);
    } else if (product.portions.length > 1) {
      openPortionModal(product);
    } else {
      addToCart(product);
    }
  };

  const updateQty = (idx: number, delta: number) => {
    setCart((prev) => {
      const updated = [...prev];
      const newQty = updated[idx].qty + delta;
      if (newQty <= 0) updated.splice(idx, 1);
      else updated[idx] = { ...updated[idx], qty: newQty };
      return updated;
    });
  };

  const subtotal = cart.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
  const total = Math.max(0, subtotal - discount);
  const change = parseFloat(collected || "0") - total;

  const now = new Date();
  const dateStr = `${now.getDate().toString().padStart(2,"0")}/${(now.getMonth()+1).toString().padStart(2,"0")}/${now.getFullYear()} ${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")} ${now.getHours() >= 12 ? "pm" : "am"}`;

  const saveOrder = (status: "billed" | "kot") => {
    if (cart.length === 0) { Alert.alert("Cart is empty"); return null; }
    if (Platform.OS === "web") { Alert.alert("Not available", "Billing requires the native app."); return null; }
    const localId = Crypto.randomUUID();
    const ts = Date.now();
    db.runSync(
      `INSERT INTO orders (local_id, shop_id, user_id, status, subtotal, discount, total, payment_method, order_type, kot_printed, synced, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [localId, session?.shop?.id ?? 1, session?.user?.id ?? 1, status, subtotal, discount, total, "cash", orderType, status === "kot" ? 1 : 0, ts, ts]
    );
    const orderId = (db.getFirstSync("SELECT last_insert_rowid() as id") as any)?.id;
    for (const item of cart) {
      db.runSync(
        `INSERT INTO order_items (order_id, product_id, portion_id, product_name, portion_name, qty, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, item.productId, item.portionId ?? null, item.productName, item.portionName ?? null, item.qty, item.unitPrice, item.qty * item.unitPrice]
      );
    }
    return orderId;
  };

  const handleBill = (_print: boolean) => {
    const paid = parseFloat(collected || "0");

    // Snapshot everything BEFORE clearing state
    const snapCart = cart.map(i => ({
      name: i.productName,
      portionName: i.portionName,
      qty: i.qty,
      price: i.unitPrice,
      amt: i.qty * i.unitPrice,
    }));
    const snapSubtotal = subtotal;
    const snapDiscount = discount;
    const snapTotal = total;
    const snapBillNo = billNo;

    const now = new Date();
    const dd = String(now.getDate()).padStart(2,"0");
    const mm = String(now.getMonth()+1).padStart(2,"0");
    const yyyy = now.getFullYear();
    const hh = String(now.getHours()).padStart(2,"0");
    const min = String(now.getMinutes()).padStart(2,"0");

    const data = {
      billNo: snapBillNo,
      date: `${dd}.${mm}.${yyyy}`,
      time: `${hh}:${min}`,
      shopName: session?.shop?.name ?? "iDine Lite",
      shopAddress: (session?.shop as any)?.address || "Chemani road, Nallur, Jaffna",
      shopPhone: session?.shop?.phone || "0711336666",
      cashier: session?.user?.username ?? "-",
      orderType,
      items: snapCart,
      subtotal: snapSubtotal,
      discount: snapDiscount,
      total: snapTotal,
      paid,
      balance: Math.max(0, paid - snapTotal),
    };

    // Save to DB (skip on web)
    if (Platform.OS !== "web") {
      saveOrder("billed");
    }

    // Clear cart + close cash modal
    setCashModal(false);
    setCart([]); setDiscount(0); setCollected("");
    setBillNo((prev) => prev + 1);
    setOrderType("dine-in");

    // Show receipt after modal transition settles
    setTimeout(() => {
      setReceiptData(data);
      setReceiptModal(true);
    }, 350);
  };

  const handlePrintReceipt = async (data: typeof receiptData) => {
    if (!data) return;

    const esc = buildReceiptEsc(paperSize, {
      shopName: data.shopName,
      shopAddress: data.shopAddress,
      shopPhone: data.shopPhone,
      billNo: data.billNo,
      date: data.date,
      time: data.time,
      cashier: data.cashier,
      orderType: data.orderType,
      items: data.items.map(it => ({ name: it.name, portionName: it.portionName, qty: it.qty, price: it.price, amt: it.amt })),
      subtotal: data.subtotal,
      discount: data.discount,
      total: data.total,
      paid: data.paid,
      balance: data.balance,
      receiptFooter,
    });

    try {
      if (printerType === "wifi") {
        if (!wifiPrinterIp) { Alert.alert("No WiFi Printer", "Set WiFi printer IP in Settings."); return; }
        await printWifi(wifiPrinterIp, parseInt(wifiPrinterPort || "9100"), esc);
      } else {
        if (!printerAddr) { Alert.alert("No Bluetooth Printer", "Set Bluetooth printer address in Settings."); return; }
        await printBluetooth(printerAddr, esc);
      }
      Alert.alert("Printed", "Receipt sent to printer.");
    } catch (e: any) {
      Alert.alert("Print Failed", e?.message ?? "Could not reach printer.");
    }
  };

  const handlePrintBillAndKOT = async (data: typeof receiptData) => {
    if (!data) return;

    // Build Bill ESC
    const billEsc = buildReceiptEsc(paperSize, {
      shopName: data.shopName,
      shopAddress: data.shopAddress,
      shopPhone: data.shopPhone,
      billNo: data.billNo,
      date: data.date,
      time: data.time,
      cashier: data.cashier,
      orderType: data.orderType,
      items: data.items.map(it => ({ name: it.name, portionName: it.portionName, qty: it.qty, price: it.price, amt: it.amt })),
      subtotal: data.subtotal,
      discount: data.discount,
      total: data.total,
      paid: data.paid,
      balance: data.balance,
      receiptFooter,
    });

    // Build KOT ESC from current receipt data items
    const now2 = new Date();
    const dd2 = now2.getDate().toString().padStart(2, "0");
    const mm2 = (now2.getMonth() + 1).toString().padStart(2, "0");
    const yyyy2 = now2.getFullYear();
    const hh2 = now2.getHours().toString().padStart(2, "0");
    const min2 = now2.getMinutes().toString().padStart(2, "0");

    const kotEsc = buildKotEsc(paperSize, {
      shopName: data.shopName,
      orderNo: String(data.billNo).padStart(3, "0"),
      cashier: data.cashier,
      dateTime: `${dd2}.${mm2}.${yyyy2} ${hh2}:${min2}`,
      orderType: data.orderType,
      items: data.items.map(it => {
        // item.name may be "ProductName (PortionName)" — split it back
        const match = it.name.match(/^(.+?)\s*\((.+)\)$/);
        return {
          name: match ? match[1] : it.name,
          portionName: match ? match[2] : undefined,
          qty: it.qty,
        };
      }),
    });

    try {
      // Print Bill on main printer
      if (printerType === "wifi") {
        if (!wifiPrinterIp) { Alert.alert("No WiFi Printer", "Set WiFi printer IP in Settings."); return; }
        await printWifi(wifiPrinterIp, parseInt(wifiPrinterPort || "9100"), billEsc);
      } else {
        if (!printerAddr) { Alert.alert("No Bluetooth Printer", "Set Bluetooth printer address in Settings."); return; }
        await printBluetooth(printerAddr, billEsc);
      }

      // Print KOT — use dedicated KOT printer if enabled, else same main printer
      if (kotPrinterEnabled && kotPrinterIp) {
        await printWifi(kotPrinterIp, parseInt(kotPrinterPort || "9100"), kotEsc);
      } else if (printerType === "wifi") {
        await printWifi(wifiPrinterIp, parseInt(wifiPrinterPort || "9100"), kotEsc);
      } else {
        await printBluetooth(printerAddr, kotEsc);
      }

      Alert.alert("Printed", "Bill & KOT sent to printer.");
    } catch (e: any) {
      Alert.alert("Print Failed", e?.message ?? "Could not reach printer.");
    }
  };

  const handleKOT = () => {
    if (cart.length === 0) { Alert.alert("Cart is empty"); return; }
    setKotModal(true);
  };

  const confirmKOT = async () => {
    const orderId = saveOrder("kot");
    setKotModal(false);
    if (orderId !== null) {
      const now = new Date();
      const dd = now.getDate().toString().padStart(2, "0");
      const mm = (now.getMonth() + 1).toString().padStart(2, "0");
      const yyyy = now.getFullYear();
      const hh = now.getHours().toString().padStart(2, "0");
      const min = now.getMinutes().toString().padStart(2, "0");

      const kotEsc = buildKotEsc(paperSize, {
        shopName: session?.shop?.name ?? "iDine Lite",
        orderNo: String(billNo).padStart(3, "0"),
        cashier: session?.user?.username ?? "Admin",
        dateTime: `${dd}.${mm}.${yyyy} ${hh}:${min}`,
        orderType,
        items: cart.map(i => ({ name: i.productName, portionName: i.portionName, qty: i.qty })),
      });

      try {
        // Use dedicated KOT printer if enabled, otherwise fall back to main printer
        if (kotPrinterEnabled && kotPrinterIp) {
          await printWifi(kotPrinterIp, parseInt(kotPrinterPort || "9100"), kotEsc);
        } else if (printerType === "wifi") {
          if (wifiPrinterIp) await printWifi(wifiPrinterIp, parseInt(wifiPrinterPort || "9100"), kotEsc);
          else Alert.alert("No WiFi Printer", "Set WiFi printer IP in Settings.");
        } else {
          if (printerAddr) await printBluetooth(printerAddr, kotEsc);
          else Alert.alert("No Bluetooth Printer", "Pair a printer in Settings.");
        }
      } catch (e: any) {
        Alert.alert("KOT Print Failed", e?.message ?? "Could not reach printer.");
      }

      setCart([]);
      setBillNo((prev) => prev + 1);
    }
  };

  const handleFoodItemConfirm = () => {
    const price = parseFloat(foodItemPrice);
    if (isNaN(price) || price <= 0) { Alert.alert("Enter a valid price"); return; }
    // Add as a generic "Food Item" to cart
    setCart((prev) => [...prev, {
      productId: -99,
      productName: "Food Item",
      qty: 1,
      unitPrice: price,
    }]);
    setFoodItemModal(false);
    setFoodItemPrice("");
  };

  const userName = session?.user?.username ? `Hello, ${session.user.username}.` : "Hello.";

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getDate().toString().padStart(2,"0")}/${(d.getMonth()+1).toString().padStart(2,"0")} ${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
  };

  return (
    <SafeAreaView style={s.root} edges={["top", "left", "right"]}>
      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={openDrawer} style={s.headerIcon}>
          <List size={22} color="#fff" weight="bold" />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>
          {session?.shop?.name ? `iDine - ${session.shop.name}` : "iDine Lite"}
        </Text>
        <TouchableOpacity onPress={() => router.replace("/dashboard" as any)}>
          <Image source={require("../assets/icon_home.png")} style={{ width: 28, height: 28 }} resizeMode="contain" />
        </TouchableOpacity>
      </View>

      {/* ── Sub-header ── */}
      <View style={s.subHeader}>
        <Text style={s.subLeft}>{userName}{"  "}
          <Text style={s.subBold}>No.of Bill:{billNo}</Text>
        </Text>
        <Text style={s.subRight}>{dateStr}</Text>
      </View>

      {/* ── Search ── */}
      <View style={s.searchWrap}>
        <MagnifyingGlass size={16} color={Colors.textMuted} style={{ marginRight: 6 }} />
        <TextInput
          style={s.searchInput}
          placeholder="Search item here !"
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* ── Category tabs ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catRow} contentContainerStyle={s.catContent}>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[s.catTab, selectedCat === cat.id && s.catTabActive]}
            onPress={() => setSelectedCat(cat.id)}
          >
            <Text style={[s.catTabText, selectedCat === cat.id && s.catTabTextActive]}>{cat.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Product grid + Cart panel wrapper ── */}
      <View style={{ flex: 1 }}>
      {/* ── Product grid ── */}
      <FlatList
        data={filteredProducts}
        keyExtractor={(i) => String(i.id)}
        numColumns={4}
        style={s.grid}
        contentContainerStyle={s.gridContent}
        columnWrapperStyle={{ gap: Spacing.sm }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} tintColor={Colors.primary} />
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={[s.card, { width: ITEM_W, flexDirection: "column" }]} onPress={() => handleSelectProduct(item)} activeOpacity={0.85}>
            <TouchableOpacity style={s.cardImgWrap} onPress={() => handleSelectProduct(item)} activeOpacity={0.85}>
              {item.image_url
                ? <Image source={{ uri: item.image_url }} style={s.cardImg} resizeMode="cover" />
                : <View style={s.cardImgPlaceholder}><Text style={s.cardImgEmoji}>🍽️</Text></View>
              }
            </TouchableOpacity>
            <View style={[s.cardBody, { flex: 1 }]}>
              <Text style={s.cardName} numberOfLines={2}>{item.name}</Text>
            </View>
            <TouchableOpacity style={s.cardAddBtn} onPress={() => handleSelectProduct(item)}>
              <Text style={s.cardAddBtnText}>Add to Billing</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.selectBtn} onPress={() => handleSelectProduct(item)}>
              <Text style={s.selectBtnText}>+</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Text style={s.emptyText}>No items found</Text>
            <TouchableOpacity onPress={() => router.push("/items" as any)}>
              <Text style={s.emptyLink}>+ Add Items</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* ── Cart / Bill table — always visible ── */}
      <View style={s.cartPanel}>
        <View style={s.tableHeader}>
          <Text style={[s.th, { width: 22 }]}>No.</Text>
          <Text style={[s.th, { flex: 1 }]}>Item</Text>
          <Text style={[s.th, { width: 32 }]}>Ptn</Text>
          <Text style={[s.th, { width: 30, textAlign: "center" }]}>Qty</Text>
          <Text style={[s.th, { width: 52, textAlign: "right" }]}>Price</Text>
          <Text style={[s.th, { width: 58, textAlign: "right" }]}>Amt</Text>
        </View>
        <ScrollView style={s.tableScroll} nestedScrollEnabled>
          {cart.length === 0 ? (
            <View style={s.emptyCart}>
              <Text style={s.emptyCartText}>No items selected</Text>
            </View>
          ) : cart.map((item, idx) => (
            <TouchableOpacity key={idx} style={s.tableRow} onPress={() => updateQty(idx, 1)} onLongPress={() => updateQty(idx, -1)}>
              <Text style={[s.td, { width: 22, fontSize: 11, minHeight: 16, paddingTop: 1 }]}>{idx + 1}.</Text>
              <Text style={[s.td, { flex: 1, minHeight: 16 }]} numberOfLines={2} ellipsizeMode="tail">{item.productName}</Text>
              <Text style={[s.td, { width: 32, fontSize: 11, minHeight: 16, paddingTop: 1 }]} numberOfLines={1}>{item.portionName ?? "-"}</Text>
              <Text style={[s.td, { width: 30, textAlign: "center", fontWeight: "700", minHeight: 16, paddingTop: 1 }]}>{item.qty}</Text>
              <Text style={[s.td, { width: 52, textAlign: "right", fontSize: 11, minHeight: 16, paddingTop: 1 }]}>{item.unitPrice.toLocaleString("en-LK", { minimumFractionDigits: 2 })}</Text>
              <Text style={[s.td, { width: 58, textAlign: "right", fontSize: 11, minHeight: 16, paddingTop: 1 }]}>{(item.qty * item.unitPrice).toLocaleString("en-LK", { minimumFractionDigits: 2 })}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={s.billSummaryRow}>
          <View style={s.billLeft}>
            <Text style={s.billNo}>#{billNo}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={s.billTotal}>TOTAL: {subtotal.toLocaleString("en-LK", { minimumFractionDigits: 2 })}</Text>
              {discount > 0 && <Text style={s.billDisc}>-{discount.toLocaleString("en-LK", { minimumFractionDigits: 2 })}</Text>}
            </View>
          </View>
          <View style={s.billRight}>
            <Text style={s.billNetPay}>Net Pay</Text>
            <Text style={s.billNetAmt}>Rs. {total.toLocaleString("en-LK", { minimumFractionDigits: 2 })}</Text>
          </View>
        </View>
      </View>
      </View>{/* ── end flex:1 wrapper ── */}

      {/* ── Bottom Action Bar ── */}
      <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TouchableOpacity style={s.navBtn} onPress={() => setFoodItemModal(true)}>
          <View style={s.navIconRing}>
            <Image source={require("../assets/icon_food_bill.png")} style={s.navIconImg} resizeMode="contain" />
          </View>
          <Text style={s.navLabel}>Cash Bill</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.navBtn} onPress={() => { setDiscountInput(discount > 0 ? String(discount) : ""); setDiscountModal(true); }}>
          <View style={s.navIconRing}>
            <Image source={require("../assets/icon_discount.png")} style={s.navIconImg} resizeMode="contain" />
          </View>
          <Text style={s.navLabel}>Discount</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.navBtn} onPress={() => cart.length > 0 ? setCashModal(true) : Alert.alert("Cart is empty")}>
          <View style={s.navIconRingLarge}>
            <Image source={require("../assets/icon_printer.png")} style={s.navIconImgLarge} resizeMode="contain" />
          </View>
          <Text style={s.navLabel}>Print Bill</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.navBtn} onPress={handleKOT}>
          <View style={s.navIconRing}>
            <Image source={require("../assets/icon_kot.png")} style={s.navIconImg} resizeMode="contain" />
          </View>
          <Text style={s.navLabel}>KOT</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.navBtn} onPress={() => { loadRecentOrders(); setRecentModal(true); }}>
          <View style={s.navIconRing}>
            <Image source={require("../assets/icon_recent.png")} style={s.navIconImg} resizeMode="contain" />
          </View>
          <Text style={s.navLabel}>Recent</Text>
        </TouchableOpacity>
      </View>

      {/* ═══════════════════════════════════════════════════
          MODALS
      ═══════════════════════════════════════════════════ */}

      {/* ── Portion Selection Modal ── */}
      <Modal visible={!!portionModal} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modalCard}>
            {/* Red title */}
            <Text style={s.modalRedTitle}>Select Portion</Text>
            {/* Item image */}
            <View style={s.modalImgWrap}>
              {portionModal?.image_url
                ? <Image source={{ uri: portionModal.image_url }} style={s.modalImg} resizeMode="cover" />
                : <View style={s.modalImgPlaceholder}><Text style={{ fontSize: 40 }}>🍽️</Text></View>
              }
            </View>
            {/* Item name */}
            <Text style={s.modalItemName}>{portionModal?.name}</Text>

            {/* Portion rows with +/- */}
            {portionModal && [
              // Base price row (shown only if product has portions — it's the "default" option)
              ...portionModal.portions.map((p) => (
                <View key={p.id} style={s.portionPickRow}>
                  {/* Name + price */}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <Text style={s.portionPickName}>{p.name}</Text>
                    <Text style={s.portionPickPrice}>LKR.{p.price.toFixed(2)}</Text>
                  </View>
                  {/* Quick qty grid — single line */}
                  <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
                    {[5, 10, 15, 20, 30, 50].map((q) => {
                      const active = portionQtys[p.id] === q;
                      return (
                        <TouchableOpacity
                          key={q}
                          style={[s.quickQtyBtn, active && s.quickQtyBtnActive, { flex: 1 }]}
                          onPress={() => setPortionQtys((prev) => ({ ...prev, [p.id]: q }))}
                        >
                          <Text style={[s.quickQtyText, active && s.quickQtyTextActive]}>{q}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {/* +/- with editable qty */}
                  <View style={[s.qtyRow, { justifyContent: "center" }]}>
                    <TouchableOpacity style={s.qtyBtn} onPress={() => changePortionQty(p.id, -1)}>
                      <Text style={s.qtyBtnText}>−</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={s.qtyNumInput}
                      keyboardType="number-pad"
                      value={String(portionQtys[p.id] ?? 0)}
                      onChangeText={(v) => {
                        const n = parseInt(v, 10);
                        setPortionQtys((prev) => ({ ...prev, [p.id]: isNaN(n) ? 0 : Math.max(0, n) }));
                      }}
                      selectTextOnFocus
                    />
                    <TouchableOpacity style={s.qtyBtn} onPress={() => changePortionQty(p.id, 1)}>
                      <Text style={s.qtyBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )),
            ]}

            {/* Confirm / Cancel */}
            <View style={s.modalBtnRow}>
              <TouchableOpacity style={[s.modalBtn, s.modalBtnGreen]} onPress={confirmPortionSelection}>
                <Text style={s.modalBtnText}>Confirm</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, s.modalBtnRed]} onPress={() => setPortionModal(null)}>
                <Text style={s.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Discount Modal ── */}
      <Modal visible={discountModal} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modalCard}>
            <Text style={s.modalRedTitle}>Discount</Text>
            {/* Emoji icon */}
            <Text style={{ fontSize: 52, textAlign: "center", marginVertical: 8 }}>🏷️</Text>
            <Text style={s.modalItemName}>Enter the discount</Text>
            <Text style={[s.modalSubText, { marginBottom: 16 }]}>amount</Text>
            {/* Rs. input display */}
            <View style={s.rsInputWrap}>
              <Text style={s.rsLabel}>Rs.</Text>
              <Text style={[s.rsInput, { minWidth: 60 }]}>{discountInput || "0"}</Text>
            </View>
            <NumPad value={discountInput} onChange={setDiscountInput} />
            <View style={[s.modalBtnRow, { marginTop: 16 }]}>
              <TouchableOpacity style={[s.modalBtn, s.modalBtnGreen]} onPress={() => {
                const d = parseFloat(discountInput);
                setDiscount(isNaN(d) ? 0 : d);
                setDiscountModal(false);
                setDiscountInput("");
              }}>
                <Text style={s.modalBtnText}>Confirm</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, s.modalBtnRed]} onPress={() => { setDiscountModal(false); setDiscountInput(""); }}>
                <Text style={s.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Cash Bill (Food Item price entry) Modal ── */}
      <Modal visible={foodItemModal} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modalCard}>
            <Text style={s.modalRedTitle}>Cash bill</Text>
            <Text style={{ fontSize: 44, textAlign: "center", marginVertical: 8 }}>🍛</Text>
            <Text style={s.modalItemName}>Food items</Text>
            <Text style={[s.modalSubText, { marginBottom: 16 }]}>Enter the price</Text>
            <View style={s.rsInputWrap}>
              <Text style={s.rsLabel}>Rs.</Text>
              <Text style={[s.rsInput, { minWidth: 60 }]}>{foodItemPrice || "0"}</Text>
            </View>
            <NumPad value={foodItemPrice} onChange={setFoodItemPrice} />
            <View style={[s.modalBtnRow, { marginTop: 16 }]}>
              <TouchableOpacity style={[s.modalBtn, s.modalBtnGreen]} onPress={handleFoodItemConfirm}>
                <Text style={s.modalBtnText}>Confirm</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, s.modalBtnRed]} onPress={() => { setFoodItemModal(false); setFoodItemPrice(""); }}>
                <Text style={s.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Cash Payment Modal (Print Bill) ── */}
      <Modal visible={cashModal} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.printBillCard}>
            {/* Header */}
            <View style={s.pbHeader}>
              <Text style={s.pbTitle}>Print Bill</Text>
              <TouchableOpacity onPress={() => setCashModal(false)} style={s.pbClose}>
                <X size={18} color="#666" />
              </TouchableOpacity>
            </View>

            {/* Total */}
            <Text style={s.pbTotalLine}>
              Total Bill Amount : <Text style={s.pbTotalAmt}>Rs.{total.toLocaleString("en-LK")}</Text>
            </Text>

            {/* Amount Paid label + display */}
            <Text style={s.pbPaidLabel}>Amount Paid</Text>
            <View style={s.pbAmtBox}>
              <Text style={s.pbAmtTxt}>{collected || "0"}</Text>
            </View>

            {/* Balance */}
            {(() => {
              const paid = parseFloat(collected || "0");
              const bal = paid - total;
              const isShort = bal < 0;
              const isExact = bal === 0;
              return (
                <Text style={s.pbBalLine}>
                  Balance :{" "}
                  <Text style={[s.pbBalAmt, { color: isShort ? "#C62828" : isExact ? "#111" : "#2E7D32" }]}>
                    {isShort ? `(−) Rs.${Math.abs(bal).toLocaleString("en-LK")}` : `(+) Rs.${bal.toLocaleString("en-LK")}`}
                  </Text>
                </Text>
              );
            })()}

            {/* NumPad — layout: 1 2 3 / 4 5 6 / 7 8 9 / < 0 . */}
            <NumPadCash value={collected} onChange={setCollected} />

            {/* Order Type toggle */}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14, marginBottom: 2 }}>
              <TouchableOpacity
                onPress={() => setOrderType("dine-in")}
                style={{
                  flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: "center",
                  backgroundColor: orderType === "dine-in" ? "#4CAF50" : "#F0F0F0",
                  borderWidth: 1.5,
                  borderColor: orderType === "dine-in" ? "#388E3C" : "#DCDCDC",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: orderType === "dine-in" ? "#fff" : "#555" }}>🍽  Dine In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setOrderType("takeaway")}
                style={{
                  flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: "center",
                  backgroundColor: orderType === "takeaway" ? "#FF9800" : "#F0F0F0",
                  borderWidth: 1.5,
                  borderColor: orderType === "takeaway" ? "#F57C00" : "#DCDCDC",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: orderType === "takeaway" ? "#fff" : "#555" }}>🥡  Take Away</Text>
              </TouchableOpacity>
            </View>

            {/* Buttons */}
            <View style={s.pbBtnRow}>
              <TouchableOpacity style={[s.pbBtn, s.pbBtnPrint, { flex: 1 }]} onPress={() => handleBill(true)}>
                <Text style={s.pbBtnTxt}>Pay &amp; Print</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── KOT Modal ── */}
      <Modal visible={kotModal} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modalCard}>
            <Text style={s.modalRedTitle}>KOT</Text>
            <Text style={{ fontSize: 40, textAlign: "center", marginVertical: 6 }}>🍳</Text>
            {/* KOT Preview */}
            <View style={s.kotPreview}>
              <Text style={s.kotTitle}>KOT</Text>
              <Text style={s.kotOrderNo}>Order No: {billNo}</Text>
              <View style={s.kotDivider} />
              {cart.map((item, idx) => (
                <View key={idx} style={s.kotItem}>
                  <Text style={s.kotItemName}>{item.productName}{item.portionName ? ` (${item.portionName})` : ""}</Text>
                  <Text style={s.kotItemQty}>x{item.qty}</Text>
                </View>
              ))}
            </View>
            <View style={s.modalBtnRow}>
              <TouchableOpacity style={[s.modalBtn, s.modalBtnGreen]} onPress={confirmKOT}>
                <Printer size={16} color="#fff" />
                <Text style={s.modalBtnText}> Print KOT</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, s.modalBtnRed]} onPress={() => setKotModal(false)}>
                <Text style={s.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Receipt Modal ── */}
      <Modal visible={receiptModal} transparent={true} animationType="slide" statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center" }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 18, width: "93%", maxHeight: "90%", paddingTop: 22, paddingHorizontal: 18, paddingBottom: 0 }}>
          {receiptData ? (
            <>
              <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>

                {/* Shop name + address */}
                <Text style={s.rcShopName}>{receiptData.shopName}</Text>
                {!!receiptData.shopAddress && <Text style={s.rcShopAddr}>{receiptData.shopAddress}</Text>}
                {!!receiptData.shopPhone && <Text style={s.rcShopAddr}>{receiptData.shopPhone}</Text>}

                <View style={s.rcDash} />

                {/* ORDER # — big, single line */}
                <Text style={s.rcOrderNo}>ORDER  #{String(receiptData.billNo).padStart(3, "0")}</Text>
                <Text style={{ fontSize: 14, fontWeight: "700", textAlign: "center", color: "#444", letterSpacing: 1, marginTop: -2, marginBottom: 4 }}>
                  {receiptData.orderType === "takeaway" ? "🥡  TAKE AWAY" : "🍽  DINE IN"}
                </Text>

                <View style={s.rcDash} />

                {/* Bill No | Date & Time */}
                <View style={s.rcInfoRow}>
                  <Text style={s.rcInfoLbl}>Bill No: <Text style={s.rcInfoVal}>{String(receiptData.billNo).padStart(3, "0")}</Text></Text>
                  <Text style={s.rcInfoLbl}>{receiptData.date}  {receiptData.time}</Text>
                </View>
                <View style={[s.rcInfoRow, { marginTop: 2 }]}>
                  <Text style={s.rcInfoLbl}>Payment: <Text style={s.rcInfoVal}>Cash</Text></Text>
                </View>

                <View style={s.rcDash} />

                {/* Table header */}
                <View style={s.rcTblRow}>
                  <Text style={[s.rcTblHd, { width: 22 }]}>#</Text>
                  <Text style={[s.rcTblHd, { flex: 1 }]}>ITEM</Text>
                  <Text style={[s.rcTblHd, { width: 34, textAlign: "center" }]}>QTY</Text>
                  <Text style={[s.rcTblHd, { width: 60, textAlign: "right" }]}>PRICE</Text>
                  <Text style={[s.rcTblHd, { width: 60, textAlign: "right" }]}>AMT</Text>
                </View>
                <View style={s.rcDash} />

                {/* Items */}
                {receiptData.items.map((item, i) => (
                  <View key={i} style={s.rcTblRow}>
                    <Text style={[s.rcTblTd, { width: 22, color: "#888" }]}>{i + 1}</Text>
                    <Text style={[s.rcTblTd, { flex: 1 }]} numberOfLines={2}>{item.name}{item.portionName ? ` (${item.portionName.slice(0, 3)})` : ""}</Text>
                    <Text style={[s.rcTblTd, { width: 34, textAlign: "center" }]}>{item.qty}</Text>
                    <Text style={[s.rcTblTd, { width: 60, textAlign: "right", color: "#555" }]}>{item.price.toLocaleString("en-LK")}</Text>
                    <Text style={[s.rcTblTd, { width: 60, textAlign: "right", fontWeight: "700" }]}>{item.amt.toLocaleString("en-LK")}</Text>
                  </View>
                ))}
                <View style={s.rcDash} />

                {/* Sub Total */}
                <View style={s.rcSumRow}>
                  <Text style={s.rcSumLbl}>Sub Total</Text>
                  <Text style={s.rcSumVal}>Rs. {receiptData.subtotal.toLocaleString("en-LK")}</Text>
                </View>
                {receiptData.discount > 0 && (
                  <View style={s.rcSumRow}>
                    <Text style={s.rcSumLbl}>Discount</Text>
                    <Text style={[s.rcSumVal, { color: "#E53935" }]}>- Rs. {receiptData.discount.toLocaleString("en-LK")}</Text>
                  </View>
                )}

                {/* Net Pay */}
                <View style={s.rcNetRow}>
                  <Text style={s.rcNetLbl}>Net Pay</Text>
                  <Text style={s.rcNetVal}>Rs. {receiptData.total.toLocaleString("en-LK")}</Text>
                </View>
                <View style={s.rcDash} />

                <View style={s.rcSumRow}>
                  <Text style={s.rcSumLbl}>Payment Method</Text>
                  <Text style={s.rcSumVal}>Cash</Text>
                </View>
                <View style={s.rcSumRow}>
                  <Text style={s.rcSumLbl}>Total Paid</Text>
                  <Text style={s.rcSumVal}>Rs. {receiptData.paid.toLocaleString("en-LK")}</Text>
                </View>
                <View style={s.rcSumRow}>
                  <Text style={s.rcSumLbl}>Balance</Text>
                  <Text style={[s.rcSumVal, { color: "#2E7D32", fontWeight: "800" }]}>Rs. {receiptData.balance.toLocaleString("en-LK")}</Text>
                </View>
                <View style={s.rcDash} />

                <Text style={s.rcThankYou}>🙏  Thank you! Come again</Text>
                <Text style={s.rcBrand}>iDine Lite by AxisXNOR</Text>

              </ScrollView>

              {/* Buttons */}
              <View style={{ flexDirection: "row", marginHorizontal: -18, overflow: "hidden", borderBottomLeftRadius: 18, borderBottomRightRadius: 18, marginTop: 10 }}>
                <TouchableOpacity style={{ flex: 1, backgroundColor: "#00BCD4", paddingVertical: 16, alignItems: "center" }} onPress={() => setReceiptModal(false)}>
                  <Text style={{ fontSize: 11, fontWeight: "800", color: "#fff" }}>＋ New Bill</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: "#FF9800", paddingVertical: 16, alignItems: "center" }}
                  onPress={() => handlePrintReceipt(receiptData)}
                  onLongPress={() => setPrinterType(t => t === "wifi" ? "bluetooth" : "wifi")}
                >
                  <Text style={{ fontSize: 11, fontWeight: "800", color: "#fff" }}>🖨 {printerType === "wifi" ? "WiFi Print" : "BT Print"}</Text>
                  <Text style={{ fontSize: 9, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>hold to switch</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: "#7B1FA2", paddingVertical: 16, alignItems: "center" }}
                  onPress={() => handlePrintBillAndKOT(receiptData)}
                  onLongPress={() => setPrinterType(t => t === "wifi" ? "bluetooth" : "wifi")}
                >
                  <Text style={{ fontSize: 11, fontWeight: "800", color: "#fff" }}>🖨 Bill & KOT</Text>
                  <Text style={{ fontSize: 9, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>hold to switch</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}
          </View>
        </View>
      </Modal>

      {/* ── Side Drawer ── */}
      {drawerOpen && (
        <View style={s.drawerOverlayWrap}>
          {/* Dim backdrop */}
          <TouchableOpacity
            style={s.drawerBackdrop}
            activeOpacity={1}
            onPress={closeDrawer}
          />
          {/* Sliding panel */}
          {Platform.OS === "web" ? (
            <View style={[
              s.drawerPanel,
              { transform: [{ translateX: drawerSlid ? 0 : -300 }] } as any,
              ({ transition: "transform 260ms ease" } as any),
            ]}>
              <DrawerMenu
                session={session}
                onClose={closeDrawer}
                onNavigate={(route) => {
                  closeDrawer();
                  setTimeout(() => router.push(route as any), 260);
                }}
              />
            </View>
          ) : (
            <Animated.View style={[s.drawerPanel, { transform: [{ translateX: slideAnim }] }]}>
              <DrawerMenu
                session={session}
                onClose={closeDrawer}
                onNavigate={(route) => {
                  closeDrawer();
                  setTimeout(() => router.push(route as any), 240);
                }}
              />
            </Animated.View>
          )}
        </View>
      )}

      {/* ── Recent Bills Modal ── */}
      <Modal visible={recentModal} transparent animationType="slide">
        <View style={s.overlayBottom}>
          <View style={[s.sheet, { paddingBottom: 24 }]}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Recent Bills</Text>
              <TouchableOpacity onPress={() => setRecentModal(false)}><X size={22} color={Colors.text} /></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
              {recentOrders.length === 0 ? (
                <Text style={{ textAlign: "center", color: Colors.textMuted, padding: 24 }}>No recent bills</Text>
              ) : recentOrders.map((order) => (
                <View key={order.id} style={s.recentCard}>
                  <View style={s.recentCardHeader}>
                    <Text style={s.recentBillNo}>Bill #{order.id}</Text>
                    <Text style={s.recentTime}>{formatTime(order.created_at)}</Text>
                    <View style={[s.recentBadge, { backgroundColor: order.status === "billed" ? Colors.green : Colors.orange }]}>
                      <Text style={s.recentBadgeText}>{order.status.toUpperCase()}</Text>
                    </View>
                  </View>
                  {/* Items */}
                  {order.items.map((item, i) => (
                    <View key={i} style={s.recentItemRow}>
                      <Text style={s.recentItemName} numberOfLines={1}>
                        {item.product_name}{item.portion_name ? ` (${item.portion_name})` : ""}
                      </Text>
                      <Text style={s.recentItemQty}>x{item.qty}</Text>
                      <Text style={s.recentItemAmt}>Rs.{item.line_total.toFixed(2)}</Text>
                    </View>
                  ))}
                  {/* Summary */}
                  <View style={s.recentSummary}>
                    {order.discount > 0 && <Text style={s.recentDisc}>Disc: Rs.{order.discount.toFixed(2)}</Text>}
                    <Text style={s.recentTotal}>Total: Rs.{order.total.toFixed(2)}</Text>
                  </View>
                  {/* Reprint buttons */}
                  <View style={s.recentBtnRow}>
                    <TouchableOpacity style={s.reprintBtn} onPress={async () => {
                      try {
                        const now = new Date(order.created_at);
                        const dd = String(now.getDate()).padStart(2,"0");
                        const mm = String(now.getMonth()+1).padStart(2,"0");
                        const yyyy = now.getFullYear();
                        const hh = String(now.getHours()).padStart(2,"0");
                        const min = String(now.getMinutes()).padStart(2,"0");
                        const subtotal = order.total + order.discount;
                        const esc = buildReceiptEsc(paperSize, {
                          shopName: session?.shop?.name ?? "iDine Lite",
                          shopAddress: (session?.shop as any)?.address || "Chemani road, Nallur, Jaffna",
                          shopPhone: session?.shop?.phone || "0711336666",
                          billNo: order.id,
                          date: `${dd}.${mm}.${yyyy}`,
                          time: `${hh}:${min}`,
                          cashier: session?.user?.username ?? "-",
                          orderType: order.order_type ?? "dine-in",
                          items: order.items.map(it => ({ name: it.product_name, portionName: it.portion_name ?? undefined, qty: it.qty, price: it.unit_price, amt: it.line_total })),
                          subtotal,
                          discount: order.discount,
                          total: order.total,
                          paid: order.total,
                          balance: 0,
                          receiptFooter,
                        });
                        if (printerType === "wifi") {
                          if (!wifiPrinterIp) { Alert.alert("No WiFi Printer", "Set WiFi printer IP in Settings."); return; }
                          await printWifi(wifiPrinterIp, parseInt(wifiPrinterPort || "9100"), esc);
                        } else {
                          if (!printerAddr) { Alert.alert("No Bluetooth Printer", "Set BT printer in Settings."); return; }
                          await printBluetooth(printerAddr, esc);
                        }
                        Alert.alert("Printed", `Bill #${order.id} sent to printer.`);
                      } catch (e: any) { Alert.alert("Print Failed", e?.message ?? "Could not reach printer."); }
                    }}>
                      <Printer size={13} color="#fff" />
                      <Text style={s.reprintBtnText}> Reprint Bill</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.reprintBtn, { backgroundColor: Colors.orange }]} onPress={async () => {
                      try {
                        const now = new Date(order.created_at);
                        const dd = String(now.getDate()).padStart(2,"0");
                        const mm = String(now.getMonth()+1).padStart(2,"0");
                        const yyyy = now.getFullYear();
                        const hh = String(now.getHours()).padStart(2,"0");
                        const min = String(now.getMinutes()).padStart(2,"0");
                        const esc = buildKotEsc(paperSize, {
                          shopName: session?.shop?.name ?? "iDine Lite",
                          orderNo: String(order.id).padStart(3,"0"),
                          cashier: session?.user?.username ?? "-",
                          dateTime: `${dd}.${mm}.${yyyy} ${hh}:${min}`,
                          items: order.items.map(it => ({ name: it.product_name, portionName: it.portion_name, qty: it.qty })),
                        });
                        if (printerType === "wifi") {
                          if (!wifiPrinterIp) { Alert.alert("No WiFi Printer", "Set WiFi printer IP in Settings."); return; }
                          await printWifi(wifiPrinterIp, parseInt(wifiPrinterPort || "9100"), esc);
                        } else {
                          if (!printerAddr) { Alert.alert("No Bluetooth Printer", "Set BT printer in Settings."); return; }
                          await printBluetooth(printerAddr, esc);
                        }
                        Alert.alert("Printed", `KOT #${order.id} sent to printer.`);
                      } catch (e: any) { Alert.alert("Print Failed", e?.message ?? "Could not reach printer."); }
                    }}>
                      <CookingPot size={13} color="#fff" />
                      <Text style={s.reprintBtnText}> Reprint KOT</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0F2F5" },
  drawerOverlayWrap: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 999, flexDirection: "row",
  },
  drawerBackdrop: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  drawerPanel: {
    width: 280, height: "100%",
    position: "absolute", top: 0, left: 0, bottom: 0,
    zIndex: 1000,
  },

  // Header
  header: {
    backgroundColor: Colors.primary, flexDirection: "row",
    alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 10,
  },
  headerIcon: { padding: 2 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "700", color: "#fff" },

  // Sub-header
  subHeader: {
    backgroundColor: "#E8E8E8", flexDirection: "row",
    alignItems: "center", paddingHorizontal: 14, paddingVertical: 5,
    justifyContent: "space-between",
  },
  subLeft: { fontSize: 11, color: "#444" },
  subBold: { fontWeight: "700", color: "#222" },
  subRight: { fontSize: 11, color: "#444" },

  // Search
  searchWrap: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#fff", borderRadius: 20, borderWidth: 1, borderColor: "#DDD",
    marginHorizontal: 12, marginVertical: 4, paddingHorizontal: 10, paddingVertical: 4,
  },
  searchInput: { flex: 1, fontSize: 12, color: Colors.text, padding: 0 },

  // Category tabs
  catRow: { maxHeight: 42, backgroundColor: Colors.primary, borderBottomWidth: 0 },
  catContent: { paddingHorizontal: 4, alignItems: "stretch", gap: 0 },
  catTab: {
    paddingHorizontal: 16, paddingVertical: 0,
    height: 42, justifyContent: "center", alignItems: "center",
    borderBottomWidth: 3, borderBottomColor: "transparent",
    backgroundColor: "transparent",
  },
  catTabActive: { borderBottomColor: "#fff", backgroundColor: "rgba(255,255,255,0.15)" },
  catTabText: { fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: "500" },
  catTabTextActive: { color: "#fff", fontWeight: "700" },

  // Product grid
  grid: { flex: 1, backgroundColor: "#F0F2F5" },
  gridContent: { padding: Spacing.sm, rowGap: 4 },
  card: {
    backgroundColor: "#fff", borderRadius: Radius.md,
    borderWidth: 1, borderColor: "#DDD",
    overflow: "hidden",
    elevation: 2, shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2,
  },
  cardImgWrap: { width: "100%", aspectRatio: 1.4, backgroundColor: "#F5F5F5" },
  cardImg: { width: "100%", height: "100%" },
  cardImgPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#EEF4FB" },
  cardImgEmoji: { fontSize: 26 },
  cardBody: { paddingHorizontal: 5, paddingTop: 4, paddingBottom: 3 },
  cardName: { fontSize: 13, fontWeight: "700", color: Colors.text, lineHeight: 16 },
  cardDesc: { fontSize: 9, color: Colors.textMuted, marginTop: 1, lineHeight: 12 },
  cardPrice: { fontSize: 11, fontWeight: "700", color: Colors.text, marginTop: 3 },
  cardAddBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 4, alignItems: "center",
  },
  cardAddBtnText: { color: "#fff", fontSize: 10, fontWeight: "600" },
  selectBtn: {
    backgroundColor: Colors.green,
    paddingVertical: 4, alignItems: "center",
  },
  selectBtnText: { color: "#fff", fontSize: 15, fontWeight: "700", lineHeight: 18 },

  // Empty
  emptyWrap: { alignItems: "center", padding: 40 },
  emptyText: { color: Colors.textMuted, fontSize: 14 },
  emptyLink: { color: Colors.primary, fontWeight: "600", marginTop: 8 },

  // Cart/bill table
  cartPanel: {
    backgroundColor: "#fff",
    borderWidth: 2, borderColor: Colors.red,
    borderRadius: 6,
    marginHorizontal: 6, marginBottom: 2,
  },
  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: 8, paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: "#E0E0E0",
    backgroundColor: "#fff",
    borderTopLeftRadius: 4, borderTopRightRadius: 4,
  },
  th: { fontSize: 12, fontWeight: "700", color: Colors.primary },
  tableScroll: { height: 96 },
  tableRow: {
    flexDirection: "row", alignItems: "flex-start",
    paddingHorizontal: 8, paddingVertical: 2,
  },
  td: { fontSize: 12, color: Colors.text },
  emptyCart: { height: 60, alignItems: "center", justifyContent: "center" },
  emptyCartText: { fontSize: 12, color: Colors.textMuted },

  // Bill summary row
  billSummaryRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 8, paddingVertical: 6,
    borderTopWidth: 1, borderTopColor: "#E0E0E0",
    backgroundColor: "#fff",
    borderBottomLeftRadius: 4, borderBottomRightRadius: 4,
  },
  billLeft: { flex: 1, gap: 1 },
  billRight: { alignItems: "flex-end" },
  billNo: { fontSize: 12, fontWeight: "700", color: Colors.green },
  billTotal: { fontSize: 11, fontWeight: "600", color: Colors.primary },
  billDisc: { fontSize: 11, fontWeight: "600", color: Colors.orange },
  billNetPay: { fontSize: 10, color: Colors.text },
  billNetAmt: { fontSize: 15, fontWeight: "900", color: Colors.green },

  // Bottom nav bar
  bottomBar: {
    flexDirection: "row",
    backgroundColor: Colors.primary,
    paddingTop: 6,
    alignItems: "center",
  },
  navBtn: { flex: 1, alignItems: "center", justifyContent: "center" },
  navIcon: { alignItems: "center", justifyContent: "center" },
  navIconRing: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 2, borderColor: "rgba(255,255,255,0.85)",
    alignItems: "center", justifyContent: "center",
    backgroundColor: "transparent",
  },
  navIconRingLarge: {
    width: 50, height: 50, borderRadius: 25,
    borderWidth: 2.5, borderColor: "rgba(255,255,255,0.85)",
    alignItems: "center", justifyContent: "center",
    backgroundColor: "transparent",
  },
  navIconImg: { width: 28, height: 28 },
  navIconImgLarge: { width: 36, height: 36 },
  navLabel: { fontSize: 9, color: "#fff", fontWeight: "600", marginTop: 4, textAlign: "center" },

  // ── Shared Modal styles ──
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center" },
  overlayBottom: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },

  // Center card modal (portion, discount, food item, KOT)
  modalCard: {
    backgroundColor: "#fff", borderRadius: 20,
    padding: 24, width: "85%", maxWidth: 360,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 10, elevation: 8,
  },
  modalRedTitle: {
    fontSize: 16, fontWeight: "700", color: Colors.red,
    textAlign: "center", marginBottom: 4,
  },
  modalImgWrap: {
    width: 80, height: 80, borderRadius: 40,
    alignSelf: "center", overflow: "hidden",
    backgroundColor: "#F5F5F5", marginBottom: 8,
  },
  modalImg: { width: "100%", height: "100%" },
  modalImgPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  modalItemName: { fontSize: 24, fontWeight: "800", color: Colors.text, textAlign: "center" },
  modalSubText: { fontSize: 14, color: Colors.textMuted, textAlign: "center", marginTop: 2 },

  // Portion pick rows
  portionPickRow: {
    flexDirection: "column",
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F0F0F0",
  },
  portionPickName: { fontSize: 15, fontWeight: "700", color: Colors.text },
  portionPickPrice: { fontSize: 13, fontWeight: "600", color: Colors.primary },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  qtyBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center",
    elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 2,
  },
  qtyBtnText: { fontSize: 26, fontWeight: "700", color: "#fff", lineHeight: 30 },
  qtyNum: { fontSize: 20, fontWeight: "700", color: Colors.text, minWidth: 28, textAlign: "center" },
  qtyNumInput: {
    fontSize: 22, fontWeight: "700", color: Colors.text,
    minWidth: 56, textAlign: "center",
    borderWidth: 1.5, borderColor: "#CCC", borderRadius: 8,
    paddingVertical: 4, paddingHorizontal: 8, backgroundColor: "#F9F9F9",
  },
  quickQtyBtn: {
    backgroundColor: "#F0F2F5", borderRadius: 8,
    paddingVertical: 7, alignItems: "center",
    borderWidth: 1.5, borderColor: "#DDD",
  },
  quickQtyBtnActive: {
    backgroundColor: Colors.primary, borderColor: Colors.primary,
  },
  quickQtyText: { fontSize: 13, fontWeight: "600", color: Colors.text },
  quickQtyTextActive: { color: "#fff" },

  // Rs. input (discount + food item)
  rsInputWrap: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1.5, borderColor: "#CCC", borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    marginBottom: 20, backgroundColor: "#FAFAFA",
  },
  rsLabel: { fontSize: 18, fontWeight: "700", color: Colors.text, marginRight: 10 },
  rsInput: { flex: 1, fontSize: 28, fontWeight: "800", color: Colors.text, padding: 0 },

  // Modal bottom buttons
  modalBtnRow: { flexDirection: "row", gap: 12, marginTop: 4 },
  modalBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 30,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
  },
  modalBtnGreen: { backgroundColor: Colors.green },
  modalBtnRed: { backgroundColor: Colors.red },
  modalBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  // KOT preview
  kotPreview: {
    backgroundColor: "#FAFAFA", borderRadius: 8,
    borderWidth: 1, borderColor: "#E0E0E0",
    padding: 12, marginVertical: 8,
  },
  kotTitle: { fontSize: 24, fontWeight: "900", textAlign: "center", color: Colors.text, letterSpacing: 4 },
  kotOrderNo: { fontSize: 24, fontWeight: "800", textAlign: "center", color: Colors.primary, marginBottom: 8 },
  kotDivider: { height: 1, backgroundColor: "#CCC", marginBottom: 8 },
  kotItem: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  kotItemName: { fontSize: 13, color: Colors.text, flex: 1 },
  kotItemQty: { fontSize: 13, fontWeight: "700", color: Colors.primary },

  // Print Bill card modal
  printBillCard: {
    backgroundColor: "#fff", borderRadius: 20, padding: 20,
    width: "90%", maxWidth: 380,
  },
  pbHeader: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 10, position: "relative" },
  pbTitle: { fontSize: 20, fontWeight: "800", color: "#111", textAlign: "center" },
  pbClose: { position: "absolute", right: 0, padding: 4 },
  pbTotalLine: { fontSize: 14, fontWeight: "700", textAlign: "center", color: "#111", marginBottom: 8 },
  pbTotalAmt: { color: "#C0392B", fontWeight: "800" },
  pbPaidLabel: { fontSize: 13, fontWeight: "600", color: "#333", textAlign: "center", marginBottom: 6 },
  pbAmtBox: {
    backgroundColor: "#E0E0E0", borderRadius: 8, paddingVertical: 12,
    alignItems: "center", marginBottom: 6,
  },
  pbAmtTxt: { fontSize: 28, fontWeight: "800", color: "#111" },
  pbBalLine: { fontSize: 14, fontWeight: "700", textAlign: "center", marginBottom: 8, color: "#111" },
  pbBalAmt: { fontWeight: "800" },
  pbBtnRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  pbBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  pbBtnPrint: { backgroundColor: Colors.green },
  pbBtnPay: { backgroundColor: Colors.green },
  pbBtnTxt: { fontSize: 15, fontWeight: "700", color: "#fff" },

  // Bottom sheet modal (recent bills)
  sheet: {
    backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: Spacing.xl, paddingBottom: 36,
  },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: "600", color: Colors.text },

  // Recent Bills
  recentCard: {
    borderWidth: 1, borderColor: "#E8E8E8", borderRadius: 10,
    padding: 12, marginBottom: 10, backgroundColor: "#FAFAFA",
  },
  recentCardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 },
  recentBillNo: { fontSize: 14, fontWeight: "700", color: Colors.text, flex: 1 },
  recentTime: { fontSize: 11, color: Colors.textMuted },
  recentBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  recentBadgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  recentItemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 2 },
  recentItemName: { flex: 1, fontSize: 12, color: Colors.text },
  recentItemQty: { fontSize: 12, color: Colors.textMuted, marginRight: 8 },
  recentItemAmt: { fontSize: 12, fontWeight: "600", color: Colors.primary },
  recentSummary: {
    flexDirection: "row", justifyContent: "flex-end", gap: 12,
    borderTopWidth: 1, borderTopColor: "#EEE",
    paddingTop: 6, marginTop: 4,
  },
  recentDisc: { fontSize: 12, color: Colors.orange, fontWeight: "600" },
  recentTotal: { fontSize: 13, fontWeight: "700", color: Colors.green },
  recentBtnRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  reprintBtn: {
    flex: 1, backgroundColor: Colors.primary,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 7, borderRadius: 6,
  },
  reprintBtnText: { fontSize: 12, color: "#fff", fontWeight: "600" },

  // ── Receipt Modal ──
  rcOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
  },
  rcCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    width: "93%",
    maxWidth: 390,
    maxHeight: "90%",
    paddingTop: 22,
    paddingHorizontal: 18,
    paddingBottom: 0,
    elevation: 30,
    zIndex: 9999,
    shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
  },
  rcShopName: { fontSize: 21, fontWeight: "900", textAlign: "center", color: "#111", letterSpacing: 0.3, marginBottom: 2 },
  rcShopAddr: { fontSize: 12, textAlign: "center", color: "#666", marginBottom: 2 },
  rcOrderNo: { fontSize: 28, fontWeight: "900", textAlign: "center", color: "#111", letterSpacing: 2, paddingVertical: 6 },
  rcDash: { borderStyle: "dashed", borderWidth: 1, borderColor: "#DDD", marginVertical: 9 },
  rcInfoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rcInfoLbl: { fontSize: 12, color: "#555" },
  rcInfoVal: { fontSize: 12, fontWeight: "700", color: "#111" },
  rcTblRow: { flexDirection: "row", alignItems: "center", paddingVertical: 5 },
  rcTblHd: { fontSize: 11, fontWeight: "800", color: "#444", letterSpacing: 0.5 },
  rcTblTd: { fontSize: 12, color: "#111" },
  rcSumRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  rcSumLbl: { fontSize: 13, color: "#555" },
  rcSumVal: { fontSize: 13, fontWeight: "600", color: "#111" },
  rcNetRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#E0F7FA", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, marginVertical: 6,
  },
  rcNetLbl: { fontSize: 16, fontWeight: "900", color: "#00838F" },
  rcNetVal: { fontSize: 16, fontWeight: "900", color: "#00838F" },
  rcThankYou: { fontSize: 14, fontWeight: "800", textAlign: "center", color: "#111", marginTop: 6 },
  rcBrand: { fontSize: 11, textAlign: "center", color: "#BBB", marginTop: 3, marginBottom: 10 },
  rcBtnRow: {
    flexDirection: "row",
    marginTop: 10, marginHorizontal: -18,
    borderBottomLeftRadius: 18, borderBottomRightRadius: 18,
    overflow: "hidden",
  },
  rcBtn: { flex: 1, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  rcBtnIcon: { fontSize: 18, marginBottom: 2 },
  rcBtnTxt: { fontSize: 11, fontWeight: "800", color: "#fff", letterSpacing: 0.3 },
});

const ds = StyleSheet.create({
  drawer: {
    width: 280,
    height: "100%",
    backgroundColor: "#fff",
    paddingTop: 0,
    flexDirection: "column",
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 16,
  },
  profileSection: {
    backgroundColor: Colors.primary,
    paddingTop: 44,
    paddingBottom: 20,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#E87722",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.6)",
  },
  avatarText: {
    fontSize: 30,
    fontWeight: "800",
    color: "#fff",
  },
  userName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },
  userRole: {
    fontSize: 13,
    fontWeight: "400",
    color: "rgba(255,255,255,0.85)",
  },
  shopName: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.95)",
    marginTop: 4,
    textAlign: "center",
  },
  shopInfo: {
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
    textAlign: "center",
  },
  divider: {
    height: 1,
    backgroundColor: "#E0E0E0",
  },
  menuList: {
    flex: 1,
    paddingTop: 8,
  },
  // Hierarchical menu styles
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 15,
    backgroundColor: "#F8F9FA",
  },
  sectionNum: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.primary,
    width: 24,
  },
  sectionLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#222",
  },
  chevron: {
    fontSize: 12,
    color: "#888",
    fontWeight: "600",
  },
  subList: {
    backgroundColor: "#fff",
    paddingLeft: 0,
  },
  subItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderBottomWidth: 1,
    borderBottomColor: "#F5F5F5",
  },
  subDot: {
    fontSize: 16,
    color: Colors.primary,
    fontWeight: "700",
    marginRight: 10,
    width: 16,
  },
  subLabel: {
    fontSize: 14,
    color: "#333",
    fontWeight: "500",
  },
  menuDivider: {
    height: 1,
    backgroundColor: "#E8E8E8",
  },
  // Legacy - keep for any remaining refs
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F2F2F2",
  },
  menuNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  menuNumText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#222",
  },
  closeBtn: {
    backgroundColor: "#2E7D32",
    marginHorizontal: 20,
    marginBottom: 24,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: "center",
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.5,
  },

});
