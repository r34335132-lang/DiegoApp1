import React, { useState, useRef } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
  Platform, ActivityIndicator, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/context/auth";
import { useUpload } from "@/hooks/useUpload";
import { ChatMedia, UploadProgressBar } from "@/components/MediaViewer";
import * as Haptics from "expo-haptics";

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  contenido: string | null;
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
  const hasMedia = (isImage || isVideo) && message.media_url;

  return (
    <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowOther]}>
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther, hasMedia && styles.bubbleMedia]}>
        {hasMedia ? (
          <ChatMedia uri={message.media_url!} isVideo={isVideo} isMe={isMe} />
        ) : null}
        {message.contenido ? (
          <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextOther]}>
            {message.contenido}
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

export default function EntrenadorChatDetailScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id, nombre } = useLocalSearchParams<{ id: string; nombre: string }>();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const { uploading, progress, pickAndUpload, reset: resetUpload } = useUpload();

  const { data } = useQuery({
    queryKey: ["/api/chat", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/chat/${id}`);
      return res.json();
    },
    refetchInterval: 3000,
    staleTime: 0,
    gcTime: 1000 * 60 * 10,
  });

  const sendMutation = useMutation({
    mutationFn: async (payload: { contenido?: string; tipo?: string; mediaUrl?: string }) => {
      const res = await apiRequest("POST", "/api/chat", { receiverId: id, ...payload });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/chat", id] });
      qc.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      setText("");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
  });

  const messages: Message[] = data?.messages || [];

  const handleSend = () => {
    const t = text.trim();
    if (!t) return;
    sendMutation.mutate({ contenido: t, tipo: "texto" });
  };

  const handlePickMedia = async () => {
    const result = await pickAndUpload("all");
    if (!result) return;
    sendMutation.mutate({
      tipo: result.isVideo ? "video" : "imagen",
      mediaUrl: result.url,
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
      {/* Header */}
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
            <Text style={styles.headerSub}>Cliente</Text>
          </View>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        data={[...messages].reverse()}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        showsVerticalScrollIndicator={false}
        inverted
        renderItem={({ item }) => (
          <MessageBubble message={item} isMe={item.sender_id === user?.id} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Ionicons name="chatbubble-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyChatText}>Inicia la conversación</Text>
          </View>
        }
      />

      {/* Upload progress */}
      {uploading && (
        <View style={styles.uploadBar}>
          <ActivityIndicator color={Colors.primary} size="small" />
          <Text style={styles.uploadText}>Subiendo archivo... {progress}%</Text>
          <UploadProgressBar progress={progress} visible />
        </View>
      )}

      {/* Input */}
      <View style={[styles.inputBar, { paddingBottom: bottomPad }]}>
        <Pressable
          style={({ pressed }) => [styles.mediaBtn, pressed && { opacity: 0.7 }]}
          onPress={handlePickMedia}
          disabled={uploading || sendMutation.isPending}
          testID="media-picker-btn"
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
          testID="message-input"
        />

        <Pressable
          style={({ pressed }) => [
            styles.sendBtn,
            (!text.trim() || sendMutation.isPending) && styles.sendBtnDisabled,
            pressed && { opacity: 0.8 },
          ]}
          onPress={handleSend}
          disabled={!text.trim() || sendMutation.isPending}
          testID="send-btn"
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
    backgroundColor: Colors.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerAvatarText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 14,
    color: Colors.text,
  },
  headerName: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  },
  headerSub: {
    fontFamily: "Outfit_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
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
