import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  Platform, RefreshControl, Modal, ActivityIndicator, Image, Alert,
  KeyboardAvoidingView
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/context/auth";
import { useUpload } from "@/hooks/useUpload";
import { UploadProgressBar } from "@/components/MediaViewer";

// Importar Supabase
import { supabase } from "@/lib/supabase";

export default function ProgresoTrainerScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { user } = useAuth();
  
  const [showModal, setShowModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  
  // Nuevos campos
  const [genero, setGenero] = useState<"hombre" | "mujer">("mujer");
  const [grasa, setGrasa] = useState("");
  const [musculo, setMusculo] = useState("");
  const [cintura, setCintura] = useState("");
  const [brazo, setBrazo] = useState("");
  const [cadera, setCadera] = useState("");
  const [muslo, setMuslo] = useState("");

  const [notas, setNotas] = useState("");
  const [fotoUrl, setFotoUrl] = useState("");
  const [error, setError] = useState("");
  const photoUpload = useUpload();
  const [refreshing, setRefreshing] = useState(false);

  // 1. OBTENER LOS CLIENTES DEL ENTRENADOR DESDE SUPABASE
  const { data: clientsData } = useQuery({
    queryKey: ["clients", user?.id],
    queryFn: async () => {
      if (!user?.id) return { clients: [] };
      const { data, error } = await supabase
        .from("perfiles")
        .select("*")
        .eq("rol", "cliente")
        .eq("entrenador_id", user.id);

      if (error) throw new Error(error.message);
      return { clients: data };
    },
    enabled: !!user?.id,
  });

  const activeClients = clientsData?.clients || [];
  
  // Si no ha seleccionado a nadie, mostramos al primer cliente o a él mismo
  const targetClientId = selectedClient || (activeClients.length > 0 ? activeClients[0].id : user?.id);

  // 2. OBTENER EL PROGRESO DEL CLIENTE SELECCIONADO
  const { data: progressData, refetch } = useQuery({
    queryKey: ["progress", targetClientId],
    enabled: !!targetClientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("progreso")
        .select("*")
        .eq("cliente_id", targetClientId)
        .order("fecha", { ascending: false });

      if (error) throw new Error(error.message);
      return { entries: data || [] };
    },
  });

  // 3. GUARDAR UN NUEVO REGISTRO
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !targetClientId) throw new Error("Faltan datos de usuario");

      const { error } = await supabase
        .from("progreso")
        .insert([{
          cliente_id: targetClientId,
          entrenador_id: user.id,
          fecha,
          genero,
          grasa_corporal: grasa ? Number(grasa) : null,
          masa_muscular: musculo ? Number(musculo) : null,
          cintura: cintura ? Number(cintura) : null,
          brazo: brazo ? Number(brazo) : null,
          cadera: cadera ? Number(cadera) : null,
          muslo: muslo ? Number(muslo) : null,
          notas: notas || null,
          foto_url: fotoUrl || null,
        }]);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["progress", targetClientId] });
      setShowModal(false);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: any) => {
      setError(err.message || "Error al guardar");
      Alert.alert("Error", err.message);
    },
  });

  const resetForm = () => {
    setGrasa(""); setMusculo(""); setCintura(""); 
    setBrazo(""); setCadera(""); setMuslo("");
    setNotas(""); setFotoUrl(""); setError("");
    setFecha(new Date().toISOString().split("T")[0]);
    setGenero("mujer");
    photoUpload.reset();
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [targetClientId, refetch]);

  const pickPhoto = async () => {
    photoUpload.reset();
    const result = await photoUpload.pickAndUpload("images");
    if (result) {
      setFotoUrl(result.url);
    }
  };

  const entries = progressData?.entries || [];
  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);
  const latestEntry = entries[0];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topInset + 16 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Progreso</Text>
            <Text style={styles.subtitle}>Seguimiento de métricas</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]}
            onPress={() => setShowModal(true)}
          >
            <Ionicons name="add" size={24} color={Colors.primaryText} />
          </Pressable>
        </View>

        {/* Client Selector */}
        {activeClients.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <Pressable
              style={[styles.clientTab, selectedClient === user?.id && styles.clientTabActive]}
              onPress={() => setSelectedClient(user?.id || "")}
            >
              <Text style={[styles.clientTabText, selectedClient === user?.id && styles.clientTabTextActive]}>
                Yo
              </Text>
            </Pressable>
            {activeClients.map((c: any) => (
              <Pressable
                key={c.id}
                style={[styles.clientTab, targetClientId === c.id && styles.clientTabActive]}
                onPress={() => setSelectedClient(c.id)}
              >
                <Text style={[styles.clientTabText, targetClientId === c.id && styles.clientTabTextActive]}>
                  {c.nombre} {c.apellido}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* Latest Metrics */}
        {latestEntry ? (
          <View style={styles.metricsCard}>
            <View style={styles.metricsHeaderRow}>
              <View>
                <Text style={styles.metricsTitle}>Última medición</Text>
                <Text style={styles.metricsDate}>{latestEntry.fecha}</Text>
              </View>
              {latestEntry.genero && (
                <View style={styles.genderBadge}>
                  <Ionicons name={latestEntry.genero === "mujer" ? "woman" : "man"} size={14} color={Colors.primary} />
                  <Text style={styles.genderBadgeText}>{latestEntry.genero}</Text>
                </View>
              )}
            </View>
            
            <View style={styles.metricsGrid}>
              {latestEntry.grasa_corporal && (
                <View style={styles.metricItem}>
                  <Text style={styles.metricValue}>{latestEntry.grasa_corporal}%</Text>
                  <Text style={styles.metricLabel}>grasa</Text>
                </View>
              )}
              {latestEntry.masa_muscular && (
                <View style={styles.metricItem}>
                  <Text style={styles.metricValue}>{latestEntry.masa_muscular}%</Text>
                  <Text style={styles.metricLabel}>músculo</Text>
                </View>
              )}
              {latestEntry.cintura && (
                <View style={styles.metricItem}>
                  <Text style={styles.metricValue}>{latestEntry.cintura}</Text>
                  <Text style={styles.metricLabel}>cm cintura</Text>
                </View>
              )}
              {latestEntry.brazo && (
                <View style={styles.metricItem}>
                  <Text style={styles.metricValue}>{latestEntry.brazo}</Text>
                  <Text style={styles.metricLabel}>cm brazo</Text>
                </View>
              )}
              {latestEntry.cadera && (
                <View style={styles.metricItem}>
                  <Text style={styles.metricValue}>{latestEntry.cadera}</Text>
                  <Text style={styles.metricLabel}>cm cadera</Text>
                </View>
              )}
              {latestEntry.muslo && (
                <View style={styles.metricItem}>
                  <Text style={styles.metricValue}>{latestEntry.muslo}</Text>
                  <Text style={styles.metricLabel}>cm muslo</Text>
                </View>
              )}
            </View>
          </View>
        ) : null}

        {/* Progress History */}
        <Text style={styles.sectionTitle}>Historial</Text>

        {entries.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="trending-up-outline" size={56} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Sin registros aún</Text>
            <Text style={styles.emptySubtitle}>Registra el primer progreso</Text>
            <Pressable style={styles.emptyBtn} onPress={() => setShowModal(true)}>
              <Text style={styles.emptyBtnText}>Agregar registro</Text>
            </Pressable>
          </View>
        ) : (
          entries.map((entry: any) => (
            <View key={entry.id} style={styles.entryCard}>
              <View style={styles.entryHeader}>
                <Text style={styles.entryDate}>{entry.fecha}</Text>
                {entry.foto_url && (
                  <Ionicons name="image" size={16} color={Colors.primary} />
                )}
              </View>
              <View style={styles.entryMetrics}>
                {entry.grasa_corporal && <Text style={styles.entryMetric}>{entry.grasa_corporal}% grasa</Text>}
                {entry.masa_muscular && <Text style={styles.entryMetric}>{entry.masa_muscular}% musc</Text>}
                {entry.cintura && <Text style={styles.entryMetric}>{entry.cintura} cm cint</Text>}
                {entry.brazo && <Text style={styles.entryMetric}>{entry.brazo} cm br</Text>}
                {entry.cadera && <Text style={styles.entryMetric}>{entry.cadera} cm cad</Text>}
                {entry.muslo && <Text style={styles.entryMetric}>{entry.muslo} cm mus</Text>}
              </View>
              {entry.notas && (
                <Text style={styles.entryNotas} numberOfLines={2}>{entry.notas}</Text>
              )}
              {entry.foto_url && (
                <Image source={{ uri: entry.foto_url }} style={styles.entryPhoto} resizeMode="cover" />
              )}
            </View>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* MODAL DE NUEVO REGISTRO CON PROTECCIÓN DE TECLADO */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => { setShowModal(false); resetForm(); }}>
        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.overlay} onPress={() => { setShowModal(false); resetForm(); }} />
          
          <View style={[styles.modal, { paddingBottom: insets.bottom + 24, maxHeight: "85%" }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Nuevo Registro</Text>

            <ScrollView 
              showsVerticalScrollIndicator={false} 
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              {error ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={16} color={Colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Text style={styles.label}>Fecha</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.modalInput}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors.textMuted}
                  value={fecha}
                  onChangeText={setFecha}
                />
              </View>

              <Text style={styles.label}>Género del Paciente</Text>
              <View style={styles.genderRow}>
                <Pressable
                  style={[styles.genderBtn, genero === "mujer" && styles.genderBtnActive]}
                  onPress={() => setGenero("mujer")}
                >
                  <Ionicons name="woman" size={18} color={genero === "mujer" ? Colors.primaryText : Colors.textSecondary} />
                  <Text style={[styles.genderBtnText, genero === "mujer" && styles.genderBtnTextActive]}>Mujer</Text>
                </Pressable>
                <Pressable
                  style={[styles.genderBtn, genero === "hombre" && styles.genderBtnActive]}
                  onPress={() => setGenero("hombre")}
                >
                  <Ionicons name="man" size={18} color={genero === "hombre" ? Colors.primaryText : Colors.textSecondary} />
                  <Text style={[styles.genderBtnText, genero === "hombre" && styles.genderBtnTextActive]}>Hombre</Text>
                </Pressable>
              </View>

              {/* Porcentajes */}
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Grasa (%)</Text>
                  <View style={styles.inputContainer}>
                    <TextInput style={styles.modalInput} placeholder="18.5" placeholderTextColor={Colors.textMuted} value={grasa} onChangeText={setGrasa} keyboardType="decimal-pad" />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Músculo (%)</Text>
                  <View style={styles.inputContainer}>
                    <TextInput style={styles.modalInput} placeholder="40.0" placeholderTextColor={Colors.textMuted} value={musculo} onChangeText={setMusculo} keyboardType="decimal-pad" />
                  </View>
                </View>
              </View>

              {/* Circunferencias */}
              <Text style={[styles.label, { marginTop: 4, color: Colors.text }]}>Circunferencias (cm)</Text>
              
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Brazo</Text>
                  <View style={styles.inputContainer}>
                    <TextInput style={styles.modalInput} placeholder="35" placeholderTextColor={Colors.textMuted} value={brazo} onChangeText={setBrazo} keyboardType="decimal-pad" />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Cintura</Text>
                  <View style={styles.inputContainer}>
                    <TextInput style={styles.modalInput} placeholder="80" placeholderTextColor={Colors.textMuted} value={cintura} onChangeText={setCintura} keyboardType="decimal-pad" />
                  </View>
                </View>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Cadera</Text>
                  <View style={styles.inputContainer}>
                    <TextInput style={styles.modalInput} placeholder="95" placeholderTextColor={Colors.textMuted} value={cadera} onChangeText={setCadera} keyboardType="decimal-pad" />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Muslo Medio</Text>
                  <View style={styles.inputContainer}>
                    <TextInput style={styles.modalInput} placeholder="60" placeholderTextColor={Colors.textMuted} value={muslo} onChangeText={setMuslo} keyboardType="decimal-pad" />
                  </View>
                </View>
              </View>

              <Text style={styles.label}>Notas</Text>
              <View style={[styles.inputContainer, { alignItems: "flex-start" }]}>
                <TextInput
                  style={[styles.modalInput, { height: 70, textAlignVertical: "top" }]}
                  placeholder="Observaciones o sensaciones..."
                  placeholderTextColor={Colors.textMuted}
                  value={notas}
                  onChangeText={setNotas}
                  multiline
                />
              </View>

              {/* Photo Upload */}
              <Text style={styles.label}>Foto de progreso</Text>
              <Pressable
                style={({ pressed }) => [styles.photoBtn, pressed && { opacity: 0.8 }]}
                onPress={pickPhoto}
                disabled={photoUpload.uploading}
              >
                {photoUpload.uploading ? (
                  <View style={styles.uploadingRow}>
                    <ActivityIndicator color={Colors.primary} size="small" />
                    <Text style={styles.photoBtnText}>Subiendo... {photoUpload.progress}%</Text>
                  </View>
                ) : fotoUrl ? (
                  <View style={styles.uploadingRow}>
                    <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                    <Text style={[styles.photoBtnText, { color: Colors.success }]}>Foto añadida</Text>
                  </View>
                ) : (
                  <View style={styles.uploadingRow}>
                    <Ionicons name="camera" size={20} color={Colors.primary} />
                    <Text style={styles.photoBtnText}>Añadir foto de progreso</Text>
                  </View>
                )}
              </Pressable>
              <UploadProgressBar
                visible={photoUpload.uploading}
                progress={photoUpload.progress}
                error={photoUpload.error}
                onRetry={photoUpload.error ? () => { photoUpload.reset(); pickPhoto(); } : undefined}
              />
              {fotoUrl ? (
                <Image source={{ uri: fotoUrl }} style={styles.previewImg} resizeMode="cover" />
              ) : null}

              <Pressable
                style={({ pressed }) => [
                  styles.confirmBtn,
                  (createMutation.isPending || photoUpload.uploading) && styles.btnDisabled,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => {
                  if (!fecha) return setError("La fecha es requerida");
                  if (photoUpload.uploading) return setError("Espera a que termine la subida");
                  createMutation.mutate();
                }}
                disabled={createMutation.isPending || photoUpload.uploading}
              >
                {createMutation.isPending ? <ActivityIndicator color={Colors.primaryText} /> : <Text style={styles.confirmBtnText}>Guardar Registro</Text>}
              </Pressable>

              <Pressable style={styles.cancelBtn} onPress={() => { setShowModal(false); resetForm(); }}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </Pressable>

            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title: { fontFamily: "Outfit_700Bold", fontSize: 30, color: Colors.text, letterSpacing: -0.5 },
  subtitle: { fontFamily: "Outfit_400Regular", fontSize: 15, color: Colors.textSecondary, marginTop: 2 },
  addBtn: { backgroundColor: Colors.primary, width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  clientTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, marginRight: 8 },
  clientTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  clientTabText: { fontFamily: "Outfit_500Medium", fontSize: 13, color: Colors.textSecondary },
  clientTabTextActive: { color: Colors.primaryText, fontFamily: "Outfit_700Bold" },
  metricsCard: { backgroundColor: Colors.card, borderRadius: 18, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: Colors.border },
  metricsHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  metricsTitle: { fontFamily: "Outfit_700Bold", fontSize: 16, color: Colors.text },
  metricsDate: { fontFamily: "Outfit_400Regular", fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  genderBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.primary + "15", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  genderBadgeText: { fontFamily: "Outfit_600SemiBold", fontSize: 12, color: Colors.primary, textTransform: "capitalize" },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metricItem: { backgroundColor: Colors.surface, borderRadius: 12, padding: 12, minWidth: 80, flex: 1, alignItems: "center", borderWidth: 1, borderColor: Colors.border },
  metricValue: { fontFamily: "Outfit_700Bold", fontSize: 18, color: Colors.primary },
  metricLabel: { fontFamily: "Outfit_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  sectionTitle: { fontFamily: "Outfit_700Bold", fontSize: 18, color: Colors.text, marginBottom: 14 },
  emptyState: { alignItems: "center", paddingTop: 40, gap: 10 },
  emptyTitle: { fontFamily: "Outfit_700Bold", fontSize: 20, color: Colors.text, marginTop: 8 },
  emptySubtitle: { fontFamily: "Outfit_400Regular", fontSize: 15, color: Colors.textMuted },
  emptyBtn: { backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 12 },
  emptyBtnText: { fontFamily: "Outfit_600SemiBold", fontSize: 15, color: Colors.primaryText },
  entryCard: { backgroundColor: Colors.card, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  entryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  entryDate: { fontFamily: "Outfit_600SemiBold", fontSize: 15, color: Colors.text },
  entryMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  entryMetric: { fontFamily: "Outfit_500Medium", fontSize: 12, color: Colors.primary, backgroundColor: Colors.primary + "15", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  entryNotas: { fontFamily: "Outfit_400Regular", fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  entryPhoto: { width: "100%", height: 160, borderRadius: 12, marginTop: 10 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  modal: { backgroundColor: Colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingTop: 16, maxHeight: "85%", borderWidth: 1, borderColor: Colors.border, borderBottomWidth: 0, marginTop: "auto" },
  modalHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 20 },
  modalTitle: { fontFamily: "Outfit_700Bold", fontSize: 22, color: Colors.text, marginBottom: 20 },
  label: { fontFamily: "Outfit_500Medium", fontSize: 14, color: Colors.textSecondary, marginBottom: 8 },
  genderRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  genderBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 14, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  genderBtnActive: { backgroundColor: Colors.primary + "15", borderColor: Colors.primary },
  genderBtnText: { fontFamily: "Outfit_500Medium", fontSize: 14, color: Colors.textSecondary },
  genderBtnTextActive: { color: Colors.primary, fontFamily: "Outfit_600SemiBold" },
  inputContainer: { backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, marginBottom: 16 },
  modalInput: { fontFamily: "Outfit_400Regular", fontSize: 16, color: Colors.text, paddingVertical: 12, flex: 1 },
  row: { flexDirection: "row", gap: 12 },
  photoBtn: { backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.primary + "44", borderStyle: "dashed", paddingVertical: 14, alignItems: "center", marginBottom: 12 },
  uploadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  photoBtnText: { fontFamily: "Outfit_500Medium", fontSize: 14, color: Colors.primary },
  previewImg: { width: "100%", height: 140, borderRadius: 12, marginBottom: 16 },
  errorBox: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(239,68,68,0.12)", borderRadius: 12, padding: 12, marginBottom: 16, gap: 8, borderWidth: 1, borderColor: "rgba(239,68,68,0.3)" },
  errorText: { fontFamily: "Outfit_400Regular", color: Colors.error, fontSize: 14, flex: 1 },
  confirmBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 8, marginBottom: 10 },
  btnDisabled: { opacity: 0.6 },
  confirmBtnText: { fontFamily: "Outfit_700Bold", fontSize: 16, color: Colors.primaryText },
  cancelBtn: { paddingVertical: 14, alignItems: "center" },
  cancelBtnText: { fontFamily: "Outfit_500Medium", fontSize: 16, color: Colors.textSecondary },
});