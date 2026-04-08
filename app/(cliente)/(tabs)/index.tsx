import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Platform, RefreshControl, Image, ActivityIndicator, Modal, Alert
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

export default function ClienteDashboard() {
  const insets = useSafeAreaInsets();
  const { user, setUser, logout } = useAuth();
  const qc = useQueryClient();
  const photoUpload = useUpload();

  const [refreshing, setRefreshing] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // 1. Obtener Rutinas Asignadas al Cliente
  const { data: routinesData, refetch: refetchRoutines } = useQuery({
    queryKey: ["client_routines", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rutinas")
        .select(`
          *,
          perfiles:entrenador_id (nombre, apellido)
        `)
        .eq("cliente_id", user?.id)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);

      const formattedRoutines = (data || []).map((r: any) => ({
        ...r,
        trainer_nombre: r.perfiles?.nombre,
        trainer_apellido: r.perfiles?.apellido,
      }));

      return { routines: formattedRoutines };
    },
  });

  // 2. Obtener Progreso
  const { data: progressData, refetch: refetchProgress } = useQuery({
    queryKey: ["client_progress", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("progreso")
        .select("*")
        .eq("cliente_id", user?.id)
        .order("fecha", { ascending: false });

      if (error) throw new Error(error.message);
      return { entries: data || [] };
    },
  });

  // 3. Obtener Mensajes
  const { data: chatsData, refetch: refetchChats } = useQuery({
    queryKey: ["client_chats_preview", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: miPerfil } = await supabase
        .from("perfiles")
        .select("entrenador_id")
        .eq("id", user?.id)
        .single();

      const entrenadorId = miPerfil?.entrenador_id;
      if (!entrenadorId) return { conversations: [], totalUnread: 0 };

      const { data: entrenadorData } = await supabase
        .from("perfiles")
        .select("nombre, apellido, avatar_url")
        .eq("id", entrenadorId)
        .single();

      const { data: messagesData } = await supabase
        .from("mensajes")
        .select("*")
        .or(`and(emisor_id.eq.${user?.id},receptor_id.eq.${entrenadorId}),and(emisor_id.eq.${entrenadorId},receptor_id.eq.${user?.id})`)
        .order("created_at", { ascending: false });

      const messages = messagesData || [];
      let totalUnread = 0;
      let lastMsg = null;

      if (messages.length > 0) {
        lastMsg = messages[0];
        totalUnread = messages.filter(m => m.receptor_id === user?.id && !m.leido).length;
      }

      const conversations = entrenadorData ? [{
        other_id: entrenadorId,
        nombre: entrenadorData.nombre,
        apellido: entrenadorData.apellido,
        avatar_url: entrenadorData.avatar_url,
        last_msg: lastMsg?.texto || (lastMsg?.tipo === "imagen" ? "📷 Imagen" : lastMsg?.tipo === "video" ? "🎥 Video" : ""),
        unread_count: totalUnread
      }] : [];

      return { conversations, totalUnread };
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchRoutines(), refetchProgress(), refetchChats()]);
    setRefreshing(false);
  }, [refetchRoutines, refetchProgress, refetchChats]);

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
      "¿Estás seguro? Se borrará todo tu progreso y no se podrá recuperar.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Eliminar definitivamente", style: "destructive", onPress: () => deleteAccountMutation.mutate() }
      ]
    );
  };
  // -----------------------------

  const routines = routinesData?.routines || [];
  const progressEntries = progressData?.entries || [];
  const conversations = chatsData?.conversations || [];
  const totalUnread = chatsData?.totalUnread || 0;

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
        {/* Header Clickable para el Perfil */}
        <Pressable 
          style={({ pressed }) => [styles.header, pressed && { opacity: 0.7 }]} 
          onPress={() => setShowProfileModal(true)}
        >
          <View>
            <Text style={styles.saludo}>{saludo},</Text>
            <Text style={styles.nombre}>{user?.nombre} {user?.apellido}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6, alignItems: "center" }}>
              <View style={styles.badge}>
                <Ionicons name="person" size={12} color={Colors.accentBlue} />
                <Text style={[styles.badgeText, { color: Colors.accentBlue }]}>Paciente</Text>
              </View>
            </View>
          </View>
          <View>
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
            ) : (
              <LinearGradient colors={["#374151", "#1F2937"]} style={styles.avatar}>
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
                {latestProgress.masa_muscular && (
                  <View style={styles.metricItem}>
                    <Text style={styles.metricValue}>{latestProgress.masa_muscular}%</Text>
                    <Text style={styles.metricLabel}>músculo</Text>
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
              onPress={() => router.push({ pathname: "/(cliente)/rutina/[id]", params: { id: r.id } })}
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
                <Text style={styles.seeAll}>Ver chat</Text>
              </Pressable>
            </View>
            {conversations.map((conv: any) => (
              <Pressable
                key={conv.other_id}
                style={({ pressed }) => [styles.convRow, pressed && { opacity: 0.8 }]}
                onPress={() => router.push({
                  pathname: "/(cliente)/chat/[id]",
                  params: { id: conv.other_id, nombre: `${conv.nombre} ${conv.apellido}` }
                })}
              >
                {conv.avatar_url ? (
                  <Image source={{ uri: conv.avatar_url }} style={styles.convAvatarImg} />
                ) : (
                  <LinearGradient colors={["#374151", "#1F2937"]} style={styles.convAvatar}>
                    <Text style={styles.convAvatarText}>{(conv.nombre || "?")[0].toUpperCase()}</Text>
                  </LinearGradient>
                )}
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

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* --- MODAL DE PERFIL --- */}
      <Modal visible={showProfileModal} transparent animationType="slide" onRequestClose={() => setShowProfileModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowProfileModal(false)} />
        <View style={[styles.profileModal, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Ajustes de Perfil</Text>

          <View style={styles.profileModalContent}>
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.largeAvatar} />
            ) : (
              <LinearGradient colors={["#374151", "#1F2937"]} style={styles.largeAvatar}>
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
  scroll: { paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
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
  },
  badgeText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
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
    color: Colors.text,
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
    borderColor: Colors.border,
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
  convAvatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
  
  /* Modal de Perfil */
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
    color: Colors.text,
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
    marginTop: 10,
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
});