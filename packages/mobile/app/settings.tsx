import { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, FlatList, ActivityIndicator, Modal,
  PermissionsAndroid, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  ArrowLeft, Printer, SignOut, Info,
  ArrowsClockwise, Database, BluetoothConnected, MagnifyingGlass, CookingPot, LockKey,
  Export, Import, ShoppingBag, ChartBar,
} from "phosphor-react-native";
import RNBluetoothClassic from "react-native-bluetooth-classic";
import { printWifi, printBluetooth, buildTestEsc, buildKotEsc, type PaperSize } from "../lib/printer";
import { Colors, Spacing, Radius, Typography } from "../lib/theme";
import { store } from "../lib/store";
import { logoutUser } from "../lib/auth";
import { exportItems, importItems, exportSales } from "../lib/importExport";
import { syncWithServer } from "../lib/sync";

// ── BT device type ──────────────────────────────────────────────
interface BTDevice { id: string; name: string }

// ── BT: guard against Expo Go (native module = null) ───────────
function getBTModule() {
  if (!RNBluetoothClassic || typeof RNBluetoothClassic.getBondedDevices !== "function") {
    throw new Error("Bluetooth is not available in Expo Go.\nBuild an APK to use this feature.");
  }
  return RNBluetoothClassic;
}

// ── BT scan: bonded (paired) devices ───────────────────────────
async function scanBluetoothDevices(): Promise<BTDevice[]> {
  // Android 12+ requires runtime permissions before any BT call
  if (Platform.OS === "android") {
    const perms = [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ];
    const granted = await PermissionsAndroid.requestMultiple(perms);
    const allGranted = Object.values(granted).every(
      (r) => r === PermissionsAndroid.RESULTS.GRANTED
    );
    if (!allGranted) {
      throw new Error("Bluetooth permissions denied. Please allow Bluetooth and Location permissions in App Settings.");
    }
  }

  const bt = getBTModule();
  try {
    const enabled = await bt.isBluetoothEnabled();
    if (!enabled) {
      await bt.requestBluetoothEnabled();
    }
  } catch {
    // Some devices throw if BT already enabled — safe to ignore
  }
  const bonded: any[] = await bt.getBondedDevices();
  return bonded.map((d: any) => ({ id: d.address ?? d.id, name: d.name ?? d.address }));
}

async function sendTestPageBluetooth(addr: string, paper: PaperSize): Promise<void> {
  const esc = buildTestEsc(paper);
  await printBluetooth(addr, esc);
}

async function sendTestPageWifi(ip: string, port: string, paper: PaperSize): Promise<void> {
  const esc = buildTestEsc(paper);
  await printWifi(ip, parseInt(port) || 9100, esc);
}

// ────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const [apiUrl, setApiUrl] = useState("");
  const [btAddr, setBtAddr] = useState("");
  const [wifiIp, setWifiIp] = useState("");
  const [wifiPort, setWifiPort] = useState("9100");
  const [printerType, setPrinterType] = useState<"bluetooth" | "wifi">("bluetooth");
  const [paperSize, setPaperSize] = useState<PaperSize>("58");
  const [receiptFooter, setReceiptFooter] = useState("Thank you! Come again");
  const [session, setSession] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  // KOT printer
  const [kotPrinterEnabled, setKotPrinterEnabled] = useState(false);
  const [kotPrinterIp, setKotPrinterIp] = useState("");
  const [kotPrinterPort, setKotPrinterPort] = useState("9100");
  const [testingKot, setTestingKot] = useState(false);

  // Change password
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  // BT scan state
  const [scanVisible, setScanVisible] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [btDevices, setBtDevices] = useState<BTDevice[]>([]);

  // Test page loading
  const [testingBt, setTestingBt] = useState(false);
  const [testingWifi, setTestingWifi] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [url, bt, ip, port, ptype, paper, footer, s, last, kotEnabled, kotIp, kotPort] = await Promise.all([
        store.getApiUrl(),
        store.getPrinterAddress(),
        store.getWifiPrinterIp(),
        store.getWifiPrinterPort(),
        store.getPrinterType(),
        store.getPaperSize(),
        store.getReceiptFooter(),
        (async () => {
          const { getSession } = await import("../lib/auth");
          return getSession();
        })(),
        store.getLastSync(),
        store.getKotPrinterEnabled(),
        store.getKotPrinterIp(),
        store.getKotPrinterPort(),
      ]);
      setApiUrl(url);
      setBtAddr(bt ?? "");
      setWifiIp(ip);
      setWifiPort(port);
      setPrinterType(ptype);
      setPaperSize(paper);
      setReceiptFooter(footer);
      setSession(s);
      setLastSync(last);
      setKotPrinterEnabled(kotEnabled);
      setKotPrinterIp(kotIp);
      setKotPrinterPort(kotPort);
    };
    load();
  }, []);

  const selectPrinterType = async (type: "bluetooth" | "wifi") => {
    setPrinterType(type);
    await store.setPrinterType(type);
  };

  const selectPaperSize = async (size: PaperSize) => {
    setPaperSize(size);
    await store.setPaperSize(size);
  };

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
      await sendTestPageBluetooth(addr, paperSize);
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
      await sendTestPageWifi(ip, port, paperSize);
      Alert.alert("Test Page Sent", "Check your printer.");
    } catch (e: any) {
      Alert.alert("Print Failed", e?.message ?? "Could not reach printer.");
    } finally {
      setTestingWifi(false);
    }
  };

  // ── KOT Printer ────────────────────────────────────────────────
  const toggleKotPrinter = async (val: boolean) => {
    setKotPrinterEnabled(val);
    await store.setKotPrinterEnabled(val);
  };

  const saveKotPrinter = async () => {
    const ip = kotPrinterIp.trim();
    const port = kotPrinterPort.trim() || "9100";
    if (ip && !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
      Alert.alert("Invalid IP", "Enter a valid IP address (e.g. 192.168.1.200)");
      return;
    }
    await Promise.all([store.setKotPrinterIp(ip), store.setKotPrinterPort(port)]);
    Alert.alert("Saved", "KOT printer settings saved");
  };

  const testKotPrinter = async () => {
    const ip = kotPrinterIp.trim();
    const port = kotPrinterPort.trim() || "9100";
    if (!ip) { Alert.alert("No KOT Printer", "Set the KOT printer IP first."); return; }
    setTestingKot(true);
    try {
      const kotEsc = buildKotEsc(paperSize, {
        shopName: "iDine Lite",
        orderNo: "001",
        cashier: "Admin",
        dateTime: new Date().toLocaleString("en-LK"),
        items: [
          { name: "Test Item", portionName: "Full", qty: 2 },
          { name: "Another Item", qty: 1 },
        ],
      });
      await printWifi(ip, parseInt(port) || 9100, kotEsc);
      Alert.alert("Test KOT Sent", "Check your kitchen printer.");
    } catch (e: any) {
      Alert.alert("KOT Print Failed", e?.message ?? "Could not reach KOT printer.");
    } finally {
      setTestingKot(false);
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

  const handleChangePassword = async () => {
    if (!currentPw || !newPw || !confirmPw) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    if (newPw !== confirmPw) {
      Alert.alert("Error", "New passwords do not match");
      return;
    }
    if (newPw.length < 6) {
      Alert.alert("Error", "New password must be at least 6 characters");
      return;
    }
    setChangingPw(true);
    try {
      const { getSession } = await import("../lib/auth");
      const s = await getSession();
      const apiUrl = await store.getApiUrl();
      const res = await fetch(`${apiUrl}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${s?.token}`,
        },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to change password");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      Alert.alert("Success", "Password changed successfully");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Something went wrong");
    } finally {
      setChangingPw(false);
    }
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

  // ── Import / Export ────────────────────────────────────────────
  const [ieLoading, setIeLoading] = useState<string | null>(null);

  const handleExportItems = async () => {
    try {
      setIeLoading("export_items");
      await exportItems();
    } catch (e: any) {
      Alert.alert("Export Failed", e?.message ?? "Could not export items.");
    } finally { setIeLoading(null); }
  };

  const handleImportItems = async () => {
    try {
      setIeLoading("import_items");
      const shopId = Number(session?.shop?.id ?? 1);
      const { inserted, skipped, errors } = await importItems(shopId);
      let msg = `Imported: ${inserted}  |  Skipped: ${skipped}`;
      if (errors.length) msg += `\n\nWarnings:\n${errors.slice(0, 5).join("\n")}`;
      Alert.alert("Import Complete", msg);
    } catch (e: any) {
      if (e?.message !== "Cancelled") Alert.alert("Import Failed", e?.message ?? "Could not import items.");
    } finally { setIeLoading(null); }
  };

  const handleExportSales = async () => {
    try {
      setIeLoading("export_sales");
      await exportSales();
    } catch (e: any) {
      Alert.alert("Export Failed", e?.message ?? "Could not export sales.");
    } finally { setIeLoading(null); }
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
        <View style={styles.profileCard}>
          {/* Avatar */}
          <View style={styles.avatarWrap}>
            <Text style={styles.avatarText}>
              {session?.user?.username
                ? session.user.username.slice(0, 2).toUpperCase()
                : "??"}
            </Text>
          </View>

          {/* Name + role badge */}
          <View style={styles.profileCenter}>
            <Text style={styles.profileName}>{session?.user?.username ?? "—"}</Text>
            <View style={[styles.roleBadge, {
              backgroundColor: session?.user?.role === "admin" ? Colors.primaryLight : Colors.greenLight,
            }]}>
              <Text style={[styles.roleText, {
                color: session?.user?.role === "admin" ? Colors.primary : Colors.green,
              }]}>
                {session?.user?.role?.toUpperCase() ?? "—"}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.profileDivider} />

          {/* Detail rows */}
          <View style={styles.profileRows}>
            <View style={styles.profileRow}>
              <Text style={styles.profileRowLabel}>Shop</Text>
              <Text style={styles.profileRowValue}>{session?.shop?.name ?? "—"}</Text>
            </View>
            {!!session?.shop?.id && (
              <View style={styles.profileRow}>
                <Text style={styles.profileRowLabel}>Shop ID</Text>
                <Text style={styles.profileRowValue}>{session.shop.id}</Text>
              </View>
            )}
            {!!session?.shop?.code && (
              <View style={styles.profileRow}>
                <Text style={styles.profileRowLabel}>Shop Code</Text>
                <Text style={styles.profileRowValue}>{session.shop.code}</Text>
              </View>
            )}
            {!!session?.shop?.address && (
              <View style={styles.profileRow}>
                <Text style={styles.profileRowLabel}>Address</Text>
                <Text style={[styles.profileRowValue, { flex: 2 }]}>{session.shop.address}</Text>
              </View>
            )}
            {!!session?.shop?.phone && (
              <View style={styles.profileRow}>
                <Text style={styles.profileRowLabel}>Phone</Text>
                <Text style={styles.profileRowValue}>{session.shop.phone}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Printer Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Printer</Text>

          {/* Type selector */}
          <View style={styles.printerToggle}>
            <TouchableOpacity
              style={[styles.printerToggleBtn, printerType === "bluetooth" && styles.printerToggleBtnActive]}
              onPress={() => selectPrinterType("bluetooth")}
            >
              <BluetoothConnected size={18} color={printerType === "bluetooth" ? Colors.white : "#1565C0"} />
              <Text style={[styles.printerToggleBtnText, printerType === "bluetooth" && styles.printerToggleBtnTextActive]}>
                Bluetooth
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.printerToggleBtn, printerType === "wifi" && styles.printerToggleBtnActiveWifi]}
              onPress={() => selectPrinterType("wifi")}
            >
              <Printer size={18} color={printerType === "wifi" ? Colors.white : "#00695C"} />
              <Text style={[styles.printerToggleBtnText, printerType === "wifi" && styles.printerToggleBtnTextActive]}>
                WiFi / Network
              </Text>
            </TouchableOpacity>
          </View>

          {/* Paper size selector */}
          <View style={{ flexDirection: "row", marginTop: 10, gap: 8 }}>
            <TouchableOpacity
              style={[styles.printerToggleBtn, { flex: 1 }, paperSize === "58" && styles.printerToggleBtnActive]}
              onPress={() => selectPaperSize("58")}
            >
              <Text style={[styles.printerToggleBtnText, paperSize === "58" && styles.printerToggleBtnTextActive]}>58mm</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.printerToggleBtn, { flex: 1 }, paperSize === "80" && styles.printerToggleBtnActiveWifi]}
              onPress={() => selectPaperSize("80")}
            >
              <Text style={[styles.printerToggleBtnText, paperSize === "80" && styles.printerToggleBtnTextActive]}>80mm</Text>
            </TouchableOpacity>
          </View>

          {/* Receipt footer message */}
          <View style={{ marginTop: 14 }}>
            <Text style={[styles.cardLabel, { marginBottom: 6 }]}>Receipt Footer Message</Text>
            <TextInput
              style={[styles.input, { marginBottom: 0 }]}
              value={receiptFooter}
              onChangeText={setReceiptFooter}
              onBlur={() => store.setReceiptFooter(receiptFooter.trim() || "Thank you! Come again")}
              placeholder="Thank you! Come again"
              placeholderTextColor="#AAA"
              maxLength={80}
            />
          </View>

          {/* Bluetooth config */}
          {printerType === "bluetooth" && (
            <View style={[styles.card, { marginTop: 12 }]}>
              <View style={styles.infoRow}>
                <BluetoothConnected size={18} color="#1565C0" />
                <Text style={styles.cardLabel}>Printer Address</Text>
              </View>
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
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: "#BBDEFB", flex: 1 }]} onPress={saveBtPrinter}>
                  <Text style={[styles.saveBtnText, { color: "#1565C0" }]}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.testBtn, { flex: 1 }]} onPress={testBtPrinter} disabled={testingBt}>
                  {testingBt
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <><Printer size={15} color="#fff" /><Text style={styles.testBtnText}>Test Page</Text></>
                  }
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* WiFi config */}
          {printerType === "wifi" && (
            <View style={[styles.card, { marginTop: 12 }]}>
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
              <Text style={[styles.cardLabel, { marginTop: 6 }]}>Port</Text>
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
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: "#B2DFDB", flex: 1 }]} onPress={saveWifiPrinter}>
                  <Text style={[styles.saveBtnText, { color: "#00695C" }]}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.testBtn, { flex: 1, backgroundColor: "#00695C" }]} onPress={testWifiPrinter} disabled={testingWifi}>
                  {testingWifi
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <><Printer size={15} color="#fff" /><Text style={styles.testBtnText}>Test Page</Text></>
                  }
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* KOT Printer Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>KOT Printer (Kitchen)</Text>
          <View style={styles.card}>
            {/* Toggle row */}
            <TouchableOpacity
              style={styles.kotToggleRow}
              onPress={() => toggleKotPrinter(!kotPrinterEnabled)}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.text }}>Separate KOT Printer</Text>
                <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>
                  Print KOT to a different WiFi printer (kitchen / counter)
                </Text>
              </View>
              <View style={[styles.kotCheckbox, kotPrinterEnabled && styles.kotCheckboxActive]}>
                {kotPrinterEnabled && <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>✓</Text>}
              </View>
            </TouchableOpacity>

            {/* KOT WiFi IP/Port fields — shown only when enabled */}
            {kotPrinterEnabled && (
              <View style={{ marginTop: 6, gap: 10 }}>
                <View style={styles.kotDivider} />
                <View style={styles.infoRow}>
                  <CookingPot size={18} color="#E65100" />
                  <Text style={[styles.cardLabel, { color: "#E65100" }]}>KOT Printer IP</Text>
                </View>
                <Text style={styles.helperText}>e.g. 192.168.1.200</Text>
                <TextInput
                  style={styles.input}
                  value={kotPrinterIp}
                  onChangeText={setKotPrinterIp}
                  placeholder="192.168.1.200"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="numeric"
                />
                <Text style={[styles.cardLabel, { marginTop: 2 }]}>Port</Text>
                <Text style={styles.helperText}>Default: 9100</Text>
                <TextInput
                  style={styles.input}
                  value={kotPrinterPort}
                  onChangeText={setKotPrinterPort}
                  placeholder="9100"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="number-pad"
                />
                <View style={styles.btnRow}>
                  <TouchableOpacity style={[styles.saveBtn, { backgroundColor: "#FFE0B2", flex: 1 }]} onPress={saveKotPrinter}>
                    <Text style={[styles.saveBtnText, { color: "#E65100" }]}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.testBtn, { flex: 1, backgroundColor: "#E65100" }]}
                    onPress={testKotPrinter}
                    disabled={testingKot}
                  >
                    {testingKot
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <><CookingPot size={15} color="#fff" /><Text style={styles.testBtnText}>Test KOT</Text></>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Change Password */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Change Password</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <LockKey size={18} color={Colors.primary} />
              <Text style={styles.cardLabel}>Update your password</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Current password"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
              value={currentPw}
              onChangeText={setCurrentPw}
            />
            <TextInput
              style={styles.input}
              placeholder="New password"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
              value={newPw}
              onChangeText={setNewPw}
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm new password"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
              value={confirmPw}
              onChangeText={setConfirmPw}
            />
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: Colors.primary, alignItems: "center" }]}
              onPress={handleChangePassword}
              disabled={changingPw}
            >
              {changingPw
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={[styles.saveBtnText, { color: "#fff" }]}>Change Password</Text>
              }
            </TouchableOpacity>
          </View>
        </View>

        {/* Data / Backup */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data &amp; Backup</Text>
          <View style={styles.card}>
            {/* Items row */}
            <View style={styles.infoRow}>
              <ShoppingBag size={18} color={Colors.textSecondary} />
              <Text style={[styles.cardLabel, { flex: 1 }]}>Items</Text>
              <TouchableOpacity
                style={styles.ieBtn}
                onPress={handleImportItems}
                disabled={ieLoading}
              >
                <Import size={15} color={Colors.primary} />
                <Text style={styles.ieBtnText}>Import</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ieBtn, { marginLeft: 8 }]}
                onPress={handleExportItems}
                disabled={ieLoading}
              >
                <Export size={15} color={Colors.primary} />
                <Text style={styles.ieBtnText}>Export</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.ieDivider} />
            {/* Sales row */}
            <View style={styles.infoRow}>
              <ChartBar size={18} color={Colors.textSecondary} />
              <Text style={[styles.cardLabel, { flex: 1 }]}>Sales</Text>
              <TouchableOpacity
                style={styles.ieBtn}
                onPress={handleExportSales}
                disabled={ieLoading}
              >
                <Export size={15} color={Colors.primary} />
                <Text style={styles.ieBtnText}>Export CSV</Text>
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

  // printer type toggle
  printerToggle: {
    flexDirection: "row", borderRadius: Radius.md, overflow: "hidden",
    borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  printerToggleBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 12, backgroundColor: Colors.white,
  },
  printerToggleBtnActive: {
    backgroundColor: "#1565C0",
  },
  printerToggleBtnActiveWifi: {
    backgroundColor: "#00695C",
  },
  printerToggleBtnText: {
    fontSize: 13, fontWeight: "700", color: Colors.textSecondary,
  },
  printerToggleBtnTextActive: {
    color: Colors.white,
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

  ieDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 4 },
  ieBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderWidth: 1, borderColor: Colors.primary, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  ieBtnText: { ...Typography.caption, color: Colors.primary, fontWeight: "600" },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 4 },

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

  // ── KOT printer toggle ──
  kotToggleRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
  },
  kotCheckbox: {
    width: 28, height: 28, borderRadius: 6,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#F5F5F5",
  },
  kotCheckboxActive: {
    backgroundColor: "#E65100", borderColor: "#E65100",
  },
  kotDivider: {
    height: 1, backgroundColor: Colors.border, marginVertical: 4,
  },

  // ── Profile card ──
  profileCard: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.lg,
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    padding: Spacing.lg, alignItems: "center",
    elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 6,
  },
  avatarWrap: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 10,
  },
  avatarText: { fontSize: 26, fontWeight: "800", color: Colors.white },
  profileCenter: { alignItems: "center", gap: 6 },
  profileName: { fontSize: 18, fontWeight: "700", color: Colors.white },
  roleBadge: {
    paddingHorizontal: 12, paddingVertical: 3, borderRadius: Radius.full,
  },
  roleText: { fontSize: 11, fontWeight: "700" },
  profileDivider: {
    width: "100%", height: 1,
    backgroundColor: "rgba(255,255,255,0.2)", marginVertical: 14,
  },
  profileRows: { width: "100%", gap: 8 },
  profileRow: { flexDirection: "row", alignItems: "center" },
  profileRowLabel: {
    flex: 1, fontSize: 12, color: "rgba(255,255,255,0.65)", fontWeight: "500",
  },
  profileRowValue: {
    flex: 2, fontSize: 13, color: Colors.white, fontWeight: "600", textAlign: "right",
  },
});
