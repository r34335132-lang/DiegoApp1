import { Stack } from "expo-router";

export default function ClienteLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="rutina/[id]" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false, animation: "slide_from_right" }} />
    </Stack>
  );
}
