import { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, Alert, KeyboardAvoidingView, Platform
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft, Plus, Pencil, Trash, X, Check, User, ShieldCheck } from "phosphor-react-native";
import { Colors, Spacing, Radius, Typography } from "../lib/theme";
import { store } from "../lib/store";
import { getSession } from "../lib/auth";

interface UserItem { id: number; username: string; role: string; is_active: number; }

export default function UsersScreen() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [modal, setModal] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [form, setForm] = useState({ username: "", password: "", role: "cashier" });
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { getSession().then(setSession); loadUsers(); }, []);

  const loadUsers = async () => {
    const s = await getSession();
    if (!s) return;
    const apiUrl = await store.getApiUrl();
    try {
      const res = await fetch(`${apiUrl}/api/users?shop_id=${s.shop.id}`, {
        headers: { Authorization: `Bearer ${s.token}` },
      });
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch {
      // fallback: load from local SQLite
    }
  };

  const handleSave = async () => {
    if (!form.username.trim() || (!editing && !form.password.trim())) {
      Alert.alert("Error", "Username and password are required");
      return;
    }
    setLoading(true);
    const apiUrl = await store.getApiUrl();
    const s = await getSession();
    try {
      let res: Response;
      if (editing) {
        res = await fetch(`${apiUrl}/api/users/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${s?.token}` },
          body: JSON.stringify({ role: form.role, password: form.password || undefined }),
        });
      } else {
        res = await fetch(`${apiUrl}/api/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${s?.token}` },
          body: JSON.stringify({ shopId: s?.shop.id, username: form.username, password: form.password, role: form.role }),
        });
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? `Server error ${res.status}`);
      }
      setModal(false);
      loadUsers();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => { setEditing(null); setForm({ username: "", password: "", role: "cashier" }); setModal(true); };
  const openEdit = (u: UserItem) => { setEditing(u); setForm({ username: u.username, password: "", role: u.role }); setModal(true); };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft size={22} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Users</Text>
        {session?.user?.role === "admin" && (
          <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
            <Plus size={20} color={Colors.white} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={users}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={[styles.avatar, { backgroundColor: item.role === "admin" ? Colors.primaryLight : Colors.greenLight }]}>
              {item.role === "admin"
                ? <ShieldCheck size={22} color={Colors.primary} weight="duotone" />
                : <User size={22} color={Colors.green} weight="duotone" />}
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.username}>{item.username}</Text>
              <Text style={styles.role}>{item.role === "admin" ? "Administrator" : "Cashier"}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: item.is_active ? Colors.greenLight : Colors.redLight }]}>
              <Text style={[styles.badgeText, { color: item.is_active ? Colors.green : Colors.red }]}>
                {item.is_active ? "Active" : "Inactive"}
              </Text>
            </View>
            {session?.user?.role === "admin" && (
              <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
                <Pencil size={16} color={Colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No users found. Requires internet to load.</Text>
          </View>
        }
      />

      <Modal visible={modal} transparent animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editing ? "Edit User" : "Add User"}</Text>
                <TouchableOpacity onPress={() => setModal(false)}>
                  <X size={22} color={Colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Username *</Text>
              <TextInput
                style={styles.input}
                value={form.username}
                onChangeText={(v) => setForm({ ...form, username: v })}
                placeholder="Enter username"
                placeholderTextColor={Colors.textMuted}
                editable={!editing}
              />

              <Text style={styles.label}>{editing ? "New Password (leave blank to keep)" : "Password *"}</Text>
              <TextInput
                style={styles.input}
                value={form.password}
                onChangeText={(v) => setForm({ ...form, password: v })}
                placeholder="Enter password"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry
              />

              <Text style={styles.label}>Role</Text>
              <View style={styles.roleRow}>
                {["cashier", "admin"].map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roleBtn, form.role === r && styles.roleBtnActive]}
                    onPress={() => setForm({ ...form, role: r })}
                  >
                    <Text style={[styles.roleBtnText, form.role === r && styles.roleBtnTextActive]}>
                      {r === "admin" ? "Admin" : "Cashier"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
                <Check size={18} color={Colors.white} />
                <Text style={styles.saveBtnText}>{editing ? "Update" : "Add User"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.primary, paddingHorizontal: Spacing.lg,
    paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 12,
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: Colors.white },
  addBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center",
  },
  list: { padding: Spacing.md, gap: Spacing.sm },
  row: {
    backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.md,
    flexDirection: "row", alignItems: "center", elevation: 1,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
  },
  username: { fontSize: 15, fontWeight: "600", color: Colors.text },
  role: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, marginRight: 6 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  editBtn: { padding: 8 },
  empty: { flex: 1, alignItems: "center", padding: 40 },
  emptyText: { color: Colors.textMuted, fontSize: 14, textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: Spacing.xl, paddingBottom: 40,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.lg },
  modalTitle: { ...Typography.h3, color: Colors.text },
  label: { ...Typography.label, color: Colors.text, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14,
    color: Colors.text, marginBottom: 14, backgroundColor: Colors.surface,
  },
  roleRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  roleBtn: {
    flex: 1, paddingVertical: 10, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, alignItems: "center",
  },
  roleBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  roleBtnText: { fontSize: 14, fontWeight: "600", color: Colors.textSecondary },
  roleBtnTextActive: { color: Colors.white },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  saveBtnText: { ...Typography.button, color: Colors.white },
});
