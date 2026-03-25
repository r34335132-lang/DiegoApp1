import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, Platform, RefreshControl, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/auth";

// Importar Supabase
import { supabase } from "@/lib/supabase";

export default function MisRutinasScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["client_routines_list", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // Buscamos las rutinas y le pedimos a Supabase que también traiga los ID de los ejercicios para contarlos
      const { data: routinesData, error } = await supabase
        .from("rutinas")
        .select(`
          *,
          perfiles:entrenador_id (nombre, apellido),
          ejercicios (id)
        `)
        .eq("cliente_id", user?.id)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);

      // Formateamos para que la interfaz muestre el nombre del entrenador y la cantidad de ejercicios
      const formatted = (routinesData || []).map((r: any) => ({
        ...r,
        trainer_nombre: r.perfiles?.nombre,
        trainer_apellido: r.perfiles?.apellido,
        exercise_count: r.ejercicios?.length || 0, // <-- Nueva mejora: Conteo de ejercicios
      }));

      return { routines: formatted };
    },
    staleTime: 1000 * 60,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const routines = data?.routines || [];
  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);

  const nivelColor = (n: string) => {
    const nivel = n?.toLowerCase();
    if (nivel === "principiante") return Colors.success;
    if (nivel === "avanzado") return Colors.accent;
    return Colors.accentBlue;
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={[styles.headerContainer, { paddingTop: topInset + 16 }]}>
        <Text style={styles.title}>Mis Rutinas</Text>
        <Text style={styles.subtitle}>{routines.length} rutinas asignadas</Text>
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
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
              <Ionicons name="barbell-outline" size={64} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>Sin rutinas asignadas</Text>
              <Text style={styles.emptySubtitle}>
                Tu entrenador todavía no ha asignado ninguna rutina para ti.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.routineCard, pressed && { opacity: 0.85 }]}
              onPress={() => router.push({
                pathname: "/(cliente)/rutina/[id]",
                params: { id: item.id }
              })}
            >
              <View style={styles.cardTop}>
                <View style={styles.routineIconWrapper}>
                  <Ionicons name="barbell" size={22} color={Colors.primary} />
                </View>
                <View style={[styles.nivelBadge, { backgroundColor: nivelColor(item.nivel) + "22" }]}>
                  <Text style={[styles.nivelText, { color: nivelColor(item.nivel) }]}>
                    {item.nivel}
                  </Text>
                </View>
              </View>

              <Text style={styles.routineName}>{item.nombre}</Text>
              {item.descripcion ? (
                <Text style={styles.routineDesc} numberOfLines={2}>{item.descripcion}</Text>
              ) : null}

              <View style={styles.metaContainer}>
                {(item.trainer_nombre || item.trainer_apellido) && (
                  <View style={styles.metaItem}>
                    <Ionicons name="person" size={14} color={Colors.textMuted} />
                    <Text style={styles.metaText}>
                      Coach: {item.trainer_nombre} {item.trainer_apellido}
                    </Text>
                  </View>
                )}
                <View style={styles.metaItem}>
                  <Ionicons name="list" size={14} color={Colors.textMuted} />
                  <Text style={styles.metaText}>{item.exercise_count} ejercicios</Text>
                </View>
              </View>

              <View style={styles.viewBtn}>
                <Text style={styles.viewBtnText}>Ver ejercicios</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.primaryText} />
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
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
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 22,
    color: Colors.text,
    marginTop: 8,
  },
  emptySubtitle: {
    fontFamily: "Outfit_400Regular",
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  routineCard: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  routineIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.primary + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  nivelBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  nivelText: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 12,
    textTransform: "capitalize",
  },
  routineName: {
    fontFamily: "Outfit_700Bold",
    fontSize: 20,
    color: Colors.text,
    marginBottom: 6,
  },
  routineDesc: {
    fontFamily: "Outfit_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 12,
    lineHeight: 20,
  },
  metaContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
    flexWrap: "wrap",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontFamily: "Outfit_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },
  viewBtnText: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 14,
    color: Colors.primaryText,
  },
});