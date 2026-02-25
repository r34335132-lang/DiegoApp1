import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  Platform, RefreshControl, Modal, ActivityIndicator, Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/context/auth";

export default function MiProgresoScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const [peso, setPeso] = useState("");
  const [grasa, setGrasa] = useState("");
  const [musculo, setMusculo] = useState("");
  const [cintura, setCintura] = useState("");
  const [notas, setNotas] = useState("");
  const [fotoUrl, setFotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const { data: progressData, refetch } = useQuery({
    queryKey: ["/api/progress", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/progress");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/progress", {
        fecha,
        peso: peso ? Number(peso) : undefined,
        grasaCorporal: grasa ? Number(grasa) : undefined,
        masaMuscular: musculo ? Number(musculo) : undefined,
        cintura: cintura ? Number(cintura) : undefined,
        notas: notas || undefined,
        fotoUrl: fotoUrl || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/progress"] });
      setShowModal(false);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: any) => setError(err.message || "Error al guardar"),
  });

  const resetForm = () => {
    setPeso(""); setGrasa(""); setMusculo(""); setCintura("");
    setNotas(""); setFotoUrl(""); setError("");
    setFecha(new Date().toISOString().split("T")[0]);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    setUploadProgress(0);
    try {
      const asset = result.assets[0];
      const name = asset.fileName || "progress.jpg";
      const type = asset.mimeType || "image/jpeg";
      const formData = new FormData();
      const fileObj = new File([{ uri: asset.uri } as any], name, { type });
      formData.append("file", fileObj as any);
      const baseUrl = getApiUrl();
      const uploadUrl = new URL("/api/upload", baseUrl).toString();
      let progress = 0;
      const interval = setInterval(() => {
        progress = Math.min(progress + 15, 90);
        setUploadProgress(progress);
      }, 200);
      const res = await expoFetch(uploadUrl, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      clearInterval(interval);
      setUploadProgress(100);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setFotoUrl(data.url);
    } catch (err: any) {
      setError("Error al subir: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const entries = progressData?.entries || [];
  const latestEntry = entries[0];
  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);

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
            <Text style={styles.title}>Mi Progreso</Text>
            <Text style={styles.subtitle}>{entries.length} registros</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]}
            onPress={() => setShowModal(true)}
          >
            <Ionicons name="add" size={24} color={Colors.primaryText} />
          </Pressable>
        </View>

        {latestEntry && (
          <View style={styles.metricsCard}>
            <Text style={styles.metricsTitle}>Última medición</Text>
            <Text style={styles.metricsDate}>{latestEntry.fecha}</Text>
            <View style={styles.metricsGrid}>
              {latestEntry.peso && (
                <View style={styles.metricItem}>
                  <Text style={styles.metricValue}>{latestEntry.peso}</Text>
                  <Text style={styles.metricLabel}>kg peso</Text>
                </View>
              )}
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
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>Historial</Text>

        {entries.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="trending-up-outline" size={56} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Sin registros</Text>
            <Text style={styles.emptySubtitle}>
              Registra tu primer progreso y lleva un control de tu evolución
            </Text>
            <Pressable style={styles.emptyBtn} onPress={() => setShowModal(true)}>
              <Text style={styles.emptyBtnText}>Registrar ahora</Text>
            </Pressable>
          </View>
        ) : (
          entries.map((entry: any) => (
            <View key={entry.id} style={styles.entryCard}>
              <View style={styles.entryHeader}>
                <Text style={styles.entryDate}>{entry.fecha}</Text>
                {entry.foto_url && (
                  <Ionicons name="camera" size={16} color={Colors.primary} />
                )}
              </View>
              <View style={styles.entryMetrics}>
                {entry.peso && <Text style={styles.entryMetric}>{entry.peso} kg</Text>}
                {entry.grasa_corporal && <Text style={styles.entryMetric}>{entry.grasa_corporal}% grasa</Text>}
                {entry.masa_muscular && <Text style={styles.entryMetric}>{entry.masa_muscular}% músculo</Text>}
                {entry.cintura && <Text style={styles.entryMetric}>{entry.cintura} cm cintura</Text>}
              </View>
              {entry.notas && (
                <Text style={styles.entryNotas} numberOfLines={3}>{entry.notas}</Text>
              )}
              {entry.foto_url && (
                <Image source={{ uri: entry.foto_url }} style={styles.entryPhoto} resizeMode="cover" />
              )}
            </View>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => { setShowModal(false); resetForm(); }}>
        <Pressable style={styles.overlay} onPress={() => { setShowModal(false); resetForm(); }} />
        <ScrollView
          style={[styles.modal, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Nuevo Registro</Text>

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

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Peso (kg)</Text>
              <View style={styles.inputContainer}>
                <TextInput style={styles.modalInput} placeholder="75.5" placeholderTextColor={Colors.textMuted} value={peso} onChangeText={setPeso} keyboardType="decimal-pad" />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Grasa (%)</Text>
              <View style={styles.inputContainer}>
                <TextInput style={styles.modalInput} placeholder="18.5" placeholderTextColor={Colors.textMuted} value={grasa} onChangeText={setGrasa} keyboardType="decimal-pad" />
              </View>
            </View>
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Músculo (%)</Text>
              <View style={styles.inputContainer}>
                <TextInput style={styles.modalInput} placeholder="40.0" placeholderTextColor={Colors.textMuted} value={musculo} onChangeText={setMusculo} keyboardType="decimal-pad" />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Cintura (cm)</Text>
              <View style={styles.inputContainer}>
                <TextInput style={styles.modalInput} placeholder="80" placeholderTextColor={Colors.textMuted} value={cintura} onChangeText={setCintura} keyboardType="decimal-pad" />
              </View>
            </View>
          </View>

          <Text style={styles.label}>Notas</Text>
          <View style={[styles.inputContainer, { alignItems: "flex-start" }]}>
            <TextInput
              style={[styles.modalInput, { height: 70, textAlignVertical: "top" }]}
              placeholder="¿Cómo te sentiste hoy?"
              placeholderTextColor={Colors.textMuted}
              value={notas}
              onChangeText={setNotas}
              multiline
            />
          </View>

          <Pressable
            style={({ pressed }) => [styles.photoBtn, pressed && { opacity: 0.8 }]}
            onPress={pickPhoto}
            disabled={uploading}
          >
            {uploading ? (
              <View style={styles.uploadRow}>
                <ActivityIndicator color={Colors.primary} size="small" />
                <Text style={styles.photoBtnText}>Subiendo... {uploadProgress}%</Text>
              </View>
            ) : fotoUrl ? (
              <View style={styles.uploadRow}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                <Text style={[styles.photoBtnText, { color: Colors.success }]}>Foto añadida</Text>
              </View>
            ) : (
              <View style={styles.uploadRow}>
                <Ionicons name="camera" size={20} color={Colors.primary} />
                <Text style={styles.photoBtnText}>Añadir foto de progreso</Text>
              </View>
            )}
          </Pressable>
          {fotoUrl ? <Image source={{ uri: fotoUrl }} style={styles.previewImg} resizeMode="cover" /> : null}

          <Pressable
            style={({ pressed }) => [
              styles.confirmBtn,
              (createMutation.isPending || uploading) && styles.btnDisabled,
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => {
              if (!fecha) return setError("La fecha es requerida");
              createMutation.mutate();
            }}
            disabled={createMutation.isPending || uploading}
          >
            {createMutation.isPending ? <ActivityIndicator color={Colors.primaryText} /> : <Text style={styles.confirmBtnText}>Guardar Registro</Text>}
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
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title: { fontFamily: "Outfit_700Bold", fontSize: 30, color: Colors.text, letterSpacing: -0.5 },
  subtitle: { fontFamily: "Outfit_400Regular", fontSize: 15, color: Colors.textSecondary, marginTop: 2 },
  addBtn: { backgroundColor: Colors.primary, width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  metricsCard: { backgroundColor: Colors.card, borderRadius: 18, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: Colors.border },
  metricsTitle: { fontFamily: "Outfit_700Bold", fontSize: 16, color: Colors.text },
  metricsDate: { fontFamily: "Outfit_400Regular", fontSize: 13, color: Colors.textMuted, marginBottom: 16, marginTop: 2 },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metricItem: { backgroundColor: Colors.surface, borderRadius: 12, padding: 12, minWidth: 80, alignItems: "center", borderWidth: 1, borderColor: Colors.border },
  metricValue: { fontFamily: "Outfit_700Bold", fontSize: 20, color: Colors.primary },
  metricLabel: { fontFamily: "Outfit_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  sectionTitle: { fontFamily: "Outfit_700Bold", fontSize: 18, color: Colors.text, marginBottom: 14 },
  emptyState: { alignItems: "center", paddingTop: 40, gap: 12, paddingHorizontal: 20 },
  emptyTitle: { fontFamily: "Outfit_700Bold", fontSize: 22, color: Colors.text, marginTop: 8 },
  emptySubtitle: { fontFamily: "Outfit_400Regular", fontSize: 15, color: Colors.textMuted, textAlign: "center", lineHeight: 22 },
  emptyBtn: { backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 12 },
  emptyBtnText: { fontFamily: "Outfit_600SemiBold", fontSize: 15, color: Colors.primaryText },
  entryCard: { backgroundColor: Colors.card, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  entryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  entryDate: { fontFamily: "Outfit_600SemiBold", fontSize: 15, color: Colors.text },
  entryMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  entryMetric: { fontFamily: "Outfit_500Medium", fontSize: 13, color: Colors.primary, backgroundColor: Colors.primary + "15", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  entryNotas: { fontFamily: "Outfit_400Regular", fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  entryPhoto: { width: "100%", height: 160, borderRadius: 12, marginTop: 10 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  modal: { backgroundColor: Colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingTop: 16, maxHeight: "90%", borderWidth: 1, borderColor: Colors.border, borderBottomWidth: 0 },
  modalHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 20 },
  modalTitle: { fontFamily: "Outfit_700Bold", fontSize: 22, color: Colors.text, marginBottom: 20 },
  label: { fontFamily: "Outfit_500Medium", fontSize: 14, color: Colors.textSecondary, marginBottom: 8 },
  inputContainer: { backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, marginBottom: 16 },
  modalInput: { fontFamily: "Outfit_400Regular", fontSize: 16, color: Colors.text, paddingVertical: 12, flex: 1 },
  row: { flexDirection: "row", gap: 12 },
  photoBtn: { backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.primary + "44", borderStyle: "dashed", paddingVertical: 14, alignItems: "center", marginBottom: 12 },
  uploadRow: { flexDirection: "row", alignItems: "center", gap: 8 },
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
