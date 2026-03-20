import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  Platform, RefreshControl, Image, Modal, ActivityIndicator, KeyboardAvoidingView,
  Alert
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import * as Haptics from "expo-haptics";
import DateTimePicker from '@react-native-community/datetimepicker';

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth";

export default function ClientesScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { user } = useAuth();
  
  // Estado para el modal de invitar
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  // Estado para el modal de editar membresía y estado
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedClientToEdit, setSelectedClientToEdit] = useState<any>(null);
  
  // Fecha
  const [fechaMembresia, setFechaMembresia] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // Estado manual
  const [isClientActive, setIsClientActive] = useState(true);

  const { data, refetch } = useQuery({
    queryKey: ["clients", user?.id],
    queryFn: async () => {
      if (!user?.id) return { clients: [] };

      const { data: clientesActivos, error: errActivos } = await supabase
        .from("perfiles")
        .select("*")
        .eq("rol", "cliente")
        .eq("entrenador_id", user.id);

      const { data: invitaciones, error: errInvitaciones } = await supabase
        .from("invitaciones")
        .select("*")
        .eq("estado", "pendiente")
        .eq("entrenador_id", user.id);

      if (errActivos) throw new Error(errActivos.message);
      if (errInvitaciones) throw new Error(errInvitaciones.message);

      // Usamos el campo estado que acabamos de crear en Supabase
      const perfilesFormateados = (clientesActivos || []).map(c => ({
        ...c,
        status: c.estado || "activo" // Será "activo" o "inactivo"
      }));

      const invitacionesFormateadas = (invitaciones || []).map(inv => ({
        id: inv.id,
        invite_email: inv.email,
        status: "pendiente",
        role: "cliente"
      }));

      return { clients: [...perfilesFormateados, ...invitacionesFormateadas] };
    },
    enabled: !!user?.id,
  });

  const addMutation = useMutation({
    mutationFn: async (inviteEmail: string) => {
      if (!user?.id) throw new Error("No autenticado");

      const correoLimpio = inviteEmail.trim().toLowerCase();

      // Paso A: Buscar si el usuario ya existe
      const { data: clienteExistente, error: errBusqueda } = await supabase
        .from("perfiles")
        .select("*")
        .eq("email", correoLimpio)
        .maybeSingle();

      if (clienteExistente) {
        if (clienteExistente.rol !== "cliente") {
          throw new Error("Este correo pertenece a una cuenta de Entrenador.");
        }

        // Lo vinculamos 
        const { data: updatedData, error: updateError } = await supabase
          .from("perfiles")
          .update({ entrenador_id: user.id })
          .eq("id", clienteExistente.id)
          .select() 
          .single();

        if (updateError) throw new Error(updateError.message);
        if (!updatedData) throw new Error("Bloqueo de base de datos. Asegúrate de ejecutar el código SQL.");
        
        return { tipo: "vinculado" };
        
      } else {
        // Paso B: Si no existe, lo invitamos 
        const { data: insertedData, error: inviteError } = await supabase
          .from("invitaciones")
          .insert([{ email: correoLimpio, entrenador_id: user.id }])
          .select()
          .single();

        if (inviteError) throw new Error(inviteError.message);
        if (!insertedData) throw new Error("Bloqueo de base de datos al invitar.");
        
        return { tipo: "invitado" };
      }
    },
    onSuccess: (resultado) => {
      qc.invalidateQueries({ queryKey: ["clients", user?.id] });
      setShowModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (resultado.tipo === "vinculado") {
        Alert.alert("¡Cliente Vinculado!", "El usuario ya tenía cuenta y ha sido agregado a tu lista exitosamente.");
      } else {
        Alert.alert("Invitación Pendiente", "El usuario no tiene cuenta en la app. Se ha guardado en pendientes hasta que se registre.");
      }

      setEmail("");
      setError("");
    },
    onError: (err: any) => {
      setError(err.message || "Error al agregar paciente");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  // MUTACIÓN: Editar Cliente (Fecha y Estado) YA CORREGIDA
  const editClientMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClientToEdit?.id) throw new Error("Cliente no seleccionado");

      let fechaStr = null;
      if (fechaMembresia) {
        // Formatear a YYYY-MM-DD respetando zona horaria local
        const year = fechaMembresia.getFullYear();
        const month = String(fechaMembresia.getMonth() + 1).padStart(2, '0');
        const day = String(fechaMembresia.getDate()).padStart(2, '0');
        fechaStr = `${year}-${month}-${day}`;
      }

      const payload: any = { 
        fecha_membresia: fechaStr,
        estado: isClientActive ? 'activo' : 'inactivo' // AHORA SÍ GUARDARÁ EL ESTADO EN SUPABASE
      };
      
      const { error } = await supabase
        .from("perfiles")
        .update(payload)
        .eq("id", selectedClientToEdit.id);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients", user?.id] });
      setShowEditModal(false);
      setSelectedClientToEdit(null);
      setFechaMembresia(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Éxito", "Datos del cliente actualizados.");
    },
    onError: (err: any) => {
      Alert.alert("Error", err.message || "No se pudo actualizar al cliente");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const openEditModal = (client: any) => {
    setSelectedClientToEdit(client);
    setIsClientActive(client.status !== "inactivo");
    
    if (client.fecha_membresia) {
      // Añadimos T12:00:00 para evitar que la zona horaria le reste un día
      setFechaMembresia(new Date(client.fecha_membresia + "T12:00:00")); 
    } else {
      setFechaMembresia(new Date()); // Fecha actual por defecto si no tiene
    }
    
    setShowEditModal(true);
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    const currentDate = selectedDate || fechaMembresia;
    setShowDatePicker(Platform.OS === 'ios'); 
    if (currentDate) setFechaMembresia(currentDate);
  };

  const clients = (data?.clients || []).filter((c: any) => {
    const q = search.toLowerCase();
    return (
      !q ||
      (c.nombre || "").toLowerCase().includes(q) ||
      (c.apellido || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.invite_email || "").toLowerCase().includes(q)
    );
  });

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
            <Text style={styles.title}>Pacientes</Text>
            <Text style={styles.subtitle}>{clients.length} registrados</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]}
            onPress={() => setShowModal(true)}
          >
            <Ionicons name="person-add" size={20} color={Colors.primaryText} />
          </Pressable>
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar paciente..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {clients.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={56} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>
              {search ? "Sin resultados" : "Sin pacientes aún"}
            </Text>
            <Text style={styles.emptySubtitle}>
              {search
                ? "Intenta con otro término de búsqueda"
                : "Agrega tu primer paciente invitándolo por correo"}
            </Text>
            {!search && (
              <Pressable style={styles.emptyBtn} onPress={() => setShowModal(true)}>
                <Text style={styles.emptyBtnText}>Invitar paciente</Text>
              </Pressable>
            )}
          </View>
        ) : (
          clients.map((client: any) => {
            // Lógica para determinar colores según estado
            const isActivo = client.status === "activo";
            const isInactivo = client.status === "inactivo";
            const isPendiente = client.status === "pendiente";

            const statusBgColor = isActivo ? Colors.success + "22" : isInactivo ? Colors.error + "22" : Colors.warning + "22";
            const statusColor = isActivo ? Colors.success : isInactivo ? Colors.error : Colors.warning;
            const statusLabel = isActivo ? "Activo" : isInactivo ? "Inactivo" : "Pendiente";

            return (
              <View key={client.id} style={styles.clientCard}>
                <View style={styles.clientLeft}>
                  {client.avatar_url ? (
                    <Image source={{ uri: client.avatar_url }} style={styles.avatar} />
                  ) : (
                    <LinearGradient
                      colors={isActivo ? ["#374151", "#1F2937"] : ["#2A2A2A", "#1A1A1A"]}
                      style={styles.avatar}
                    >
                      <Text style={styles.avatarText}>
                        {(client.nombre || client.invite_email || "?")[0].toUpperCase()}
                      </Text>
                    </LinearGradient>
                  )}
                </View>

                <View style={styles.clientInfo}>
                  <Text style={styles.clientName}>
                    {client.nombre
                      ? `${client.nombre} ${client.apellido}`
                      : client.invite_email || "Invitado"}
                  </Text>
                  <Text style={styles.clientEmail}>
                    {client.email || client.invite_email || ""}
                  </Text>
                  <View style={styles.metaRow}>
                    <View style={[styles.statusPill, { backgroundColor: statusBgColor }]}>
                      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                      <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                    </View>
                    
                    {/* Fecha de Membresía */}
                    {!isPendiente && client.fecha_membresia && (
                      <View style={styles.membershipBadge}>
                        <Ionicons name="calendar-outline" size={12} color={Colors.textSecondary} />
                        <Text style={styles.membershipText}>Vence: {client.fecha_membresia}</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.clientActions}>
                  {/* BOTÓN EDITAR CLIENTE (Para clientes que ya tienen cuenta, activos o inactivos) */}
                  {!isPendiente && (
                    <Pressable
                      style={({ pressed }) => [styles.actionIcon, pressed && { opacity: 0.6 }]}
                      onPress={() => openEditModal(client)}
                    >
                      <Ionicons name="pencil" size={18} color={Colors.primary} />
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* --- MODAL INVITAR PACIENTE --- */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <KeyboardAvoidingView 
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.overlay} onPress={() => setShowModal(false)} />
          <View style={[styles.modal, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Agregar Paciente</Text>
            <Text style={styles.modalSubtitle}>
              Ingresa el correo electrónico de tu paciente. Si ya tiene cuenta, se conectará automáticamente.
            </Text>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={Colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={20} color={Colors.textMuted} />
              <TextInput
                style={styles.modalInput}
                placeholder="correo@ejemplo.com"
                placeholderTextColor={Colors.textMuted}
                value={email}
                onChangeText={(t) => { setEmail(t); setError(""); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoFocus
              />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.confirmBtn,
                addMutation.isPending && styles.btnDisabled,
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => {
                if (!email.trim()) return setError("El correo es requerido");
                addMutation.mutate(email.trim());
              }}
              disabled={addMutation.isPending}
            >
              {addMutation.isPending ? (
                <ActivityIndicator color={Colors.primaryText} />
              ) : (
                <Text style={styles.confirmBtnText}>Agregar</Text>
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
              onPress={() => { setShowModal(false); setError(""); setEmail(""); }}
            >
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* --- MODAL EDITAR CLIENTE (MEMBRESÍA Y ESTADO) --- */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditModal(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={styles.overlay} onPress={() => { setShowEditModal(false); setShowDatePicker(false); }} />
          <View style={[styles.modal, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Ajustes de Paciente</Text>
            <Text style={styles.modalSubtitle}>
              {selectedClientToEdit?.nombre} {selectedClientToEdit?.apellido}
            </Text>

            {/* Selector de Estado */}
            <Text style={styles.label}>Estado de la cuenta</Text>
            <View style={styles.statusToggleRow}>
              <Pressable
                style={[styles.statusToggleBtn, isClientActive && styles.statusToggleBtnActive]}
                onPress={() => setIsClientActive(true)}
              >
                <Ionicons name="checkmark-circle" size={18} color={isClientActive ? Colors.success : Colors.textSecondary} />
                <Text style={[styles.statusToggleText, isClientActive && { color: Colors.success, fontFamily: "Outfit_700Bold" }]}>Activo</Text>
              </Pressable>
              <Pressable
                style={[styles.statusToggleBtn, !isClientActive && styles.statusToggleBtnInactive]}
                onPress={() => setIsClientActive(false)}
              >
                <Ionicons name="close-circle" size={18} color={!isClientActive ? Colors.error : Colors.textSecondary} />
                <Text style={[styles.statusToggleText, !isClientActive && { color: Colors.error, fontFamily: "Outfit_700Bold" }]}>Inactivo</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>Vencimiento de membresía</Text>
            
            {/* Campo que abre el calendario al tocarse */}
            <Pressable 
              style={styles.datePickerBtn} 
              onPress={() => setShowDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
              <Text style={styles.datePickerText}>
                {fechaMembresia ? fechaMembresia.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }) : "Seleccionar fecha"}
              </Text>
            </Pressable>

            {/* Componente del Calendario Nativo */}
            {showDatePicker && (
              <View style={Platform.OS === 'ios' ? styles.iosDatePickerContainer : undefined}>
                <DateTimePicker
                  value={fechaMembresia || new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  onChange={handleDateChange}
                  minimumDate={new Date()}
                  textColor={Colors.text}
                  themeVariant="dark" 
                />
                {Platform.OS === 'ios' && (
                  <Pressable style={styles.iosDateDoneBtn} onPress={() => setShowDatePicker(false)}>
                    <Text style={styles.iosDateDoneText}>Listo</Text>
                  </Pressable>
                )}
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.confirmBtn,
                { marginTop: 24 },
                editClientMutation.isPending && styles.btnDisabled,
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => editClientMutation.mutate()}
              disabled={editClientMutation.isPending}
            >
              {editClientMutation.isPending ? (
                <ActivityIndicator color={Colors.primaryText} />
              ) : (
                <Text style={styles.confirmBtnText}>Guardar Cambios</Text>
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
              onPress={() => { setShowEditModal(false); setShowDatePicker(false); }}
            >
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
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
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Outfit_400Regular",
    fontSize: 15,
    color: Colors.text,
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
    paddingHorizontal: 20,
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
  clientCard: {
    flexDirection: "row",
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    gap: 12,
  },
  clientLeft: {},
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  clientInfo: { flex: 1 },
  clientName: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  clientEmail: {
    fontFamily: "Outfit_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    flexWrap: "wrap",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statusText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
  },
  membershipBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  membershipText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  roleText: {
    fontFamily: "Outfit_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: "capitalize",
  },
  clientActions: { gap: 8, flexDirection: "row" },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primary + "15",
    borderWidth: 1,
    borderColor: Colors.primary + "40",
    alignItems: "center",
    justifyContent: "center",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
  },
  modal: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingTop: 16,
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
    marginBottom: 8,
  },
  modalSubtitle: {
    fontFamily: "Outfit_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 20,
    lineHeight: 21,
  },
  label: {
    fontFamily: "Outfit_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
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
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    marginBottom: 16,
    gap: 10,
  },
  modalInput: {
    flex: 1,
    fontFamily: "Outfit_400Regular",
    fontSize: 16,
    color: Colors.text,
    paddingVertical: 14,
  },
  confirmBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
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
  // Nuevos estilos para los toggles de estado
  statusToggleRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  statusToggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusToggleBtnActive: {
    backgroundColor: Colors.success + "15",
    borderColor: Colors.success + "50",
  },
  statusToggleBtnInactive: {
    backgroundColor: Colors.error + "15",
    borderColor: Colors.error + "50",
  },
  statusToggleText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  // Date Picker Estilos
  datePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  datePickerText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 16,
    color: Colors.text,
  },
  iosDatePickerContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    marginTop: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iosDateDoneBtn: {
    backgroundColor: Colors.primary,
    padding: 12,
    alignItems: "center",
  },
  iosDateDoneText: {
    fontFamily: "Outfit_700Bold",
    color: Colors.primaryText,
    fontSize: 15,
  }
});