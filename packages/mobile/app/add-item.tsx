import { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable,
  TextInput, Alert, Platform, Image, Modal, KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { List, Camera, Upload, CheckSquare, Square, CaretDown } from "phosphor-react-native";
import * as ImagePicker from "expo-image-picker";
import { Colors } from "../lib/theme";
import db from "../lib/database";
import { getSession } from "../lib/auth";
import {
  serverCreateProduct, serverUpdateProduct,
  serverCreateCategory, serverCreatePortionTemplate,
  pullAllFromServer, uploadMenuImage,
} from "../lib/serverApi";

// ─── Types ────────────────────────────────────────────────────
interface Category { id: number; name: string; }
interface Unit { id: number; name: string; abbreviation?: string; }
interface Portion { id: number; name: string; }
interface PortionPrice { portionId: number; name: string; price: string; }

// ─── Demo data (web preview) ──────────────────────────────────
const DEMO_CATS: Category[] = [
  { id: 1, name: "Sri Lankan" },
  { id: 2, name: "Indian" },
  { id: 3, name: "Chinees" },
  { id: 4, name: "Beverages" },
];
const DEMO_UNITS: Unit[] = [
  { id: 1, name: "Piece", abbreviation: "pcs" },
  { id: 2, name: "Kilogram", abbreviation: "kg" },
  { id: 3, name: "Litre", abbreviation: "L" },
];
const DEMO_PORTIONS: Portion[] = [
  { id: 1, name: "Full" },
  { id: 2, name: "Half" },
  { id: 3, name: "Regular" },
  { id: 4, name: "Large" },
  { id: 5, name: "Mini" },
  { id: 6, name: "Mega" },
];

// ─── Dropdown Modal ───────────────────────────────────────────
function DropdownModal({
  visible, title, items, selectedId, onSelect, onClose, onAdd,
}: {
  visible: boolean;
  title: string;
  items: { id: number; label: string }[];
  selectedId: number | null;
  onSelect: (id: number, label: string) => void;
  onClose: () => void;
  onAdd?: (name: string) => void;
}) {
  const [addMode, setAddMode] = useState(false);
  const [newName, setNewName] = useState("");
  const isSubmitting = useRef(false);

  // Reset add-mode state whenever the modal opens
  useEffect(() => {
    if (visible) {
      setAddMode(false);
      setNewName("");
      isSubmitting.current = false;
    }
  }, [visible]);

  const handleAdd = () => {
    if (!newName.trim() || !onAdd) return;
    if (isSubmitting.current) return;          // guard double-tap
    isSubmitting.current = true;
    onAdd(newName.trim());
    setNewName("");
    setAddMode(false);
    // reset guard after short delay so it doesn't block next open
    setTimeout(() => { isSubmitting.current = false; }, 1000);
  };

  const handleClose = () => {
    setAddMode(false);
    setNewName("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <TouchableOpacity style={dm.overlay} activeOpacity={1} onPress={handleClose} />
      <View style={dm.sheet}>
        <View style={dm.titleRow}>
          <Text style={dm.title}>{title}</Text>
          {onAdd && !addMode && (
            <TouchableOpacity style={dm.addBtn} onPress={() => setAddMode(true)}>
              <Text style={dm.addBtnTxt}>+ Add New</Text>
            </TouchableOpacity>
          )}
        </View>
        {addMode && (
          <View style={dm.addRow}>
            <TextInput
              style={dm.addInput}
              placeholder={`New ${title.replace("Select ", "")} name`}
              placeholderTextColor="#AAA"
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />
            <TouchableOpacity style={dm.addConfirm} onPress={handleAdd}>
              <Text style={dm.addConfirmTxt}>Add</Text>
            </TouchableOpacity>
            <TouchableOpacity style={dm.addCancel} onPress={() => { setAddMode(false); setNewName(""); }}>
              <Text style={dm.addCancelTxt}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        <ScrollView style={{ maxHeight: 280 }}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[dm.item, selectedId === item.id && dm.itemActive]}
              onPress={() => { onSelect(item.id, item.label); handleClose(); }}
            >
              <Text style={[dm.itemTxt, selectedId === item.id && dm.itemTxtActive]}>
                {item.label}
              </Text>
              {selectedId === item.id && <Text style={{ color: "#2E7D32", fontWeight: "700" }}>✓</Text>}
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={dm.closeBtn} onPress={handleClose}>
          <Text style={dm.closeTxt}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const dm = StyleSheet.create({
  overlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "#fff", borderTopLeftRadius: 18, borderTopRightRadius: 18,
    padding: 20, paddingBottom: 32,
  },
  titleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 14,
  },
  title: { fontSize: 16, fontWeight: "700", color: "#333" },
  addBtn: {
    backgroundColor: "#E8F5E9", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
  },
  addBtnTxt: { fontSize: 13, color: "#2E7D32", fontWeight: "700" },
  addRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginBottom: 12, backgroundColor: "#F9F9F9",
    borderRadius: 8, padding: 8, borderWidth: 1, borderColor: "#E0E0E0",
  },
  addInput: {
    flex: 1, fontSize: 14, color: "#222", paddingVertical: 4,
  },
  addConfirm: {
    backgroundColor: "#2E7D32", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6,
  },
  addConfirmTxt: { color: "#fff", fontWeight: "700", fontSize: 13 },
  addCancel: {
    backgroundColor: "#EEE", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6,
  },
  addCancelTxt: { color: "#666", fontWeight: "700", fontSize: 13 },
  item: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 13, paddingHorizontal: 6,
    borderBottomWidth: 1, borderBottomColor: "#F0F0F0",
  },
  itemActive: { backgroundColor: "#F0F8EE" },
  itemTxt: { fontSize: 15, color: "#333" },
  itemTxtActive: { color: "#2E7D32", fontWeight: "600" },
  closeBtn: {
    marginTop: 14, backgroundColor: "#2E7D32", borderRadius: 30,
    paddingVertical: 12, alignItems: "center",
  },
  closeTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
});

// ─── Main Screen ──────────────────────────────────────────────
export default function AddItemScreen() {
  const { id: editId } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!editId;
  const [session, setSession] = useState<any>(null);

  // Form state
  const [itemName, setItemName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);

  // Dropdowns
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [portions, setPortions] = useState<Portion[]>([]);

  const [selectedCat, setSelectedCat] = useState<{ id: number; name: string } | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<{ id: number; name: string } | null>(null);

  const [catDropOpen, setCatDropOpen] = useState(false);
  const [unitDropOpen, setUnitDropOpen] = useState(false);
  const [portionAddOpen, setPortionAddOpen] = useState(false);
  const [newPortionName, setNewPortionName] = useState("");

  // Portions: checked state + prices
  const [portionPrices, setPortionPrices] = useState<PortionPrice[]>([]);

  useEffect(() => { getSession().then(setSession); loadData(); }, []);

  // Auto-select "Regular" portion once portions are loaded (add mode only)
  useEffect(() => {
    if (portions.length === 0 || isEdit) return;
    const regular = portions.find((p) => p.name.toLowerCase() === "regular");
    if (regular && portionPrices.length === 0) {
      setPortionPrices([{ portionId: regular.id, name: regular.name, price: "" }]);
    }
  }, [portions]);

  // Load existing product data when in edit mode
  useEffect(() => {
    if (!isEdit || !editId || Platform.OS === "web") return;
    try {
      const prod = db.getFirstSync(
        `SELECT p.*, c.name as category_name, u.name as unit_name
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN units u ON u.id = p.unit_id
         WHERE p.id = ?`,
        [parseInt(editId)]
      ) as any;
      if (!prod) return;
      setItemName(prod.name ?? "");
      setDescription(prod.description ?? "");
      setImageUri(prod.image_url ?? null);
      if (prod.category_id) setSelectedCat({ id: prod.category_id, name: prod.category_name ?? "" });
      if (prod.unit_id) setSelectedUnit({ id: prod.unit_id, name: prod.unit_name ?? "" });

      // Load existing portions for this product
      const existingPortions = db.getAllSync(
        "SELECT id, name, price FROM portions WHERE product_id = ? AND deleted_at IS NULL",
        [parseInt(editId)]
      ) as { id: number; name: string; price: number }[];

      if (existingPortions.length > 0) {
        setPortionPrices(existingPortions.map((ep) => ({
          portionId: ep.id,
          name: ep.name,
          price: String(ep.price),
        })));
      }
    } catch (e) {
      console.error("Load edit data error:", e);
    }
  }, [editId, portions]);

  const loadData = () => {
    if (Platform.OS === "web") {
      setCategories(DEMO_CATS);
      setUnits(DEMO_UNITS);
      setPortions(DEMO_PORTIONS);
      return;
    }
    try {
      const cats = db.getAllSync(
        "SELECT id, name FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, name"
      ) as Category[];
      setCategories(cats);
    } catch { setCategories([]); }

    try {
      const us = db.getAllSync(
        "SELECT id, name, abbreviation FROM units WHERE deleted_at IS NULL ORDER BY name"
      ) as Unit[];
      setUnits(us);
    } catch { setUnits([]); }

    try {
      // Ensure "Regular" template portion always exists
      db.runSync(
        `INSERT INTO portions (product_id, name, price)
         SELECT 0, 'Regular', 0 WHERE NOT EXISTS (
           SELECT 1 FROM portions WHERE product_id = 0 AND name = 'Regular' AND deleted_at IS NULL
         )`
      );
      const ps = db.getAllSync(
        `SELECT name, MIN(id) as id FROM portions 
         WHERE deleted_at IS NULL AND product_id = 0 
         GROUP BY name
         ORDER BY MIN(id) ASC`
      ) as Portion[];
      setPortions(ps.length > 0 ? ps : []);
    } catch { setPortions([]); }
  };

  // ─── Add new category inline ──────────────────────────────
  const handleAddCategory = async (name: string) => {
    if (Platform.OS === "web") {
      const newId = Date.now();
      const newCat = { id: newId, name };
      setCategories((prev) => [...prev, newCat]);
      setSelectedCat({ id: newId, name });
      return;
    }
    try {
      const shopId = Number(session?.shop?.id ?? 1);
      const created = await serverCreateCategory(shopId, name, 999);
      db.runSync(
        "INSERT OR REPLACE INTO categories (id, shop_id, name, sort_order, updated_at) VALUES (?, ?, ?, ?, ?)",
        [created.id, shopId, name, 999, Date.now()]
      );
      const newCat = { id: created.id, name };
      setCategories((prev) => [...prev, newCat]);
      setSelectedCat({ id: created.id, name });
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not add category");
    }
  };

  // ─── Add new portion template inline ─────────────────────
  const handleAddPortion = async (name: string) => {
    if (Platform.OS === "web") {
      const newId = Date.now();
      const newPortion = { id: newId, name };
      setPortions((prev) => [...prev, newPortion]);
      setPortionPrices((prev) => [...prev, { portionId: newId, name, price: "" }]);
      return;
    }
    try {
      // Check if template already exists locally
      const existing = db.getFirstSync(
        "SELECT id FROM portions WHERE product_id = 0 AND name = ? AND deleted_at IS NULL", [name]
      ) as { id: number } | null;
      if (existing) {
        Alert.alert("Exists", `Portion "${name}" already exists`);
        return;
      }
      const shopId = Number(session?.shop?.id ?? 1);
      const created = await serverCreatePortionTemplate(shopId, name);
      db.runSync(
        "INSERT OR REPLACE INTO portions (id, product_id, name, price) VALUES (?, 0, ?, 0)",
        [created.id, name]
      );
      const newPortion = { id: created.id, name };
      setPortions((prev) => [...prev, newPortion]);
      setPortionPrices((prev) => [...prev, { portionId: created.id, name, price: "" }]);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not add portion");
    }
  };

  const isPortionSelected = (portionId: number) =>
    portionPrices.some((p) => p.portionId === portionId);

  const togglePortion = (portion: Portion) => {
    if (isPortionSelected(portion.id)) {
      setPortionPrices((prev) => prev.filter((p) => p.portionId !== portion.id));
    } else {
      setPortionPrices((prev) => [...prev, { portionId: portion.id, name: portion.name, price: "" }]);
    }
  };

  const updatePortionPrice = (portionId: number, value: string) => {
    setPortionPrices((prev) =>
      prev.map((p) => (p.portionId === portionId ? { ...p, price: value } : p))
    );
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission required", "Please allow photo library access in Settings.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"] as any,
        allowsEditing: true, aspect: [1, 1], quality: 0.8,
      });
      if (!result.canceled) setImageUri(result.assets[0].uri);
    } catch (e) {
      console.warn("[add-item] pickImage error:", e);
      Alert.alert("Error", "Could not open image library.");
    }
  };

  const takePhoto = async () => {
    try {
      const permLib = await ImagePicker.requestMediaLibraryPermissionsAsync();
      const permCam = await ImagePicker.requestCameraPermissionsAsync();
      if (permLib.status !== "granted" || permCam.status !== "granted") {
        Alert.alert("Permission required", "Camera and photo library access are both needed.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"] as any,
        allowsEditing: true, aspect: [1, 1], quality: 0.8,
      });
      if (!result.canceled) setImageUri(result.assets[0].uri);
    } catch (e: any) {
      console.warn("[add-item] takePhoto error:", e);
      Alert.alert("Error", "Could not open camera.");
    }
  };

  const handleSave = async () => {
    if (!itemName.trim()) { Alert.alert("Required", "Item name is required"); return; }
    for (const pp of portionPrices) {
      if (!pp.price.trim() || isNaN(parseFloat(pp.price))) {
        Alert.alert("Validation Error", `Enter a valid price for "${pp.name}"`);
        return;
      }
    }
    if (Platform.OS === "web") {
      Alert.alert("Saved!", `Item "${itemName}" ${isEdit ? "updated" : "added"} (demo mode).`);
      router.back();
      return;
    }
    try {
      const basePrice = portionPrices.length > 0 ? parseFloat(portionPrices[0].price) || 0 : 0;
      const portionsPayload = portionPrices.map((pp) => ({ name: pp.name, price: parseFloat(pp.price) || 0 }));

      // Upload image to server if a new local image was selected
      let finalImageUrl: string | null = imageUri ?? null;
      if (imageUri && imageUri.startsWith("file://")) {
        finalImageUrl = await uploadMenuImage(imageUri);
      }

      if (isEdit && editId) {
        // UPDATE on server
        await serverUpdateProduct(parseInt(editId), {
          categoryId: selectedCat?.id ?? null,
          name: itemName.trim(),
          description: description.trim() || null,
          imageUrl: finalImageUrl,
          price: basePrice,
          isAvailable: true,
          portions: portionsPayload,
        });
        // Refresh local from server
        await pullAllFromServer(Number(session?.shop?.id ?? 1));
        Alert.alert("Updated", `"${itemName}" has been updated!`, [
          { text: "OK", onPress: () => router.back() },
        ]);
      } else {
        // INSERT on server
        const shopId = Number(session?.shop?.id ?? 1);
        await serverCreateProduct({
          shopId,
          categoryId: selectedCat?.id ?? null,
          name: itemName.trim(),
          description: description.trim() || null,
          imageUrl: finalImageUrl,
          price: basePrice,
          portions: portionsPayload,
        });
        // Refresh local from server
        await pullAllFromServer(shopId);
        Alert.alert("Item Added", `"${itemName}" has been saved!`, [
          { text: "OK", onPress: () => router.back() },
        ]);
      }
    } catch (e: any) {
      Alert.alert("Save Failed", e?.message ?? String(e));
    }
  };

  const handleCancel = () => router.back();

  // Selected portion prices (sorted by order selected)
  const selectedPortionPrices = portionPrices;

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
          <Image
            source={require("../assets/icon_home.png")}
            style={{ width: 28, height: 28 }}
            resizeMode="contain"
          />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
      <ScrollView
        style={{ flex: 1, width: "100%" }}
        contentContainerStyle={s.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.pageTitle}>{isEdit ? "Edit Item" : "Add Item"}</Text>

        {/* Item name */}
        <TextInput
          style={s.input}
          placeholder="Item name"
          placeholderTextColor="#AAA"
          value={itemName}
          onChangeText={setItemName}
        />

        {/* Category + Unit row */}
        <View style={s.rowTwo}>
          <TouchableOpacity
            style={s.dropBtn}
            onPress={() => setCatDropOpen(true)}
            activeOpacity={0.8}
          >
            <Text style={[s.dropTxt, !selectedCat && s.dropPlaceholder]} numberOfLines={1}>
              {selectedCat ? selectedCat.name : "Category"}
            </Text>
            <CaretDown size={15} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity
            style={s.dropBtn}
            onPress={() => setUnitDropOpen(true)}
            activeOpacity={0.8}
          >
            <Text style={[s.dropTxt, !selectedUnit && s.dropPlaceholder]} numberOfLines={1}>
              {selectedUnit ? selectedUnit.name : "Unit"}
            </Text>
            <CaretDown size={15} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Eligible Portions */}
        <View style={s.sectionRow}>
          <Text style={s.sectionLabel}>Eligible Portions</Text>
          <TouchableOpacity
            style={s.sectionAddBtn}
            onPress={() => setPortionAddOpen((v) => !v)}
          >
            <Text style={s.sectionAddTxt}>{portionAddOpen ? "✕" : "+"}</Text>
          </TouchableOpacity>
        </View>
        {portionAddOpen && (
          <View style={s.inlineAddRow}>
            <TextInput
              style={s.inlineAddInput}
              placeholder="New portion name (e.g. Quarter)"
              placeholderTextColor="#AAA"
              value={newPortionName}
              onChangeText={setNewPortionName}
              autoFocus
            />
            <TouchableOpacity
              style={s.inlineAddConfirm}
              onPress={() => {
                if (newPortionName.trim()) {
                  handleAddPortion(newPortionName.trim());
                  setNewPortionName("");
                  setPortionAddOpen(false);
                }
              }}
            >
              <Text style={s.inlineAddConfirmTxt}>Add</Text>
            </TouchableOpacity>
          </View>
        )}
        {portions.length === 0 && !portionAddOpen ? (
          <Text style={s.noneText}>No portions yet. Tap + to add one.</Text>
        ) : (
          <View style={s.portionGrid}>
            {portions.map((portion) => {
              const checked = isPortionSelected(portion.id);
              return (
                <TouchableOpacity
                  key={portion.id}
                  style={s.portionChip}
                  onPress={() => togglePortion(portion)}
                  activeOpacity={0.7}
                >
                  {checked
                    ? <CheckSquare size={20} color="#2E7D32" weight="fill" />
                    : <Square size={20} color="#888" />
                  }
                  <Text style={[s.portionChipTxt, checked && s.portionChipTxtActive]}>
                    {portion.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Price per portion */}
        {selectedPortionPrices.length > 0 && (
          <>
            <Text style={s.sectionLabel}>Price</Text>
            <View style={s.priceGrid}>
              {selectedPortionPrices.map((pp) => (
                <View key={pp.portionId} style={s.priceField}>
                  <TextInput
                    style={s.priceInput}
                    placeholder={pp.name}
                    placeholderTextColor="#AAA"
                    value={pp.price}
                    onChangeText={(v) => updatePortionPrice(pp.portionId, v)}
                    keyboardType="decimal-pad"
                  />
                </View>
              ))}
            </View>
          </>
        )}

        {/* Description */}
        <TextInput
          style={s.textarea}
          placeholder="Description"
          placeholderTextColor="#AAA"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />

        {/* Image picker */}
        <View style={s.imageRow}>
          <View style={s.imagePreview}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={s.previewImg} resizeMode="cover" />
            ) : (
              <View style={s.imgPlaceholder}>
                <Text style={{ fontSize: 32 }}>🖼️</Text>
              </View>
            )}
          </View>
          <View style={s.imageActions}>
            <TouchableOpacity style={s.imageBtn} onPress={pickImage}>
              <Upload size={18} color="#555" />
              <Text style={s.imageBtnTxt}>Upload image</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.imageBtn} onPress={takePhoto}>
              <Camera size={18} color="#555" />
              <Text style={s.imageBtnTxt}>Take photo</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Buttons */}
        <View style={s.btnRow}>
          <Pressable style={s.saveBtn} onPress={() => handleSave()}>
            <Text style={s.saveBtnTxt}>{isEdit ? "Save Changes" : "Add Item"}</Text>
          </Pressable>
          <Pressable style={s.cancelBtn} onPress={() => handleCancel()}>
            <Text style={s.cancelBtnTxt}>Cancel</Text>
          </Pressable>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Category dropdown modal */}
      <DropdownModal
        visible={catDropOpen}
        title="Select Category"
        items={categories.map((c) => ({ id: c.id, label: c.name }))}
        selectedId={selectedCat?.id ?? null}
        onSelect={(id, label) => setSelectedCat({ id, name: label })}
        onClose={() => setCatDropOpen(false)}
        onAdd={handleAddCategory}
      />

      {/* Unit dropdown modal */}
      <DropdownModal
        visible={unitDropOpen}
        title="Select Unit"
        items={units.map((u) => ({ id: u.id, label: u.abbreviation ? `${u.name} (${u.abbreviation})` : u.name }))}
        selectedId={selectedUnit?.id ?? null}
        onSelect={(id, label) => setSelectedUnit({ id, name: label })}
        onClose={() => setUnitDropOpen(false)}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },

  // Header
  header: {
    backgroundColor: Colors.primary, flexDirection: "row",
    alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 10,
  },
  headerIcon: { padding: 2 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "700", color: "#fff" },

  body: { padding: 20, paddingBottom: 40 },

  pageTitle: {
    fontSize: 18, fontWeight: "700", color: Colors.primary,
    textAlign: "center", marginBottom: 20,
  },

  // Inputs
  input: {
    borderWidth: 1.5, borderColor: "#DDD", borderRadius: 8,
    backgroundColor: "#F9F9F9", fontSize: 14, color: "#222",
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16,
  },
  textarea: {
    borderWidth: 1.5, borderColor: "#DDD", borderRadius: 8,
    backgroundColor: "#F9F9F9", fontSize: 14, color: "#222",
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10,
    height: 90, textAlignVertical: "top", marginBottom: 16,
  },

  // Category + Unit row
  rowTwo: { flexDirection: "row", gap: 10, marginBottom: 20, width: "100%" },
  dropBtn: {
    flex: 1, flexDirection: "row", alignItems: "center",
    borderWidth: 1.5, borderColor: "#DDD", borderRadius: 8,
    backgroundColor: "#F9F9F9", paddingHorizontal: 12, paddingVertical: 11,
  },
  dropTxt: { flex: 1, fontSize: 14, color: "#222" },
  dropPlaceholder: { color: "#AAA" },
  dropArrow: { fontSize: 11, color: "#666" },

  // Portions
  sectionRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 14, fontWeight: "700", color: "#333",
  },
  sectionAddBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: "#2E7D32", alignItems: "center", justifyContent: "center",
  },
  sectionAddTxt: { color: "#fff", fontSize: 18, fontWeight: "700", lineHeight: 22 },
  inlineAddRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginBottom: 12, backgroundColor: "#F9F9F9",
    borderRadius: 8, padding: 8, borderWidth: 1, borderColor: "#E0E0E0",
  },
  inlineAddInput: {
    flex: 1, fontSize: 14, color: "#222", paddingVertical: 4,
  },
  inlineAddConfirm: {
    backgroundColor: "#2E7D32", borderRadius: 6,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  inlineAddConfirmTxt: { color: "#fff", fontWeight: "700", fontSize: 13 },
  portionGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16,
  },
  portionChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingVertical: 5, paddingRight: 10,
    minWidth: "30%",
  },
  portionChipTxt: { fontSize: 13, color: "#555" },
  portionChipTxtActive: { color: "#2E7D32", fontWeight: "600" },
  noneText: { fontSize: 13, color: "#AAA", marginBottom: 16, fontStyle: "italic" },

  // Price per portion
  priceGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 18,
  },
  priceField: { minWidth: "45%", flex: 1 },
  priceInput: {
    borderBottomWidth: 1.5, borderBottomColor: "#CCC",
    fontSize: 14, color: "#222",
    paddingVertical: 8,
  },

  // Image
  imageRow: {
    flexDirection: "row", alignItems: "center",
    gap: 20, marginBottom: 28, marginTop: 6,
  },
  imagePreview: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: "#F0F0F0", overflow: "hidden",
    alignItems: "center", justifyContent: "center",
  },
  previewImg: { width: "100%", height: "100%" },
  imgPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F0F0F0" },
  imageActions: { flex: 1, gap: 14 },
  imageBtn: { flexDirection: "row", alignItems: "center", gap: 8 },
  imageBtnTxt: { fontSize: 14, color: "#444" },

  // Buttons
  btnRow: { flexDirection: "row", gap: 14 },
  saveBtn: {
    flex: 1, backgroundColor: "#2E7D32", borderRadius: 30,
    paddingVertical: 14, alignItems: "center",
  },
  saveBtnTxt: { color: "#fff", fontSize: 15, fontWeight: "700" },
  cancelBtn: {
    flex: 1, backgroundColor: "#8B0000", borderRadius: 30,
    paddingVertical: 14, alignItems: "center",
  },
  cancelBtnTxt: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
