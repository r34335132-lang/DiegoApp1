import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Platform, RefreshControl, Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/auth";
import { apiRequest } from "@/lib/query-client";

export default function ClienteDashboard() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const { data: routinesData, refetch: refetchRoutines } = useQuery({
    queryKey: ["/api/routines"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/routines");
      return res.json();
    },
  });

  const { data: progressData, refetch: refetchProgress } = useQuery({
    queryKey: ["/api/progress", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/progress");
      return res.json();
    },
  });

  const { data: chatsData, refetch: refetchChats } = useQuery({
    queryKey: ["/api/chat/conversations"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/chat/conversations");
      return res.json();
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchRoutines(), refetchProgress(), refetchChats()]);
    setRefreshing(false);
  }, []);

  const routines = routinesData?.routines || [];
  const progressEntries = progressData?.entries || [];
  const conversations = chatsData?.conversations || [];
  const totalUnread = conversations.reduce((sum: number, c: any) => sum + Number(c.unread_count || 0), 0);

  const latestProgress = progressEntries[0];
  const hora = new Date().getHours();
  const saludo = hora < 12 ? "Buenos días" : hora < 18 ? "Buenas tardes" : "Buenas noches";
  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topInset + 16 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.saludo}>{saludo},</Text>
            <Text style={styles.nombre}>{user?.nombre} {user?.apellido}</Text>
            <View style={styles.badge}>
              <Ionicons name="person" size={12} color={Colors.accentBlue} />
              <Text style={[styles.badgeText, { color: Colors.accentBlue }]}>Cliente</Text>
            </View>
          </View>
          {user?.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
          ) : (
            <LinearGradient colors={["#374151", "#1F2937"]} style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user?.nombre?.[0]}{user?.apellido?.[0]}
              </Text>
            </LinearGradient>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: Colors.primary + "22" }]}>
              <Ionicons name="barbell" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.statValue}>{routines.length}</Text>
            <Text style={styles.statLabel}>Rutinas</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: Colors.success + "22" }]}>
              <Ionicons name="trending-up" size={20} color={Colors.success} />
            </View>
            <Text style={styles.statValue}>{progressEntries.length}</Text>
            <Text style={styles.statLabel}>Registros</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: Colors.accentOrange + "22" }]}>
              <Ionicons name="chatbubbles" size={20} color={Colors.accentOrange} />
            </View>
            <Text style={styles.statValue}>{totalUnread}</Text>
            <Text style={styles.statLabel}>Mensajes</Text>
          </View>
        </View>

        {/* Latest Progress */}
        {latestProgress && (
          <>
            <Text style={styles.sectionTitle}>Últimas métricas</Text>
            <View style={styles.progressCard}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressDate}>{latestProgress.fecha}</Text>
                <Pressable onPress={() => router.push("/(cliente)/mi-progreso")}>
                  <Text style={styles.seeAll}>Ver todo</Text>
                </Pressable>
              </View>
              <View style={styles.metricsGrid}>
                {latestProgress.peso && (
                  <View style={styles.metricItem}>
                    <Text style={styles.metricValue}>{latestProgress.peso}</Text>
                    <Text style={styles.metricLabel}>kg peso</Text>
                  </View>
                )}
                {latestProgress.grasa_corporal && (
                  <View style={styles.metricItem}>
                    <Text style={styles.metricValue}>{latestProgress.grasa_corporal}%</Text>
                    <Text style={styles.metricLabel}>grasa</Text>
                  </View>
                )}
                {latestProgress.cintura && (
                  <View style={styles.metricItem}>
                    <Text style={styles.metricValue}>{latestProgress.cintura}</Text>
                    <Text style={styles.metricLabel}>cm cintura</Text>
                  </View>
                )}
              </View>
            </View>
          </>
        )}

        {/* My Routines */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Mis rutinas</Text>
          <Pressable onPress={() => router.push("/(cliente)/mis-rutinas")}>
            <Text style={styles.seeAll}>Ver todas</Text>
          </Pressable>
        </View>

        {routines.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="barbell-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Tu entrenador aún no asignó rutinas</Text>
          </View>
        ) : (
          routines.slice(0, 3).map((r: any) => (
            <Pressable
              key={r.id}
              style={({ pressed }) => [styles.routineRow, pressed && { opacity: 0.8 }]}
            >
              <View style={styles.routineIcon}>
                <Ionicons name="barbell" size={20} color={Colors.primary} />
              </View>
              <View style={styles.routineInfo}>
                <Text style={styles.routineName}>{r.nombre}</Text>
                <Text style={styles.routineTrainer}>
                  {r.trainer_nombre ? `De: ${r.trainer_nombre} ${r.trainer_apellido}` : "Sin asignar"}
                </Text>
              </View>
              <View style={[styles.nivelBadge, { backgroundColor: Colors.primary + "22" }]}>
                <Text style={[styles.nivelText, { color: Colors.primary }]}>{r.nivel}</Text>
              </View>
            </Pressable>
          ))
        )}

        {/* Conversations */}
        {conversations.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Mensajes</Text>
              <Pressable onPress={() => router.push("/(cliente)/chat")}>
                <Text style={styles.seeAll}>Ver todo</Text>
              </Pressable>
            </View>
            {conversations.slice(0, 2).map((conv: any) => (
              <Pressable
                key={conv.other_id}
                style={({ pressed }) => [styles.convRow, pressed && { opacity: 0.8 }]}
                onPress={() => router.push({
                  pathname: "/(cliente)/chat/[id]",
                  params: { id: conv.other_id, nombre: `${conv.nombre} ${conv.apellido}` }
                })}
              >
                <LinearGradient colors={["#374151", "#1F2937"]} style={styles.convAvatar}>
                  <Text style={styles.convAvatarText}>{(conv.nombre || "?")[0].toUpperCase()}</Text>
                </LinearGradient>
                <View style={styles.convInfo}>
                  <Text style={styles.convName}>{conv.nombre} {conv.apellido}</Text>
                  <Text style={styles.convPreview} numberOfLines={1}>{conv.last_msg || "Sin mensajes"}</Text>
                </View>
                {Number(conv.unread_count) > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{conv.unread_count}</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </>
        )}

        {/* Logout */}
        <Pressable
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}
          onPress={logout}
        >
          <Ionicons name="log-out-outline" size={20} color={Colors.error} />
          <Text style={styles.logoutText}>Cerrar Sesión</Text>
        </Pressable>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 28,
  },
  saludo: {
    fontFamily: "Outfit_400Regular",
    fontSize: 16,
    color: Colors.textSecondary,
  },
  nombre: {
    fontFamily: "Outfit_700Bold",
    fontSize: 26,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.accentBlue + "22",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: "flex-start",
    marginTop: 6,
  },
  badgeText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
    color: Colors.text,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 28,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontFamily: "Outfit_700Bold",
    fontSize: 22,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: "Outfit_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  sectionTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: Colors.text,
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    marginTop: 8,
  },
  seeAll: {
    fontFamily: "Outfit_500Medium",
    fontSize: 14,
    color: Colors.primary,
  },
  progressCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  progressDate: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  metricItem: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    minWidth: 80,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  metricValue: {
    fontFamily: "Outfit_700Bold",
    fontSize: 20,
    color: Colors.primary,
  },
  metricLabel: {
    fontFamily: "Outfit_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  emptyCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
    marginBottom: 20,
  },
  emptyText: {
    fontFamily: "Outfit_400Regular",
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: "center",
  },
  routineRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  routineIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primary + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  routineInfo: { flex: 1 },
  routineName: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  routineTrainer: {
    fontFamily: "Outfit_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  nivelBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  nivelText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
    textTransform: "capitalize",
  },
  convRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  convAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  convAvatarText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
    color: Colors.text,
  },
  convInfo: { flex: 1 },
  convName: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  convPreview: {
    fontFamily: "Outfit_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
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
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.error + "44",
    backgroundColor: Colors.error + "11",
  },
  logoutText: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 15,
    color: Colors.error,
  },
});
