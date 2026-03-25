import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Platform, ActivityIndicator, RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { MediaViewer } from "@/components/MediaViewer";

// Importar Supabase
import { supabase } from "@/lib/supabase";

export default function ClienteRutinaDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [refreshing, setRefreshing] = useState(false);

  // 1. OBTENER DETALLE DE RUTINA Y EJERCICIOS DESDE SUPABASE
  const { data, refetch, isLoading, isError } = useQuery({
    queryKey: ["client_routine_details", id],
    enabled: !!id,
    queryFn: async () => {
      // Buscar la rutina y los datos del entrenador
      const { data: routineData, error: routineError } = await supabase
        .from("rutinas")
        .select(`
          *,
          perfiles:entrenador_id (nombre, apellido)
        `)
        .eq("id", id)
        .single();

      if (routineError) throw new Error(routineError.message);

      // Buscar los ejercicios
      const { data: exercisesData, error: exercisesError } = await supabase
        .from("ejercicios")
        .select("*")
        .eq("rutina_id", id)
        .order("orden", { ascending: true });

      if (exercisesError) throw new Error(exercisesError.message);

      return {
        routine: {
          ...routineData,
          trainer_nombre: routineData.perfiles?.nombre,
          trainer_apellido: routineData.perfiles?.apellido,
        },
        exercises: exercisesData || [],
      };
    },
    staleTime: 1000 * 60 * 5,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const routine = data?.routine;
  const exercises = data?.exercises || [];
  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);

  // --- LÓGICA PARA AGRUPAR BI-SERIES / TRI-SERIES ---
  const groupedExercises = React.useMemo(() => {
    if (!exercises) return [];
    const groups: any[] = [];
    let currentGroup: string | null = null;
    let currentGroupArray: any[] = [];

    exercises.forEach((ex: any) => {
      if (ex.grupo_serie) {
        if (currentGroup === ex.grupo_serie) {
          currentGroupArray.push(ex);
        } else {
          if (currentGroupArray.length > 0) {
            groups.push({ type: 'group', name: currentGroup, items: currentGroupArray });
          }
          currentGroup = ex.grupo_serie;
          currentGroupArray = [ex];
        }
      } else {
        if (currentGroupArray.length > 0) {
          groups.push({ type: 'group', name: currentGroup, items: currentGroupArray });
          currentGroupArray = [];
          currentGroup = null;
        }
        groups.push({ type: 'single', item: ex });
      }
    });
    if (currentGroupArray.length > 0) {
      groups.push({ type: 'group', name: currentGroup, items: currentGroupArray });
    }
    return groups;
  }, [exercises]);
  // ----------------------------------------------------

  const nivelColor = (n: string) => {
    const nivel = n?.toLowerCase();
    if (nivel === "principiante") return Colors.success;
    if (nivel === "avanzado") return Colors.accent;
    return Colors.accentBlue;
  };

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: Colors.background }]}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={styles.loadingText}>Cargando rutina...</Text>
      </View>
    );
  }

  if (isError || !routine) {
    return (
      <View style={[styles.center, { backgroundColor: Colors.background }]}>
        <Ionicons name="warning-outline" size={48} color={Colors.error} />
        <Text style={styles.errorTitle}>No se pudo cargar</Text>
        <Text style={styles.errorSubtitle}>La rutina no existe o no tienes acceso</Text>
        <Pressable style={styles.retryBtn} onPress={() => router.back()}>
          <Text style={styles.retryBtnText}>Regresar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topInset + 8 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Back button */}
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
          <Text style={styles.backText}>Atrás</Text>
        </Pressable>

        {/* Routine header */}
        <View style={styles.routineHeader}>
          <View style={styles.headerTop}>
            <View style={styles.routineIcon}>
              <Ionicons name="barbell" size={28} color={Colors.primary} />
            </View>
            <View style={[styles.nivelBadge, { backgroundColor: nivelColor(routine.nivel) + "22" }]}>
              <Text style={[styles.nivelText, { color: nivelColor(routine.nivel) }]}>
                {routine.nivel}
              </Text>
            </View>
          </View>

          <Text style={styles.routineName}>{routine.nombre}</Text>

          {routine.descripcion ? (
            <Text style={styles.routineDesc}>{routine.descripcion}</Text>
          ) : null}

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="barbell" size={14} color={Colors.textMuted} />
              <Text style={styles.metaText}>{exercises.length} ejercicios</Text>
            </View>
            {(routine.trainer_nombre || routine.trainer_apellido) && (
              <View style={styles.metaItem}>
                <Ionicons name="person" size={14} color={Colors.textMuted} />
                <Text style={styles.metaText}>Coach: {routine.trainer_nombre} {routine.trainer_apellido}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Exercises Agrupados */}
        {groupedExercises.length === 0 ? (
          <View style={styles.emptyExercises}>
            <Ionicons name="barbell-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Sin ejercicios aún</Text>
            <Text style={styles.emptySubtitle}>
              Tu entrenador aún no ha añadido ejercicios a esta rutina.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Ejercicios</Text>
            {groupedExercises.map((group, groupIdx) => {
              // Si es un ejercicio normal sin grupo
              if (group.type === "single") {
                return <ExerciseCard key={group.item.id} exercise={group.item} index={group.item.orden} />;
              }

              // Si es un grupo (Bi-serie, Tri-serie)
              return (
                <View key={`group-${group.name}-${groupIdx}`} style={styles.groupWrapper}>
                  <View style={styles.groupHeader}>
                    <Ionicons name="link" size={18} color={Colors.accentOrange} />
                    <Text style={styles.groupTitle}>
                      {group.items.length === 2 ? "BI-SERIE" : group.items.length === 3 ? "TRI-SERIE" : "CIRCUITO"} (Grupo {group.name})
                    </Text>
                  </View>
                  <View style={styles.groupBorder}>
                    {group.items.map((ex: any) => (
                      <ExerciseCard key={ex.id} exercise={ex} index={ex.orden} />
                    ))}
                  </View>
                </View>
              );
            })}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

function ExerciseCard({ exercise: ex, index: idx }: { exercise: any; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasMedia = ex.imagen_url || ex.video_url;

  return (
    <Pressable
      style={({ pressed }) => [styles.exerciseCard, pressed && { opacity: 0.95 }]}
      onPress={() => setExpanded(!expanded)}
    >
      <View style={styles.exHeader}>
        <View style={styles.exNum}>
          <Text style={styles.exNumText}>{idx + 1}</Text>
        </View>
        <Text style={styles.exName} numberOfLines={expanded ? undefined : 1}>{ex.nombre}</Text>
        <View style={styles.exHeaderRight}>
          {hasMedia && (
            <View style={styles.mediaBadge}>
              <Ionicons name="videocam" size={12} color={Colors.primary} />
            </View>
          )}
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={Colors.textMuted}
          />
        </View>
      </View>

      <View style={styles.exStats}>
        {ex.series && (
          <View style={styles.exStatItem}>
            <Ionicons name="repeat" size={13} color={Colors.primary} />
            <Text style={styles.exStatText}>{ex.series} series</Text>
          </View>
        )}
        {ex.repeticiones && (
          <View style={styles.exStatItem}>
            <Ionicons name="fitness" size={13} color={Colors.accentBlue} />
            <Text style={styles.exStatText}>{ex.repeticiones} reps</Text>
          </View>
        )}
        {ex.peso && (
          <View style={styles.exStatItem}>
            <Ionicons name="barbell" size={13} color={Colors.accentOrange} />
            <Text style={styles.exStatText}>{ex.peso}</Text>
          </View>
        )}
        {ex.descanso && (
          <View style={styles.exStatItem}>
            <Ionicons name="timer" size={13} color={Colors.textMuted} />
            <Text style={styles.exStatText}>{ex.descanso}</Text>
          </View>
        )}
      </View>

      {expanded && (
        <>
          {ex.descripcion ? (
            <Text style={styles.exDesc}>{ex.descripcion}</Text>
          ) : null}

          {ex.imagen_url ? (
            <View style={styles.mediaContainer}>
              <Text style={styles.mediaLabel}>Imagen</Text>
              <MediaViewer
                uri={ex.imagen_url}
                isVideo={false}
                thumbnailStyle={styles.exMediaThumb}
              />
            </View>
          ) : null}

          {ex.video_url ? (
            <View style={styles.mediaContainer}>
              <Text style={styles.mediaLabel}>Video demostrativo</Text>
              <MediaViewer
                uri={ex.video_url}
                isVideo={true}
                thumbnailStyle={styles.exMediaThumb}
              />
            </View>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  loadingText: {
    fontFamily: "Outfit_400Regular",
    fontSize: 15,
    color: Colors.textMuted,
    marginTop: 8,
  },
  errorTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 20,
    color: Colors.text,
    marginTop: 8,
  },
  errorSubtitle: {
    fontFamily: "Outfit_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  retryBtnText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 15,
    color: Colors.primaryText,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  backText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 16,
    color: Colors.textSecondary,
  },
  routineHeader: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  routineIcon: {
    width: 52,
    height: 52,
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
    fontSize: 13,
    textTransform: "capitalize",
  },
  routineName: {
    fontFamily: "Outfit_700Bold",
    fontSize: 26,
    color: Colors.text,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  routineDesc: {
    fontFamily: "Outfit_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 14,
  },
  metaRow: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaText: {
    fontFamily: "Outfit_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  emptyExercises: {
    alignItems: "center",
    paddingTop: 40,
    gap: 12,
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
    lineHeight: 22,
    paddingHorizontal: 12,
  },
  sectionTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: Colors.text,
    marginBottom: 14,
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
    marginBottom: 12,
    gap: 10,
  },
  exNum: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: Colors.primary + "22",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  exNumText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 14,
    color: Colors.primary,
  },
  exName: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 16,
    color: Colors.text,
    flex: 1,
  },
  exHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  mediaBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: Colors.primary + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  exStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  exStatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  exStatText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  exDesc: {
    fontFamily: "Outfit_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 21,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  mediaContainer: {
    marginTop: 12,
  },
  mediaLabel: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  exMediaThumb: {
    width: "100%",
    height: 200,
    borderRadius: 12,
  },
  // --- NUEVOS ESTILOS PARA LOS GRUPOS (BI-SERIES) ---
  groupWrapper: {
    marginBottom: 16,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 2,
    borderWidth: 2,
    borderColor: Colors.accentOrange + "44",
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  groupTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 15,
    color: Colors.accentOrange,
  },
  groupBorder: {
    padding: 8,
    paddingTop: 0,
    gap: 8,
  },
});