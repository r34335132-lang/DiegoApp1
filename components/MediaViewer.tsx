import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, Modal, Pressable,
  Dimensions, Platform, ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export function getMediaType(url: string): "gif" | "video" | "image" {
  if (!url) return "image";
  const lower = url.toLowerCase().split("?")[0];
  if (lower.endsWith(".gif")) return "gif";
  if (
    lower.endsWith(".mp4") ||
    lower.endsWith(".mov") ||
    lower.endsWith(".avi") ||
    lower.endsWith(".webm")
  )
    return "video";
  return "image";
}

interface InlineVideoProps {
  uri: string;
  style?: object;
  compact?: boolean;
}

export function InlineVideo({ uri, style, compact = false }: InlineVideoProps) {
  const videoRef = useRef<VideoView>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = false;
    p.muted = false;
  });

  useEffect(() => {
    const playingSub = player.addListener("playingChange", ({ isPlaying: playing }) => {
      setIsPlaying(playing);
    });
    const timeSub = player.addListener("timeUpdate", ({ currentTime }) => {
      setIsReady(true);
      const dur = player.duration;
      if (dur && dur > 0) {
        setProgress(currentTime / dur);
      }
    });
    const endSub = player.addListener("playToEnd", () => {
      setIsPlaying(false);
      setProgress(0);
      player.currentTime = 0;
    });
    const statusSub = player.addListener("statusChange", ({ status }) => {
      if (status === "readyToPlay") setIsReady(true);
    });

    return () => {
      playingSub.remove();
      timeSub.remove();
      endSub.remove();
      statusSub.remove();
    };
  }, [player]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  }, [player, isPlaying]);

  const openFullscreen = useCallback(async () => {
    try {
      await videoRef.current?.enterFullscreen();
    } catch {}
  }, []);

  const controlH = compact ? 32 : 40;

  return (
    <View style={[styles.videoContainer, style]}>
      <VideoView
        ref={videoRef}
        player={player}
        style={styles.videoElement}
        contentFit="contain"
        nativeControls={false}
      />

      {!isReady && (
        <View style={styles.bufferingOverlay}>
          <ActivityIndicator color={Colors.primary} size={compact ? "small" : "large"} />
        </View>
      )}

      {!isPlaying && isReady && (
        <Pressable style={styles.bigPlayOverlay} onPress={togglePlay}>
          <View style={styles.bigPlayBtn}>
            <Ionicons name="play" size={compact ? 22 : 32} color="#fff" />
          </View>
        </Pressable>
      )}

      <View style={[styles.controls, { height: controlH }]}>
        <Pressable
          style={[styles.controlBtn, { width: controlH, height: controlH }]}
          onPress={togglePlay}
        >
          <Ionicons
            name={isPlaying ? "pause" : "play"}
            size={compact ? 14 : 16}
            color="#fff"
          />
        </Pressable>

        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.min(progress * 100, 100)}%` as any },
            ]}
          />
        </View>

        <Pressable
          style={[styles.controlBtn, { width: controlH, height: controlH }]}
          onPress={openFullscreen}
        >
          <Ionicons name="expand" size={compact ? 13 : 15} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

interface MediaViewerProps {
  uri: string;
  isVideo?: boolean;
  thumbnailStyle?: object;
  style?: object;
}

export function MediaViewer({
  uri,
  isVideo,
  thumbnailStyle,
  style,
}: MediaViewerProps) {
  const [expanded, setExpanded] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);

  const mediaType = isVideo === true ? "video" : getMediaType(uri);

  if (mediaType === "video") {
    return (
      <View style={[styles.videoWrapper, thumbnailStyle, style]}>
        <InlineVideo uri={uri} />
      </View>
    );
  }

  return (
    <>
      <Pressable
        style={[styles.imgWrapper, thumbnailStyle, style]}
        onPress={() => setExpanded(true)}
      >
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
        {mediaType === "gif" && (
          <View style={styles.gifBadge}>
            <Text style={styles.gifBadgeText}>GIF</Text>
          </View>
        )}
      </Pressable>

      <Modal
        visible={expanded}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setExpanded(false)}
      >
        <View style={styles.lightbox}>
          <Pressable
            style={styles.lightboxClose}
            onPress={() => setExpanded(false)}
          >
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
  tipo?: string;
  isVideo?: boolean;
  isMe: boolean;
}

export function ChatMedia({ uri, tipo, isVideo }: ChatMediaProps) {
  const [expanded, setExpanded] = useState(false);

  const mediaType =
    isVideo === true || tipo === "video"
      ? "video"
      : tipo === "gif" || getMediaType(uri) === "gif"
      ? "gif"
      : "image";

  if (mediaType === "video") {
    return (
      <View style={styles.chatVideoWrapper}>
        <InlineVideo uri={uri} compact style={styles.chatVideoInner} />
      </View>
    );
  }

  return (
    <>
      <Pressable style={styles.chatImageWrapper} onPress={() => setExpanded(true)}>
        <Image
          source={{ uri }}
          style={styles.chatImage}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
        {mediaType === "gif" && (
          <View style={styles.gifBadge}>
            <Text style={styles.gifBadgeText}>GIF</Text>
          </View>
        )}
        <View style={styles.expandBtn}>
          <Ionicons name="expand" size={13} color="#fff" />
        </View>
      </Pressable>

      <Modal
        visible={expanded}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setExpanded(false)}
      >
        <View style={styles.lightbox}>
          <Pressable
            style={styles.lightboxClose}
            onPress={() => setExpanded(false)}
          >
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

interface UploadProgressBarProps {
  progress: number;
  visible: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function UploadProgressBar({
  progress,
  visible,
  error,
  onRetry,
}: UploadProgressBarProps) {
  if (!visible && !error) return null;

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={16} color={Colors.error} />
        <Text style={styles.errorText} numberOfLines={2}>
          {error}
        </Text>
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
  videoWrapper: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  videoContainer: {
    width: "100%",
    minHeight: 180,
    backgroundColor: "#0a0a0a",
    borderRadius: 12,
    overflow: "hidden",
  },
  videoElement: {
    width: "100%",
    height: 180,
  },
  bufferingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    bottom: 40,
  },
  bigPlayOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  bigPlayBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 4,
    gap: 4,
  },
  controlBtn: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
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
  gifBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  gifBadgeText: {
    fontSize: 10,
    color: Colors.primary,
    fontFamily: "Outfit_700Bold",
    letterSpacing: 0.5,
  },
  chatVideoWrapper: {
    borderRadius: 12,
    overflow: "hidden",
    marginVertical: 2,
    width: 240,
  },
  chatVideoInner: {
    minHeight: 150,
  },
  chatImageWrapper: {
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  chatImage: {
    width: 200,
    height: 150,
    borderRadius: 12,
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
