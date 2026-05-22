import { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, Alert, KeyboardAvoidingView, Platform,
  ActivityIndicator, Animated, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  List, Plus, PencilSimple, Trash, X, Check,
  User, ShieldCheck, Eye, EyeSlash, MagnifyingGlass,
  ToggleLeft, ToggleRight, Warning,
} from "phosphor-react-native";
import { Colors, Spacing, Radius, Typography } from "../lib/theme";
import { store } from "../lib/store";
import { getSession } from "../lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────
interface UserItem {
  id: number;
  username: string;
  role: "admin" | "cashier";
  isActive: boolean;
  createdAt?: string;
}

// ─── Demo data ────────────────────────────────────────────────────────────────
const DEMO_USERS: UserItem[] = [
  { id: 1, username: "admin", role: "admin", isActive: true, createdAt: new Date().toISOString() },
  { id: 2, username: "cashier1", role: "cashier", isActive: true, createdAt: new Date().toISOString() },
  { id: 3, username: "cashier2", role: "cashier", isActive: false, createdAt: new Date().toISOString() },
];

// ─── User Card ─────────────────────────────────────────────────────────────── 
function UserCard({
  item, isAdmin, isSelf, onEdit, onToggleActive, onDelete,
}: {
  item: UserItem;
  isAdmin: boolean;
  isSelf: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () =>
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 20 }).start();
  const handlePressOut = () =>
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20 }).start();

  const isAdminUser = item.role === "admin";

  return (
    <Animated.View style={[c.card, { transform: [{ scale: scaleAnim }] }]}>
      {/* Avatar */}
      <View style={[c.avatar, { backgroundColor: isAdminUser ? "#E8EDF7" : "#E6F4EC" }]}>
        {isAdminUser
          ? <ShieldCheck size={26} color={Colors.primary} weight="duotone" />
          : <User size={26} color={Colors.green} weight="duotone" />}
      </View>

      {/* Info */}
      <View style={c.info}>
        <View style={c.nameRow}>
          <Text style={c.username} numberOfLines={1}>{item.username}</Text>
          {isSelf && (
            <View style={c.selfBadge}>
              <Text style={c.selfBadgeTxt}>You</Text>
            </View>
          )}
        </View>
        <View style={c.metaRow}>
          <View style={[c.rolePill, { backgroundColor: isAdminUser ? "#E8EDF7" : "#E6F4EC" }]}>
            <Text style={[c.rolePillTxt, { color: isAdminUser ? Colors.primary : Colors.green }]}>
              {isAdminUser ? "Admin" : "Cashier"}
            </Text>
          </View>
          <View style={[c.statusDot, { backgroundColor: item.isActive ? Colors.green : "#B71C1C" }]} />
          <Text style={[c.statusTxt, { color: item.isActive ? Colors.green : "#B71C1C" }]}>
            {item.isActive ? "Active" : "Inactive"}
          </Text>
        </View>
      </View>

      {/* Actions — admin only, and can't self-delete */}
      {isAdmin && (
        <View style={c.actions}>
          <TouchableOpacity
            style={c.actionBtn}
            onPress={onToggleActive}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            activeOpacity={0.7}
          >
            {item.isActive
              ? <ToggleRight size={22} color={Colors.green} weight="fill" />
              : <ToggleLeft size={22} color="#AAA" weight="fill" />}
          </TouchableOpacity>

          <TouchableOpacity
            style={c.actionBtn}
            onPress={onEdit}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            activeOpacity={0.7}
          >
            <PencilSimple size={19} color={Colors.primary} weight="bold" />
          </TouchableOpacity>

          {!isSelf && (
            <TouchableOpacity
              style={c.actionBtn}
              onPress={onDelete}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              activeOpacity={0.7}
            >
              <Trash size={19} color="#B71C1C" weight="bold" />
            </TouchableOpacity>
          )}
        </View>
      )}
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function UsersScreen() {
  const [session, setSession] = useState<any>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [filtered, setFiltered] = useState<UserItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Modal
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [form, setForm] = useState({ username: "", password: "", role: "cashier" as "admin" | "cashier" });
  const [showPwd, setShowPwd] = useState(false);

  useEffect(() => {
    getSession().then((s) => {
      setSession(s);
      // Block cashier from user management
      if (s?.user?.role !== "admin") {
        Alert.alert("Access Denied", "Only admins can manage users.", [
          { text: "OK", onPress: () => router.back() },
        ]);
        return;
      }
      loadUsers();
    });
  }, []);

  // Search filter
  useEffect(() => {
    const q = search.toLowerCase().trim();
    setFiltered(q ? users.filter((u) =>
      u.username.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    ) : users);
  }, [search, users]);

  const loadUsers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    if (Platform.OS === "web") {
      setUsers(DEMO_USERS);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const s = await getSession();
      if (!s) return;
      const apiUrl = await store.getApiUrl();
      const res = await fetch(`${apiUrl}/api/users?shop_id=${s.shop.id}`, {
        headers: { Authorization: `Bearer ${s.token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // normalise isActive — server returns boolean or 0/1
      const normalised: UserItem[] = (data.users ?? []).map((u: any) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        isActive: u.isActive === true || u.isActive === 1,
        createdAt: u.createdAt,
      }));
      setUsers(normalised);
    } catch (e: any) {
      Alert.alert("Load Error", e?.message ?? "Could not load users");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleSave = async () => {
    const uname = form.username.trim();
    const pwd = form.password.trim();

    if (!editing && !uname) {
      Alert.alert("Required", "Username cannot be empty");
      return;
    }
    if (!editing && !pwd) {
      Alert.alert("Required", "Password cannot be empty");
      return;
    }
    if (pwd && pwd.length < 4) {
      Alert.alert("Too short", "Password must be at least 4 characters");
      return;
    }

    if (Platform.OS === "web") {
      if (editing) {
        setUsers((prev) => prev.map((u) => u.id === editing.id ? { ...u, role: form.role } : u));
      } else {
        setUsers((prev) => [...prev, { id: Date.now(), username: uname, role: form.role, isActive: true }]);
      }
      setModal(false);
      return;
    }

    setSaving(true);
    try {
      const s = await getSession();
      const apiUrl = await store.getApiUrl();
      let res: Response;

      if (editing) {
        const body: any = { role: form.role };
        if (pwd) body.password = pwd;
        res = await fetch(`${apiUrl}/api/users/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${s?.token}` },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`${apiUrl}/api/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${s?.token}` },
          body: JSON.stringify({ shopId: s?.shop.id, username: uname, password: pwd, role: form.role }),
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? `Server error ${res.status}`);
      }

      setModal(false);
      loadUsers(true);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not save user");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (user: UserItem) => {
    const newVal = !user.isActive;
    const label = newVal ? "activate" : "deactivate";
    Alert.alert(
      `${newVal ? "Activate" : "Deactivate"} User`,
      `${label.charAt(0).toUpperCase() + label.slice(1)} "${user.username}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: newVal ? "Activate" : "Deactivate",
          style: newVal ? "default" : "destructive",
          onPress: async () => {
            if (Platform.OS === "web") {
              setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, isActive: newVal } : u));
              return;
            }
            try {
              const s = await getSession();
              const apiUrl = await store.getApiUrl();
              const res = await fetch(`${apiUrl}/api/users/${user.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${s?.token}` },
                body: JSON.stringify({ isActive: newVal }),
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              loadUsers(true);
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Could not update user");
            }
          },
        },
      ]
    );
  };

  const handleDelete = (user: UserItem) => {
    Alert.alert(
      "Delete User",
      `Permanently remove "${user.username}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (Platform.OS === "web") {
              setUsers((prev) => prev.filter((u) => u.id !== user.id));
              return;
            }
            try {
              const s = await getSession();
              const apiUrl = await store.getApiUrl();
              const res = await fetch(`${apiUrl}/api/users/${user.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${s?.token}` },
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              loadUsers(true);
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Could not delete user");
            }
          },
        },
      ]
    );
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ username: "", password: "", role: "cashier" });
    setShowPwd(false);
    setModal(true);
  };

  const openEdit = (u: UserItem) => {
    setEditing(u);
    setForm({ username: u.username, password: "", role: u.role });
    setShowPwd(false);
    setModal(true);
  };

  const isAdmin = session?.user?.role === "admin";
  const selfId = session?.user?.id;

  // ── Summary stats
  const totalUsers = users.length;
  const activeCount = users.filter((u) => u.isActive).length;
  const adminCount = users.filter((u) => u.role === "admin").length;

  return (
    <SafeAreaView style={s.root} edges={["top", "left", "right", "bottom"]}>
      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerIcon}>
          <List size={22} color="#fff" weight="bold" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>
          {session?.shop?.name ? `iDine - ${session.shop.name}` : "iDine Lite"}
        </Text>
        {isAdmin && (
          <TouchableOpacity style={s.headerAddBtn} onPress={openAdd} activeOpacity={0.8}>
            <Plus size={20} color="#fff" weight="bold" />
          </TouchableOpacity>
        )}
        {!isAdmin && <View style={{ width: 36 }} />}
      </View>

      {/* ── Stats bar ── */}
      <View style={s.statsBar}>
        <View style={s.statItem}>
          <Text style={s.statNum}>{totalUsers}</Text>
          <Text style={s.statLabel}>Total</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={[s.statNum, { color: Colors.green }]}>{activeCount}</Text>
          <Text style={s.statLabel}>Active</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={[s.statNum, { color: Colors.primary }]}>{adminCount}</Text>
          <Text style={s.statLabel}>Admins</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={[s.statNum, { color: "#B71C1C" }]}>{totalUsers - activeCount}</Text>
          <Text style={s.statLabel}>Inactive</Text>
        </View>
      </View>

      {/* ── Search ── */}
      <View style={s.searchWrap}>
        <MagnifyingGlass size={17} color={Colors.textMuted} />
        <TextInput
          style={s.searchInput}
          placeholder="Search by name or role..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <X size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── List ── */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={s.loadingTxt}>Loading users...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={() => loadUsers(true)}
          renderItem={({ item }) => (
            <UserCard
              item={item}
              isAdmin={isAdmin}
              isSelf={item.id === selfId}
              onEdit={() => openEdit(item)}
              onToggleActive={() => handleToggleActive(item)}
              onDelete={() => handleDelete(item)}
            />
          )}
          ListEmptyComponent={
            <View style={s.center}>
              <Warning size={48} color={Colors.textMuted} weight="duotone" />
              <Text style={s.emptyTitle}>
                {search ? "No results found" : "No users yet"}
              </Text>
              <Text style={s.emptySubtitle}>
                {search ? `No users match "${search}"` : isAdmin ? "Tap + to add the first user" : "No users found"}
              </Text>
            </View>
          }
          ListHeaderComponent={
            !loading && filtered.length > 0 ? (
              <Text style={s.listHeader}>
                {filtered.length} user{filtered.length !== 1 ? "s" : ""}{search ? ` for "${search}"` : ""}
              </Text>
            ) : null
          }
        />
      )}

      {/* ── Add / Edit Modal ── */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setModal(false)} />
          <View style={s.modalSheet}>
            {/* Modal header */}
            <View style={s.modalHeader}>
              <View style={s.modalTitleRow}>
                {editing?.role === "admin"
                  ? <ShieldCheck size={22} color={Colors.primary} weight="duotone" />
                  : <User size={22} color={Colors.green} weight="duotone" />}
                <Text style={s.modalTitle}>{editing ? `Edit  ${editing.username}` : "Add New User"}</Text>
              </View>
              <TouchableOpacity onPress={() => setModal(false)} style={s.modalCloseBtn}>
                <X size={20} color={Colors.text} weight="bold" />
              </TouchableOpacity>
            </View>

            {/* Username */}
            <Text style={s.fieldLabel}>Username</Text>
            <TextInput
              style={[s.fieldInput, editing && s.fieldInputDisabled]}
              value={form.username}
              onChangeText={(v) => setForm({ ...form, username: v })}
              placeholder="e.g. cashier1"
              placeholderTextColor={Colors.textMuted}
              editable={!editing}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {editing && (
              <Text style={s.hintTxt}>Username cannot be changed after creation</Text>
            )}

            {/* Password */}
            <Text style={s.fieldLabel}>
              {editing ? "New Password" : "Password *"}
            </Text>
            <View style={s.pwdRow}>
              <TextInput
                style={[s.fieldInput, { flex: 1, marginBottom: 0 }]}
                value={form.password}
                onChangeText={(v) => setForm({ ...form, password: v })}
                placeholder={editing ? "Leave blank to keep current" : "Min. 4 characters"}
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!showPwd}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPwd((v) => !v)}>
                {showPwd
                  ? <EyeSlash size={20} color={Colors.textMuted} />
                  : <Eye size={20} color={Colors.textMuted} />}
              </TouchableOpacity>
            </View>

            {/* Role */}
            <Text style={s.fieldLabel}>Role</Text>
            <View style={s.roleRow}>
              {(["cashier", "admin"] as const).map((r) => {
                const active = form.role === r;
                const isAdminRole = r === "admin";
                return (
                  <TouchableOpacity
                    key={r}
                    style={[
                      s.roleBtn,
                      active && { backgroundColor: isAdminRole ? Colors.primary : Colors.green, borderColor: isAdminRole ? Colors.primary : Colors.green },
                    ]}
                    onPress={() => setForm({ ...form, role: r })}
                    activeOpacity={0.8}
                  >
                    {isAdminRole
                      ? <ShieldCheck size={18} color={active ? "#fff" : Colors.primary} weight={active ? "fill" : "regular"} />
                      : <User size={18} color={active ? "#fff" : Colors.green} weight={active ? "fill" : "regular"} />}
                    <Text style={[s.roleBtnTxt, active && { color: "#fff" }]}>
                      {r === "admin" ? "Admin" : "Cashier"}
                    </Text>
                    {active && <Check size={14} color="#fff" weight="bold" />}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Role description */}
            <View style={s.roleDesc}>
              <Text style={s.roleDescTxt}>
                {form.role === "admin"
                  ? "Admin: full access — manage users, items, settings & reports."
                  : "Cashier: billing & orders only — no settings or user management."}
              </Text>
            </View>

            {/* Save */}
            <TouchableOpacity
              style={[s.saveBtn, saving && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Check size={18} color="#fff" weight="bold" />}
              <Text style={s.saveBtnTxt}>{editing ? "Save Changes" : "Create User"}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Card styles ──────────────────────────────────────────────────────────────
const c = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: "center", justifyContent: "center",
  },
  info: { flex: 1, marginLeft: 12 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 5 },
  username: { fontSize: 15, fontWeight: "700", color: Colors.text },
  selfBadge: {
    backgroundColor: "#E8EDF7", borderRadius: 20,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  selfBadgeTxt: { fontSize: 10, fontWeight: "700", color: Colors.primary },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  rolePill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  rolePillTxt: { fontSize: 11, fontWeight: "700" },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusTxt: { fontSize: 12, fontWeight: "600" },
  actions: { flexDirection: "row", alignItems: "center", gap: 2 },
  actionBtn: { padding: 8 },
});

// ─── Screen styles ────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#EEF1F7" },

  // Header
  header: {
    backgroundColor: Colors.primary,
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 12, gap: 10,
  },
  headerIcon: { padding: 2 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "700", color: "#fff" },
  headerAddBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center", justifyContent: "center",
  },

  // Stats
  statsBar: {
    flexDirection: "row", backgroundColor: "#fff",
    marginHorizontal: 0, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#E8EDF7",
    elevation: 1,
  },
  statItem: { flex: 1, alignItems: "center" },
  statNum: { fontSize: 20, fontWeight: "800", color: Colors.text },
  statLabel: { fontSize: 11, fontWeight: "500", color: Colors.textMuted, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: "#E8EDF7" },

  // Search
  searchWrap: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#fff", margin: 14, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
    elevation: 1, shadowColor: "#000", shadowOpacity: 0.04,
    shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },

  // List
  listContent: { paddingHorizontal: 14, paddingBottom: 30 },
  listHeader: {
    fontSize: 12, color: Colors.textMuted, fontWeight: "600",
    marginBottom: 10, letterSpacing: 0.3,
  },

  // States
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
  loadingTxt: { color: Colors.textMuted, fontSize: 14, marginTop: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  emptySubtitle: { fontSize: 13, color: Colors.textMuted, textAlign: "center" },

  // Modal
  modalOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 36,
    marginTop: "auto",
  },
  modalHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 24,
  },
  modalTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: Colors.text },
  modalCloseBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "#F0F2F8", alignItems: "center", justifyContent: "center",
  },

  // Fields
  fieldLabel: {
    fontSize: 12, fontWeight: "700", color: Colors.textMuted,
    letterSpacing: 0.5, marginBottom: 6, textTransform: "uppercase",
  },
  fieldInput: {
    borderWidth: 1.5, borderColor: "#D0D7E8", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: Colors.text, marginBottom: 16,
    backgroundColor: "#F5F7FB",
  },
  fieldInputDisabled: {
    backgroundColor: "#EAEDF5", borderColor: "#D0D7E8", color: Colors.textMuted,
  },
  hintTxt: { fontSize: 11, color: Colors.textMuted, marginTop: -12, marginBottom: 16 },
  pwdRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  eyeBtn: {
    width: 44, height: 44, alignItems: "center", justifyContent: "center",
    backgroundColor: "#F5F7FB", borderRadius: 10,
    borderWidth: 1.5, borderColor: "#D0D7E8",
  },

  // Role selector
  roleRow: { flexDirection: "row", gap: 12, marginBottom: 10 },
  roleBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: "#D0D7E8", backgroundColor: "#F5F7FB",
  },
  roleBtnTxt: { fontSize: 14, fontWeight: "700", color: Colors.textSecondary },
  roleDesc: {
    backgroundColor: "#F0F4FF", borderRadius: 8, padding: 10, marginBottom: 20,
  },
  roleDescTxt: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },

  // Save
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: 30,
    paddingVertical: 15, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 8,
  },
  saveBtnTxt: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
