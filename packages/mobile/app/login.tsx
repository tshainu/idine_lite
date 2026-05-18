import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
  ActivityIndicator, Image, useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Eye, EyeSlash } from "phosphor-react-native";
import { Colors, Spacing, Radius, Typography } from "../lib/theme";
import { loginUser } from "../lib/auth";
import { startSyncEngine } from "../lib/sync";

export default function LoginScreen() {
  const [shopCode, setShopCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { width } = useWindowDimensions();

  const handleLogin = async () => {
    if (!shopCode.trim() || !username.trim() || !password.trim()) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      await loginUser(shopCode.trim(), username.trim(), password);
      startSyncEngine();
      router.replace("/dashboard");
    } catch (e: any) {
      Alert.alert("Login Failed", e.message ?? "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.root} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Mascot */}
          <Image
            source={require("../assets/login_mascot.png")}
            style={[s.mascot, { width: width * 0.45, height: width * 0.45 }]}
            resizeMode="contain"
          />

          {/* Title */}
          <Text style={s.title}>SIGN IN</Text>
          <Text style={s.subtitle}>Enter your shop id, username and password</Text>

          {/* Shop ID */}
          <View style={s.inputRow}>
            <Image source={require("../assets/login_shopid.png")} style={s.fieldIcon} resizeMode="contain" />
            <TextInput
              style={s.input}
              placeholder="Shop id"
              placeholderTextColor="#BDBDBD"
              value={shopCode}
              onChangeText={v => setShopCode(v.toUpperCase())}
              autoCapitalize="characters"
            />
          </View>

          {/* Username */}
          <View style={s.inputRow}>
            <Image source={require("../assets/login_username.png")} style={s.fieldIcon} resizeMode="contain" />
            <TextInput
              style={s.input}
              placeholder="Username"
              placeholderTextColor="#BDBDBD"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />
          </View>

          {/* Password */}
          <View style={s.inputRow}>
            <Image source={require("../assets/login_password.png")} style={s.fieldIcon} resizeMode="contain" />
            <TextInput
              style={[s.input, { flex: 1 }]}
              placeholder="Password"
              placeholderTextColor="#BDBDBD"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
            />
            <TouchableOpacity onPress={() => setShowPass(!showPass)} style={{ padding: 4 }}>
              {showPass
                ? <EyeSlash size={18} color="#BDBDBD" />
                : <Eye size={18} color="#BDBDBD" />
              }
            </TouchableOpacity>
          </View>

          {/* Login Button */}
          <TouchableOpacity
            style={[s.btn, loading && { opacity: 0.7 }]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnText}>Login</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={() => Alert.alert(
            "Forgot Password?",
            "Please contact iDine support to reset your password:\n\n📧 idinelite@axisxnor.com\n📞 +94 711336666",
            [{ text: "OK" }]
          )}>
            <Text style={s.forgot}>Forgot username or password?</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  scroll: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 32,
    paddingBottom: 40,
  },
  mascot: {
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1A2540",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: "#888",
    textAlign: "center",
    marginBottom: 32,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 30,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    backgroundColor: "#FAFAFA",
    gap: 10,
  },
  fieldIcon: {
    width: 28,
    height: 28,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#333",
  },
  btn: {
    width: "100%",
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 20,
    elevation: 2,
  },
  btnText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.5,
  },
  forgot: {
    fontSize: 13,
    color: "#888",
  },
});
