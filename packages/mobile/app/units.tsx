import { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Platform, Image, Animated, PanResponder,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { List, FloppyDisk, X } from "phosphor-react-native";
import { Colors, Spacing, Radius } from "../lib/theme";
import db from "../lib/database";
import { getSession } from "../lib/auth";
import { serverCreateUnit, serverUpdateUnit, serverDeleteUnit } from "../lib/serverApi";

interface Unit { id: number; name: string; abbreviation?: string; }

const SWIPE_THRESHOLD = 60;
const ACTION_WIDTH = 160;

function SwipeRow({
  unit,
  onEdit,
  onDelete,
}: {
  unit: Unit;
  onEdit: (u: Unit) => void;
  onDelete: (id: number) => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const open = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dy) < 20,
      onPanResponderMove: (_, g) => {
        const dx = Math.max(-ACTION_WIDTH, Math.min(0, g.dx + (open.current ? -ACTION_WIDTH : 0)));
        translateX.setValue(dx);
      },
      onPanResponderRelease: (_, g) => {
        const shouldOpen = open.current
          ? g.dx > -SWIPE_THRESHOLD
          : g.dx < -SWIPE_THRESHOLD;
        const toValue = shouldOpen ? -ACTION_WIDTH : 0;
        open.current = toValue !== 0;
        Animated.spring(translateX, {
          toValue,
          useNativeDriver: true,
          bounciness: 4,
        }).start();
      },
    })
  ).current;

  const close = () => {
    open.current = false;
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
  };

  return (
    <View style={sw.wrapper}>
      {/* Actions behind */}
      <View style={sw.actions}>
        <TouchableOpacity
          style={sw.editAction}
          onPress={() => { close(); onEdit(unit); }}
        >
          <Text style={sw.actionText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={sw.deleteAction}
          onPress={() => { close(); onDelete(unit.id); }}
        >
          <Text style={sw.actionText}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Foreground row */}
      <Animated.View
        style={[sw.row, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <View style={sw.info}>
          <Text style={sw.name}>{unit.name}</Text>
          {unit.abbreviation ? (
            <Text style={sw.abbr}>({unit.abbreviation})</Text>
          ) : null}
        </View>
        <Text style={sw.hint}>←</Text>
      </Animated.View>
    </View>
  );
}

export default function UnitsScreen() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [name, setName] = useState("");
  const [abbr, setAbbr] = useState("");
  const [session, setSession] = useState<any>(null);
  const [editId, setEditId] = useState<number | null>(null);

  useEffect(() => {
    getSession().then(setSession);
    loadUnits();
  }, []);

  const loadUnits = () => {
    if (Platform.OS === "web") {
      setUnits([
        { id: 1, name: "Kilogram", abbreviation: "kg" },
        { id: 2, name: "Gram", abbreviation: "g" },
        { id: 3, name: "Litre", abbreviation: "L" },
        { id: 4, name: "Piece", abbreviation: "pcs" },
      ]);
      return;
    }
    try {
      const rows = db.getAllSync(
        "SELECT * FROM units WHERE deleted_at IS NULL ORDER BY name"
      ) as Unit[];
      setUnits(rows);
    } catch {
      setUnits([]);
    }
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) { Alert.alert("Enter unit name"); return; }
    if (Platform.OS === "web") {
      Alert.alert("Not available", "Saving requires the native app.");
      return;
    }
    try {
      if (editId !== null) {
        await serverUpdateUnit(editId, trimmed, abbr.trim() || undefined);
        db.runSync(
          "UPDATE units SET name=?, abbreviation=?, updated_at=? WHERE id=?",
          [trimmed, abbr.trim() || null, Date.now(), editId]
        );
      } else {
        const created = await serverCreateUnit(session?.shop?.id ?? 1, trimmed, abbr.trim() || undefined);
        db.runSync(
          "INSERT OR REPLACE INTO units (id, shop_id, name, abbreviation, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
          [created.id, session?.shop?.id ?? 1, trimmed, abbr.trim() || null, Date.now(), Date.now()]
        );
      }
      setName(""); setAbbr(""); setEditId(null);
      loadUnits();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? String(e));
    }
  };

  const handleDelete = (id: number) => {
    Alert.alert("Delete Unit", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          if (Platform.OS === "web") { Alert.alert("Not available on web"); return; }
          try {
            await serverDeleteUnit(id);
          } catch (e: any) {
            Alert.alert("Error", e?.message ?? "Could not delete");
            return;
          }
          db.runSync("UPDATE units SET deleted_at=? WHERE id=?", [Date.now(), id]);
          loadUnits();
        },
      },
    ]);
  };

  const startEdit = (unit: Unit) => {
    setEditId(unit.id);
    setName(unit.name);
    setAbbr(unit.abbreviation ?? "");
  };

  const cancelEdit = () => { setEditId(null); setName(""); setAbbr(""); };

  return (
    <SafeAreaView style={s.root} edges={["top", "left", "right", "bottom"]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerIcon}>
          <List size={22} color="#fff" weight="bold" />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>
          {session?.shop?.name ? `iDine - ${session.shop.name}` : "iDine Lite"}
        </Text>
        <TouchableOpacity onPress={() => router.replace("/dashboard" as any)}>
          <Image source={require("../assets/icon_home.png")} style={{ width: 28, height: 28 }} resizeMode="contain" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Text style={s.screenTitle}>Units</Text>

        {/* Input form */}
        <View style={s.formCard}>
          <Text style={s.label}>Unit Name</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Kilogram"
            placeholderTextColor={Colors.textMuted}
          />
          <Text style={s.label}>Abbreviation (optional)</Text>
          <TextInput
            style={s.input}
            value={abbr}
            onChangeText={setAbbr}
            placeholder="e.g. kg"
            placeholderTextColor={Colors.textMuted}
          />
          <View style={s.btnRow}>
            <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
              <FloppyDisk size={16} color="#fff" />
              <Text style={s.saveBtnText}>{editId !== null ? "Update Unit" : "Save Unit"}</Text>
            </TouchableOpacity>
            {editId !== null && (
              <TouchableOpacity style={s.cancelBtn} onPress={cancelEdit}>
                <X size={16} color="#fff" />
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Units list */}
        <Text style={s.listTitle}>Existing Units</Text>
        <Text style={s.swipeHint}>Swipe left on a row to Edit or Delete</Text>
        {units.length === 0 ? (
          <Text style={s.empty}>No units added yet.</Text>
        ) : units.map((unit) => (
          <SwipeRow
            key={unit.id}
            unit={unit}
            onEdit={startEdit}
            onDelete={handleDelete}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const sw = StyleSheet.create({
  wrapper: { marginBottom: 8, borderRadius: 10, overflow: "hidden" },
  actions: {
    position: "absolute", right: 0, top: 0, bottom: 0,
    width: ACTION_WIDTH, flexDirection: "row",
  },
  editAction: {
    width: 80, backgroundColor: "#4CAF50",
    alignItems: "center", justifyContent: "center",
  },
  deleteAction: {
    width: 80, backgroundColor: "#E91E8C",
    alignItems: "center", justifyContent: "center",
  },
  actionText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  row: {
    backgroundColor: "#fff", flexDirection: "row",
    alignItems: "center", paddingHorizontal: 14, paddingVertical: 14,
    borderWidth: 1, borderColor: "#E0E0E0", borderRadius: 10,
  },
  info: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontSize: 15, fontWeight: "600", color: Colors.text },
  abbr: { fontSize: 13, color: Colors.textMuted },
  hint: { fontSize: 16, color: "#CCC" },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0F2F5" },
  header: {
    backgroundColor: Colors.primary, flexDirection: "row",
    alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 10,
  },
  headerIcon: { padding: 2 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "700", color: "#fff" },
  body: { padding: 16, paddingBottom: 40 },
  screenTitle: {
    fontSize: 20, fontWeight: "800", color: Colors.primary,
    textAlign: "center", marginBottom: 16,
  },
  formCard: {
    backgroundColor: "#fff", borderRadius: 12,
    padding: 16, marginBottom: 20,
    elevation: 2, shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4,
  },
  label: { fontSize: 13, fontWeight: "600", color: "#444", marginBottom: 4, marginTop: 10 },
  input: {
    borderBottomWidth: 1.5, borderBottomColor: "#CCC",
    paddingVertical: 8, paddingHorizontal: 4,
    fontSize: 15, color: Colors.text,
  },
  btnRow: { flexDirection: "row", gap: 14, marginBottom: 4, marginTop: 18 },
  saveBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "#2E7D32", borderRadius: 30, paddingVertical: 14, gap: 6,
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  cancelBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "#8B0000", borderRadius: 30, paddingVertical: 14, gap: 6,
  },
  cancelBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  listTitle: { fontSize: 16, fontWeight: "700", color: Colors.primary, textAlign: "center", marginBottom: 4 },
  swipeHint: { fontSize: 11, color: "#AAA", textAlign: "center", marginBottom: 14, fontStyle: "italic" },
  empty: { color: "#AAA", textAlign: "center", marginTop: 24 },
});
