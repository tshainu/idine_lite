import { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, FlatList, ActivityIndicator, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  ArrowLeft, WifiHigh, Printer, SignOut, Info,
  ArrowsClockwise, Database, BluetoothConnected, MagnifyingGlass,
} from "phosphor-react-native";
import { Colors, Spacing, Radius, Typography } from "../lib/theme";
import { store } from "../lib/store";
import { logoutUser } from "../lib/auth";
import { syncWithServer } from "../lib/sync";

// ── BT device type ──────────────────────────────────────────────
interface BTDevice { id: string; name: string }

// ── Minimal BT scan using expo-modules (graceful fallback) ──────
async function scanBluetoothDevices(): Promise<BTDevice[]> {
  try {
    // Try react-native-bluetooth-classic if available
    // @ts-ignore
    const RNBluetoothClassic = (await import("react-native-bluetooth-classic")).default;
    const bonded: any[] = await RNBluetoothClassic.getBondedDevices();
    return bonded.map((d: any) => ({ id: d.address ?? d.id, name: d.name ?? d.address }));
  } catch {
    // Library not installed — return demo list so UI works
    return [
      { id: "SCAN_NOT_AVAILABLE", name: "BT library not installed" },
    ];
  }
}

async function sendTestPageBluetooth(addr: string): Promise<void> {
  try {
    // @ts-ignore
    const RNBluetoothClassic = (await import("react-native-bluetooth-classic")).default;
    const connected = await RNBluetoothClassic.connectToDevice(addr);
    const testEsc =
      "\x1B\x40" +           // Init
      "\x1B\x61\x01" +       // Center
      "\x1B\x21\x10" +       // Double height
      "iDine Lite\n" +
      "\x1B\x21\x00" +       // Normal
      "--- TEST PAGE ---\n" +
      new Date().toLocaleString() + "\n\n\n" +
      "\x1D\x56\x00";        // Cut
    await connected.write(testEsc);
    await connected.disconnect();
  } catch (e: any) {
    throw new Error(e?.message ?? "Bluetooth print failed");
  }
}

async function sendTestPageWifi(ip: string, port: string): Promise<void> {
  // Uses fetch via TCP proxy — works where net module is unavailable
  // Falls back to a graceful alert if not available
  try {
    const testEsc =
      "\x1B\x40" +
      "\x1B\x61\x01" +
      "\x1B\x21\x10" +
      "iDine Lite\n" +
      "\x1B\x21\x00" +
      "--- TEST PAGE ---\n" +
      new Date().toLocaleString() + "\n\n\n" +
      "\x1D\x56\x00";

    const res = await fetch(`http://${ip}:${port}`, {
      method: "POST",
      body: testEsc,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e: any) {
    throw new Error(e?.message ?? "WiFi print failed");
  }
}

// ────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const [apiUrl, setApiUrl] = useState("");
  const [btAddr, setBtAddr] = useState("");
  const [wifiIp, setWifiIp] = useState("");
  const [wifiPort, setWifiPort] = useState("9100");
  const [session, setSession] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  // BT scan state
  const [scanVisible, setScanVisible] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [btDevices, setBtDevices] = useState<BTDevice[]>([]);

  // Test page loading
  const [testingBt, setTestingBt] = useState(false);
  const [testingWifi, setTestingWifi] = useState(false);

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

  // ── BT scan ────────────────────────────────────────────────────
  const openBtScan = useCallback(async () => {
    setScanVisible(true);
    setScanning(true);
    setBtDevices([]);
    try {
      const devices = await scanBluetoothDevices();
      setBtDevices(devices);
    } catch (e: any) {
      Alert.alert("Scan Error", e?.message ?? "Could not scan for devices");
    } finally {
      setScanning(false);
    }
  }, []);

  const selectDevice = useCallback(async (device: BTDevice) => {
    if (device.id === "SCAN_NOT_AVAILABLE") {
      setScanVisible(false);
      Alert.alert(
        "Library Missing",
        "Install react-native-bluetooth-classic to enable BT scanning.",
      );
      return;
    }
    setBtAddr(device.id);
    await store.setPrinterAddress(device.id);
    setScanVisible(false);
    Alert.alert("Saved", `Bluetooth printer set to:\n${device.name}\n${device.id}`);
  }, []);

  // ── Save handlers ──────────────────────────────────────────────
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

  // ── Test page ──────────────────────────────────────────────────
  const testBtPrinter = async () => {
    const addr = btAddr.trim();
    if (!addr) { Alert.alert("No Printer", "Set a Bluetooth printer address first."); return; }
    setTestingBt(true);
    try {
      await sendTestPageBluetooth(addr);
      Alert.alert("Test Page Sent", "Check your printer.");
    } catch (e: any) {
      Alert.alert("Print Failed", e?.message ?? "Could not reach printer.");
    } finally {
      setTestingBt(false);
    }
  };

  const testWifiPrinter = async () => {
    const ip = wifiIp.trim();
    const port = wifiPort.trim() || "9100";
    if (!ip) { Alert.alert("No Printer", "Set a WiFi printer IP first."); return; }
    setTestingWifi(true);
    try {
      await sendTestPageWifi(ip, port);
      Alert.alert("Test Page Sent", "Check your printer.");
    } catch (e: any) {
      Alert.alert("Print Failed", e?.message ?? "Could not reach printer.");
    } finally {
      setTestingWifi(false);
    }
  };

  // ── Sync ───────────────────────────────────────────────────────
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

  // ── Render ─────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft size={22} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      {/* ── BT Device Picker Modal ── */}
      <Modal visible={scanVisible} transparent animationType="slide" onRequestClose={() => setScanVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Nearby Bluetooth Printers</Text>
            {scanning ? (
              <View style={styles.scanningRow}>
                <ActivityIndicator color={Colors.primary} />
                <Text style={styles.scanningText}>Scanning…</Text>
              </View>
            ) : btDevices.length === 0 ? (
              <Text style={styles.noDevices}>No devices found</Text>
            ) : (
              <FlatList
                data={btDevices}
                keyExtractor={(d) => d.id}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.deviceRow} onPress={() => selectDevice(item)}>
                    <BluetoothConnected size={18} color="#1565C0" />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.deviceName}>{item.name}</Text>
                      <Text style={styles.deviceAddr}>{item.id}</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
            {!scanning && (
              <TouchableOpacity style={styles.rescanBtn} onPress={openBtScan}>
                <MagnifyingGlass size={16} color={Colors.primary} />
                <Text style={styles.rescanText}>Scan Again</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setScanVisible(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 120 }}>

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

        {/* Bluetooth Printer */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bluetooth Printer</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <BluetoothConnected size={18} color="#1565C0" />
              <Text style={styles.cardLabel}>Printer Address</Text>
            </View>

            {/* Scan button */}
            <TouchableOpacity style={styles.scanBtn} onPress={openBtScan}>
              <MagnifyingGlass size={16} color="#1565C0" />
              <Text style={styles.scanBtnText}>Scan for Printers</Text>
            </TouchableOpacity>

            <Text style={styles.helperText}>Or enter MAC address manually:</Text>
            <Text style={[styles.helperText, { marginTop: 2 }]}>Format: 00:11:22:33:44:55</Text>
            <TextInput
              style={styles.input}
              value={btAddr}
              onChangeText={setBtAddr}
              placeholder="e.g. 00:11:22:33:44:55"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: "#BBDEFB", flex: 1 }]}
                onPress={saveBtPrinter}
              >
                <Text style={[styles.saveBtnText, { color: "#1565C0" }]}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.testBtn, { flex: 1 }]}
                onPress={testBtPrinter}
                disabled={testingBt}
              >
                {testingBt
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <><Printer size={15} color="#fff" /><Text style={styles.testBtnText}>Test Page</Text></>
                }
              </TouchableOpacity>
            </View>
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

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: "#B2DFDB", flex: 1 }]}
                onPress={saveWifiPrinter}
              >
                <Text style={[styles.saveBtnText, { color: "#00695C" }]}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.testBtn, { flex: 1, backgroundColor: "#00695C" }]}
                onPress={testWifiPrinter}
                disabled={testingWifi}
              >
                {testingWifi
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <><Printer size={15} color="#fff" /><Text style={styles.testBtnText}>Test Page</Text></>
                }
              </TouchableOpacity>
            </View>
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

      </ScrollView>

      {/* ── Fixed Sync Bar at Bottom ── */}
      <View style={styles.syncBar}>
        <View style={styles.syncLastRow}>
          <Database size={15} color={Colors.textSecondary} />
          <Text style={styles.syncLastText}>
            Last sync: {lastSync ?? "Never"}
          </Text>
        </View>
        <TouchableOpacity style={styles.syncBtn} onPress={handleSync} disabled={syncing}>
          <ArrowsClockwise size={18} color={Colors.white} />
          <Text style={styles.syncBtnText}>{syncing ? "Syncing…" : "Sync Now"}</Text>
        </TouchableOpacity>
      </View>
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
    shadowOpacity: 0.08, shadowRadius: 4, gap: 10,
  },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoLabel: { flex: 1, ...Typography.body, color: Colors.textSecondary },
  infoValue: { ...Typography.body, color: Colors.text, fontWeight: "600" },
  cardLabel: { flex: 1, ...Typography.body, color: Colors.text },
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: Spacing.md },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.full },
  badgeText: { fontSize: 11, fontWeight: "700" },
  helperText: { fontSize: 11, color: Colors.textMuted, marginLeft: 2 },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 13,
    color: Colors.text, backgroundColor: Colors.surface,
  },

  // scan
  scanBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderWidth: 1.5, borderColor: "#1565C0", borderRadius: Radius.md,
    paddingVertical: 10, backgroundColor: "#E3F2FD",
  },
  scanBtnText: { color: "#1565C0", fontWeight: "700", fontSize: 13 },

  // save + test row
  btnRow: { flexDirection: "row", gap: 10 },
  saveBtn: {
    backgroundColor: Colors.primaryLight, borderRadius: Radius.md,
    paddingVertical: 10, alignItems: "center",
  },
  saveBtnText: { color: Colors.primary, fontWeight: "700", fontSize: 13 },
  testBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 10, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 6,
  },
  testBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  // logout
  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    marginHorizontal: Spacing.lg, marginTop: Spacing.lg,
    backgroundColor: Colors.redLight, borderRadius: Radius.md,
    paddingVertical: 14, gap: 8, elevation: 1,
    marginBottom: Spacing.lg,
  },
  logoutText: { ...Typography.button, color: Colors.red },

  // ── Sync bar (fixed bottom) ──
  syncBar: {
    backgroundColor: Colors.white,
    borderTopWidth: 1, borderTopColor: Colors.border,
    paddingHorizontal: Spacing.lg, paddingVertical: 10,
    flexDirection: "row", alignItems: "center", gap: 12,
    elevation: 8,
  },
  syncLastRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  syncLastText: { fontSize: 12, color: Colors.textSecondary },
  syncBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 10, paddingHorizontal: 16,
    flexDirection: "row", alignItems: "center", gap: 8,
  },
  syncBtnText: { color: Colors.white, fontWeight: "600", fontSize: 14 },

  // BT device modal
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: Spacing.lg, maxHeight: "70%",
  },
  modalTitle: {
    fontSize: 16, fontWeight: "700", color: Colors.text,
    marginBottom: 16, textAlign: "center",
  },
  scanningRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 20, justifyContent: "center" },
  scanningText: { color: Colors.textSecondary, fontSize: 14 },
  noDevices: { textAlign: "center", color: Colors.textMuted, padding: 24 },
  separator: { height: 1, backgroundColor: Colors.border },
  deviceRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 4,
  },
  deviceName: { fontSize: 14, fontWeight: "600", color: Colors.text },
  deviceAddr: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  rescanBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, marginTop: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.md,
  },
  rescanText: { color: Colors.primary, fontWeight: "600", fontSize: 13 },
  cancelBtn: {
    marginTop: 10, paddingVertical: 12, alignItems: "center",
    backgroundColor: Colors.surface, borderRadius: Radius.md,
  },
  cancelText: { color: Colors.textSecondary, fontWeight: "600", fontSize: 14 },
});
