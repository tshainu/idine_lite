import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initDatabase } from "../lib/database";
import { getSession } from "../lib/auth";
import { startSyncEngine, stopSyncEngine } from "../lib/sync";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
});

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        if (Platform.OS !== "web") {
          await initDatabase();
        }
      } catch (e) {
        console.warn("DB init skipped:", e);
      }
      const session = await getSession();
      setReady(true);
      if (session) {
        if (Platform.OS !== "web") startSyncEngine();
        router.replace("/dashboard");
      } else {
        router.replace("/login");
      }
    };
    init();
    return () => stopSyncEngine();
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" backgroundColor="#0A1F44" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="dashboard" />
          <Stack.Screen name="billing" />
          <Stack.Screen name="items" />
          <Stack.Screen name="categories" />
          <Stack.Screen name="reports" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="portions" />
          <Stack.Screen name="units" />
          <Stack.Screen name="add-item" />
          <Stack.Screen name="users" />
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
