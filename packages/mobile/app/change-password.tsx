import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { LockKey, Eye, EyeSlash } from "phosphor-react-native";
import { Colors, Spacing, Radius, Typography } from "../lib/theme";
import { store } from "../lib/store";
import { getSession } from "../lib/auth";

export default function ChangePasswordScreen() {
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = async () => {
    if (!newPw || !confirmPw) {
      Alert.alert("Error", "Please fill in both fields");
      return;
    }
    if (newPw !== confirmPw) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }
    if (newPw.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const session = await getSession();
      const apiUrl = await store.getApiUrl();
      const res = await fetch(`${apiUrl}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.token}`,
        },
        body: JSON.stringify({ currentPassword: "__skip__", newPassword: newPw, forceChange: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to change password");
      Alert.alert("Password Set!", "Your password has been updated. Welcome!", [
        { text: "Continue", onPress: () => router.replace("/dashboard") }
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.root} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          <View style={s.iconWrap}>
            <LockKey size={56} color={Colors.primary} weight="duotone" />
          </View>

          <Text style={s.title}>Set New Password</Text>
          <Text style={s.subtitle}>
            This is your first login. Please set a new password to continue.
          </Text>

          {/* New password */}
          <View style={s.inputRow}>
            <TextInput
              style={[s.input, { flex: 1 }]}
              placeholder="New password (min 6 characters)"
              placeholderTextColor="#BDBDBD"
              value={newPw}
              onChangeText={setNewPw}
              secureTextEntry={!showNew}
            />
            <TouchableOpacity onPress={() => setShowNew(!showNew)} style={{ padding: 4 }}>
              {showNew ? <EyeSlash size={18} color="#BDBDBD" /> : <Eye size={18} color="#BDBDBD" />}
            </TouchableOpacity>
          </View>

          {/* Confirm password */}
          <View style={s.inputRow}>
            <TextInput
              style={[s.input, { flex: 1 }]}
              placeholder="Confirm new password"
              placeholderTextColor="#BDBDBD"
              value={confirmPw}
              onChangeText={setConfirmPw}
              secureTextEntry={!showConfirm}
            />
            <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={{ padding: 4 }}>
              {showConfirm ? <EyeSlash size={18} color="#BDBDBD" /> : <Eye size={18} color="#BDBDBD" />}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[s.btn, loading && { opacity: 0.7 }]}
            onPress={handleChange}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnText}>Set Password & Continue</Text>
            }
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  scroll: {
    flexGrow: 1, alignItems: "center",
    paddingHorizontal: 32, paddingTop: 60, paddingBottom: 40,
  },
  iconWrap: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: Colors.primaryLight,
    alignItems: "center", justifyContent: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 24, fontWeight: "800", color: "#1A2540",
    marginBottom: 10, textAlign: "center",
  },
  subtitle: {
    fontSize: 14, color: "#888", textAlign: "center",
    marginBottom: 36, lineHeight: 20,
  },
  inputRow: {
    flexDirection: "row", alignItems: "center", width: "100%",
    borderWidth: 1.5, borderColor: "#E0E0E0", borderRadius: 30,
    paddingHorizontal: 18, paddingVertical: 10, marginBottom: 16,
    backgroundColor: "#FAFAFA", gap: 10,
  },
  input: { fontSize: 15, color: "#333" },
  btn: {
    width: "100%", backgroundColor: Colors.primary,
    borderRadius: 10, paddingVertical: 16,
    alignItems: "center", marginTop: 8, elevation: 2,
  },
  btnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
