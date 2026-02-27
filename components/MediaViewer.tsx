import React, { useState } from "react";
import {
  View, Text, StyleSheet, Modal, Pressable,
  Dimensions, Platform, Linking, ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

interface MediaViewerProps {
  uri: string;
  isVideo?: boolean;
  thumbnailStyle?: object;
  style?: object;
}

export function MediaViewer({ uri, isVideo = false, thumbnailStyle, style }: MediaViewerProps) {
  const [expanded, setExpanded] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);

  const openVideo = async () => {
    try {
      await Linking.openURL(uri);
    } catch {}
  };

  if (isVideo) {
    return (
      <Pressable
        style={[styles.videoThumb, thumbnailStyle, style]}
        onPress={openVideo}
      >
        <View style={styles.videoOverlay}>
          <View style={styles.playBtn}>
            <Ionicons name="play" size={24} color="#fff" />
          </View>
        </View>
        <View style={styles.videoLabel}>
          <Ionicons name="videocam" size={12} color="#fff" />
          <Text style={styles.videoLabelText}>Video</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <>
      <Pressable style={[styles.imgWrapper, thumbnailStyle, style]} onPress={() => setExpanded(true)}>
        <Image
          source={{ uri }}
          style={styles.thumbImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          onLoadStart={() => setImgLoading(true)}
          onLoadEnd={() => setImgLoading(false)}
        />
        {imgLoading && (
          <View style={styles.imgLoader}>
            <ActivityIndicator color={Colors.primary} size="small" />
          </View>
        )}
        <View style={styles.expandBtn}>
          <Ionicons name="expand" size={14} color="#fff" />
        </View>
      </Pressable>

      <Modal visible={expanded} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setExpanded(false)}>
        <View style={styles.lightbox}>
          <Pressable style={styles.lightboxClose} onPress={() => setExpanded(false)}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          <Image
            source={{ uri }}
            style={styles.lightboxImage}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
        </View>
      </Modal>
    </>
  );
}

interface ChatMediaProps {
  uri: string;
  isVideo?: boolean;
  isMe: boolean;
}

export function ChatMedia({ uri, isVideo = false, isMe }: ChatMediaProps) {
  const openVideo = async () => {
    try {
      await Linking.openURL(uri);
    } catch {}
  };

  if (isVideo) {
    return (
      <Pressable style={styles.chatVideoThumb} onPress={openVideo}>
        <View style={styles.chatVideoOverlay}>
          <View style={styles.playBtn}>
            <Ionicons name="play" size={20} color="#fff" />
          </View>
        </View>
        <View style={styles.videoLabel}>
          <Ionicons name="videocam" size={11} color="#fff" />
          <Text style={styles.videoLabelText}>Video — Toca para ver</Text>
        </View>
      </Pressable>
    );
  }

  return <MediaViewer uri={uri} thumbnailStyle={styles.chatImage} />;
}

interface UploadProgressBarProps {
  progress: number;
  visible: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function UploadProgressBar({ progress, visible, error, onRetry }: UploadProgressBarProps) {
  if (!visible && !error) return null;

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={16} color={Colors.error} />
        <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
        {onRetry && (
          <Pressable
            style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]}
            onPress={onRetry}
          >
            <Ionicons name="refresh" size={14} color={Colors.primary} />
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.progressWrapper}>
      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { width: `${progress}%` as any }]} />
      </View>
      <Text style={styles.progressText}>{progress}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  imgWrapper: {
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  imgLoader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
  },
  expandBtn: {
    position: "absolute",
    bottom: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoThumb: {
    borderRadius: 12,
    backgroundColor: "#1a1a2e",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    minHeight: 120,
    position: "relative",
  },
  videoOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 120,
  },
  chatVideoThumb: {
    borderRadius: 12,
    backgroundColor: "#1a1a2e",
    alignItems: "center",
    justifyContent: "center",
    width: 200,
    height: 130,
    position: "relative",
    overflow: "hidden",
  },
  chatVideoOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  playBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoLabel: {
    position: "absolute",
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  videoLabelText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.8)",
    fontFamily: "Outfit_500Medium",
  },
  chatImage: {
    width: 200,
    height: 150,
  },
  lightbox: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  lightboxClose: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 24,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  lightboxImage: {
    width: SCREEN_W,
    height: SCREEN_H * 0.8,
  },
  progressWrapper: {
    marginVertical: 6,
  },
  progressContainer: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  progressText: {
    fontFamily: "Outfit_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 3,
    textAlign: "right",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(239,68,68,0.1)",
    borderRadius: 8,
    padding: 8,
    marginVertical: 6,
    flexWrap: "wrap",
  },
  errorText: {
    flex: 1,
    fontFamily: "Outfit_400Regular",
    fontSize: 12,
    color: Colors.error,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.card,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  retryText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
    color: Colors.primary,
  },
});
