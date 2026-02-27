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

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  color: string;
  onPress?: () => void;
}

function StatCard({ label, value, icon, color, onPress }: StatCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.statCard, pressed && { opacity: 0.8 }]}
      onPress={onPress}
    >
      <View style={[styles.statIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

export default function TrainerDashboard() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const { data: clientsData, refetch: refetchClients } = useQuery({
    queryKey: ["/api/clients"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/clients");
      return res.json();
    },
  });

  const { data: routinesData, refetch: refetchRoutines } = useQuery({
    queryKey: ["/api/routines"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/routines");
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

  const { data: sessionsData, refetch: refetchSessions } = useQuery({
    queryKey: ["/api/training-sessions"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/training-sessions");
      return res.json();
    },
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchClients(), refetchRoutines(), refetchChats(), refetchSessions()]);
    setRefreshing(false);
  }, []);

  const clients = clientsData?.clients || [];
  const routines = routinesData?.routines || [];
  const conversations = chatsData?.conversations || [];
  const sessions = sessionsData?.sessions || [];
  const totalUnread = conversations.reduce((sum: number, c: any) => sum + Number(c.unread_count || 0), 0);
  const activeClients = clients.filter((c: any) => c.status === "activo").length;

  const hora = new Date().getHours();
  const saludo = hora < 12 ? "Buenos días" : hora < 18 ? "Buenas tardes" : "Buenas noches";

  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topInset + 16 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.saludo}>{saludo},</Text>
            <Text style={styles.nombre}>{user?.nombre} {user?.apellido}</Text>
            <View style={styles.badge}>
              <Ionicons name="fitness" size={12} color={Colors.primary} />
              <Text style={styles.badgeText}>Entrenador</Text>
            </View>
          </View>
          <Pressable
            style={({ pressed }) => [styles.avatarBtn, pressed && { opacity: 0.7 }]}
            onPress={() => {}}
          >
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
            ) : (
              <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {user?.nombre?.[0]}{user?.apellido?.[0]}
                </Text>
              </LinearGradient>
            )}
          </Pressable>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <StatCard
            label="Clientes activos"
            value={activeClients}
            icon="people"
            color={Colors.accentBlue}
            onPress={() => router.push("/(entrenador)/clientes")}
          />
          <StatCard
            label="Rutinas"
            value={routines.length}
            icon="barbell"
            color={Colors.primary}
            onPress={() => router.push("/(entrenador)/rutinas")}
          />
          <StatCard
            label="Mensajes"
            value={totalUnread}
            icon="chatbubbles"
            color={Colors.accentOrange}
            onPress={() => router.push("/(entrenador)/chat")}
          />
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Acciones rápidas</Text>
        <View style={styles.quickActions}>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.8 }]}
            onPress={() => router.push("/(entrenador)/clientes")}
          >
            <LinearGradient colors={[Colors.accentBlue, "#2563EB"]} style={styles.actionGradient}>
              <Ionicons name="person-add" size={24} color="#fff" />
            </LinearGradient>
            <Text style={styles.actionText}>Agregar{"\n"}Cliente</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.8 }]}
            onPress={() => router.push("/(entrenador)/rutinas")}
          >
            <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.actionGradient}>
              <Ionicons name="add-circle" size={24} color={Colors.primaryText} />
            </LinearGradient>
            <Text style={styles.actionText}>Nueva{"\n"}Rutina</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.8 }]}
            onPress={() => router.push("/(entrenador)/progreso")}
          >
            <LinearGradient colors={[Colors.success, "#16A34A"]} style={styles.actionGradient}>
              <Ionicons name="trending-up" size={24} color="#fff" />
            </LinearGradient>
            <Text style={styles.actionText}>Registrar{"\n"}Progreso</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.8 }]}
            onPress={() => router.push("/(entrenador)/chat")}
          >
            <LinearGradient colors={[Colors.accentOrange, "#EA580C"]} style={styles.actionGradient}>
              <Ionicons name="chatbubble-ellipses" size={24} color="#fff" />
            </LinearGradient>
            <Text style={styles.actionText}>Abrir{"\n"}Chat</Text>
          </Pressable>
        </View>

        {/* Recent Clients */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Clientes recientes</Text>
          <Pressable onPress={() => router.push("/(entrenador)/clientes")}>
            <Text style={styles.seeAll}>Ver todos</Text>
          </Pressable>
        </View>

        {clients.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="people-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No tienes clientes aún</Text>
            <Pressable
              style={styles.emptyBtn}
              onPress={() => router.push("/(entrenador)/clientes")}
            >
              <Text style={styles.emptyBtnText}>Agregar primer cliente</Text>
            </Pressable>
          </View>
        ) : (
          clients.slice(0, 3).map((client: any) => (
            <Pressable key={client.id} style={({ pressed }) => [styles.clientRow, pressed && { opacity: 0.8 }]}>
              <View style={styles.clientAvatar}>
                {client.avatar_url ? (
                  <Image source={{ uri: client.avatar_url }} style={styles.clientAvatarImg} />
                ) : (
                  <LinearGradient colors={["#374151", "#1F2937"]} style={styles.clientAvatarImg}>
                    <Text style={styles.clientInitials}>
                      {(client.nombre || client.invite_email || "?")[0].toUpperCase()}
                    </Text>
                  </LinearGradient>
                )}
              </View>
              <View style={styles.clientInfo}>
                <Text style={styles.clientName}>
                  {client.nombre ? `${client.nombre} ${client.apellido}` : client.invite_email || "Invitado"}
                </Text>
                <Text style={styles.clientEmail}>{client.email || client.invite_email || ""}</Text>
              </View>
              <View style={[
                styles.statusBadge,
                { backgroundColor: client.status === "activo" ? Colors.success + "22" : Colors.warning + "22" }
              ]}>
                <Text style={[
                  styles.statusText,
                  { color: client.status === "activo" ? Colors.success : Colors.warning }
                ]}>
                  {client.status === "activo" ? "Activo" : "Pendiente"}
                </Text>
              </View>
            </Pressable>
          ))
        )}

        {/* Recent Routines */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Rutinas recientes</Text>
          <Pressable onPress={() => router.push("/(entrenador)/rutinas")}>
            <Text style={styles.seeAll}>Ver todas</Text>
          </Pressable>
        </View>

        {routines.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="barbell-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No hay rutinas creadas</Text>
          </View>
        ) : (
          routines.slice(0, 3).map((routine: any) => (
            <Pressable
              key={routine.id}
              style={({ pressed }) => [styles.routineRow, pressed && { opacity: 0.8 }]}
              onPress={() => router.push({ pathname: "/(entrenador)/rutina/[id]", params: { id: routine.id } })}
            >
              <View style={styles.routineIcon}>
                <Ionicons name="barbell" size={20} color={Colors.primary} />
              </View>
              <View style={styles.routineInfo}>
                <Text style={styles.routineName}>{routine.nombre}</Text>
                {(routine.client_nombre || routine.client_apellido) && (
                  <Text style={styles.routineClient}>
                    Para: {routine.client_nombre} {routine.client_apellido}
                  </Text>
                )}
              </View>
              <View style={styles.nivelBadge}>
                <Text style={styles.nivelText}>{routine.nivel}</Text>
              </View>
            </Pressable>
          ))
        )}

        {/* Client Workout Activity */}
        {sessions.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Actividad de clientes</Text>
            </View>
            {sessions.slice(0, 5).map((session: any) => {
              const mins = Math.floor((session.duration_seconds || 0) / 60);
              const date = new Date(session.created_at).toLocaleDateString("es", { day: "numeric", month: "short" });
              const pct = session.total_exercises > 0
                ? Math.round((session.exercises_completed / session.total_exercises) * 100)
                : 0;
              return (
                <View key={session.id} style={styles.sessionRow}>
                  <View style={styles.sessionIcon}>
                    <Ionicons name="flame" size={18} color={Colors.accentOrange} />
                  </View>
                  <View style={styles.sessionInfo}>
                    <Text style={styles.sessionName}>
                      {session.client_nombre} {session.client_apellido}
                    </Text>
                    <Text style={styles.sessionDetail}>
                      {session.routine_nombre || "Sin rutina"} · {mins} min · {pct}%
                    </Text>
                  </View>
                  <Text style={styles.sessionDate}>{date}</Text>
                </View>
              );
            })}
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
  scroll: {
    paddingHorizontal: 20,
  },
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
    backgroundColor: Colors.primary + "22",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: "flex-start",
    marginTop: 6,
  },
  badgeText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
    color: Colors.primary,
  },
  avatarBtn: {
    borderRadius: 24,
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
    color: Colors.primaryText,
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
  quickActions: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 28,
  },
  actionBtn: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  actionGradient: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 15,
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
  },
  emptyBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  emptyBtnText: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 13,
    color: Colors.primaryText,
  },
  clientRow: {
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
  clientAvatar: {
    borderRadius: 20,
  },
  clientAvatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  clientInitials: {
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
    color: Colors.text,
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  clientEmail: {
    fontFamily: "Outfit_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
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
  routineInfo: {
    flex: 1,
  },
  routineName: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  routineClient: {
    fontFamily: "Outfit_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  nivelBadge: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  nivelText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
    textTransform: "capitalize",
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
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  sessionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.accentOrange + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  sessionInfo: { flex: 1 },
  sessionName: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  sessionDetail: {
    fontFamily: "Outfit_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  sessionDate: {
    fontFamily: "Outfit_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
});
