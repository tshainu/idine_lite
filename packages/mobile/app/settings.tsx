import { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  ArrowLeft, WifiHigh, Printer, SignOut, Info,
  ArrowsClockwise, Database, BluetoothConnected,
} from "phosphor-react-native";
import { Colors, Spacing, Radius, Typography } from "../lib/theme";
import { store } from "../lib/store";
import { logoutUser } from "../lib/auth";
import { syncWithServer } from "../lib/sync";

export default function SettingsScreen() {
  const [apiUrl, setApiUrl] = useState("");
  const [btAddr, setBtAddr] = useState("");
  const [wifiIp, setWifiIp] = useState("");
  const [wifiPort, setWifiPort] = useState("9100");
  const [session, setSession] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const [url, bt, ip, port, s, last] = await Promise.all([
        store.getApiUrl(),
        store.getPrinterAddress(),
        store.getWifiPrinterIp(),
        store.getWifiPrinterPort(),
        (async () => {
          const { getSession } = await import("../lib/auth");
          return getSession();
        })(),
        store.getLastSync(),
      ]);
      setApiUrl(url);
      setBtAddr(bt ?? "");
      setWifiIp(ip);
      setWifiPort(port);
      setSession(s);
      setLastSync(last);
    };
    load();
  }, []);

  const saveApiUrl = async () => {
    await store.setApiUrl(apiUrl.trim());
    Alert.alert("Saved", "API URL updated");
  };

  const saveBtPrinter = async () => {
    await store.setPrinterAddress(btAddr.trim());
    Alert.alert("Saved", "Bluetooth printer address saved");
  };

  const saveWifiPrinter = async () => {
    const ip = wifiIp.trim();
    const port = wifiPort.trim() || "9100";
    if (ip && !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
      Alert.alert("Invalid IP", "Enter a valid IP address (e.g. 192.168.1.100)");
      return;
    }
    await Promise.all([store.setWifiPrinterIp(ip), store.setWifiPrinterPort(port)]);
    Alert.alert("Saved", "WiFi printer settings saved");
  };

  const handleSync = async () => {
    setSyncing(true);
    const res = await syncWithServer();
    setSyncing(false);
    const now = new Date().toLocaleString();
    setLastSync(now);
    Alert.alert(res.success ? "Sync Complete" : "Sync Failed", res.error ?? "Data synced successfully");
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout", style: "destructive",
        onPress: async () => { await logoutUser(); router.replace("/login"); }
      }
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft size={22} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.scroll}>

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Shop</Text>
              <Text style={styles.infoValue}>{session?.shop?.name ?? "—"}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Username</Text>
              <Text style={styles.infoValue}>{session?.user?.username ?? "—"}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Role</Text>
              <View style={[styles.badge, {
                backgroundColor: session?.user?.role === "admin"
                  ? Colors.primaryLight : Colors.greenLight,
              }]}>
                <Text style={[styles.badgeText, {
                  color: session?.user?.role === "admin" ? Colors.primary : Colors.green,
                }]}>
                  {session?.user?.role?.toUpperCase() ?? "—"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Sync */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sync</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Database size={18} color={Colors.textSecondary} />
              <Text style={styles.cardLabel}>Last Sync</Text>
              <Text style={styles.infoValue}>{lastSync ?? "Never"}</Text>
            </View>
            <TouchableOpacity style={styles.syncBtn} onPress={handleSync} disabled={syncing}>
              <ArrowsClockwise size={18} color={Colors.white} />
              <Text style={styles.syncBtnText}>{syncing ? "Syncing..." : "Sync Now"}</Text>
            </TouchableOpacity>
          </View>
        </View>



        {/* Bluetooth Printer */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bluetooth Printer</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <BluetoothConnected size={18} color="#1565C0" />
              <Text style={styles.cardLabel}>MAC Address</Text>
            </View>
            <Text style={styles.helperText}>Format: 00:11:22:33:44:55</Text>
            <TextInput
              style={styles.input}
              value={btAddr}
              onChangeText={setBtAddr}
              placeholder="e.g. 00:11:22:33:44:55"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: "#BBDEFB" }]} onPress={saveBtPrinter}>
              <Text style={[styles.saveBtnText, { color: "#1565C0" }]}>Save Bluetooth Printer</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* WiFi Printer */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WiFi / Network Printer</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Printer size={18} color="#00695C" />
              <Text style={styles.cardLabel}>IP Address</Text>
            </View>
            <Text style={styles.helperText}>e.g. 192.168.1.100</Text>
            <TextInput
              style={styles.input}
              value={wifiIp}
              onChangeText={setWifiIp}
              placeholder="192.168.1.100"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numeric"
            />
            <Text style={[styles.cardLabel, { marginTop: 10 }]}>Port</Text>
            <Text style={styles.helperText}>Default: 9100</Text>
            <TextInput
              style={styles.input}
              value={wifiPort}
              onChangeText={setWifiPort}
              placeholder="9100"
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
            />
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: "#B2DFDB" }]} onPress={saveWifiPrinter}>
              <Text style={[styles.saveBtnText, { color: "#00695C" }]}>Save WiFi Printer</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* App Info */}
        <View style={styles.section}>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Info size={18} color={Colors.textSecondary} />
              <Text style={styles.cardLabel}>iDine Lite</Text>
              <Text style={styles.infoValue}>v1.0.0</Text>
            </View>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <SignOut size={18} color={Colors.red} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  scroll: { flex: 1 },
  section: { marginTop: Spacing.lg, paddingHorizontal: Spacing.lg },
  sectionTitle: {
    ...Typography.label, color: Colors.textSecondary,
    marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5,
  },
  infoCard: {
    backgroundColor: Colors.white, borderRadius: Radius.md, overflow: "hidden",
    elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4,
  },
  card: {
    backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.lg,
    elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, gap: 12,
  },
  infoRow: { flexDirection: "row", alignItems: "center", padding: Spacing.md, gap: 10 },
  infoLabel: { flex: 1, ...Typography.body, color: Colors.textSecondary },
  infoValue: { ...Typography.body, color: Colors.text, fontWeight: "600" },
  cardLabel: { flex: 1, ...Typography.body, color: Colors.text },
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: Spacing.md },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.full },
  badgeText: { fontSize: 11, fontWeight: "700" },
  helperText: { fontSize: 11, color: Colors.textMuted, marginTop: -8, marginLeft: 2 },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 13,
    color: Colors.text, backgroundColor: Colors.surface,
  },
  saveBtn: {
    backgroundColor: Colors.primaryLight, borderRadius: Radius.md,
    paddingVertical: 10, alignItems: "center",
  },
  saveBtnText: { color: Colors.primary, fontWeight: "700", fontSize: 13 },
  syncBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 12, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 8,
  },
  syncBtnText: { color: Colors.white, fontWeight: "600", fontSize: 14 },
  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    marginHorizontal: Spacing.lg, marginTop: Spacing.lg,
    backgroundColor: Colors.redLight, borderRadius: Radius.md,
    paddingVertical: 14, gap: 8, elevation: 1,
  },
  logoutText: { ...Typography.button, color: Colors.red },
});
