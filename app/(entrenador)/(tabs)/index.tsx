import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Platform, RefreshControl, Image, Modal, ActivityIndicator, Alert
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/auth";
import { supabase } from "@/lib/supabase";
import { useUpload } from "@/hooks/useUpload";
import * as Haptics from "expo-haptics";

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
  const { user, setUser, logout } = useAuth();
  const qc = useQueryClient();
  const photoUpload = useUpload();
  
  const [refreshing, setRefreshing] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any>(null);

  // 1. Obtener Clientes e Invitaciones desde Supabase
  const { data: clientsData, refetch: refetchClients } = useQuery({
    queryKey: ["clients", user?.id],
    queryFn: async () => {
      if (!user?.id) return { clients: [] };

      const { data: activos } = await supabase
        .from("perfiles")
        .select("*")
        .eq("rol", "cliente")
        .eq("entrenador_id", user.id);

      const { data: pendientes } = await supabase
        .from("invitaciones")
        .select("*")
        .eq("estado", "pendiente")
        .eq("entrenador_id", user.id);

      const perfilesFormateados = (activos || []).map(c => ({ ...c, status: "activo" }));
      const invitacionesFormateadas = (pendientes || []).map(inv => ({
        id: inv.id, invite_email: inv.email, status: "pendiente", role: "cliente"
      }));

      return { clients: [...perfilesFormateados, ...invitacionesFormateadas] };
    },
    enabled: !!user?.id,
  });

  // 2. Obtener Rutinas desde Supabase
  const { data: routinesData, refetch: refetchRoutines } = useQuery({
    queryKey: ["routines", user?.id],
    queryFn: async () => {
      if (!user?.id) return { routines: [] };

      const { data } = await supabase
        .from("rutinas")
        .select(`
          *,
          perfiles:cliente_id (nombre, apellido)
        `)
        .eq("entrenador_id", user.id)
        .order("created_at", { ascending: false });

      const formatRoutines = (data || []).map((r: any) => ({
        ...r,
        client_nombre: r.perfiles?.nombre,
        client_apellido: r.perfiles?.apellido,
      }));

      return { routines: formatRoutines };
    },
    enabled: !!user?.id,
  });

  // 3. Obtener Actividad/Sesiones desde Supabase
  const { data: sessionsData, refetch: refetchSessions } = useQuery({
    queryKey: ["sessions", user?.id],
    queryFn: async () => {
      if (!user?.id) return { sessions: [] };

      const { data: misRutinas } = await supabase
        .from("rutinas")
        .select("id")
        .eq("entrenador_id", user.id);

      const rutinasIds = (misRutinas || []).map(r => r.id);
      if (rutinasIds.length === 0) return { sessions: [] };

      const { data } = await supabase
        .from("sesiones_entrenamiento")
        .select(`
          *,
          perfiles:cliente_id (nombre, apellido),
          rutinas:rutina_id (nombre, nivel)
        `)
        .in("rutina_id", rutinasIds)
        .order("created_at", { ascending: false })
        .limit(10); 

      const formatSessions = (data || []).map((s: any) => ({
        ...s,
        duration_seconds: s.duracion_segundos,
        total_exercises: s.total_ejercicios,
        exercises_completed: s.ejercicios_completados,
        client_nombre: s.perfiles?.nombre,
        client_apellido: s.perfiles?.apellido,
        routine_nombre: s.rutinas?.nombre,
        routine_nivel: s.rutinas?.nivel,
      }));

      return { sessions: formatSessions };
    },
    enabled: !!user?.id,
  });

  // 4. Obtener Chats para contador
  const { data: chatsData, refetch: refetchChats } = useQuery({
    queryKey: ["chats_list", user?.id],
    queryFn: async () => {
      if (!user?.id) return { unread: 0 };
      const { data } = await supabase
        .from("mensajes")
        .select("id")
        .eq("receptor_id", user.id)
        .eq("leido", false);
        
      return { unread: data?.length || 0 };
    },
    enabled: !!user?.id,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchClients(), refetchRoutines(), refetchSessions(), refetchChats()]);
    setRefreshing(false);
  }, [refetchClients, refetchRoutines, refetchSessions, refetchChats]);

  // --- MUTACIONES DE PERFIL ---
  const updateAvatarMutation = useMutation({
    mutationFn: async (url: string) => {
      const { error } = await supabase.from("perfiles").update({ avatar_url: url }).eq("id", user?.id);
      if (error) throw new Error(error.message);
      return url;
    },
    onSuccess: (url) => {
      if (user) setUser({ ...user, avatar_url: url });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => Alert.alert("Error", "No se pudo actualizar la foto")
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("delete_own_account");
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setShowProfileModal(false);
      logout();
    },
    onError: () => Alert.alert("Error", "Hubo un problema al eliminar la cuenta.")
  });

  const handleChangePhoto = async () => {
    const result = await photoUpload.pickAndUpload("images");
    if (result) {
      updateAvatarMutation.mutate(result.url);
    }
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      "Eliminar Cuenta",
      "¿Estás seguro? Esta acción borrará todos tus pacientes, rutinas y mensajes. NO se puede deshacer.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Eliminar definitivamente", style: "destructive", onPress: () => deleteAccountMutation.mutate() }
      ]
    );
  };
  // -----------------------------

  const clients = clientsData?.clients || [];
  const routines = routinesData?.routines || [];
  const sessions = sessionsData?.sessions || [];
  const totalUnread = chatsData?.unread || 0;
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
        {/* Header Clickable para Perfil */}
        <Pressable 
          style={({ pressed }) => [styles.header, pressed && { opacity: 0.7 }]} 
          onPress={() => setShowProfileModal(true)}
        >
          <View>
            <Text style={styles.saludo}>{saludo},</Text>
            <Text style={styles.nombre}>{user?.nombre} {user?.apellido}</Text>
            <View style={styles.badge}>
              <Ionicons name="fitness" size={12} color={Colors.primary} />
              <Text style={styles.badgeText}>Entrenador</Text>
            </View>
          </View>
          <View>
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
            ) : (
              <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {user?.nombre?.[0]}{user?.apellido?.[0]}
                </Text>
              </LinearGradient>
            )}
            <View style={styles.editIconBadge}>
              <Ionicons name="pencil" size={10} color="#fff" />
            </View>
          </View>
        </Pressable>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <StatCard
            label="Pacientes activos"
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
            <Text style={styles.actionText}>Agregar{"\n"}Paciente</Text>
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
          <Text style={styles.sectionTitle}>Pacientes recientes</Text>
          <Pressable onPress={() => router.push("/(entrenador)/clientes")}>
            <Text style={styles.seeAll}>Ver todos</Text>
          </Pressable>
        </View>

        {clients.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="people-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No tienes pacientes aún</Text>
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
                <Text style={styles.routineClient}>
                  {routine.client_nombre !== "Sin" ? `Para: ${routine.client_nombre} ${routine.client_apellido}` : "Sin asignar"}
                </Text>
              </View>
              <View style={styles.nivelBadge}>
                <Text style={styles.nivelText}>{routine.nivel}</Text>
              </View>
            </Pressable>
          ))
        )}

        {/* Client Workout Activity */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Actividad de pacientes</Text>
          <Pressable onPress={() => router.push("/(entrenador)/actividad")}>
            <Text style={styles.seeAll}>Ver todas</Text>
          </Pressable>
        </View>
        
        {sessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="flame-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No hay actividad reciente</Text>
          </View>
        ) : (
          sessions.slice(0, 5).map((session: any) => {
            const mins = Math.floor((session.duration_seconds || 0) / 60);
            const date = new Date(session.created_at).toLocaleDateString("es", { day: "numeric", month: "short" });
            const pct = session.total_exercises > 0
              ? Math.round((session.exercises_completed / session.total_exercises) * 100)
              : 0;
            return (
              <Pressable 
                key={session.id} 
                style={({ pressed }) => [styles.sessionRow, pressed && { opacity: 0.8 }]}
                onPress={() => setSelectedSession(session)} 
              >
                <View style={styles.sessionIcon}>
                  <Ionicons name="flame" size={18} color={Colors.accentOrange} />
                </View>
                <View style={styles.sessionInfo}>
                  <Text style={styles.sessionName}>
                    {session.client_nombre} {session.client_apellido}
                  </Text>
                  <Text style={styles.sessionDetail}>
                    {session.routine_nombre || "Sin rutina"} · {mins} min · {pct}% completado
                  </Text>
                </View>
                <Text style={styles.sessionDate}>{date}</Text>
              </Pressable>
            );
          })
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* --- MODAL DETALLE DE SESIÓN DE ENTRENAMIENTO --- */}
      <Modal visible={!!selectedSession} transparent animationType="slide" onRequestClose={() => setSelectedSession(null)}>
        <Pressable style={styles.overlay} onPress={() => setSelectedSession(null)} />
        <View style={[styles.profileModal, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.modalHandle} />
          
          {selectedSession && (
            <>
              <View style={styles.sessionModalHeader}>
                <View style={styles.sessionModalIcon}>
                  <Ionicons name="trophy" size={32} color={Colors.accentOrange} />
                </View>
                <Text style={styles.sessionModalTitle}>
                  {selectedSession.client_nombre} {selectedSession.client_apellido}
                </Text>
                <Text style={styles.sessionModalSubtitle}>
                  Completó un entrenamiento el {new Date(selectedSession.created_at).toLocaleDateString("es", { day: "numeric", month: "long" })}
                </Text>
              </View>

              <View style={styles.sessionModalGrid}>
                <View style={styles.sessionModalStat}>
                  <Text style={styles.sessionModalStatValue}>{selectedSession.routine_nombre}</Text>
                  <Text style={styles.sessionModalStatLabel}>Rutina</Text>
                </View>
                <View style={styles.sessionModalStat}>
                  <Text style={styles.sessionModalStatValue}>
                    {Math.floor(selectedSession.duration_seconds / 60)} min
                  </Text>
                  <Text style={styles.sessionModalStatLabel}>Tiempo</Text>
                </View>
              </View>

              <View style={styles.progressContainer}>
                <View style={styles.progressHeaderRow}>
                  <Text style={styles.progressLabel}>Progreso de la rutina</Text>
                  <Text style={styles.progressPct}>
                    {Math.round((selectedSession.exercises_completed / Math.max(selectedSession.total_exercises, 1)) * 100)}%
                  </Text>
                </View>
                <View style={styles.progressBarWrap}>
                  <View 
                    style={[
                      styles.progressBarFill, 
                      { width: `${(selectedSession.exercises_completed / Math.max(selectedSession.total_exercises, 1)) * 100}%` as any }
                    ]} 
                  />
                </View>
                <Text style={styles.progressDetailText}>
                  {selectedSession.exercises_completed} de {selectedSession.total_exercises} ejercicios completados
                </Text>
              </View>

              <Pressable 
                style={styles.closeSessionBtn} 
                onPress={() => setSelectedSession(null)}
              >
                <Text style={styles.closeSessionText}>Cerrar resumen</Text>
              </Pressable>
            </>
          )}
        </View>
      </Modal>

      {/* --- MODAL DE PERFIL --- */}
      <Modal visible={showProfileModal} transparent animationType="fade" onRequestClose={() => setShowProfileModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowProfileModal(false)} />
        <View style={[styles.profileModal, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Ajustes de Perfil</Text>

          <View style={styles.profileModalContent}>
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.largeAvatar} />
            ) : (
              <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.largeAvatar}>
                <Text style={styles.largeAvatarText}>{user?.nombre?.[0]}{user?.apellido?.[0]}</Text>
              </LinearGradient>
            )}
            <Text style={styles.profileName}>{user?.nombre} {user?.apellido}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>

            <Pressable style={styles.changePhotoBtn} onPress={handleChangePhoto} disabled={photoUpload.uploading || updateAvatarMutation.isPending}>
              {(photoUpload.uploading || updateAvatarMutation.isPending) ? (
                <ActivityIndicator color={Colors.primary} />
              ) : (
                <>
                  <Ionicons name="camera" size={20} color={Colors.primary} />
                  <Text style={styles.changePhotoText}>Cambiar Foto</Text>
                </>
              )}
            </Pressable>
          </View>

          <View style={styles.profileActions}>
            <Pressable style={styles.logoutBtnFull} onPress={() => { setShowProfileModal(false); logout(); }}>
              <Ionicons name="log-out-outline" size={20} color={Colors.text} />
              <Text style={styles.logoutBtnText}>Cerrar Sesión</Text>
            </Pressable>

            <Pressable style={styles.deleteAccountBtn} onPress={confirmDeleteAccount} disabled={deleteAccountMutation.isPending}>
              {deleteAccountMutation.isPending ? (
                <ActivityIndicator color={Colors.error} />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={20} color={Colors.error} />
                  <Text style={styles.deleteAccountText}>Eliminar Cuenta</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

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
    alignItems: "center",
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
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: Colors.primaryText,
  },
  editIconBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: Colors.card,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border
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
  clientInfo: { flex: 1 },
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
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  sessionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.accentOrange + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  sessionInfo: { flex: 1 },
  sessionName: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  sessionDetail: {
    fontFamily: "Outfit_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 3,
  },
  sessionDate: {
    fontFamily: "Outfit_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },

  /* Modales Globales */
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  profileModal: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingTop: 16,
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 22,
    color: Colors.text,
    marginBottom: 20,
    textAlign: "center",
  },
  
  /* Contenido Modal Perfil */
  profileModalContent: {
    alignItems: "center",
    marginBottom: 24,
  },
  largeAvatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  largeAvatarText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 32,
    color: Colors.primaryText,
  },
  profileName: {
    fontFamily: "Outfit_700Bold",
    fontSize: 20,
    color: Colors.text,
    marginBottom: 4,
  },
  profileEmail: {
    fontFamily: "Outfit_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 16,
  },
  changePhotoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.primary + "15",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  changePhotoText: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 14,
    color: Colors.primary,
  },
  profileActions: {
    gap: 12,
  },
  logoutBtnFull: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.surface,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  logoutBtnText: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  deleteAccountBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.error + "15",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.error + "44",
  },
  deleteAccountText: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 15,
    color: Colors.error,
  },

  /* Contenido Modal de Sesión */
  sessionModalHeader: {
    alignItems: "center",
    marginBottom: 24,
  },
  sessionModalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.accentOrange + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  sessionModalTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 24,
    color: Colors.text,
    marginBottom: 4,
    textAlign: "center",
  },
  sessionModalSubtitle: {
    fontFamily: "Outfit_400Regular",
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  sessionModalGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  sessionModalStat: {
    flex: 1,
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sessionModalStatValue: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: Colors.text,
    textAlign: "center",
    marginBottom: 4,
  },
  sessionModalStatLabel: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  progressContainer: {
    backgroundColor: Colors.surface,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 24,
  },
  progressHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  progressLabel: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  progressPct: {
    fontFamily: "Outfit_700Bold",
    fontSize: 15,
    color: Colors.primary,
  },
  progressBarWrap: {
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 10,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  progressDetailText: {
    fontFamily: "Outfit_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  closeSessionBtn: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  closeSessionText: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  }
});