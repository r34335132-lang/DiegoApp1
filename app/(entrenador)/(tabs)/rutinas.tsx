import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
  Platform, RefreshControl, Modal, ActivityIndicator, ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import * as Haptics from "expo-haptics";

// Importaciones de Supabase
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth";

const NIVELES = ["principiante", "intermedio", "avanzado"];

export default function RutinasScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { user } = useAuth(); // <-- Obtenemos el entrenador
  const [showModal, setShowModal] = useState(false);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [nivel, setNivel] = useState("intermedio");
  // CAMBIO: Ahora es un arreglo para múltiples clientes
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  // 1. OBTENER RUTINAS DE SUPABASE (Actualizado para tabla intermedia)
  const { data: routinesData, refetch } = useQuery({
    queryKey: ["routines", user?.id],
    queryFn: async () => {
      if (!user?.id) return { routines: [] };

      const { data, error } = await supabase
        .from("rutinas")
        .select(`
          *,
          rutina_clientes (
            perfiles:cliente_id (nombre, apellido)
          )
        `)
        .eq("entrenador_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);

      // Formateamos para sacar un texto con todos los nombres (Ej: "Diego, Juan")
      const formatted = (data || []).map((r: any) => {
        const assigned = r.rutina_clientes
          ?.map((rc: any) => `${rc.perfiles?.nombre} ${rc.perfiles?.apellido}`)
          .filter(Boolean)
          .join(", ");
        return {
          ...r,
          assigned_names: assigned || null,
        };
      });

      return { routines: formatted };
    },
    enabled: !!user?.id,
  });

  // 2. OBTENER CLIENTES (Para el selector del Modal)
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

  // 3. CREAR RUTINA (Actualizado para guardar múltiples en la tabla intermedia)
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("No autenticado");

      // Primero creamos la rutina base (ya no pasamos cliente_id aquí)
      const { data: newRoutine, error: routineError } = await supabase
        .from("rutinas")
        .insert([{
          nombre: nombre.trim(),
          descripcion: descripcion.trim() || null,
          nivel,
          entrenador_id: user.id
        }])
        .select()
        .single();

      if (routineError) throw new Error(routineError.message);

      // Luego insertamos las relaciones con los clientes elegidos en la tabla intermedia
      if (clientIds.length > 0) {
        const inserts = clientIds.map(cId => ({
          rutina_id: newRoutine.id,
          cliente_id: cId
        }));
        const { error: clientsError } = await supabase.from("rutina_clientes").insert(inserts);
        if (clientsError) throw new Error(clientsError.message);
      }

      return newRoutine;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routines", user?.id] });
      setShowModal(false);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: any) => {
      setError(err.message || "Error al crear rutina");
    },
  });

  // 4. ELIMINAR RUTINA
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("rutinas")
        .delete()
        .eq("id", id);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routines", user?.id] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const resetForm = () => {
    setNombre("");
    setDescripcion("");
    setNivel("intermedio");
    setClientIds([]); // Reseteamos el arreglo
    setError("");
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const routines = (routinesData?.routines || []).filter((r: any) =>
    !search || r.nombre.toLowerCase().includes(search.toLowerCase())
  );

  const activeClients = clientsData?.clients || [];
  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);

  const nivelColor = (n: string) => {
    if (n === "principiante") return Colors.success;
    if (n === "avanzado") return Colors.accent;
    return Colors.accentBlue;
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ paddingTop: topInset + 16, paddingHorizontal: 20 }}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Rutinas</Text>
            <Text style={styles.subtitle}>{routines.length} rutinas creadas</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]}
            onPress={() => setShowModal(true)}
          >
            <Ionicons name="add" size={24} color={Colors.primaryText} />
          </Pressable>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar rutina..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <FlatList
        data={routines}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!routines.length}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="barbell-outline" size={56} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>
              {search ? "Sin resultados" : "Sin rutinas aún"}
            </Text>
            <Text style={styles.emptySubtitle}>
              Crea tu primera rutina de entrenamiento
            </Text>
            {!search && (
              <Pressable style={styles.emptyBtn} onPress={() => setShowModal(true)}>
                <Text style={styles.emptyBtnText}>Crear rutina</Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.routineCard, pressed && { opacity: 0.85 }]}
            onPress={() => router.push({ pathname: "/(entrenador)/rutina/[id]", params: { id: item.id } })}
          >
            <View style={styles.cardTop}>
              <View style={styles.routineIconWrapper}>
                <Ionicons name="barbell" size={22} color={Colors.primary} />
              </View>
              <View style={styles.cardActions}>
                <Pressable
                  style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
                  onPress={() => deleteMutation.mutate(item.id)}
                >
                  <Ionicons name="trash-outline" size={16} color={Colors.error} />
                </Pressable>
              </View>
            </View>

            <Text style={styles.routineName}>{item.nombre}</Text>
            {item.descripcion ? (
              <Text style={styles.routineDesc} numberOfLines={2}>{item.descripcion}</Text>
            ) : null}

            <View style={styles.cardBottom}>
              <View style={[styles.nivelBadge, { backgroundColor: nivelColor(item.nivel) + "22" }]}>
                <Text style={[styles.nivelText, { color: nivelColor(item.nivel) }]}>
                  {item.nivel}
                </Text>
              </View>
              {item.assigned_names && (
                <Text style={styles.clientText} numberOfLines={1}>
                  <Ionicons name="people" size={12} color={Colors.textMuted} /> {item.assigned_names}
                </Text>
              )}
              <View style={styles.arrowBtn}>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </View>
            </View>
          </Pressable>
        )}
      />

      {/* Create Routine Modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => { setShowModal(false); resetForm(); }}>
        <Pressable style={styles.overlay} onPress={() => { setShowModal(false); resetForm(); }} />
        <ScrollView
          style={[styles.modal, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Nueva Rutina</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Nombre de la rutina *</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.modalInput}
              placeholder="Ej: Día de piernas"
              placeholderTextColor={Colors.textMuted}
              value={nombre}
              onChangeText={(t) => { setNombre(t); setError(""); }}
            />
          </View>

          <Text style={styles.label}>Descripción (opcional)</Text>
          <View style={[styles.inputContainer, { alignItems: "flex-start" }]}>
            <TextInput
              style={[styles.modalInput, { height: 80, textAlignVertical: "top" }]}
              placeholder="Describe el objetivo de esta rutina..."
              placeholderTextColor={Colors.textMuted}
              value={descripcion}
              onChangeText={setDescripcion}
              multiline
            />
          </View>

          <Text style={styles.label}>Nivel</Text>
          <View style={styles.nivelSelector}>
            {NIVELES.map((n) => (
              <Pressable
                key={n}
                style={[styles.nivelOption, nivel === n && styles.nivelOptionActive]}
                onPress={() => setNivel(n)}
              >
                <Text style={[styles.nivelOptionText, nivel === n && styles.nivelOptionTextActive]}>
                  {n.charAt(0).toUpperCase() + n.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          {activeClients.length > 0 && (
            <>
              <Text style={styles.label}>Asignar a pacientes (opcional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.clientsScroll}>
                {activeClients.map((c: any) => {
                  const isSelected = clientIds.includes(c.id);
                  return (
                    <Pressable
                      key={c.id}
                      style={[styles.clientOption, isSelected && styles.clientOptionActive]}
                      onPress={() => {
                        setClientIds(prev => 
                          isSelected ? prev.filter(id => id !== c.id) : [...prev, c.id]
                        );
                      }}
                    >
                      <Text style={[styles.clientOptionText, isSelected && styles.clientOptionTextActive]}>
                        {c.nombre} {c.apellido}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.confirmBtn,
              createMutation.isPending && styles.btnDisabled,
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => {
              if (!nombre.trim()) return setError("El nombre es requerido");
              createMutation.mutate();
            }}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <ActivityIndicator color={Colors.primaryText} />
            ) : (
              <Text style={styles.confirmBtnText}>Crear Rutina</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.cancelBtn}
            onPress={() => { setShowModal(false); resetForm(); }}
          >
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </Pressable>

          <View style={{ height: 40 }} />
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  title: {
    fontFamily: "Outfit_700Bold",
    fontSize: 30,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: "Outfit_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  addBtn: {
    backgroundColor: Colors.primary,
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Outfit_400Regular",
    fontSize: 15,
    color: Colors.text,
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 120,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
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
    textAlign: "center",
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
  routineCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  routineIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primary + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.error + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  routineName: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: Colors.text,
    marginBottom: 4,
  },
  routineDesc: {
    fontFamily: "Outfit_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 12,
    lineHeight: 20,
  },
  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nivelBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  nivelText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
    textTransform: "capitalize",
  },
  clientText: {
    fontFamily: "Outfit_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    flex: 1,
    paddingRight: 10,
  },
  arrowBtn: {
    marginLeft: "auto",
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
    maxHeight: "85%",
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
    paddingVertical: 14,
    flex: 1,
  },
  nivelSelector: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  nivelOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  nivelOptionActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  nivelOptionText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  nivelOptionTextActive: {
    color: Colors.primaryText,
    fontFamily: "Outfit_700Bold",
  },
  clientsScroll: {
    marginBottom: 16,
  },
  clientOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
  },
  clientOptionActive: {
    backgroundColor: Colors.accentBlue,
    borderColor: Colors.accentBlue,
  },
  clientOptionText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  clientOptionTextActive: {
    color: "#fff",
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