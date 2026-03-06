import React, { useState, useCallback, useEffect } from "react";
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
import { useAuth } from "@/context/auth";
import { supabase } from "@/lib/supabase";
import * as Notifications from "expo-notifications"; 

// Configuración para las notificaciones locales
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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

export default function ClienteChatScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["client_chats_list", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // 1. Buscamos el ID del entrenador asignado a este cliente
      const { data: miPerfil } = await supabase
        .from("perfiles")
        .select("entrenador_id")
        .eq("id", user?.id)
        .single();

      const entrenadorId = miPerfil?.entrenador_id;
      
      // Si no tiene entrenador, devolvemos un arreglo vacío
      if (!entrenadorId) return { conversations: [] };

      // 2. Buscamos los datos del entrenador
      const { data: entrenadorData } = await supabase
        .from("perfiles")
        .select("nombre, apellido, avatar_url")
        .eq("id", entrenadorId)
        .single();

      // 3. Buscamos los mensajes entre ambos
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

      // Creamos la conversación (el cliente generalmente solo tiene 1 chat: con su entrenador)
      const conversations = entrenadorData ? [{
        other_id: entrenadorId,
        nombre: entrenadorData.nombre,
        apellido: entrenadorData.apellido,
        avatar_url: entrenadorData.avatar_url,
        role: "entrenador",
        last_msg: lastMsg?.texto,
        last_tipo: lastMsg?.tipo,
        last_at: lastMsg?.created_at || new Date().toISOString(), // Si no hay mensajes, ponemos la fecha actual para que no se rompa el timeAgo
        unread_count: totalUnread
      }] : [];

      return { conversations };
    }
  });

  // ESCUCHAR NUEVOS MENSAJES EN TIEMPO REAL
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('cliente-mensajes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensajes', filter: `receptor_id=eq.${user.id}` },
        (payload) => {
          const nuevoMensaje = payload.new;
          
          Notifications.scheduleNotificationAsync({
            content: {
              title: "Nuevo mensaje de tu entrenador",
              body: nuevoMensaje.texto || (nuevoMensaje.tipo === 'imagen' ? '📷 Imagen' : '🎥 Video'),
              sound: true,
            },
            trigger: null, 
          });

          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, refetch]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const conversations = data?.conversations || [];
  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Text style={styles.title}>Mensajes</Text>
        <Text style={styles.subtitle}>
          Habla directamente con tu entrenador
        </Text>
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
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={64} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>Sin entrenador asignado</Text>
              <Text style={styles.emptySubtitle}>
                Aún no estás vinculado a un entrenador. Espera a que te envíen una invitación.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.conversationItem, pressed && { opacity: 0.8 }]}
              onPress={() => router.push({
                pathname: "/(cliente)/chat/[id]",
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
                  <View style={styles.nameRow}>
                    <Text style={styles.convName} numberOfLines={1}>
                      {item.nombre} {item.apellido}
                    </Text>
                    <View style={styles.rolePill}>
                      <Text style={styles.roleText}>{item.role || "entrenador"}</Text>
                    </View>
                  </View>
                  <Text style={styles.convTime}>
                    {item.last_msg ? timeAgo(item.last_at) : ""}
                  </Text>
                </View>
                <View style={styles.convBottom}>
                  <Text style={[styles.convPreview, Number(item.unread_count) > 0 && { color: Colors.text, fontFamily: "Outfit_600SemiBold" }]} numberOfLines={1}>
                    {item.last_msg ? (item.last_tipo === "imagen" ? "📷 Imagen" : item.last_tipo === "video" ? "🎥 Video" : item.last_msg) : "Toca para iniciar el chat"}
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
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 22,
    color: Colors.text,
    marginTop: 8,
  },
  emptySubtitle: {
    fontFamily: "Outfit_400Regular",
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  conversationItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
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
    alignItems: "flex-start",
    marginBottom: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  convName: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  },
  rolePill: {
    backgroundColor: Colors.primary + "22",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  roleText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 10,
    color: Colors.primary,
    textTransform: "capitalize",
  },
  convTime: {
    fontFamily: "Outfit_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
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
});