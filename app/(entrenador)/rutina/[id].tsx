import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  Platform, Modal, ActivityIndicator, Image,
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
import * as Haptics from "expo-haptics";

export default function RutinaDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [series, setSeries] = useState("3");
  const [reps, setReps] = useState("10");
  const [peso, setPeso] = useState("");
  const [descanso, setDescanso] = useState("60s");
  const [imagenUrl, setImagenUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");

  const { data, refetch } = useQuery({
    queryKey: ["/api/routines", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/routines/${id}`);
      return res.json();
    },
  });

  const addExMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/exercises", {
        routineId: id,
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
        series: Number(series) || 3,
        repeticiones: reps,
        peso: peso || undefined,
        descanso,
        imagenUrl: imagenUrl || undefined,
        orden: (data?.exercises?.length || 0),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/routines", id] });
      setShowModal(false);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: any) => setError(err.message || "Error al agregar"),
  });

  const deleteExMutation = useMutation({
    mutationFn: async (exId: string) => {
      const res = await apiRequest("DELETE", `/api/exercises/${exId}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/routines", id] });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
  });

  const resetForm = () => {
    setNombre(""); setDescripcion(""); setSeries("3"); setReps("10");
    setPeso(""); setDescanso("60s"); setImagenUrl(""); setError("");
  };

  const pickMedia = async (type: "images" | "videos") => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: type,
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    setUploadProgress(0);
    try {
      const asset = result.assets[0];
      const name = asset.fileName || (type === "images" ? "exercise.jpg" : "exercise.mp4");
      const mimeType = asset.mimeType || (type === "images" ? "image/jpeg" : "video/mp4");
      const formData = new FormData();
      const fileObj = new File([{ uri: asset.uri } as any], name, { type: mimeType });
      formData.append("file", fileObj as any);

      const baseUrl = getApiUrl();
      const uploadUrl = new URL("/api/upload", baseUrl).toString();

      let progress = 0;
      const interval = setInterval(() => {
        progress = Math.min(progress + 20, 90);
        setUploadProgress(progress);
      }, 200);

      const res = await expoFetch(uploadUrl, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      clearInterval(interval);
      setUploadProgress(100);

      const uploadData = await res.json();
      if (!res.ok) throw new Error(uploadData.message);
      setImagenUrl(uploadData.url);
    } catch (err: any) {
      setError("Error al subir: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const routine = data?.routine;
  const exercises = data?.exercises || [];
  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);

  if (!routine) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topInset + 8 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.pageHeader}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]}
            onPress={() => setShowModal(true)}
          >
            <Ionicons name="add" size={22} color={Colors.primaryText} />
          </Pressable>
        </View>

        {/* Routine Info */}
        <View style={styles.routineInfo}>
          <Text style={styles.routineName}>{routine.nombre}</Text>
          {routine.descripcion ? (
            <Text style={styles.routineDesc}>{routine.descripcion}</Text>
          ) : null}
          <View style={styles.metaRow}>
            <View style={styles.nivelBadge}>
              <Text style={styles.nivelText}>{routine.nivel}</Text>
            </View>
            <Text style={styles.exerciseCount}>{exercises.length} ejercicios</Text>
          </View>
        </View>

        {/* Exercises */}
        {exercises.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="barbell-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Sin ejercicios</Text>
            <Text style={styles.emptySubtitle}>Agrega ejercicios a esta rutina</Text>
            <Pressable style={styles.emptyBtn} onPress={() => setShowModal(true)}>
              <Text style={styles.emptyBtnText}>Agregar ejercicio</Text>
            </Pressable>
          </View>
        ) : (
          exercises.map((ex: any, idx: number) => (
            <View key={ex.id} style={styles.exerciseCard}>
              <View style={styles.exHeader}>
                <View style={styles.exNum}>
                  <Text style={styles.exNumText}>{idx + 1}</Text>
                </View>
                <Text style={styles.exName}>{ex.nombre}</Text>
                <Pressable
                  style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
                  onPress={() => deleteExMutation.mutate(ex.id)}
                >
                  <Ionicons name="trash-outline" size={16} color={Colors.error} />
                </Pressable>
              </View>

              {ex.descripcion ? (
                <Text style={styles.exDesc}>{ex.descripcion}</Text>
              ) : null}

              <View style={styles.exStats}>
                <View style={styles.exStat}>
                  <Ionicons name="repeat" size={14} color={Colors.primary} />
                  <Text style={styles.exStatText}>{ex.series} series</Text>
                </View>
                <View style={styles.exStat}>
                  <Ionicons name="fitness" size={14} color={Colors.accentBlue} />
                  <Text style={styles.exStatText}>{ex.repeticiones} reps</Text>
                </View>
                {ex.peso && (
                  <View style={styles.exStat}>
                    <Ionicons name="barbell" size={14} color={Colors.accentOrange} />
                    <Text style={styles.exStatText}>{ex.peso}</Text>
                  </View>
                )}
                <View style={styles.exStat}>
                  <Ionicons name="timer" size={14} color={Colors.textMuted} />
                  <Text style={styles.exStatText}>{ex.descanso}</Text>
                </View>
              </View>

              {ex.imagen_url ? (
                <Image
                  source={{ uri: ex.imagen_url }}
                  style={styles.exImage}
                  resizeMode="cover"
                />
              ) : null}
            </View>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Add Exercise Modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => { setShowModal(false); resetForm(); }}>
        <Pressable style={styles.overlay} onPress={() => { setShowModal(false); resetForm(); }} />
        <ScrollView
          style={[styles.modal, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Nuevo Ejercicio</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Nombre del ejercicio *</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.modalInput}
              placeholder="Ej: Sentadilla con barra"
              placeholderTextColor={Colors.textMuted}
              value={nombre}
              onChangeText={(t) => { setNombre(t); setError(""); }}
            />
          </View>

          <Text style={styles.label}>Descripción (opcional)</Text>
          <View style={[styles.inputContainer, { alignItems: "flex-start" }]}>
            <TextInput
              style={[styles.modalInput, { height: 60, textAlignVertical: "top" }]}
              placeholder="Técnica y consejos..."
              placeholderTextColor={Colors.textMuted}
              value={descripcion}
              onChangeText={setDescripcion}
              multiline
            />
          </View>

          <View style={styles.statsRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Series</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.modalInput}
                  placeholder="3"
                  placeholderTextColor={Colors.textMuted}
                  value={series}
                  onChangeText={setSeries}
                  keyboardType="number-pad"
                />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Reps</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.modalInput}
                  placeholder="10"
                  placeholderTextColor={Colors.textMuted}
                  value={reps}
                  onChangeText={setReps}
                />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Peso</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.modalInput}
                  placeholder="60 kg"
                  placeholderTextColor={Colors.textMuted}
                  value={peso}
                  onChangeText={setPeso}
                />
              </View>
            </View>
          </View>

          <Text style={styles.label}>Descanso</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.modalInput}
              placeholder="60s"
              placeholderTextColor={Colors.textMuted}
              value={descanso}
              onChangeText={setDescanso}
            />
          </View>

          <Text style={styles.label}>Imagen / Video</Text>
          <View style={styles.mediaRow}>
            <Pressable
              style={({ pressed }) => [styles.mediaBtn, pressed && { opacity: 0.8 }]}
              onPress={() => pickMedia("images")}
              disabled={uploading}
            >
              <Ionicons name="image" size={20} color={Colors.primary} />
              <Text style={styles.mediaBtnText}>Imagen</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.mediaBtn, pressed && { opacity: 0.8 }]}
              onPress={() => pickMedia("videos")}
              disabled={uploading}
            >
              <Ionicons name="videocam" size={20} color={Colors.accentBlue} />
              <Text style={[styles.mediaBtnText, { color: Colors.accentBlue }]}>Video</Text>
            </Pressable>
          </View>
          {uploading && (
            <View style={styles.uploadProgress}>
              <ActivityIndicator color={Colors.primary} size="small" />
              <Text style={styles.uploadText}>Subiendo... {uploadProgress}%</Text>
            </View>
          )}
          {imagenUrl ? (
            <View style={styles.uploadSuccess}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
              <Text style={[styles.uploadText, { color: Colors.success }]}>Archivo subido</Text>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.confirmBtn,
              (addExMutation.isPending || uploading) && styles.btnDisabled,
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => {
              if (!nombre.trim()) return setError("El nombre es requerido");
              addExMutation.mutate();
            }}
            disabled={addExMutation.isPending || uploading}
          >
            {addExMutation.isPending ? (
              <ActivityIndicator color={Colors.primaryText} />
            ) : (
              <Text style={styles.confirmBtnText}>Agregar Ejercicio</Text>
            )}
          </Pressable>

          <Pressable style={styles.cancelBtn} onPress={() => { setShowModal(false); resetForm(); }}>
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </Pressable>

          <View style={{ height: 40 }} />
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20 },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtn: {
    backgroundColor: Colors.primary,
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  routineInfo: {
    marginBottom: 24,
  },
  routineName: {
    fontFamily: "Outfit_700Bold",
    fontSize: 28,
    color: Colors.text,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  routineDesc: {
    fontFamily: "Outfit_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  nivelBadge: {
    backgroundColor: Colors.primary + "22",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  nivelText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 13,
    color: Colors.primary,
    textTransform: "capitalize",
  },
  exerciseCount: {
    fontFamily: "Outfit_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 40,
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
  },
  emptyBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  emptyBtnText: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 15,
    color: Colors.primaryText,
  },
  exerciseCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  exHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 10,
  },
  exNum: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.primary + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  exNumText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 13,
    color: Colors.primary,
  },
  exName: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 16,
    color: Colors.text,
    flex: 1,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.error + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  exDesc: {
    fontFamily: "Outfit_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 10,
    lineHeight: 20,
  },
  exStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  exStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  exStatText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  exImage: {
    width: "100%",
    height: 160,
    borderRadius: 12,
    marginTop: 12,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  modal: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingTop: 16,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: Colors.border,
    borderBottomWidth: 0,
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
  },
  label: {
    fontFamily: "Outfit_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  inputContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  modalInput: {
    fontFamily: "Outfit_400Regular",
    fontSize: 16,
    color: Colors.text,
    paddingVertical: 12,
    flex: 1,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 0,
  },
  mediaRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  mediaBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.primary + "44",
    borderStyle: "dashed",
  },
  mediaBtnText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 14,
    color: Colors.primary,
  },
  uploadProgress: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  uploadSuccess: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  uploadText: {
    fontFamily: "Outfit_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
  },
  errorText: {
    fontFamily: "Outfit_400Regular",
    color: Colors.error,
    fontSize: 14,
    flex: 1,
  },
  confirmBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 10,
  },
  btnDisabled: { opacity: 0.6 },
  confirmBtnText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
    color: Colors.primaryText,
  },
  cancelBtn: {
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelBtnText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 16,
    color: Colors.textSecondary,
  },
});
