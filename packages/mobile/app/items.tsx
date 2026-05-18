import { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, Platform, ScrollView, Image,
  Animated, PanResponder, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { List, Pencil, Trash, Check, X, Plus } from "phosphor-react-native";
import { Colors, Spacing, Radius } from "../lib/theme";
import db from "../lib/database";
import { getSession } from "../lib/auth";

interface Product {
  id: number; name: string; price: number; description?: string;
  category_id: number; category_name?: string; image_url?: string; is_available: number;
}
interface Category { id: number; name: string; }

const DEMO_CATS: Category[] = [
  { id: 1, name: "Sri Lankan" }, { id: 2, name: "Indian" },
  { id: 3, name: "Chinees" }, { id: 4, name: "Beverages" },
];
const DEMO_PRODS: Product[] = [
  { id: 1, name: "Poori set", price: 600, category_id: 1, category_name: "Sri Lankan", description: "3 pooris with spicy side dishes", is_available: 1 },
  { id: 2, name: "Dosai", price: 200, category_id: 1, category_name: "Sri Lankan", description: "Crispy rice crepe", is_available: 1 },
  { id: 3, name: "Parota", price: 240, category_id: 1, category_name: "Sri Lankan", description: "Layered flatbread", is_available: 1 },
  { id: 4, name: "Adam", price: 420, category_id: 1, category_name: "Sri Lankan", description: "Spicy dish", is_available: 1 },
];

const SWIPE_THRESHOLD = 80;

// ── Swipeable row ──────────────────────────────────────────────
function SwipeRow({ item, index, onEdit, onDelete }: {
  item: Product; index: number;
  onEdit: () => void; onDelete: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [open, setOpen] = useState(false);

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dy) < 20,
    onPanResponderMove: (_, g) => {
      const x = Math.min(0, Math.max(-170, g.dx + (open ? -170 : 0)));
      translateX.setValue(x);
    },
    onPanResponderRelease: (_, g) => {
      const shouldOpen = g.dx < -SWIPE_THRESHOLD || (open && g.dx < 20);
      Animated.spring(translateX, {
        toValue: shouldOpen ? -170 : 0,
        useNativeDriver: true, bounciness: 4,
      }).start();
      setOpen(shouldOpen);
    },
  });

  const close = () => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
    setOpen(false);
  };

  return (
    <View style={sr.wrap}>
      {/* Action buttons behind */}
      <View style={sr.actions}>
        <TouchableOpacity style={sr.editAction} onPress={() => { close(); onEdit(); }}>
          <Pencil size={20} color="#fff" />
          <Text style={sr.actionTxt}>Edit{"\n"}Product</Text>
        </TouchableOpacity>
        <TouchableOpacity style={sr.deleteAction} onPress={() => { close(); onDelete(); }}>
          <Trash size={20} color="#fff" />
          <Text style={sr.actionTxt}>Delete{"\n"}Product</Text>
        </TouchableOpacity>
      </View>
      {/* Row */}
      <Animated.View style={[sr.row, { transform: [{ translateX }] }]} {...panResponder.panHandlers}>
        <Text style={sr.num}>{index + 1}.</Text>
        <View style={sr.imgWrap}>
          {item.image_url
            ? <Image source={{ uri: item.image_url }} style={sr.img} resizeMode="cover" />
            : <View style={sr.imgPlaceholder}><Text style={{ fontSize: 22 }}>🍽️</Text></View>
          }
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={sr.name}>{item.name}</Text>
          {!!item.description && <Text style={sr.desc} numberOfLines={1}>{item.description}</Text>}
          <Text style={sr.price}>Rs. {item.price.toLocaleString("en-LK", { minimumFractionDigits: 2 })}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const sr = StyleSheet.create({
  wrap: { position: "relative", marginBottom: 1 },
  actions: {
    position: "absolute", right: 0, top: 0, bottom: 0,
    flexDirection: "row", width: 170,
  },
  editAction: {
    flex: 1, backgroundColor: "#4CAF50",
    alignItems: "center", justifyContent: "center", gap: 4,
  },
  deleteAction: {
    flex: 1, backgroundColor: "#E91E8C",
    alignItems: "center", justifyContent: "center", gap: 4,
  },
  actionTxt: { color: "#fff", fontSize: 11, fontWeight: "700", textAlign: "center" },
  row: {
    backgroundColor: "#fff", flexDirection: "row", alignItems: "center",
    paddingVertical: 10, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: "#EEE",
  },
  num: { fontSize: 13, fontWeight: "600", color: "#555", width: 24 },
  imgWrap: { width: 54, height: 54, borderRadius: 6, overflow: "hidden", backgroundColor: "#F0F0F0" },
  img: { width: "100%", height: "100%" },
  imgPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#EEF4FB" },
  name: { fontSize: 16, fontWeight: "700", color: "#222" },
  desc: { fontSize: 11, color: "#888", marginTop: 2, lineHeight: 15 },
  price: { fontSize: 13, fontWeight: "700", color: "#222", marginTop: 4 },
});

// ── Drawer ────────────────────────────────────────────────────
function DrawerMenu({ session, onClose, onNavigate }: { session: any; onClose: () => void; onNavigate: (r: string) => void }) {
  const [expanded, setExpanded] = useState<string | null>("items");
  const nav = (r: string) => onNavigate(r);
  return (
    <View style={dr.drawer}>
      <View style={dr.profile}>
        <View style={dr.avatar}><Text style={dr.avatarTxt}>{(session?.user?.name||session?.user?.username||"U").charAt(0).toUpperCase()}</Text></View>
        <Text style={dr.userName}>{session?.user?.name||session?.user?.username||"User"} <Text style={dr.role}>({session?.user?.role||"Admin"})</Text></Text>
        {session?.shop?.name && <Text style={dr.shopName}>{session.shop.name}</Text>}
      </View>
      <ScrollView style={dr.list} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={dr.section} onPress={() => setExpanded(e => e==="items"?null:"items")}>
          <Text style={dr.secNum}>1.</Text><Text style={dr.secLabel}>Item Management</Text><Text style={dr.chevron}>{expanded==="items"?"▲":"▼"}</Text>
        </TouchableOpacity>
        {expanded === "items" && (
          <View style={dr.sub}>
            {([["Add Item","/add-item"],["List Items","/items"],["Categories","/categories"],["Portions","/portions"],["Units","/units"]] as [string,string][]).map(([l,r]) => (
              <TouchableOpacity key={r} style={dr.subItem} onPress={() => nav(r)}><Text style={dr.subDot}>›</Text><Text style={dr.subLabel}>{l}</Text></TouchableOpacity>
            ))}
          </View>
        )}
        <View style={dr.divider} />
        <TouchableOpacity style={dr.section} onPress={() => nav("/users")}><Text style={dr.secNum}>2.</Text><Text style={dr.secLabel}>User Management</Text><Text style={dr.chevron}>›</Text></TouchableOpacity>
        <View style={dr.divider} />
        <TouchableOpacity style={dr.section} onPress={() => nav("/settings")}><Text style={dr.secNum}>3.</Text><Text style={dr.secLabel}>Settings</Text><Text style={dr.chevron}>›</Text></TouchableOpacity>
      </ScrollView>
      <TouchableOpacity style={dr.closeBtn} onPress={onClose}><Text style={dr.closeTxt}>Close</Text></TouchableOpacity>
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────
export default function ItemsScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filterCat, setFilterCat] = useState<number | null>(null);
  const [catDropOpen, setCatDropOpen] = useState(false);
  const [session, setSession] = useState<any>(null);
  const slideAnim = useRef(new Animated.Value(-300)).current;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSlid, setDrawerSlid] = useState(false);
  const openDrawer = () => {
    if (Platform.OS === "web") { setDrawerOpen(true); setDrawerSlid(false); setTimeout(() => setDrawerSlid(true), 20); }
    else { slideAnim.setValue(-300); setDrawerOpen(true); Animated.timing(slideAnim, { toValue: 0, duration: 260, useNativeDriver: true }).start(); }
  };
  const closeDrawer = () => {
    if (Platform.OS === "web") { setDrawerSlid(false); setTimeout(() => setDrawerOpen(false), 260); }
    else { Animated.timing(slideAnim, { toValue: -300, duration: 220, useNativeDriver: true }).start(() => setDrawerOpen(false)); }
  };

  // Edit modal (inline, no Modal component — just a panel)
  const [editPanel, setEditPanel] = useState<Product | null>(null);
  const [form, setForm] = useState({ name: "", price: "", description: "", categoryId: "" });

  useEffect(() => { getSession().then(setSession); }, []);
  useFocusEffect(useCallback(() => { loadData(); }, []));

  const loadData = () => {
    if (Platform.OS === "web") {
      setCategories(DEMO_CATS); setProducts(DEMO_PRODS); return;
    }
    const prods = db.getAllSync(
      `SELECT p.*, c.name as category_name FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.deleted_at IS NULL ORDER BY c.sort_order, p.name`
    ) as Product[];
    const cats = db.getAllSync("SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, name") as Category[];
    setProducts(prods); setCategories(cats);
  };

  const filtered = filterCat === null ? products : products.filter((p) => p.category_id === filterCat);

  const openEdit = (p: Product) => {
    router.push(`/add-item?id=${p.id}` as any);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.price.trim()) { Alert.alert("Name and price required"); return; }
    const price = parseFloat(form.price);
    if (isNaN(price)) { Alert.alert("Invalid price"); return; }
    if (Platform.OS !== "web" && editPanel) {
      db.runSync(
        "UPDATE products SET name = ?, price = ?, description = ?, category_id = ?, updated_at = ? WHERE id = ?",
        [form.name.trim(), price, form.description.trim(), form.categoryId ? parseInt(form.categoryId) : null, Date.now(), editPanel.id]
      );
    }
    setEditPanel(null); loadData();
  };

  const handleDelete = (id: number) => {
    if (Platform.OS === "web") { setProducts((p) => p.filter((x) => x.id !== id)); return; }
    Alert.alert("Delete Item", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
        db.runSync("UPDATE products SET deleted_at = ? WHERE id = ?", [Date.now(), id]);
        loadData();
      }},
    ]);
  };

  const selectedCatName = filterCat === null
    ? "Select category"
    : categories.find((c) => c.id === filterCat)?.name ?? "Select category";

  return (
    <SafeAreaView style={s.root} edges={["top", "left", "right", "bottom"]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={openDrawer} style={s.headerIcon}>
          <List size={22} color="#fff" weight="bold" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>
          {session?.shop?.name ? `iDine - ${session.shop.name}` : "iDine Lite"}
        </Text>
        <TouchableOpacity onPress={() => router.replace("/dashboard" as any)}>
          <Image source={require("../assets/icon_home.png")} style={{ width: 28, height: 28 }} resizeMode="contain" />
        </TouchableOpacity>
      </View>

      {/* Edit panel */}
      {editPanel && (
        <View style={s.editPanel}>
          <View style={s.editPanelHeader}>
            <Text style={s.editPanelTitle}>Edit Item</Text>
            <TouchableOpacity onPress={() => setEditPanel(null)}><X size={20} color={Colors.text} /></TouchableOpacity>
          </View>
          <TextInput style={s.editInput} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Item name" />
          <TextInput style={s.editInput} value={form.price} onChangeText={(v) => setForm({ ...form, price: v })} placeholder="Price" keyboardType="decimal-pad" />
          <TextInput style={s.editInput} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder="Description" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            {categories.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[s.catChip, form.categoryId === String(c.id) && s.catChipActive]}
                onPress={() => setForm({ ...form, categoryId: String(c.id) })}
              >
                <Text style={[s.catChipTxt, form.categoryId === String(c.id) && s.catChipTxtActive]}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={s.editBtnRow}>
            <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
              <Check size={16} color="#fff" /><Text style={s.saveTxt}> Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setEditPanel(null)}>
              <Text style={s.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Page title */}
      <Text style={s.pageTitle}>List of items</Text>

      {/* Category dropdown */}
      <View style={s.dropWrap}>
        <TouchableOpacity style={s.drop} onPress={() => setCatDropOpen((v) => !v)}>
          <Text style={s.dropTxt}>{selectedCatName}</Text>
          <Text style={s.dropArrow}>▼</Text>
        </TouchableOpacity>
        {catDropOpen && (
          <View style={s.dropMenu}>
            <TouchableOpacity style={s.dropItem} onPress={() => { setFilterCat(null); setCatDropOpen(false); }}>
              <Text style={s.dropItemTxt}>All Categories</Text>
            </TouchableOpacity>
            {categories.map((c) => (
              <TouchableOpacity key={c.id} style={s.dropItem} onPress={() => { setFilterCat(c.id); setCatDropOpen(false); }}>
                <Text style={s.dropItemTxt}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(i) => String(i.id)}
        style={{ flex: 1 }}
        renderItem={({ item, index }) => (
          <SwipeRow
            item={item}
            index={index}
            onEdit={() => openEdit(item)}
            onDelete={() => handleDelete(item.id)}
          />
        )}
        ListEmptyComponent={
          <Text style={s.empty}>No items. Add items from settings.</Text>
        }
      />

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
      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={() => router.push("/add-item" as any)} activeOpacity={0.85}>
        <Plus size={26} color="#fff" weight="bold" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  header: {
    backgroundColor: Colors.primary, flexDirection: "row",
    alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 10,
  },
  headerIcon: { padding: 2 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "700", color: "#fff" },
  fab: { position: "absolute", bottom: 28, right: 22, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6 },
  pageTitle: { fontSize: 16, fontWeight: "700", color: Colors.primary, textAlign: "center", paddingVertical: 12 },
  // Dropdown
  dropWrap: { marginHorizontal: 16, marginBottom: 4, zIndex: 10 },
  drop: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: "#CCC", borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: "#fff",
  },
  dropTxt: { flex: 1, fontSize: 14, color: "#555" },
  dropArrow: { fontSize: 12, color: "#555" },
  dropMenu: {
    position: "absolute", top: 48, left: 0, right: 0,
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#CCC", borderRadius: 8,
    elevation: 6, zIndex: 20,
  },
  dropItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F0F0F0" },
  dropItemTxt: { fontSize: 14, color: "#333" },
  empty: { textAlign: "center", color: "#AAA", padding: 40 },
  // Edit panel
  editPanel: {
    backgroundColor: "#F8F8F8", borderBottomWidth: 1, borderBottomColor: "#DDD",
    padding: 14,
  },
  editPanelHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  editPanelTitle: { fontSize: 15, fontWeight: "700", color: Colors.primary },
  editInput: {
    borderBottomWidth: 1, borderBottomColor: "#CCC",
    fontSize: 14, color: "#222", paddingVertical: 6, marginBottom: 8,
    backgroundColor: "transparent",
  },
  catChip: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1, borderColor: "#CCC", marginRight: 6, backgroundColor: "#fff",
  },
  catChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catChipTxt: { fontSize: 12, color: "#555" },
  catChipTxtActive: { color: "#fff", fontWeight: "600" },
  editBtnRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  saveBtn: {
    flex: 1, backgroundColor: "#2E7D32", borderRadius: 20,
    paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "center",
  },
  saveTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },
  cancelBtn: {
    flex: 1, backgroundColor: "#8B0000", borderRadius: 20,
    paddingVertical: 10, alignItems: "center", justifyContent: "center",
  },
  cancelTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },
  drawerWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 },
  drawerBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" },
  drawerPanel: { width: 280, position: "absolute", top: 0, left: 0, bottom: 0, zIndex: 1000 },
});

const dr = StyleSheet.create({
  drawer: { flex: 1, backgroundColor: "#0A1F44" },
  profile: { paddingTop: 40, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.2)" },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  avatarTxt: { fontSize: 22, fontWeight: "700", color: "#fff" },
  userName: { fontSize: 15, fontWeight: "700", color: "#fff" },
  role: { fontSize: 12, color: "rgba(255,255,255,0.7)" },
  shopName: { fontSize: 13, color: "#fff", marginTop: 2 },
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
