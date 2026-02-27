import { useCallback } from "react";
import { Vibration, Platform, Alert } from "react-native";
import * as Haptics from "expo-haptics";

export function useNotifications() {
  const scheduleNotification = useCallback(async (
    title: string,
    body: string,
    _delaySeconds = 1,
    _data?: Record<string, unknown>
  ) => {
    try {
      if (Platform.OS !== "web") {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Vibration.vibrate([100, 200, 100]);
      }
    } catch {}
  }, []);

  const cancelAll = useCallback(async () => {}, []);

  return { scheduleNotification, cancelAll };
}

export async function registerForNotifications() {
  return "granted";
}

export async function sendLocalNotification(title: string, body: string, _data?: Record<string, unknown>) {
  try {
    if (Platform.OS !== "web") {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Vibration.vibrate([0, 100, 100, 100]);
    }
  } catch {}
}
