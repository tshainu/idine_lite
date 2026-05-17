import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { Colors } from "../lib/theme";

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoText}>iD</Text>
        </View>
        <Text style={styles.appName}>iDine Lite</Text>
        <Text style={styles.tagline}>Restaurant Specialist</Text>
      </View>
      <ActivityIndicator color={Colors.white} size="large" style={styles.loader} />
      <Text style={styles.loading}>Loading...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  logoContainer: { alignItems: "center", gap: 12 },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  logoText: { fontSize: 36, fontWeight: "800", color: Colors.primary },
  appName: { fontSize: 32, fontWeight: "700", color: Colors.white, letterSpacing: 1 },
  tagline: { fontSize: 14, color: "rgba(255,255,255,0.8)", letterSpacing: 2 },
  loader: { marginTop: 60 },
  loading: { color: "rgba(255,255,255,0.6)", marginTop: 12, fontSize: 13 },
});
