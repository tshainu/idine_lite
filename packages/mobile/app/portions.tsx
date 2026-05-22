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
import { serverCreatePortionTemplate, serverUpdatePortionTemplate, serverDeletePortionTemplate } from "../lib/serverApi";

interface Portion { id: number; name: string; }

const DEMO: Portion[] = [
  { id: 1, name: "Full" },
  { id: 2, name: "Half" },
  { id: 3, name: "Regular" },
  { id: 4, name: "Large" },
  { id: 5, name: "Mega" },
  { id: 6, name: "Mini" },
];

const SWIPE_THRESHOLD = 60;
const ACTION_WIDTH = 160;

// ── Swipeable row ─────────────────────────────────────────────
function SwipeRow({ item, index, onEdit, onDelete }: {
  item: Portion; index: number;
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
export default function PortionsScreen() {
  const [portions, setPortions] = useState<Portion[]>([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [session, setSession] = useState<any>(null);

  useEffect(() => { getSession().then(setSession); loadData(); }, []);

  const loadData = () => {
    if (Platform.OS === "web") { setPortions(DEMO); return; }
    try {
      const rows = db.getAllSync(
        "SELECT DISTINCT name, MIN(id) as id FROM portions WHERE deleted_at IS NULL AND product_id = 0 GROUP BY name ORDER BY MIN(id) ASC"
      ) as Portion[];
      setPortions(rows.length > 0 ? rows : []);
    } catch { setPortions([]); }
  };

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert("Enter portion name"); return; }
    if (Platform.OS === "web") {
      if (editingId) {
        setPortions((p) => p.map((x) => x.id === editingId ? { ...x, name: name.trim() } : x));
      } else {
        setPortions((p) => [...p, { id: Date.now(), name: name.trim() }]);
      }
      setName(""); setEditingId(null);
      return;
    }
    try {
      if (editingId) {
        await serverUpdatePortionTemplate(editingId, name.trim());
        db.runSync("UPDATE portions SET name = ? WHERE id = ? AND product_id = 0", [name.trim(), editingId]);
      } else {
        const created = await serverCreatePortionTemplate(session?.shop?.id ?? 1, name.trim());
        db.runSync(
          "INSERT OR REPLACE INTO portions (id, product_id, name, price) VALUES (?, 0, ?, 0)",
          [created.id, name.trim()]
        );
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not save portion");
      return;
    }
    setName(""); setEditingId(null); loadData();
  };

  const handleDelete = (id: number) => {
    if (Platform.OS === "web") { setPortions((p) => p.filter((x) => x.id !== id)); return; }
    Alert.alert("Delete Portion", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await serverDeletePortionTemplate(id);
        } catch (e: any) {
          Alert.alert("Error", e?.message ?? "Could not delete");
          return;
        }
        db.runSync("UPDATE portions SET deleted_at = ? WHERE id = ? AND product_id = 0", [Date.now(), id]);
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
        <Text style={s.pageTitle}>{editingId ? "Edit Portion" : "Add Portion"}</Text>

        <TextInput
          style={s.input}
          placeholder="Portion name (e.g. Full, Half, Regular)"
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

        <Text style={s.listTitle}>Available Portions</Text>
        <Text style={s.swipeHint}>Swipe left on a row to edit or delete</Text>

        {portions.map((p, i) => (
          <SwipeRow
            key={p.id}
            item={p}
            index={i}
            onEdit={() => { setEditingId(p.id); setName(p.name); }}
            onDelete={() => handleDelete(p.id)}
          />
        ))}
        {portions.length === 0 && <Text style={s.empty}>No portions yet.</Text>}
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
