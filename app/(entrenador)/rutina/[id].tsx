import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  Platform, Modal, ActivityIndicator, KeyboardAvoidingView, Alert, Switch
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useUpload } from "@/hooks/useUpload";
import { InlineVideo } from "@/components/MediaViewer";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/context/auth";
import { supabase } from "@/lib/supabase";

// --- TIPOS ---
type ExForm = { nombre: string; descripcion: string; series: string; reps: string; peso: string; descanso: string; imagenUrl: string; videoUrl: string; };
const defaultEx: ExForm = { nombre: "", descripcion: "", series: "3", reps: "10", peso: "", descanso: "60s", imagenUrl: "", videoUrl: "" };

const CATEGORIAS = ["Pierna", "Pecho", "Espalda", "Brazo", "Hombro", "Core", "Cardio", "Full Body", "General"];

export default function RutinaDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { user } = useAuth();
  
  // --- ESTADOS: CREAR EJERCICIO ---
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState("");
  const [tipoEjecucion, setTipoEjecucion] = useState<"individual" | "biserie" | "triserie">("individual");
  const [exForms, setExForms] = useState<ExForm[]>([{ ...defaultEx }]);
  const [uploadingIdx, setUploadingIdx] = useState<{ index: number; type: "image" | "video" } | null>(null);

  // Estados: Catálogo (Crear)
  const [guardarEnCatalogo, setGuardarEnCatalogo] = useState(false);
  const [categoriaSeccion, setCategoriaSeccion] = useState("Pierna");

  // Estado: Selector de Catálogo (Evita Modal anidado)
  const [activeCatalogIndex, setActiveCatalogIndex] = useState<number | null>(null);

  // --- ESTADOS: EDITAR RUTINA ---
  const [showEditModal, setShowEditModal] = useState(false);
  const [editNombre, setEditNombre] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editNivel, setEditNivel] = useState("");
  const [editClienteIds, setEditClienteIds] = useState<string[]>([]);

  // --- ESTADOS: EDITAR EJERCICIO INDIVIDUAL ---
  const [showEditExModal, setShowEditExModal] = useState(false);
  const [editingExId, setEditingExId] = useState<string | null>(null);
  const [editExForm, setEditExForm] = useState<ExForm>({ ...defaultEx });
  const [guardarEnCatalogoEdit, setGuardarEnCatalogoEdit] = useState(false);
  const [categoriaSeccionEdit, setCategoriaSeccionEdit] = useState("Pierna");

  // Upload Hooks
  const imgUpload = useUpload();
  const vidUpload = useUpload();
  const imgUploadEdit = useUpload();
  const vidUploadEdit = useUpload();

  // 1. OBTENER RUTINA
  const { data, refetch } = useQuery({
    queryKey: ["routine_details", id],
    enabled: !!id,
    queryFn: async () => {
      const { data: routineData, error: routineError } = await supabase.from("rutinas").select("*").eq("id", id).single();
      if (routineError) throw new Error(routineError.message);

      const { data: clientsData } = await supabase.from("rutina_clientes").select(`cliente_id, perfiles:cliente_id (nombre, apellido)`).eq("rutina_id", id);
      const { data: exercisesData, error: exercisesError } = await supabase.from("ejercicios").select("*").eq("rutina_id", id).order("orden", { ascending: true });
        
      if (exercisesError) throw new Error(exercisesError.message);

      return { routine: routineData, assignedClients: clientsData || [], exercises: exercisesData || [] };
    },
  });

  // 2. OBTENER CLIENTES
  const { data: misClientes } = useQuery({
    queryKey: ["my_clients_for_assignment", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("perfiles").select("id, nombre, apellido").eq("rol", "cliente").eq("entrenador_id", user?.id);
      if (error) throw new Error(error.message);
      return data || [];
    }
  });

  // 3. OBTENER CATÁLOGO
  const { data: miCatalogo } = useQuery({
    queryKey: ["catalogo_ejercicios", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("catalogo_ejercicios").select("*").eq("entrenador_id", user?.id).order("categoria", { ascending: true }).order("nombre", { ascending: true });
      if (error) throw new Error(error.message);
      return data || [];
    }
  });

  // Efecto para precargar datos de edición de la rutina
  useEffect(() => {
    if (data?.routine && showEditModal) {
      setEditNombre(data.routine.nombre || "");
      setEditDesc(data.routine.descripcion || "");
      setEditNivel(data.routine.nivel || "Principiante");
      setEditClienteIds(data.assignedClients.map((c: any) => c.cliente_id) || []);
    }
  }, [showEditModal, data]);

  // MUTACIÓN: Editar Rutina
  const editRoutineMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("rutinas").update({ nombre: editNombre.trim(), descripcion: editDesc.trim() || null, nivel: editNivel }).eq("id", id);
      if (error) throw new Error(error.message);

      await supabase.from("rutina_clientes").delete().eq("rutina_id", id);
      if (editClienteIds.length > 0) {
        const inserts = editClienteIds.map(cId => ({ rutina_id: id, cliente_id: cId }));
        const { error: clientsError } = await supabase.from("rutina_clientes").insert(inserts);
        if (clientsError) throw new Error(clientsError.message);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routine_details", id] });
      qc.invalidateQueries({ queryKey: ["routines", user?.id] });
      setShowEditModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: any) => Alert.alert("Error", err.message || "No se pudo actualizar la rutina"),
  });

  // --- FUNCIONES PARA CREAR EJERCICIOS ---
  const handleTipoChange = (tipo: "individual" | "biserie" | "triserie") => {
    setTipoEjecucion(tipo);
    if (tipo === "individual") setExForms([exForms[0]]);
    else if (tipo === "biserie") setExForms([exForms[0], exForms[1] || { ...defaultEx }]);
    else if (tipo === "triserie") setExForms([exForms[0], exForms[1] || { ...defaultEx }, exForms[2] || { ...defaultEx }]);
  };

  const updateForm = (index: number, field: keyof ExForm, value: string) => {
    const newForms = [...exForms];
    newForms[index][field] = value;
    setExForms(newForms);
  };

  const handlePickImage = async (index: number) => {
    setUploadingIdx({ index, type: "image" });
    imgUpload.reset();
    const result = await imgUpload.pickAndUpload("images");
    if (result) updateForm(index, "imagenUrl", result.url);
    setUploadingIdx(null);
  };

  const handlePickVideo = async (index: number) => {
    setUploadingIdx({ index, type: "video" });
    vidUpload.reset();
    const result = await vidUpload.pickAndUpload("videos");
    if (result) updateForm(index, "videoUrl", result.url);
    setUploadingIdx(null);
  };

  const resetForm = () => {
    setTipoEjecucion("individual");
    setExForms([{ ...defaultEx }]);
    setGuardarEnCatalogo(false);
    setCategoriaSeccion("Pierna");
    setActiveCatalogIndex(null);
    setError("");
    imgUpload.reset();
    vidUpload.reset();
    setUploadingIdx(null);
  };

  const addExMutation = useMutation({
    mutationFn: async () => {
      const isGroup = tipoEjecucion !== "individual";
      let assignedGroup = null;
      if (isGroup) {
        const existingGroups = new Set((data?.exercises || []).map((e: any) => e.grupo_serie).filter(Boolean));
        assignedGroup = `G${existingGroups.size + 1}`;
      }

      const baseOrder = data?.exercises?.length || 0;
      
      // 1. Guardar en la Rutina (con el grupo si es biserie)
      const inserts = exForms.map((form, idx) => ({
        rutina_id: id, nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null,
        series: Number(form.series) || 3, repeticiones: form.reps, peso: form.peso || null,
        descanso: form.descanso, grupo_serie: assignedGroup, 
        imagen_url: form.imagenUrl || null, video_url: form.videoUrl || null, orden: baseOrder + idx,
      }));

      const { error: insertError } = await supabase.from("ejercicios").insert(inserts);
      if (insertError) throw new Error(insertError.message);

      // 2. Guardar en el Catálogo (siempre de forma individual, sin importar si era biserie)
      if (guardarEnCatalogo) {
        const catInserts = exForms.map(form => ({
          entrenador_id: user?.id, 
          nombre: form.nombre.trim(), 
          categoria: categoriaSeccion,
          descripcion: form.descripcion.trim() || null, 
          imagen_url: form.imagenUrl || null, 
          video_url: form.videoUrl || null,
        }));
        await supabase.from("catalogo_ejercicios").insert(catInserts);
        qc.invalidateQueries({ queryKey: ["catalogo_ejercicios", user?.id] });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routine_details", id] });
      setShowModal(false);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: any) => setError(err.message || "Error al agregar"),
  });

  // --- FUNCIONES PARA EDITAR EJERCICIO EXISTENTE ---
  const handleOpenEditEx = (ex: any) => {
    setEditingExId(ex.id);
    setEditExForm({
      nombre: ex.nombre || "",
      descripcion: ex.descripcion || "",
      series: ex.series?.toString() || "3",
      reps: ex.repeticiones || "10",
      peso: ex.peso || "",
      descanso: ex.descanso || "60s",
      imagenUrl: ex.imagen_url || "",
      videoUrl: ex.video_url || ""
    });
    setGuardarEnCatalogoEdit(false);
    setCategoriaSeccionEdit("Pierna");
    imgUploadEdit.reset();
    vidUploadEdit.reset();
    setShowEditExModal(true);
  };

  const handleEditPickImage = async () => {
    imgUploadEdit.reset();
    const result = await imgUploadEdit.pickAndUpload("images");
    if (result) setEditExForm(prev => ({ ...prev, imagenUrl: result.url }));
  };

  const handleEditPickVideo = async () => {
    vidUploadEdit.reset();
    const result = await vidUploadEdit.pickAndUpload("videos");
    if (result) setEditExForm(prev => ({ ...prev, videoUrl: result.url }));
  };

  const editExMutation = useMutation({
    mutationFn: async () => {
      if (!editingExId) return;
      const { error } = await supabase.from("ejercicios").update({
        nombre: editExForm.nombre.trim(),
        descripcion: editExForm.descripcion.trim() || null,
        series: Number(editExForm.series) || 3,
        repeticiones: editExForm.reps,
        peso: editExForm.peso || null,
        descanso: editExForm.descanso,
        imagen_url: editExForm.imagenUrl || null,
        video_url: editExForm.videoUrl || null,
      }).eq("id", editingExId);

      if (error) throw new Error(error.message);

      if (guardarEnCatalogoEdit) {
        const { data: existingCat } = await supabase.from("catalogo_ejercicios")
          .select("id").eq("entrenador_id", user?.id).ilike("nombre", editExForm.nombre.trim()).maybeSingle();
        
        if (existingCat) {
          await supabase.from("catalogo_ejercicios").update({
            categoria: categoriaSeccionEdit,
            descripcion: editExForm.descripcion.trim() || null,
            imagen_url: editExForm.imagenUrl || null,
            video_url: editExForm.videoUrl || null,
          }).eq("id", existingCat.id);
        } else {
          await supabase.from("catalogo_ejercicios").insert({
            entrenador_id: user?.id,
            nombre: editExForm.nombre.trim(),
            categoria: categoriaSeccionEdit,
            descripcion: editExForm.descripcion.trim() || null,
            imagen_url: editExForm.imagenUrl || null,
            video_url: editExForm.videoUrl || null,
          });
        }
        qc.invalidateQueries({ queryKey: ["catalogo_ejercicios", user?.id] });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routine_details", id] });
      setShowEditExModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: any) => Alert.alert("Error", err.message)
  });

  const deleteExMutation = useMutation({
    mutationFn: async (exId: string) => {
      const { error } = await supabase.from("ejercicios").delete().eq("id", exId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routine_details", id] });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
  });

  const routine = data?.routine;
  const exercises = data?.exercises || [];
  const assignedClients = data?.assignedClients || [];
  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);
  const isUploadingAny = imgUpload.uploading || vidUpload.uploading;
  const isUploadingEdit = imgUploadEdit.uploading || vidUploadEdit.uploading;

  if (!routine) return (
    <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={Colors.primary} /></View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: topInset + 8 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.pageHeader}>
          <Pressable style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </Pressable>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable style={({ pressed }) => [styles.editRoutineBtn, pressed && { opacity: 0.8 }]} onPress={() => setShowEditModal(true)}>
              <Ionicons name="pencil" size={20} color={Colors.text} />
            </Pressable>
            <Pressable style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]} onPress={() => setShowModal(true)}>
              <Ionicons name="add" size={22} color={Colors.primaryText} />
            </Pressable>
          </View>
        </View>

        <View style={styles.routineInfo}>
          <Text style={styles.routineName}>{routine.nombre}</Text>
          {routine.descripcion ? <Text style={styles.routineDesc}>{routine.descripcion}</Text> : null}
          <View style={styles.metaRow}>
            <View style={styles.nivelBadge}><Text style={styles.nivelText}>{routine.nivel}</Text></View>
            <Text style={styles.exerciseCount}>{exercises.length} ejercicios</Text>
          </View>
          
          <View style={styles.assignedBox}>
            <Ionicons name="people" size={16} color={Colors.textSecondary} />
            <Text style={styles.assignedText}>
              {assignedClients.length > 0
                ? `Asignada a: ${assignedClients.map((c:any) => `${c.perfiles?.nombre} ${c.perfiles?.apellido}`).join(', ')}`
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
                <View style={styles.exNum}><Text style={styles.exNumText}>{idx + 1}</Text></View>
                <Text style={styles.exName}>{ex.nombre}</Text>
                {ex.grupo_serie && (
                  <View style={{ backgroundColor: Colors.accentOrange + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 4 }}>
                      <Text style={{ color: Colors.accentOrange, fontSize: 10, fontFamily: "Outfit_700Bold" }}>EN GRUPO ({ex.grupo_serie})</Text>
                  </View>
                )}
                <Pressable style={({ pressed }) => [styles.editExBtn, { marginLeft: 'auto', marginRight: 8 }, pressed && { opacity: 0.6 }]} onPress={() => handleOpenEditEx(ex)}>
                  <Ionicons name="pencil" size={16} color={Colors.primary} />
                </Pressable>
                <Pressable style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]} onPress={() => deleteExMutation.mutate(ex.id)}>
                  <Ionicons name="trash-outline" size={16} color={Colors.error} />
                </Pressable>
              </View>

              {ex.descripcion ? <Text style={styles.exDesc}>{ex.descripcion}</Text> : null}

              <View style={styles.exStats}>
                <View style={styles.exStat}><Ionicons name="repeat" size={14} color={Colors.primary} /><Text style={styles.exStatText}>{ex.series} series</Text></View>
                <View style={styles.exStat}><Ionicons name="fitness" size={14} color={Colors.accentBlue} /><Text style={styles.exStatText}>{ex.repeticiones} reps</Text></View>
                {ex.peso && <View style={styles.exStat}><Ionicons name="barbell" size={14} color={Colors.accentOrange} /><Text style={styles.exStatText}>{ex.peso}</Text></View>}
                <View style={styles.exStat}><Ionicons name="timer" size={14} color={Colors.textMuted} /><Text style={styles.exStatText}>{ex.descanso}</Text></View>
              </View>

              {ex.imagen_url ? (
                <View style={styles.mediaWrapper}>
                  <Text style={styles.mediaLabel}>Imagen</Text>
                  <Image source={{ uri: ex.imagen_url }} style={styles.exImage} contentFit="cover" cachePolicy="memory-disk" />
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

      {/* --- MODAL PARA EDITAR LA RUTINA --- */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={styles.overlay} onPress={() => setShowEditModal(false)} />
          <View style={[styles.modal, { paddingBottom: insets.bottom + 24, maxHeight: "90%" }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Editar Rutina</Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Nombre de la rutina</Text>
              <View style={styles.inputContainer}>
                <TextInput style={styles.modalInput} placeholder="Ej: Pecho y Tríceps" placeholderTextColor={Colors.textMuted} value={editNombre} onChangeText={setEditNombre} />
              </View>

              <Text style={styles.label}>Descripción</Text>
              <View style={[styles.inputContainer, { alignItems: "flex-start" }]}>
                <TextInput style={[styles.modalInput, { height: 60, textAlignVertical: "top" }]} placeholder="Instrucciones generales..." placeholderTextColor={Colors.textMuted} value={editDesc} onChangeText={setEditDesc} multiline />
              </View>

              <Text style={styles.label}>Nivel</Text>
              <View style={styles.levelRow}>
                {["Principiante", "Intermedio", "Avanzado"].map((lvl) => (
                  <Pressable key={lvl} style={[styles.levelChip, editNivel === lvl && styles.levelChipActive]} onPress={() => setEditNivel(lvl)}>
                    <Text style={[styles.levelChipText, editNivel === lvl && styles.levelChipTextActive]}>{lvl}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Asignar a Pacientes (Múltiple)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                {misClientes?.map((c: any) => {
                  const isSelected = editClienteIds.includes(c.id);
                  return (
                    <Pressable
                      key={c.id}
                      style={[styles.clientChip, isSelected && styles.clientChipActive]}
                      onPress={() => {
                        setEditClienteIds(prev => isSelected ? prev.filter(id => id !== c.id) : [...prev, c.id]);
                      }}
                    >
                      <Text style={[styles.clientChipText, isSelected && styles.clientChipTextActive]}>{c.nombre} {c.apellido}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Pressable
                style={({ pressed }) => [styles.confirmBtn, editRoutineMutation.isPending && styles.btnDisabled, pressed && { opacity: 0.85 }]}
                onPress={() => editRoutineMutation.mutate()}
                disabled={editRoutineMutation.isPending}
              >
                {editRoutineMutation.isPending ? <ActivityIndicator color={Colors.primaryText} /> : <Text style={styles.confirmBtnText}>Guardar Cambios</Text>}
              </Pressable>
              <Pressable style={styles.cancelBtn} onPress={() => setShowEditModal(false)}><Text style={styles.cancelBtnText}>Cancelar</Text></Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* --- MODAL PARA EDITAR UN EJERCICIO EXISTENTE --- */}
      <Modal visible={showEditExModal} transparent animationType="slide" onRequestClose={() => setShowEditExModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={styles.overlay} onPress={() => setShowEditExModal(false)} />
          <View style={[styles.modal, { paddingBottom: insets.bottom + 24, maxHeight: "90%" }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Editar Ejercicio</Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              
              <View style={styles.catalogSection}>
                <View style={styles.switchRow}>
                  <Text style={styles.catalogTitle}>Actualizar también en el catálogo</Text>
                  <Switch value={guardarEnCatalogoEdit} onValueChange={setGuardarEnCatalogoEdit} trackColor={{ false: Colors.border, true: Colors.primary }} />
                </View>
                {guardarEnCatalogoEdit && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.label}>Asignar Categoría</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {CATEGORIAS.map((cat) => (
                        <Pressable key={cat} style={[styles.clientChip, categoriaSeccionEdit === cat && styles.clientChipActive, { marginBottom: 4 }]} onPress={() => setCategoriaSeccionEdit(cat)}>
                          <Text style={[styles.clientChipText, categoriaSeccionEdit === cat && styles.clientChipTextActive]}>{cat}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              <Text style={styles.label}>Nombre del ejercicio *</Text>
              <View style={styles.inputContainer}>
                <TextInput style={styles.modalInput} placeholderTextColor={Colors.textMuted} value={editExForm.nombre} onChangeText={(t) => setEditExForm(p => ({...p, nombre: t}))} />
              </View>

              <Text style={styles.label}>Descripción</Text>
              <View style={[styles.inputContainer, { alignItems: "flex-start" }]}>
                <TextInput style={[styles.modalInput, { height: 60, textAlignVertical: "top" }]} placeholderTextColor={Colors.textMuted} value={editExForm.descripcion} onChangeText={(t) => setEditExForm(p => ({...p, descripcion: t}))} multiline />
              </View>

              <View style={styles.statsRow}>
                <View style={{ flex: 1 }}><Text style={styles.label}>Series</Text><View style={styles.inputContainer}><TextInput style={styles.modalInput} keyboardType="number-pad" value={editExForm.series} onChangeText={(t) => setEditExForm(p => ({...p, series: t}))} /></View></View>
                <View style={{ flex: 1 }}><Text style={styles.label}>Reps</Text><View style={styles.inputContainer}><TextInput style={styles.modalInput} value={editExForm.reps} onChangeText={(t) => setEditExForm(p => ({...p, reps: t}))} /></View></View>
                <View style={{ flex: 1 }}><Text style={styles.label}>Peso</Text><View style={styles.inputContainer}><TextInput style={styles.modalInput} value={editExForm.peso} onChangeText={(t) => setEditExForm(p => ({...p, peso: t}))} /></View></View>
              </View>

              <Text style={styles.label}>Descanso</Text>
              <View style={styles.inputContainer}>
                <TextInput style={styles.modalInput} value={editExForm.descanso} onChangeText={(t) => setEditExForm(p => ({...p, descanso: t}))} />
              </View>

              <Text style={styles.label}>Imagen</Text>
              <Pressable style={({ pressed }) => [styles.mediaPickBtn, !!editExForm.imagenUrl && styles.mediaPickBtnSuccess, pressed && { opacity: 0.8 }]} onPress={handleEditPickImage} disabled={isUploadingEdit}>
                {imgUploadEdit.uploading ? <ActivityIndicator color={Colors.primary} size="small" /> : <Ionicons name={editExForm.imagenUrl ? "checkmark-circle" : "image-outline"} size={22} color={editExForm.imagenUrl ? Colors.success : Colors.primary} />}
                <Text style={[styles.mediaPickBtnText, !!editExForm.imagenUrl && { color: Colors.success }]}>{imgUploadEdit.uploading ? `Subiendo... ${imgUploadEdit.progress}%` : editExForm.imagenUrl ? "Imagen lista ✓" : "Cambiar imagen"}</Text>
              </Pressable>
              {editExForm.imagenUrl ? <Image source={{ uri: editExForm.imagenUrl }} style={styles.previewImage} contentFit="cover" cachePolicy="memory-disk" /> : null}

              <Text style={[styles.label, { marginTop: 8 }]}>Video</Text>
              <Pressable style={({ pressed }) => [styles.mediaPickBtn, !!editExForm.videoUrl && styles.mediaPickBtnSuccess, { borderColor: Colors.accentBlue + "66" }, pressed && { opacity: 0.8 }]} onPress={handleEditPickVideo} disabled={isUploadingEdit}>
                {vidUploadEdit.uploading ? <ActivityIndicator color={Colors.accentBlue} size="small" /> : <Ionicons name={editExForm.videoUrl ? "checkmark-circle" : "videocam-outline"} size={22} color={editExForm.videoUrl ? Colors.success : Colors.accentBlue} />}
                <Text style={[styles.mediaPickBtnText, { color: editExForm.videoUrl ? Colors.success : Colors.accentBlue }, !!editExForm.videoUrl && { color: Colors.success }]}>{vidUploadEdit.uploading ? `Subiendo... ${vidUploadEdit.progress}%` : editExForm.videoUrl ? "Video listo ✓" : "Cambiar video"}</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.confirmBtn, (editExMutation.isPending || isUploadingEdit) && styles.btnDisabled, pressed && { opacity: 0.85 }]}
                onPress={() => {
                  if (!editExForm.nombre.trim()) return Alert.alert("Error", "El nombre es requerido");
                  editExMutation.mutate();
                }}
                disabled={editExMutation.isPending || isUploadingEdit}
              >
                {editExMutation.isPending ? <ActivityIndicator color={Colors.primaryText} /> : <Text style={styles.confirmBtnText}>Guardar Cambios</Text>}
              </Pressable>
              <Pressable style={styles.cancelBtn} onPress={() => setShowEditExModal(false)}><Text style={styles.cancelBtnText}>Cancelar</Text></Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* --- MODAL PARA AGREGAR NUEVOS EJERCICIOS --- */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => { setShowModal(false); resetForm(); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={styles.overlay} onPress={() => { setShowModal(false); resetForm(); }} />
          <View style={[styles.modal, { paddingBottom: insets.bottom + 24, maxHeight: "90%" }]}>
            <View style={styles.modalHandle} />

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              
              {/* VISTA DEL CATÁLOGO (Reemplaza el formulario temporalmente) */}
              {activeCatalogIndex !== null ? (
                <View>
                  <Pressable 
                    onPress={() => setActiveCatalogIndex(null)} 
                    style={styles.backToFormBtn}
                  >
                    <Ionicons name="arrow-back" size={20} color={Colors.text} />
                    <Text style={styles.backToFormText}>Volver al formulario</Text>
                  </Pressable>
                  
                  <Text style={styles.modalTitle}>Selecciona un ejercicio</Text>
                  
                  {miCatalogo?.length === 0 ? (
                     <Text style={{ textAlign: 'center', color: Colors.textMuted, marginTop: 20 }}>No tienes ejercicios guardados aún.</Text>
                  ) : (
                     miCatalogo?.map((cat: any) => (
                       <Pressable 
                         key={cat.id} 
                         style={styles.catItem} 
                         onPress={() => {
                           const newForms = [...exForms];
                           newForms[activeCatalogIndex] = {
                             ...newForms[activeCatalogIndex],
                             nombre: cat.nombre,
                             descripcion: cat.descripcion || "",
                             imagenUrl: cat.imagen_url || "",
                             videoUrl: cat.video_url || ""
                           };
                           setExForms(newForms);
                           setActiveCatalogIndex(null);
                           Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                         }}
                       >
                         <View style={{ flex: 1 }}>
                           <Text style={styles.catItemName}>{cat.nombre}</Text>
                           <View style={styles.catItemCatWrapper}>
                             <Text style={styles.catItemCat}>{cat.categoria}</Text>
                           </View>
                         </View>
                         <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                       </Pressable>
                     ))
                  )}
                  <View style={{ height: 40 }}/>
                </View>

              ) : (
                /* --- VISTA NORMAL DEL FORMULARIO --- */
                <View>
                  <Text style={styles.modalTitle}>Nuevo Ejercicio</Text>

                  <Text style={styles.label}>Tipo de Ejecución</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                    <Pressable style={[styles.clientChip, tipoEjecucion === "individual" && styles.clientChipActive]} onPress={() => handleTipoChange("individual")}>
                      <Text style={[styles.clientChipText, tipoEjecucion === "individual" && styles.clientChipTextActive]}>Individual</Text>
                    </Pressable>
                    <Pressable style={[styles.clientChip, tipoEjecucion === "biserie" && styles.clientChipActive]} onPress={() => handleTipoChange("biserie")}>
                      <Text style={[styles.clientChipText, tipoEjecucion === "biserie" && styles.clientChipTextActive]}>Bi-serie</Text>
                    </Pressable>
                    <Pressable style={[styles.clientChip, tipoEjecucion === "triserie" && styles.clientChipActive]} onPress={() => handleTipoChange("triserie")}>
                      <Text style={[styles.clientChipText, tipoEjecucion === "triserie" && styles.clientChipTextActive]}>Tri-serie</Text>
                    </Pressable>
                  </ScrollView>

                  <View style={styles.catalogSection}>
                    <View style={styles.switchRow}>
                      <Text style={styles.catalogTitle}>Guardar en catálogo al crear</Text>
                      <Switch value={guardarEnCatalogo} onValueChange={setGuardarEnCatalogo} trackColor={{ false: Colors.border, true: Colors.primary }} />
                    </View>
                    {guardarEnCatalogo && (
                      <View style={{ marginTop: 12 }}>
                        <Text style={styles.label}>Categoría (Sección)</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          {CATEGORIAS.map((cat) => (
                            <Pressable key={cat} style={[styles.clientChip, categoriaSeccion === cat && styles.clientChipActive, { marginBottom: 4 }]} onPress={() => setCategoriaSeccion(cat)}>
                              <Text style={[styles.clientChipText, categoriaSeccion === cat && styles.clientChipTextActive]}>{cat}</Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  {error ? (
                    <View style={styles.errorBox}><Ionicons name="alert-circle" size={16} color={Colors.error} /><Text style={styles.errorText}>{error}</Text></View>
                  ) : null}

                  {exForms.map((form, index) => (
                    <View key={index} style={tipoEjecucion !== "individual" ? styles.formBlock : null}>
                      
                      {tipoEjecucion !== "individual" && <Text style={styles.blockTitle}>Ejercicio {index + 1}</Text>}

                      {/* AHORA SETEA EL INDEX PARA ABRIR LA VISTA DEL CATÁLOGO DENTRO DE ESTA MISMA MODAL */}
                      <Pressable style={styles.importFromCatBtn} onPress={() => setActiveCatalogIndex(index)}>
                        <Ionicons name="search" size={16} color={Colors.primary} />
                        <Text style={styles.importFromCatText}>Importar desde mi catálogo</Text>
                      </Pressable>

                      <Text style={styles.label}>Nombre del ejercicio *</Text>
                      <View style={styles.inputContainer}>
                        <TextInput style={styles.modalInput} placeholder="Ej: Sentadilla con barra" placeholderTextColor={Colors.textMuted} value={form.nombre} onChangeText={(t) => { updateForm(index, "nombre", t); setError(""); }} />
                      </View>

                      <Text style={styles.label}>Descripción (opcional)</Text>
                      <View style={[styles.inputContainer, { alignItems: "flex-start" }]}>
                        <TextInput style={[styles.modalInput, { height: 60, textAlignVertical: "top" }]} placeholder="Técnica y consejos..." placeholderTextColor={Colors.textMuted} value={form.descripcion} onChangeText={(t) => updateForm(index, "descripcion", t)} multiline />
                      </View>

                      <View style={styles.statsRow}>
                        <View style={{ flex: 1 }}><Text style={styles.label}>Series</Text><View style={styles.inputContainer}><TextInput style={styles.modalInput} placeholder="3" placeholderTextColor={Colors.textMuted} value={form.series} onChangeText={(t) => updateForm(index, "series", t)} keyboardType="number-pad" /></View></View>
                        <View style={{ flex: 1 }}><Text style={styles.label}>Reps</Text><View style={styles.inputContainer}><TextInput style={styles.modalInput} placeholder="10" placeholderTextColor={Colors.textMuted} value={form.reps} onChangeText={(t) => updateForm(index, "reps", t)} /></View></View>
                        <View style={{ flex: 1 }}><Text style={styles.label}>Peso</Text><View style={styles.inputContainer}><TextInput style={styles.modalInput} placeholder="60 kg" placeholderTextColor={Colors.textMuted} value={form.peso} onChangeText={(t) => updateForm(index, "peso", t)} /></View></View>
                      </View>

                      <Text style={styles.label}>Descanso</Text>
                      <View style={styles.inputContainer}>
                        <TextInput style={styles.modalInput} placeholder="60s" placeholderTextColor={Colors.textMuted} value={form.descanso} onChangeText={(t) => updateForm(index, "descanso", t)} />
                      </View>

                      <Text style={styles.label}>Imagen de referencia</Text>
                      <Pressable style={({ pressed }) => [styles.mediaPickBtn, !!form.imagenUrl && styles.mediaPickBtnSuccess, pressed && { opacity: 0.8 }]} onPress={() => handlePickImage(index)} disabled={isUploadingAny}>
                        {uploadingIdx?.index === index && uploadingIdx?.type === "image" ? <ActivityIndicator color={Colors.primary} size="small" /> : <Ionicons name={form.imagenUrl ? "checkmark-circle" : "image-outline"} size={22} color={form.imagenUrl ? Colors.success : Colors.primary} />}
                        <Text style={[styles.mediaPickBtnText, !!form.imagenUrl && { color: Colors.success }]}>{uploadingIdx?.index === index && uploadingIdx?.type === "image" ? `Subiendo... ${imgUpload.progress}%` : form.imagenUrl ? "Imagen subida ✓" : "Seleccionar imagen"}</Text>
                      </Pressable>
                      {form.imagenUrl ? <Image source={{ uri: form.imagenUrl }} style={styles.previewImage} contentFit="cover" cachePolicy="memory-disk" /> : null}

                      <Text style={[styles.label, { marginTop: 8 }]}>Video demostrativo</Text>
                      <Pressable style={({ pressed }) => [styles.mediaPickBtn, !!form.videoUrl && styles.mediaPickBtnSuccess, { borderColor: Colors.accentBlue + "66" }, pressed && { opacity: 0.8 }]} onPress={() => handlePickVideo(index)} disabled={isUploadingAny}>
                        {uploadingIdx?.index === index && uploadingIdx?.type === "video" ? <ActivityIndicator color={Colors.accentBlue} size="small" /> : <Ionicons name={form.videoUrl ? "checkmark-circle" : "videocam-outline"} size={22} color={form.videoUrl ? Colors.success : Colors.accentBlue} />}
                        <Text style={[styles.mediaPickBtnText, { color: form.videoUrl ? Colors.success : Colors.accentBlue }, !!form.videoUrl && { color: Colors.success }]}>{uploadingIdx?.index === index && uploadingIdx?.type === "video" ? `Subiendo... ${vidUpload.progress}%` : form.videoUrl ? "Video subido ✓" : "Seleccionar video"}</Text>
                      </Pressable>
                    </View>
                  ))}

                  <Pressable
                    style={({ pressed }) => [styles.confirmBtn, (addExMutation.isPending || isUploadingAny) && styles.btnDisabled, pressed && { opacity: 0.85 }]}
                    onPress={() => {
                      const isValid = exForms.every(f => f.nombre.trim() !== "");
                      if (!isValid) return setError("Todos los ejercicios deben tener nombre");
                      if (isUploadingAny) return setError("Espera a que termine la subida");
                      addExMutation.mutate();
                    }}
                    disabled={addExMutation.isPending || isUploadingAny}
                  >
                    {addExMutation.isPending ? <ActivityIndicator color={Colors.primaryText} /> : <Text style={styles.confirmBtnText}>{tipoEjecucion === "individual" ? "Agregar Ejercicio" : `Guardar ${tipoEjecucion === "biserie" ? "Bi-serie" : "Tri-serie"}`}</Text>}
                  </Pressable>
                  <Pressable style={styles.cancelBtn} onPress={() => { setShowModal(false); resetForm(); }}><Text style={styles.cancelBtnText}>Cancelar</Text></Pressable>
                  <View style={{ height: 40 }} />
                </View>
              )}

            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20 },
  pageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  editRoutineBtn: { backgroundColor: Colors.card, width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border },
  addBtn: { backgroundColor: Colors.primary, width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  routineInfo: { marginBottom: 24 },
  routineName: { fontFamily: "Outfit_700Bold", fontSize: 28, color: Colors.text, letterSpacing: -0.5, marginBottom: 8 },
  routineDesc: { fontFamily: "Outfit_400Regular", fontSize: 15, color: Colors.textSecondary, lineHeight: 22, marginBottom: 12 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  nivelBadge: { backgroundColor: Colors.primary + "22", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  nivelText: { fontFamily: "Outfit_500Medium", fontSize: 13, color: Colors.primary, textTransform: "capitalize" },
  exerciseCount: { fontFamily: "Outfit_400Regular", fontSize: 14, color: Colors.textMuted },
  assignedBox: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignSelf: "flex-start", borderWidth: 1, borderColor: Colors.border },
  assignedText: { fontFamily: "Outfit_500Medium", fontSize: 13, color: Colors.textSecondary },
  emptyState: { alignItems: "center", paddingTop: 40, gap: 10 },
  emptyTitle: { fontFamily: "Outfit_700Bold", fontSize: 20, color: Colors.text, marginTop: 8 },
  emptySubtitle: { fontFamily: "Outfit_400Regular", fontSize: 15, color: Colors.textMuted },
  emptyBtn: { backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 12 },
  emptyBtnText: { fontFamily: "Outfit_600SemiBold", fontSize: 15, color: Colors.primaryText },
  exerciseCard: { backgroundColor: Colors.card, borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  exHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 10 },
  exNum: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.primary + "22", alignItems: "center", justifyContent: "center" },
  exNumText: { fontFamily: "Outfit_700Bold", fontSize: 13, color: Colors.primary },
  exName: { fontFamily: "Outfit_600SemiBold", fontSize: 16, color: Colors.text, flex: 1 },
  
  editExBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.primary + "22", alignItems: "center", justifyContent: "center" },
  deleteBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.error + "22", alignItems: "center", justifyContent: "center" },
  
  exDesc: { fontFamily: "Outfit_400Regular", fontSize: 14, color: Colors.textSecondary, marginBottom: 10, lineHeight: 20 },
  exStats: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  exStat: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border },
  exStatText: { fontFamily: "Outfit_500Medium", fontSize: 12, color: Colors.textSecondary },
  mediaWrapper: { marginTop: 12 },
  mediaLabel: { fontFamily: "Outfit_500Medium", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  exImage: { width: "100%", height: 160, borderRadius: 12 },
  videoPlayer: { borderRadius: 12, overflow: "hidden", marginTop: 4 },
  
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  modal: { backgroundColor: Colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingTop: 16, maxHeight: "90%", borderWidth: 1, borderColor: Colors.border, borderBottomWidth: 0, marginTop: "auto" },
  modalHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 20 },
  modalTitle: { fontFamily: "Outfit_700Bold", fontSize: 22, color: Colors.text, marginBottom: 20 },
  label: { fontFamily: "Outfit_500Medium", fontSize: 14, color: Colors.textSecondary, marginBottom: 8 },
  inputContainer: { backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, marginBottom: 16 },
  modalInput: { fontFamily: "Outfit_400Regular", fontSize: 16, color: Colors.text, paddingVertical: 12, flex: 1 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 0 },
  levelRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  levelChip: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  levelChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  levelChipText: { fontFamily: "Outfit_500Medium", fontSize: 13, color: Colors.textSecondary },
  levelChipTextActive: { color: Colors.primaryText },
  clientChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, marginRight: 8 },
  clientChipActive: { backgroundColor: Colors.accentBlue, borderColor: Colors.accentBlue },
  clientChipText: { fontFamily: "Outfit_500Medium", fontSize: 14, color: Colors.textSecondary },
  clientChipTextActive: { color: "#fff" },
  
  catalogSection: { backgroundColor: Colors.surface, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, marginBottom: 20 },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  catalogTitle: { fontFamily: "Outfit_600SemiBold", fontSize: 15, color: Colors.text },
  formBlock: { backgroundColor: Colors.surface + "60", padding: 16, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  blockTitle: { fontFamily: "Outfit_700Bold", fontSize: 18, color: Colors.accentOrange, marginBottom: 14 },
  
  importFromCatBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primary + "11", padding: 12, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: Colors.primary + "33" },
  importFromCatText: { color: Colors.primary, fontFamily: "Outfit_600SemiBold", marginLeft: 8, fontSize: 14 },
  
  backToFormBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, padding: 12, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  backToFormText: { marginLeft: 8, fontFamily: "Outfit_500Medium", color: Colors.text, fontSize: 15 },
  
  catItem: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: Colors.surface, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  catItemName: { fontFamily: "Outfit_600SemiBold", fontSize: 16, color: Colors.text, marginBottom: 4 },
  catItemCatWrapper: { backgroundColor: Colors.accentOrange + "22", alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  catItemCat: { fontFamily: "Outfit_700Bold", fontSize: 10, color: Colors.accentOrange, textTransform: 'uppercase' },

  mediaPickBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: Colors.surface, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: Colors.primary + "44", borderStyle: "dashed", marginBottom: 10 },
  mediaPickBtnSuccess: { borderColor: Colors.success + "66", borderStyle: "solid", backgroundColor: Colors.success + "0F" },
  mediaPickBtnText: { fontFamily: "Outfit_500Medium", fontSize: 14, color: Colors.primary, flex: 1 },
  previewImage: { width: "100%", height: 140, borderRadius: 12, marginBottom: 14 },
  confirmBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 8, marginBottom: 10 },
  btnDisabled: { opacity: 0.5 },
  confirmBtnText: { fontFamily: "Outfit_700Bold", fontSize: 16, color: Colors.primaryText },
  cancelBtn: { paddingVertical: 14, alignItems: "center" },
  cancelBtnText: { fontFamily: "Outfit_500Medium", fontSize: 16, color: Colors.textSecondary },
  errorBox: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(239,68,68,0.12)", borderRadius: 12, padding: 12, marginBottom: 16, gap: 8, borderWidth: 1, borderColor: "rgba(239,68,68,0.3)" },
  errorText: { fontFamily: "Outfit_400Regular", color: Colors.error, fontSize: 14, flex: 1 },
});