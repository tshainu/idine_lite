import { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Platform, Image, Animated, PanResponder,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { List, Pencil, Trash } from "phosphor-react-native";
import { Colors } from "../lib/theme";
import db from "../lib/database";
import { getSession } from "../lib/auth";

interface Category { id: number; name: string; sort_order: number; }

const DEMO: Category[] = [
  { id: 1, name: "Sri Lankan", sort_order: 1 },
  { id: 2, name: "Indian", sort_order: 2 },
  { id: 3, name: "Chinees", sort_order: 3 },
  { id: 4, name: "Beverages", sort_order: 4 },
  { id: 5, name: "Short eats", sort_order: 5 },
  { id: 6, name: "Break fast", sort_order: 6 },
];

const SWIPE_THRESHOLD = 60;
const ACTION_WIDTH = 160;

// ── Swipeable row ─────────────────────────────────────────────
function SwipeRow({ item, index, onEdit, onDelete }: {
  item: Category; index: number;
  onEdit: () => void; onDelete: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [open, setOpen] = useState(false);

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dy) < 20,
    onPanResponderMove: (_, g) => {
      const x = Math.min(0, Math.max(-ACTION_WIDTH, g.dx + (open ? -ACTION_WIDTH : 0)));
      translateX.setValue(x);
    },
    onPanResponderRelease: (_, g) => {
      const shouldOpen = g.dx < -SWIPE_THRESHOLD || (open && g.dx < 20);
      Animated.spring(translateX, { toValue: shouldOpen ? -ACTION_WIDTH : 0, useNativeDriver: true, bounciness: 4 }).start();
      setOpen(shouldOpen);
    },
  });

  const close = () => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
    setOpen(false);
  };

  return (
    <View style={sr.wrap}>
      <View style={sr.actions}>
        <TouchableOpacity style={sr.editBtn} onPress={() => { close(); onEdit(); }}>
          <Pencil size={18} color="#fff" />
          <Text style={sr.actionTxt}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={sr.deleteBtn} onPress={() => { close(); onDelete(); }}>
          <Trash size={18} color="#fff" />
          <Text style={sr.actionTxt}>Delete</Text>
        </TouchableOpacity>
      </View>
      <Animated.View style={[sr.row, { transform: [{ translateX }] }]} {...panResponder.panHandlers}>
        <Text style={sr.num}>{index + 1}.</Text>
        <Text style={sr.name}>{item.name}</Text>
        <Text style={sr.hint}>← swipe</Text>
      </Animated.View>
    </View>
  );
}

const sr = StyleSheet.create({
  wrap: { position: "relative", marginBottom: 1 },
  actions: { position: "absolute", right: 0, top: 0, bottom: 0, flexDirection: "row", width: ACTION_WIDTH },
  editBtn: { flex: 1, backgroundColor: "#4CAF50", alignItems: "center", justifyContent: "center", gap: 4 },
  deleteBtn: { flex: 1, backgroundColor: "#E91E8C", alignItems: "center", justifyContent: "center", gap: 4 },
  actionTxt: { color: "#fff", fontSize: 11, fontWeight: "700" },
  row: {
    backgroundColor: "#fff", flexDirection: "row", alignItems: "center",
    paddingVertical: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: "#F0F0F0",
  },
  num: { fontSize: 13, fontWeight: "600", color: "#888", width: 28 },
  name: { flex: 1, fontSize: 15, fontWeight: "500", color: "#222" },
  hint: { fontSize: 11, color: "#CCC" },
});

// ── Main Screen ───────────────────────────────────────────────
export default function CategoriesScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [session, setSession] = useState<any>(null);

  useEffect(() => { getSession().then(setSession); loadData(); }, []);

  const loadData = () => {
    if (Platform.OS === "web") { setCategories(DEMO); return; }
    const cats = db.getAllSync(
      "SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, name"
    ) as Category[];
    setCategories(cats);
  };

  const handleSave = () => {
    if (!name.trim()) { Alert.alert("Enter category name"); return; }
    if (Platform.OS !== "web") {
      if (editingId) {
        db.runSync("UPDATE categories SET name = ?, updated_at = ? WHERE id = ?",
          [name.trim(), Date.now(), editingId]);
      } else {
        const maxOrder = db.getFirstSync("SELECT MAX(sort_order) as mo FROM categories WHERE deleted_at IS NULL") as any;
        db.runSync(
          "INSERT INTO categories (shop_id, name, sort_order, updated_at) VALUES (?, ?, ?, ?)",
          [session?.shop?.id ?? 1, name.trim(), (maxOrder?.mo ?? 0) + 1, Date.now()]
        );
      }
    } else {
      if (editingId) {
        setCategories((p) => p.map((c) => c.id === editingId ? { ...c, name: name.trim() } : c));
      } else {
        setCategories((p) => [...p, { id: Date.now(), name: name.trim(), sort_order: p.length + 1 }]);
      }
    }
    setName(""); setEditingId(null); loadData();
  };

  const handleEdit = (c: Category) => { setEditingId(c.id); setName(c.name); };

  const handleDelete = (id: number) => {
    if (Platform.OS === "web") { setCategories((p) => p.filter((c) => c.id !== id)); return; }
    const hasItems = db.getFirstSync(
      "SELECT id FROM products WHERE category_id = ? AND deleted_at IS NULL LIMIT 1", [id]
    ) as any;
    if (hasItems) { Alert.alert("Cannot Delete", "This category has items assigned to it."); return; }
    Alert.alert("Delete Category", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
        db.runSync("UPDATE categories SET deleted_at = ? WHERE id = ?", [Date.now(), id]);
        loadData();
      }},
    ]);
  };

  return (
    <SafeAreaView style={s.root} edges={["top", "left", "right", "bottom"]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerIcon}>
          <List size={22} color="#fff" weight="bold" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>
          {session?.shop?.name ? `iDine - ${session.shop.name}` : "iDine Lite"}
        </Text>
        <TouchableOpacity onPress={() => router.replace("/dashboard" as any)}>
          <Image source={require("../assets/icon_home.png")} style={{ width: 28, height: 28 }} resizeMode="contain" />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Text style={s.pageTitle}>{editingId ? "Edit Category" : "Add Category"}</Text>

        <TextInput
          style={s.input}
          placeholder="Category name"
          placeholderTextColor="#AAA"
          value={name}
          onChangeText={setName}
        />

        <View style={s.btnRow}>
          <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
            <Text style={s.saveBtnText}>{editingId ? "Update" : "Save"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelBtn} onPress={() => { setName(""); setEditingId(null); }}>
            <Text style={s.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.listTitle}>Available Categories</Text>
        <Text style={s.swipeHint}>Swipe left on a row to edit or delete</Text>

        {categories.map((c, i) => (
          <SwipeRow
            key={c.id}
            item={c}
            index={i}
            onEdit={() => handleEdit(c)}
            onDelete={() => handleDelete(c.id)}
          />
        ))}
        {categories.length === 0 && <Text style={s.empty}>No categories yet.</Text>}
      </ScrollView>
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
  body: { padding: 20, paddingBottom: 40 },
  pageTitle: { fontSize: 18, fontWeight: "700", color: Colors.primary, textAlign: "center", marginBottom: 24 },
  input: {
    borderBottomWidth: 1.5, borderBottomColor: "#CCC",
    fontSize: 15, color: "#222", paddingVertical: 8, marginBottom: 24,
  },
  btnRow: { flexDirection: "row", gap: 14, marginBottom: 28 },
  saveBtn: { flex: 1, backgroundColor: "#2E7D32", borderRadius: 30, paddingVertical: 14, alignItems: "center" },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  cancelBtn: { flex: 1, backgroundColor: "#8B0000", borderRadius: 30, paddingVertical: 14, alignItems: "center" },
  cancelBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  listTitle: { fontSize: 16, fontWeight: "700", color: Colors.primary, textAlign: "center", marginBottom: 4 },
  swipeHint: { fontSize: 11, color: "#AAA", textAlign: "center", marginBottom: 14, fontStyle: "italic" },
  empty: { color: "#AAA", textAlign: "center", marginTop: 24 },
});
