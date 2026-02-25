import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
  Platform, Image, ActivityIndicator, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/context/auth";
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
  sender_nombre: string;
  sender_apellido: string;
}

function formatTime(str: string) {
  const d = new Date(str);
  return d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

interface BubbleProps {
  message: Message;
  isMe: boolean;
}

function MessageBubble({ message, isMe }: BubbleProps) {
  return (
    <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowOther]}>
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
        {message.tipo === "imagen" && message.media_url ? (
          <Image
            source={{ uri: message.media_url }}
            style={styles.msgImage}
            resizeMode="cover"
          />
        ) : null}
        {message.contenido ? (
          <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextOther]}>
            {message.contenido}
          </Text>
        ) : null}
        <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : styles.bubbleTimeOther]}>
          {formatTime(message.created_at)}
          {isMe && message.leido ? " " : ""}
          {isMe && <Ionicons name={message.leido ? "checkmark-done" : "checkmark"} size={12} color={isMe ? "rgba(0,0,0,0.4)" : Colors.textMuted} />}
        </Text>
      </View>
    </View>
  );
}

export default function ChatDetailScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id, nombre } = useLocalSearchParams<{ id: string; nombre: string }>();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const flatRef = useRef<FlatList>(null);

  const { data, refetch } = useQuery({
    queryKey: ["/api/chat", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/chat/${id}`);
      return res.json();
    },
    refetchInterval: 3000,
  });

  const sendMutation = useMutation({
    mutationFn: async (payload: { contenido?: string; tipo?: string; mediaUrl?: string }) => {
      const res = await apiRequest("POST", "/api/chat", {
        receiverId: id,
        ...payload,
      });
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
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const name = asset.fileName || "photo.jpg";
      const type = asset.mimeType || "image/jpeg";
      const formData = new FormData();
      const fileObj = new File([{ uri: asset.uri } as any], name, { type });
      formData.append("file", fileObj as any);
      const baseUrl = getApiUrl();
      const uploadUrl = new URL("/api/upload", baseUrl).toString();
      const res = await expoFetch(uploadUrl, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const uploadData = await res.json();
      if (!res.ok) throw new Error(uploadData.message);
      sendMutation.mutate({ tipo: "imagen", mediaUrl: uploadData.url });
    } catch (err: any) {
      console.error("Upload error:", err);
    } finally {
      setUploading(false);
    }
  };

  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
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
            <Text style={styles.headerAvatarText}>
              {(nombre || "?")[0].toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.headerName} numberOfLines={1}>{nombre}</Text>
            <Text style={styles.headerStatus}>En línea</Text>
          </View>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatRef}
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

      {/* Input */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 8) }]}>
        <Pressable
          style={({ pressed }) => [styles.mediaBtn, pressed && { opacity: 0.7 }]}
          onPress={handlePickMedia}
          disabled={uploading || sendMutation.isPending}
        >
          {uploading ? (
            <ActivityIndicator color={Colors.primary} size="small" />
          ) : (
            <Ionicons name="image" size={22} color={Colors.textSecondary} />
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
          <Ionicons name="send" size={18} color={Colors.primaryText} />
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
  headerStatus: {
    fontFamily: "Outfit_400Regular",
    fontSize: 12,
    color: Colors.success,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexGrow: 1,
  },
  bubbleRow: {
    marginBottom: 8,
  },
  bubbleRowMe: {
    alignItems: "flex-end",
  },
  bubbleRowOther: {
    alignItems: "flex-start",
  },
  bubble: {
    maxWidth: "75%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    paddingBottom: 6,
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
  msgImage: {
    width: 200,
    height: 150,
    borderRadius: 12,
    marginBottom: 4,
  },
  bubbleText: {
    fontFamily: "Outfit_400Regular",
    fontSize: 15,
    lineHeight: 22,
  },
  bubbleTextMe: {
    color: Colors.primaryText,
  },
  bubbleTextOther: {
    color: Colors.text,
  },
  bubbleTime: {
    fontFamily: "Outfit_400Regular",
    fontSize: 11,
    marginTop: 4,
    textAlign: "right",
  },
  bubbleTimeMe: {
    color: "rgba(0,0,0,0.45)",
  },
  bubbleTimeOther: {
    color: Colors.textMuted,
  },
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
  sendBtnDisabled: {
    backgroundColor: Colors.border,
  },
});
