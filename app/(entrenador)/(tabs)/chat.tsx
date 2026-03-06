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

// Configuración para que las notificaciones suenen y se muestren como alerta
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

export default function ChatListScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["chats_list_trainer", user?.id],
    queryFn: async () => {
      if (!user?.id) return { conversations: [] };

      // 1. Obtener los clientes vinculados a este entrenador
      const { data: clientsData, error: clientsError } = await supabase
        .from("perfiles")
        .select("*")
        .eq("rol", "cliente")
        .eq("entrenador_id", user.id);

      if (clientsError) throw new Error(clientsError.message);
      
      const clients = clientsData || [];

      // 2. Obtener TODOS los mensajes donde participe el entrenador
      const { data: messagesData, error: msgError } = await supabase
        .from("mensajes")
        .select("*")
        .or(`emisor_id.eq.${user.id},receptor_id.eq.${user.id}`)
        .order("created_at", { ascending: false });

      if (msgError) throw new Error(msgError.message);

      const messages = messagesData || [];

      // 3. Crear la lista final de conversaciones basándonos en los CLIENTES
      const finalConversations = clients.map(client => {
        // Buscar si hay mensajes con este cliente específico
        const clientMessages = messages.filter(
          m => (m.emisor_id === client.id && m.receptor_id === user.id) || 
               (m.emisor_id === user.id && m.receptor_id === client.id)
        );

        let lastMsg = null;
        let unreadCount = 0;

        if (clientMessages.length > 0) {
          lastMsg = clientMessages[0]; // El más reciente (ya vienen ordenados)
          unreadCount = clientMessages.filter(m => m.receptor_id === user.id && !m.leido).length;
        }

        return {
          other_id: client.id,
          nombre: client.nombre,
          apellido: client.apellido,
          avatar_url: client.avatar_url,
          last_msg: lastMsg?.texto,
          last_tipo: lastMsg?.tipo,
          last_at: lastMsg?.created_at,
          unread_count: unreadCount,
        };
      });

      // Ordenar: primero los que tienen mensajes (más recientes arriba), luego los que no
      finalConversations.sort((a, b) => {
        if (!a.last_at && !b.last_at) return 0;
        if (!a.last_at) return 1;
        if (!b.last_at) return -1;
        return new Date(b.last_at).getTime() - new Date(a.last_at).getTime();
      });

      return { conversations: finalConversations };
    },
    enabled: !!user?.id,
  });

  // --- ESCUCHAR MENSAJES EN TIEMPO REAL ---
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('nuevos-mensajes-entrenador')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensajes', filter: `receptor_id=eq.${user.id}` },
        (payload) => {
          const nuevoMensaje = payload.new;
          
          Notifications.scheduleNotificationAsync({
            content: {
              title: "¡Nuevo mensaje!",
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
        <Text style={styles.subtitle}>{conversations.length} pacientes</Text>
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
              <Ionicons name="chatbubbles-outline" size={56} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>Sin mensajes</Text>
              <Text style={styles.emptySubtitle}>
                Agrega pacientes para poder chatear con ellos
              </Text>
            </View>
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
                  <Text style={[
                    styles.convPreview, 
                    Number(item.unread_count) > 0 && { color: Colors.text, fontFamily: "Outfit_600SemiBold" }
                  ]} numberOfLines={1}>
                    {item.last_tipo === "imagen" 
                      ? "📷 Imagen" 
                      : item.last_tipo === "video" 
                        ? "🎥 Video" 
                        : item.last_msg || "Toca para iniciar conversación"}
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
});