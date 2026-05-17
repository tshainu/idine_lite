import { useEffect } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import { initDatabase } from "../lib/database";
import { getSession } from "../lib/auth";
import { startSyncEngine } from "../lib/sync";

export default function Index() {
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS !== "web") await initDatabase();
      } catch {}
      const session = await getSession();
      if (session) {
        if (Platform.OS !== "web") startSyncEngine();
        router.replace("/dashboard");
      } else {
        router.replace("/login");
      }
    })();
  }, []);
  return null;
}
