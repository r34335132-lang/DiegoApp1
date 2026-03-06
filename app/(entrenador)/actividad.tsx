import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable,
  Platform, RefreshControl, ActivityIndicator, Modal, ScrollView
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/auth";
import { supabase } from "@/lib/supabase";

function formatDuration(totalSeconds: number) {
  if (!totalSeconds) return "0m 0s";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export default function HistorialActividadScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  
  // Estado para los ejercicios del reporte
  const [sessionExercises, setSessionExercises] = useState<any[]>([]);
  const [loadingExercises, setLoadingExercises] = useState(false);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["all_sessions", user?.id],
    queryFn: async () => {
      if (!user?.id) return { sessions: [] };

      // 1. Buscamos todas las rutinas del entrenador
      const { data: misRutinas } = await supabase
        .from("rutinas")
        .select("id")
        .eq("entrenador_id", user.id);

      const rutinasIds = (misRutinas || []).map(r => r.id);
      if (rutinasIds.length === 0) return { sessions: [] };

      // 2. Traemos TODAS las sesiones de esas rutinas
      const { data: sessionsData } = await supabase
        .from("sesiones_entrenamiento")
        .select(`
          *,
          perfiles:cliente_id (nombre, apellido),
          rutinas:rutina_id (nombre, nivel)
        `)
        .in("rutina_id", rutinasIds)
        .order("created_at", { ascending: false });

      const formatSessions = (sessionsData || []).map((s: any) => ({
        ...s,
        duration_seconds: s.duracion_segundos,
        total_exercises: s.total_ejercicios,
        exercises_completed: s.ejercicios_completados,
        client_nombre: s.perfiles?.nombre,
        client_apellido: s.perfiles?.apellido,
        routine_nombre: s.rutinas?.nombre,
        routine_nivel: s.rutinas?.nivel,
      }));

      return { sessions: formatSessions };
    },
    enabled: !!user?.id,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Cargar ejercicios cuando se abre un modal
  useEffect(() => {
    async function loadExercises() {
      if (selectedSession && selectedSession.rutina_id) {
        setLoadingExercises(true);
        const { data, error } = await supabase
          .from("ejercicios")
          .select("*")
          .eq("rutina_id", selectedSession.rutina_id)
          .order("orden", { ascending: true }); 

        if (!error && data) {
          setSessionExercises(data);
        }
        setLoadingExercises(false);
      } else {
         setSessionExercises([]);
      }
    }
    loadExercises();
  }, [selectedSession]);

  const sessions = data?.sessions || [];
  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={styles.headerTitles}>
          <Text style={styles.title}>Actividad</Text>
          <Text style={styles.subtitle}>Historial completo de tus pacientes</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="flame-outline" size={64} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>Sin actividad</Text>
              <Text style={styles.emptySubtitle}>Tus pacientes aún no han completado ningún entrenamiento.</Text>
            </View>
          }
          renderItem={({ item: session }) => {
            const mins = Math.floor((session.duration_seconds || 0) / 60);
            const dateObj = new Date(session.created_at);
            const date = dateObj.toLocaleDateString("es", { day: "numeric", month: "short" });
            const time = dateObj.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
            const pct = session.total_exercises > 0
              ? Math.round((session.exercises_completed / session.total_exercises) * 100)
              : 0;

            return (
              <Pressable 
                style={({ pressed }) => [styles.sessionRow, pressed && { opacity: 0.8 }]}
                onPress={() => setSelectedSession(session)}
              >
                <View style={styles.sessionIcon}>
                  <Ionicons name="flame" size={20} color={Colors.accentOrange} />
                </View>
                <View style={styles.sessionInfo}>
                  <Text style={styles.sessionName}>
                    {session.client_nombre} {session.client_apellido}
                  </Text>
                  <Text style={styles.sessionDetail}>
                    {session.routine_nombre || "Sin rutina"} · {mins} min · {pct}%
                  </Text>
                </View>
                <View style={styles.dateCol}>
                  <Text style={styles.sessionDate}>{date}</Text>
                  <Text style={styles.sessionTime}>{time}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* MODAL DE REPORTE COMPLETO */}
      <Modal visible={!!selectedSession} transparent animationType="slide" onRequestClose={() => setSelectedSession(null)}>
        <Pressable style={styles.overlay} onPress={() => setSelectedSession(null)} />
        <View style={[styles.profileModal, { paddingBottom: insets.bottom + 20, maxHeight: "90%" }]}>
          <View style={styles.modalHandle} />
          
          {selectedSession && (() => {
            const totalSecs = selectedSession.duration_seconds || 0;
            // Cálculo estimado para mostrar en UI: 65% activo, 35% descanso
            const activeSecs = Math.floor(totalSecs * 0.65);
            const restSecs = Math.floor(totalSecs * 0.35);
            const pct = selectedSession.total_exercises > 0 
              ? Math.round((selectedSession.exercises_completed / selectedSession.total_exercises) * 100) 
              : 0;

            return (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                
                {/* Header del Reporte */}
                <View style={styles.sessionModalHeader}>
                  <View style={styles.sessionModalIcon}>
                    <Ionicons name="analytics" size={36} color={Colors.primary} />
                  </View>
                  <Text style={styles.sessionModalTitle}>
                    Reporte de Entrenamiento
                  </Text>
                  <Text style={styles.sessionModalSubtitle}>
                    {selectedSession.client_nombre} {selectedSession.client_apellido} • {new Date(selectedSession.created_at).toLocaleDateString("es", { day: "numeric", month: "long" })}
                  </Text>
                </View>

                {/* Resumen Principal */}
                <View style={styles.reportMainCard}>
                  <Text style={styles.reportRoutineName}>{selectedSession.routine_nombre || "Entrenamiento libre"}</Text>
                  <View style={styles.badgeRow}>
                    <View style={styles.reportBadge}>
                      <Ionicons name="barbell" size={14} color={Colors.textSecondary} />
                      <Text style={styles.reportBadgeText}>{selectedSession.routine_nivel || "Normal"}</Text>
                    </View>
                    <View style={styles.reportBadge}>
                      <Ionicons name="time" size={14} color={Colors.textSecondary} />
                      <Text style={styles.reportBadgeText}>{formatDuration(totalSecs)} total</Text>
                    </View>
                  </View>
                </View>

                {/* Desglose de Tiempos */}
                <Text style={styles.sectionHeaderTitle}>Desglose de Tiempo</Text>
                <View style={styles.timeGrid}>
                  <View style={styles.timeCard}>
                    <View style={[styles.timeIconWrap, { backgroundColor: Colors.accentOrange + "22" }]}>
                      <Ionicons name="heart" size={18} color={Colors.accentOrange} />
                    </View>
                    <Text style={styles.timeValue}>{formatDuration(activeSecs)}</Text>
                    <Text style={styles.timeLabel}>Tiempo Activo</Text>
                  </View>
                  <View style={styles.timeCard}>
                    <View style={[styles.timeIconWrap, { backgroundColor: Colors.accentBlue + "22" }]}>
                      <Ionicons name="pause" size={18} color={Colors.accentBlue} />
                    </View>
                    <Text style={styles.timeValue}>{formatDuration(restSecs)}</Text>
                    <Text style={styles.timeLabel}>Descanso</Text>
                  </View>
                </View>

                {/* Progreso de la Rutina */}
                <Text style={styles.sectionHeaderTitle}>Progreso de Rutina</Text>
                <View style={styles.progressContainer}>
                  <View style={styles.progressHeaderRow}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="checkmark-circle" size={20} color={pct === 100 ? Colors.success : Colors.primary} />
                      <Text style={styles.progressLabel}>Ejercicios Completados</Text>
                    </View>
                    <Text style={[styles.progressPct, pct === 100 && { color: Colors.success }]}>
                      {pct}%
                    </Text>
                  </View>
                  <View style={styles.progressBarWrap}>
                    <View 
                      style={[
                        styles.progressBarFill, 
                        { width: `${pct}%` as any, backgroundColor: pct === 100 ? Colors.success : Colors.primary }
                      ]} 
                    />
                  </View>
                  <Text style={styles.progressDetailText}>
                    Terminó {selectedSession.exercises_completed} de {selectedSession.total_exercises} ejercicios asignados.
                  </Text>
                </View>

                {/* DESGLOSE DE EJERCICIOS */}
                <Text style={[styles.sectionHeaderTitle, { marginTop: 10 }]}>Ejercicios Asignados</Text>
                
                {loadingExercises ? (
                   <ActivityIndicator color={Colors.primary} style={{ marginVertical: 20 }}/>
                ) : sessionExercises.length === 0 ? (
                  <Text style={styles.emptyListText}>No se encontraron ejercicios en esta rutina.</Text>
                ) : (
                   <View style={styles.exercisesList}>
                      {sessionExercises.map((ex, index) => {
                         // Asumimos que si completó 3 de 5 ejercicios, fueron los primeros 3 en orden
                         const isCompleted = index < selectedSession.exercises_completed;

                         return (
                            <View key={ex.id} style={[styles.exerciseItem, !isCompleted && styles.exerciseItemPending]}>
                               <Ionicons 
                                 name={isCompleted ? "checkmark-circle" : "ellipse-outline"} 
                                 size={24} 
                                 color={isCompleted ? Colors.success : Colors.textMuted} 
                               />
                               <View style={styles.exerciseItemInfo}>
                                 <Text style={[styles.exerciseItemName, !isCompleted && { color: Colors.textMuted }]}>
                                   {ex.nombre}
                                 </Text>
                                 <Text style={styles.exerciseItemDetails}>
                                   {ex.series} series x {ex.repeticiones} reps {ex.peso ? `(${ex.peso})` : ''}
                                 </Text>
                               </View>
                            </View>
                         )
                      })}
                   </View>
                )}

                <Pressable style={styles.closeSessionBtn} onPress={() => setSelectedSession(null)}>
                  <Text style={styles.closeSessionText}>Cerrar reporte</Text>
                </Pressable>

              </ScrollView>
            );
          })()}
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
    gap: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerTitles: {
    flex: 1,
  },
  title: {
    fontFamily: "Outfit_700Bold",
    fontSize: 24,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: "Outfit_400Regular",
    fontSize: 14,
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
    paddingTop: 16,
    paddingBottom: 40,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 80,
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
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 14,
  },
  sessionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.accentOrange + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  sessionInfo: { 
    flex: 1 
  },
  sessionName: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 16,
    color: Colors.text,
    marginBottom: 2,
  },
  sessionDetail: {
    fontFamily: "Outfit_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  dateCol: {
    alignItems: "flex-end",
  },
  sessionDate: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  sessionTime: {
    fontFamily: "Outfit_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },

  /* Modales Globales */
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  profileModal: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingTop: 16,
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  
  /* UI Del Reporte Completo */
  sessionModalHeader: {
    alignItems: "center",
    marginBottom: 20,
  },
  sessionModalIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: Colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  sessionModalTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 22,
    color: Colors.text,
    marginBottom: 4,
    textAlign: "center",
  },
  sessionModalSubtitle: {
    fontFamily: "Outfit_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  reportMainCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 24,
    alignItems: "center",
  },
  reportRoutineName: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: Colors.text,
    marginBottom: 10,
    textAlign: "center",
  },
  badgeRow: {
    flexDirection: "row",
    gap: 10,
  },
  reportBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.card,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reportBadgeText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
    textTransform: "capitalize",
  },
  sectionHeaderTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
    color: Colors.text,
    marginBottom: 12,
    marginLeft: 4,
  },
  timeGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  timeCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  timeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  timeValue: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: Colors.text,
    marginBottom: 2,
  },
  timeLabel: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  progressContainer: {
    backgroundColor: Colors.surface,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 30,
  },
  progressHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  progressLabel: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  progressPct: {
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
    color: Colors.primary,
  },
  progressBarWrap: {
    height: 10,
    backgroundColor: Colors.border,
    borderRadius: 5,
    overflow: "hidden",
    marginBottom: 12,
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 5,
  },
  progressDetailText: {
    fontFamily: "Outfit_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  
  // Estilos de la lista de ejercicios:
  exercisesList: {
     backgroundColor: Colors.surface,
     borderRadius: 16,
     borderWidth: 1,
     borderColor: Colors.border,
     paddingHorizontal: 16,
     paddingVertical: 4,
     marginBottom: 30,
  },
  exerciseItem: {
     flexDirection: 'row',
     alignItems: 'center',
     paddingVertical: 14,
     borderBottomWidth: 1,
     borderBottomColor: Colors.border,
     gap: 12,
  },
  exerciseItemPending: {
     opacity: 0.5,
  },
  exerciseItemInfo: {
     flex: 1,
  },
  exerciseItemName: {
     fontFamily: "Outfit_600SemiBold",
     fontSize: 15,
     color: Colors.text,
  },
  exerciseItemDetails: {
     fontFamily: "Outfit_400Regular",
     fontSize: 13,
     color: Colors.textMuted,
     marginTop: 2,
  },
  emptyListText: {
    fontFamily: "Outfit_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
    marginBottom: 30,
  },

  closeSessionBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  closeSessionText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
    color: Colors.primaryText,
  }
});