import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
  Platform, ActivityIndicator, KeyboardAvoidingView, Alert
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/auth";
import { useUpload } from "@/hooks/useUpload";
import { ChatMedia, UploadProgressBar } from "@/components/MediaViewer";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";

interface Message {
  id: string;
  emisor_id: string;
  receptor_id: string;
  texto: string | null;
  tipo: string;
  media_url: string | null;
  leido: boolean;
  created_at: string;
}

function formatTime(str: string) {
  return new Date(str).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

function MessageBubble({ message, isMe }: { message: Message; isMe: boolean }) {
  const isImage = message.tipo === "imagen";
  const isVideo = message.tipo === "video";
  const isGif = message.tipo === "gif";
  const hasMedia = (isImage || isVideo || isGif) && !!message.media_url;

  return (
    <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowOther]}>
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther, hasMedia && styles.bubbleMedia]}>
        
        {/* Renderizar Imagen/Video */}
        {hasMedia ? (
          <ChatMedia uri={message.media_url!} tipo={message.tipo} isMe={isMe} />
        ) : null}
        
        {/* Renderizar Texto */}
        {message.texto ? (
          <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextOther]}>
            {message.texto}
          </Text>
        ) : null}
        
        <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : styles.bubbleTimeOther]}>
          {formatTime(message.created_at)}
          {isMe && (
            <Ionicons
              name={message.leido ? "checkmark-done" : "checkmark"}
              size={12}
              color={isMe ? "rgba(0,0,0,0.4)" : Colors.textMuted}
            />
          )}
        </Text>
      </View>
    </View>
  );
}

export default function ChatDetailScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id: otherId, nombre } = useLocalSearchParams<{ id: string; nombre: string }>();
  const qc = useQueryClient();
  
  const [text, setText] = useState("");
  const { uploading, progress, error: uploadError, pickAndUpload, reset: resetUpload } = useUpload();

  // 1. OBTENER MENSAJES INICIALES
  const { data } = useQuery({
    queryKey: ["chat_messages", user?.id, otherId],
    enabled: !!user?.id && !!otherId,
    queryFn: async () => {
      // Marcar los mensajes entrantes como leídos
      await supabase
        .from("mensajes")
        .update({ leido: true })
        .eq("emisor_id", otherId)
        .eq("receptor_id", user?.id)
        .eq("leido", false);

      const { data, error } = await supabase
        .from("mensajes")
        .select("*")
        .or(`and(emisor_id.eq.${user?.id},receptor_id.eq.${otherId}),and(emisor_id.eq.${otherId},receptor_id.eq.${user?.id})`)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);
      return data as Message[];
    },
  });

  // 2. ENVIAR UN MENSAJE 
  const sendMutation = useMutation({
    mutationFn: async (payload: { texto?: string; tipo?: string; media_url?: string }) => {
      if (!user?.id || !otherId) throw new Error("Faltan datos de usuario");

      const { data: insertedData, error } = await supabase
        .from("mensajes")
        .insert([{
          emisor_id: user.id,
          receptor_id: otherId,
          texto: payload.texto || null,
          tipo: payload.tipo || "texto",
          media_url: payload.media_url || null,
        }])
        .select()
        .single();

      if (error) throw new Error(error.message);
      if (!insertedData) throw new Error("Error al enviar el mensaje.");
      
      return insertedData;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat_messages", user?.id, otherId] });
      qc.invalidateQueries({ queryKey: ["chats_list_trainer", user?.id] });
      qc.invalidateQueries({ queryKey: ["client_chats_preview", user?.id] });
      qc.invalidateQueries({ queryKey: ["client_chats_list", user?.id] });
      setText("");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    onError: (err: any) => {
      Alert.alert("Error al enviar", err.message || "Ocurrió un problema");
    }
  });

  // 3. ESCUCHAR MENSAJES EN TIEMPO REAL
  useEffect(() => {
    if (!user?.id || !otherId) return;

    const channel = supabase
      .channel('chat_room_detail')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensajes' },
        (payload) => {
          const msg = payload.new as Message;
          if (
            (msg.emisor_id === user.id && msg.receptor_id === otherId) || 
            (msg.emisor_id === otherId && msg.receptor_id === user.id)
          ) {
            qc.invalidateQueries({ queryKey: ["chat_messages", user?.id, otherId] });
            if (msg.emisor_id === otherId) {
              supabase.from("mensajes").update({ leido: true }).eq("id", msg.id).then();
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'mensajes' },
        () => {
           qc.invalidateQueries({ queryKey: ["chat_messages", user?.id, otherId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, otherId]);

  const messages = data || [];

  const handleSend = () => {
    const t = text.trim();
    if (!t) return;
    sendMutation.mutate({ texto: t, tipo: "texto" });
  };

  const handlePickMedia = async () => {
    const result = await pickAndUpload("images");
    if (!result) return;
    
    // Aquí es donde mandamos el mensaje que es una imagen
    sendMutation.mutate({
      tipo: "imagen",
      media_url: result.url, // Esta URL es la de la imagen en Storage
    });
    resetUpload();
  };

  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 8);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>{(nombre || "?")[0].toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.headerName} numberOfLines={1}>{nombre}</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        showsVerticalScrollIndicator={false}
        inverted
        renderItem={({ item }) => (
          <MessageBubble message={item} isMe={item.emisor_id === user?.id} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Ionicons name="chatbubble-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyChatText}>Inicia la conversación</Text>
          </View>
        }
      />

      {(uploading || !!uploadError) && (
        <View style={styles.uploadBar}>
          {uploading && <ActivityIndicator color={Colors.primary} size="small" />}
          <View style={{ flex: 1 }}>
            <UploadProgressBar
              progress={progress}
              visible={uploading}
              error={uploadError}
              onRetry={uploadError ? () => { resetUpload(); handlePickMedia(); } : undefined}
            />
            {uploading && (
              <Text style={styles.uploadText}>Subiendo archivo... {progress}%</Text>
            )}
          </View>
        </View>
      )}

      <View style={[styles.inputBar, { paddingBottom: bottomPad }]}>
        <Pressable
          style={({ pressed }) => [styles.mediaBtn, pressed && { opacity: 0.7 }]}
          onPress={handlePickMedia}
          disabled={uploading || sendMutation.isPending}
        >
          {uploading ? (
            <ActivityIndicator color={Colors.primary} size="small" />
          ) : (
            <Ionicons name="attach" size={22} color={Colors.textSecondary} />
          )}
        </Pressable>

        <TextInput
          style={styles.textInput}
          placeholder="Escribe un mensaje..."
          placeholderTextColor={Colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={1000}
        />

        <Pressable
          style={({ pressed }) => [
            styles.sendBtn,
            (!text.trim() || sendMutation.isPending) && styles.sendBtnDisabled,
            pressed && { opacity: 0.8 },
          ]}
          onPress={handleSend}
          disabled={!text.trim() || sendMutation.isPending}
        >
          {sendMutation.isPending ? (
            <ActivityIndicator color={Colors.primaryText} size="small" />
          ) : (
            <Ionicons name="send" size={18} color={Colors.primaryText} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primary + "33",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.primary + "44",
  },
  headerAvatarText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 14,
    color: Colors.primary,
  },
  headerName: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  },
  headerSub: {
    fontFamily: "Outfit_400Regular",
    fontSize: 12,
    color: Colors.primary,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexGrow: 1,
  },
  bubbleRow: { marginBottom: 8 },
  bubbleRowMe: { alignItems: "flex-end" },
  bubbleRowOther: { alignItems: "flex-start" },
  bubble: {
    maxWidth: "78%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    paddingBottom: 6,
  },
  bubbleMedia: {
    paddingHorizontal: 6,
    paddingTop: 6,
  },
  bubbleMe: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: Colors.card,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bubbleText: {
    fontFamily: "Outfit_400Regular",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 4,
  },
  bubbleTextMe: { color: Colors.primaryText },
  bubbleTextOther: { color: Colors.text },
  bubbleTime: {
    fontFamily: "Outfit_400Regular",
    fontSize: 11,
    marginTop: 4,
    textAlign: "right",
  },
  bubbleTimeMe: { color: "rgba(0,0,0,0.45)" },
  bubbleTimeOther: { color: Colors.textMuted },
  emptyChat: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 40,
    gap: 12,
    transform: [{ scaleY: -1 }],
  },
  emptyChatText: {
    fontFamily: "Outfit_400Regular",
    fontSize: 15,
    color: Colors.textMuted,
  },
  uploadBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  uploadText: {
    fontFamily: "Outfit_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    flex: 1,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
    gap: 10,
  },
  mediaBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  textInput: {
    flex: 1,
    fontFamily: "Outfit_400Regular",
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 120,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
  },
  sendBtnDisabled: { backgroundColor: Colors.border },
});