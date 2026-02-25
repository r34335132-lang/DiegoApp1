import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable,
  Platform, RefreshControl, Image, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/context/auth";

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function ChatListScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["/api/chat/conversations"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/chat/conversations");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: clientsData } = useQuery({
    queryKey: ["/api/clients"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/clients");
      return res.json();
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const conversations = data?.conversations || [];
  const activeClients = (clientsData?.clients || []).filter(
    (c: any) => c.status === "activo" && c.client_id
  );

  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Text style={styles.title}>Mensajes</Text>
        <Text style={styles.subtitle}>{conversations.length} conversaciones</Text>
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.other_id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!conversations.length}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          ListHeaderComponent={
            activeClients.length > 0 && conversations.length === 0 ? (
              <View style={styles.suggestedSection}>
                <Text style={styles.suggestedTitle}>Clientes</Text>
                {activeClients.map((c: any) => (
                  <Pressable
                    key={c.id}
                    style={({ pressed }) => [styles.conversationItem, pressed && { opacity: 0.8 }]}
                    onPress={() => router.push({
                      pathname: "/(entrenador)/chat/[id]",
                      params: { id: c.client_id, nombre: `${c.nombre} ${c.apellido}` }
                    })}
                  >
                    <LinearGradient colors={["#374151", "#1F2937"]} style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {(c.nombre || "?")[0].toUpperCase()}
                      </Text>
                    </LinearGradient>
                    <View style={styles.convInfo}>
                      <Text style={styles.convName}>{c.nombre} {c.apellido}</Text>
                      <Text style={styles.convPreview}>Toca para iniciar conversación</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </Pressable>
                ))}
              </View>
            ) : null
          }
          ListEmptyComponent={
            activeClients.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={56} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>Sin mensajes</Text>
                <Text style={styles.emptySubtitle}>
                  Agrega clientes para poder chatear con ellos
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.conversationItem, pressed && { opacity: 0.8 }]}
              onPress={() => router.push({
                pathname: "/(entrenador)/chat/[id]",
                params: { id: item.other_id, nombre: `${item.nombre} ${item.apellido}` }
              })}
            >
              {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} />
              ) : (
                <LinearGradient colors={["#374151", "#1F2937"]} style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(item.nombre || "?")[0].toUpperCase()}
                  </Text>
                </LinearGradient>
              )}
              <View style={styles.convInfo}>
                <View style={styles.convTop}>
                  <Text style={styles.convName} numberOfLines={1}>
                    {item.nombre} {item.apellido}
                  </Text>
                  <Text style={styles.convTime}>
                    {item.last_at ? timeAgo(item.last_at) : ""}
                  </Text>
                </View>
                <View style={styles.convBottom}>
                  <Text style={styles.convPreview} numberOfLines={1}>
                    {item.last_tipo === "imagen" ? "Imagen" : item.last_tipo === "video" ? "Video" : item.last_msg || ""}
                  </Text>
                  {Number(item.unread_count) > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{item.unread_count}</Text>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          )}
        />
      )}

      {/* FAB to start new chat */}
      {activeClients.length > 0 && conversations.length > 0 && (
        <View style={[styles.fab, { bottom: insets.bottom + 100 }]}>
          {activeClients.map((c: any) => (
            <Pressable
              key={c.id}
              style={({ pressed }) => [styles.fabItem, pressed && { opacity: 0.8 }]}
              onPress={() => router.push({
                pathname: "/(entrenador)/chat/[id]",
                params: { id: c.client_id, nombre: `${c.nombre} ${c.apellido}` }
              })}
            >
              <LinearGradient colors={["#374151", "#1F2937"]} style={styles.fabAvatar}>
                <Text style={styles.fabAvatarText}>{(c.nombre || "?")[0].toUpperCase()}</Text>
              </LinearGradient>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: {
    fontFamily: "Outfit_700Bold",
    fontSize: 30,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: "Outfit_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  suggestedSection: {
    marginBottom: 16,
  },
  suggestedTitle: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 20,
    color: Colors.text,
    marginTop: 8,
  },
  emptySubtitle: {
    fontFamily: "Outfit_400Regular",
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  conversationItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 0,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  convInfo: { flex: 1 },
  convTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  convName: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 16,
    color: Colors.text,
    flex: 1,
  },
  convTime: {
    fontFamily: "Outfit_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    marginLeft: 8,
  },
  convBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  convPreview: {
    fontFamily: "Outfit_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
    flex: 1,
  },
  unreadBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    minWidth: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 11,
    color: Colors.primaryText,
  },
  fab: {
    position: "absolute",
    right: 20,
    flexDirection: "column",
    gap: 8,
  },
  fabItem: {},
  fabAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  fabAvatarText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 14,
    color: Colors.text,
  },
});
