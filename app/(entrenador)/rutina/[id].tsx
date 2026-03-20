import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  Platform, Modal, ActivityIndicator, KeyboardAvoidingView
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useUpload } from "@/hooks/useUpload";
import { InlineVideo, UploadProgressBar } from "@/components/MediaViewer";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/context/auth";
import { supabase } from "@/lib/supabase";

export default function RutinaDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { user } = useAuth();
  
  // Modal Agregar Ejercicio
  const [showModal, setShowModal] = useState(false);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [series, setSeries] = useState("3");
  const [reps, setReps] = useState("10");
  const [peso, setPeso] = useState("");
  const [descanso, setDescanso] = useState("60s");
  const [imagenUrl, setImagenUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [error, setError] = useState("");

  // Modal Editar Rutina
  const [showEditModal, setShowEditModal] = useState(false);
  const [editNombre, setEditNombre] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editNivel, setEditNivel] = useState("");
  const [editClienteId, setEditClienteId] = useState<string | null>(null);

  const imgUpload = useUpload();
  const vidUpload = useUpload();

  // 1. OBTENER LA RUTINA Y SUS EJERCICIOS
  const { data, refetch } = useQuery({
    queryKey: ["routine_details", id],
    enabled: !!id,
    queryFn: async () => {
      const { data: routineData, error: routineError } = await supabase
        .from("rutinas")
        .select(`
          *,
          perfiles:cliente_id (nombre, apellido)
        `)
        .eq("id", id)
        .single();
        
      if (routineError) throw new Error(routineError.message);

      const { data: exercisesData, error: exercisesError } = await supabase
        .from("ejercicios")
        .select("*")
        .eq("rutina_id", id)
        .order("orden", { ascending: true });
        
      if (exercisesError) throw new Error(exercisesError.message);

      return { routine: routineData, exercises: exercisesData || [] };
    },
  });

  // 2. OBTENER PACIENTES DEL ENTRENADOR (Para el selector de asignar rutina)
  const { data: misClientes } = useQuery({
    queryKey: ["my_clients_for_assignment", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("perfiles")
        .select("id, nombre, apellido")
        .eq("rol", "cliente")
        .eq("entrenador_id", user?.id);
        
      if (error) throw new Error(error.message);
      return data || [];
    }
  });

  // Precargar datos al abrir modal de edición de rutina
  useEffect(() => {
    if (data?.routine && showEditModal) {
      setEditNombre(data.routine.nombre || "");
      setEditDesc(data.routine.descripcion || "");
      setEditNivel(data.routine.nivel || "Principiante");
      setEditClienteId(data.routine.cliente_id || null);
    }
  }, [showEditModal, data?.routine]);

  // MUTACIÓN PARA EDITAR RUTINA
  const editRoutineMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("rutinas")
        .update({
          nombre: editNombre.trim(),
          descripcion: editDesc.trim() || null,
          nivel: editNivel,
          cliente_id: editClienteId,
        })
        .eq("id", id);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routine_details", id] });
      qc.invalidateQueries({ queryKey: ["routines", user?.id] });
      qc.invalidateQueries({ queryKey: ["routines_index", user?.id] });
      setShowEditModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: any) => Alert.alert("Error", err.message || "No se pudo actualizar la rutina"),
  });

  // MUTACIÓN AGREGAR EJERCICIO
  const addExMutation = useMutation({
    mutationFn: async () => {
      const { error: insertError } = await supabase
        .from("ejercicios")
        .insert([{
          rutina_id: id,
          nombre: nombre.trim(),
          descripcion: descripcion.trim() || null,
          series: Number(series) || 3,
          repeticiones: reps,
          peso: peso || null,
          descanso,
          imagen_url: imagenUrl || null,
          video_url: videoUrl || null,
          orden: data?.exercises?.length || 0,
        }]);

      if (insertError) throw new Error(insertError.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routine_details", id] });
      setShowModal(false);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: any) => setError(err.message || "Error al agregar"),
  });

  // MUTACIÓN ELIMINAR EJERCICIO
  const deleteExMutation = useMutation({
    mutationFn: async (exId: string) => {
      const { error } = await supabase
        .from("ejercicios")
        .delete()
        .eq("id", exId);
        
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routine_details", id] });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
  });

  const resetForm = () => {
    setNombre(""); setDescripcion(""); setSeries("3"); setReps("10");
    setPeso(""); setDescanso("60s"); setImagenUrl(""); setVideoUrl(""); setError("");
    imgUpload.reset();
    vidUpload.reset();
  };

  const handlePickImage = async () => {
    imgUpload.reset();
    const result = await imgUpload.pickAndUpload("images");
    if (result) setImagenUrl(result.url);
  };

  const handlePickVideo = async () => {
    vidUpload.reset();
    const result = await vidUpload.pickAndUpload("videos");
    if (result) setVideoUrl(result.url);
  };

  const routine = data?.routine;
  const exercises = data?.exercises || [];
  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);
  const isUploading = imgUpload.uploading || vidUpload.uploading;

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
        <View style={styles.pageHeader}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </Pressable>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable
              style={({ pressed }) => [styles.editRoutineBtn, pressed && { opacity: 0.8 }]}
              onPress={() => setShowEditModal(true)}
            >
              <Ionicons name="pencil" size={20} color={Colors.text} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]}
              onPress={() => setShowModal(true)}
            >
              <Ionicons name="add" size={22} color={Colors.primaryText} />
            </Pressable>
          </View>
        </View>

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
          
          {/* Mostramos a quién está asignada la rutina */}
          <View style={styles.assignedBox}>
            <Ionicons name="person" size={16} color={Colors.textSecondary} />
            <Text style={styles.assignedText}>
              {routine.cliente_id 
                ? `Asignada a: ${routine.perfiles?.nombre || ''} ${routine.perfiles?.apellido || ''}`
                : "Plantilla (Sin asignar)"}
            </Text>
          </View>
        </View>

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
                <View style={styles.mediaWrapper}>
                  <Text style={styles.mediaLabel}>Imagen</Text>
                  <Image
                    source={{ uri: ex.imagen_url }}
                    style={styles.exImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                </View>
              ) : null}

              {ex.video_url ? (
                <View style={styles.mediaWrapper}>
                  <Text style={styles.mediaLabel}>Video demostrativo</Text>
                  <InlineVideo uri={ex.video_url} style={styles.videoPlayer} />
                </View>
              ) : null}
            </View>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* --- MODAL PARA EDITAR LA RUTINA (REASIGNAR) --- */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={styles.overlay} onPress={() => setShowEditModal(false)} />
          <View style={[styles.modal, { paddingBottom: insets.bottom + 24, maxHeight: "90%" }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Editar Rutina</Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              
              <Text style={styles.label}>Nombre de la rutina</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Ej: Pecho y Tríceps"
                  placeholderTextColor={Colors.textMuted}
                  value={editNombre}
                  onChangeText={setEditNombre}
                />
              </View>

              <Text style={styles.label}>Descripción</Text>
              <View style={[styles.inputContainer, { alignItems: "flex-start" }]}>
                <TextInput
                  style={[styles.modalInput, { height: 60, textAlignVertical: "top" }]}
                  placeholder="Instrucciones generales..."
                  placeholderTextColor={Colors.textMuted}
                  value={editDesc}
                  onChangeText={setEditDesc}
                  multiline
                />
              </View>

              <Text style={styles.label}>Nivel</Text>
              <View style={styles.levelRow}>
                {["Principiante", "Intermedio", "Avanzado"].map((lvl) => (
                  <Pressable
                    key={lvl}
                    style={[styles.levelChip, editNivel === lvl && styles.levelChipActive]}
                    onPress={() => setEditNivel(lvl)}
                  >
                    <Text style={[styles.levelChipText, editNivel === lvl && styles.levelChipTextActive]}>{lvl}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Asignar a Paciente</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                <Pressable
                  style={[styles.clientChip, editClienteId === null && styles.clientChipActive]}
                  onPress={() => setEditClienteId(null)}
                >
                  <Text style={[styles.clientChipText, editClienteId === null && styles.clientChipTextActive]}>Ninguno</Text>
                </Pressable>
                {misClientes?.map((c: any) => (
                  <Pressable
                    key={c.id}
                    style={[styles.clientChip, editClienteId === c.id && styles.clientChipActive]}
                    onPress={() => setEditClienteId(c.id)}
                  >
                    <Text style={[styles.clientChipText, editClienteId === c.id && styles.clientChipTextActive]}>
                      {c.nombre} {c.apellido}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Pressable
                style={({ pressed }) => [
                  styles.confirmBtn,
                  editRoutineMutation.isPending && styles.btnDisabled,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => editRoutineMutation.mutate()}
                disabled={editRoutineMutation.isPending}
              >
                {editRoutineMutation.isPending ? (
                  <ActivityIndicator color={Colors.primaryText} />
                ) : (
                  <Text style={styles.confirmBtnText}>Guardar Cambios</Text>
                )}
              </Pressable>

              <Pressable style={styles.cancelBtn} onPress={() => setShowEditModal(false)}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </Pressable>

            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* --- MODAL PARA AGREGAR EJERCICIO --- */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => { setShowModal(false); resetForm(); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={styles.overlay} onPress={() => { setShowModal(false); resetForm(); }} />
          <View style={[styles.modal, { paddingBottom: insets.bottom + 24, maxHeight: "90%" }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Nuevo Ejercicio</Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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

              <Text style={styles.label}>Imagen de referencia</Text>
              <Pressable
                style={({ pressed }) => [
                  styles.mediaPickBtn,
                  !!imagenUrl && styles.mediaPickBtnSuccess,
                  pressed && { opacity: 0.8 },
                ]}
                onPress={handlePickImage}
                disabled={imgUpload.uploading}
              >
                {imgUpload.uploading ? (
                  <ActivityIndicator color={Colors.primary} size="small" />
                ) : (
                  <Ionicons
                    name={imagenUrl ? "checkmark-circle" : "image-outline"}
                    size={22}
                    color={imagenUrl ? Colors.success : Colors.primary}
                  />
                )}
                <Text style={[styles.mediaPickBtnText, !!imagenUrl && { color: Colors.success }]}>
                  {imgUpload.uploading ? `Subiendo... ${imgUpload.progress}%` : imagenUrl ? "Imagen subida ✓" : "Seleccionar imagen"}
                </Text>
              </Pressable>
              <UploadProgressBar
                visible={imgUpload.uploading}
                progress={imgUpload.progress}
                error={imgUpload.error}
                onRetry={imgUpload.error ? () => { imgUpload.reset(); handlePickImage(); } : undefined}
              />
              {imagenUrl ? (
                <Image
                  source={{ uri: imagenUrl }}
                  style={styles.previewImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : null}

              <Text style={[styles.label, { marginTop: 8 }]}>Video demostrativo</Text>
              <Pressable
                style={({ pressed }) => [
                  styles.mediaPickBtn,
                  !!videoUrl && styles.mediaPickBtnSuccess,
                  { borderColor: Colors.accentBlue + "66" },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={handlePickVideo}
                disabled={vidUpload.uploading}
              >
                {vidUpload.uploading ? (
                  <ActivityIndicator color={Colors.accentBlue} size="small" />
                ) : (
                  <Ionicons
                    name={videoUrl ? "checkmark-circle" : "videocam-outline"}
                    size={22}
                    color={videoUrl ? Colors.success : Colors.accentBlue}
                  />
                )}
                <Text style={[styles.mediaPickBtnText, { color: videoUrl ? Colors.success : Colors.accentBlue }, !!videoUrl && { color: Colors.success }]}>
                  {vidUpload.uploading ? `Subiendo... ${vidUpload.progress}%` : videoUrl ? "Video subido ✓" : "Seleccionar video"}
                </Text>
              </Pressable>
              <UploadProgressBar
                visible={vidUpload.uploading}
                progress={vidUpload.progress}
                error={vidUpload.error}
                onRetry={vidUpload.error ? () => { vidUpload.reset(); handlePickVideo(); } : undefined}
              />

              <Pressable
                style={({ pressed }) => [
                  styles.confirmBtn,
                  (addExMutation.isPending || isUploading) && styles.btnDisabled,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => {
                  if (!nombre.trim()) return setError("El nombre es requerido");
                  if (isUploading) return setError("Espera a que termine la subida");
                  addExMutation.mutate();
                }}
                disabled={addExMutation.isPending || isUploading}
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
          </View>
        </KeyboardAvoidingView>
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
  headerActions: {
    flexDirection: "row",
    gap: 12,
  },
  editRoutineBtn: {
    backgroundColor: Colors.card,
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addBtn: {
    backgroundColor: Colors.primary,
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  routineInfo: { marginBottom: 24 },
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
    marginBottom: 12,
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
  assignedBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  assignedText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
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
  mediaWrapper: {
    marginTop: 12,
  },
  mediaLabel: {
    fontFamily: "Outfit_500Medium",
    fontSize: 11,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  exImage: {
    width: "100%",
    height: 160,
    borderRadius: 12,
  },
  videoPlayer: {
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 4,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
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
    marginTop: "auto",
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
  levelRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  levelChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  levelChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  levelChipText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  levelChipTextActive: {
    color: Colors.primaryText,
  },
  clientChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
  },
  clientChipActive: {
    backgroundColor: Colors.accentBlue,
    borderColor: Colors.accentBlue,
  },
  clientChipText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  clientChipTextActive: {
    color: "#fff",
  },
  mediaPickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.primary + "44",
    borderStyle: "dashed",
    marginBottom: 10,
  },
  mediaPickBtnSuccess: {
    borderColor: Colors.success + "66",
    borderStyle: "solid",
    backgroundColor: Colors.success + "0F",
  },
  mediaPickBtnText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 14,
    color: Colors.primary,
    flex: 1,
  },
  previewImage: {
    width: "100%",
    height: 140,
    borderRadius: 12,
    marginBottom: 14,
  },
  confirmBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 10,
  },
  btnDisabled: { opacity: 0.5 },
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
});