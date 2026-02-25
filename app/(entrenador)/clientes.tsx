import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  Platform, RefreshControl, Image, Modal, ActivityIndicator, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import * as Haptics from "expo-haptics";

export default function ClientesScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  const { data, refetch } = useQuery({
    queryKey: ["/api/clients"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/clients");
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async (inviteEmail: string) => {
      const res = await apiRequest("POST", "/api/clients", { email: inviteEmail });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/clients"] });
      setShowModal(false);
      setEmail("");
      setError("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: any) => {
      setError(err.message || "Error al agregar cliente");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

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
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Clientes</Text>
            <Text style={styles.subtitle}>{clients.length} clientes registrados</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]}
            onPress={() => setShowModal(true)}
          >
            <Ionicons name="person-add" size={20} color={Colors.primaryText} />
          </Pressable>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar cliente..."
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
              {search ? "Sin resultados" : "Sin clientes aún"}
            </Text>
            <Text style={styles.emptySubtitle}>
              {search
                ? "Intenta con otro término de búsqueda"
                : "Agrega tu primer cliente invitándolo por correo"}
            </Text>
            {!search && (
              <Pressable style={styles.emptyBtn} onPress={() => setShowModal(true)}>
                <Text style={styles.emptyBtnText}>Invitar cliente</Text>
              </Pressable>
            )}
          </View>
        ) : (
          clients.map((client: any) => (
            <View key={client.id} style={styles.clientCard}>
              <View style={styles.clientLeft}>
                {client.avatar_url ? (
                  <Image source={{ uri: client.avatar_url }} style={styles.avatar} />
                ) : (
                  <LinearGradient
                    colors={client.status === "activo" ? ["#374151", "#1F2937"] : ["#2A2A2A", "#1A1A1A"]}
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
                  <View style={[
                    styles.statusPill,
                    { backgroundColor: client.status === "activo" ? Colors.success + "22" : Colors.warning + "22" }
                  ]}>
                    <View style={[
                      styles.statusDot,
                      { backgroundColor: client.status === "activo" ? Colors.success : Colors.warning }
                    ]} />
                    <Text style={[
                      styles.statusText,
                      { color: client.status === "activo" ? Colors.success : Colors.warning }
                    ]}>
                      {client.status === "activo" ? "Activo" : "Pendiente"}
                    </Text>
                  </View>
                  <Text style={styles.roleText}>{client.role || "cliente"}</Text>
                </View>
              </View>

              <View style={styles.clientActions}>
                <Pressable
                  style={({ pressed }) => [styles.actionIcon, pressed && { opacity: 0.6 }]}
                  onPress={() => {}}
                >
                  <Ionicons name="chatbubble-outline" size={18} color={Colors.textSecondary} />
                </Pressable>
              </View>
            </View>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Add Client Modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setShowModal(false)} />
        <View style={[styles.modal, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Agregar Cliente</Text>
          <Text style={styles.modalSubtitle}>
            Ingresa el correo electrónico de tu cliente. Si ya tiene cuenta, se conectará automáticamente.
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
  roleText: {
    fontFamily: "Outfit_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: "capitalize",
  },
  clientActions: { gap: 8 },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
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
    marginBottom: 8,
  },
  modalSubtitle: {
    fontFamily: "Outfit_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 20,
    lineHeight: 21,
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
});
