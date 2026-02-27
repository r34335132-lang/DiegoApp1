import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, FlatList, Pressable,
  Platform, Alert, AppState, AppStateStatus,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { InlineVideo } from "@/components/MediaViewer";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/context/auth";
import { sendLocalNotification } from "@/hooks/useNotifications";

interface Exercise {
  id: string;
  nombre: string;
  descripcion: string | null;
  series: number;
  repeticiones: string;
  peso: string | null;
  descanso: string | null;
  imagen_url: string | null;
  video_url: string | null;
}

interface Routine {
  id: string;
  nombre: string;
  descripcion: string | null;
  nivel: string;
  trainer_nombre: string | null;
  trainer_apellido: string | null;
}

type WorkoutPhase = "select" | "working" | "resting" | "complete";

function formatSeconds(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function parseRestSeconds(descanso: string | null): number {
  if (!descanso) return 60;
  const match = descanso.match(/(\d+)/);
  return match ? parseInt(match[1]) : 60;
}

export default function EntrenarScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [phase, setPhase] = useState<WorkoutPhase>("select");
  const [selectedRoutine, setSelectedRoutine] = useState<Routine | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [exerciseSeconds, setExerciseSeconds] = useState(0);
  const [restSeconds, setRestSeconds] = useState(60);
  const [restCountdown, setRestCountdown] = useState(60);
  const [exercisesCompleted, setExercisesCompleted] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const totalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const exerciseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoStartRef = useRef<number | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const { data: routinesData, isLoading: loadingRoutines } = useQuery({
    queryKey: ["/api/routines"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/routines");
      return res.json();
    },
    staleTime: 1000 * 60,
  });

  const startSessionMutation = useMutation({
    mutationFn: async (data: { routineId: string; routineNombre: string; totalExercises: number }) => {
      const res = await apiRequest("POST", "/api/training-sessions", data);
      return res.json();
    },
    onError: (err) => console.warn("[entrenar] startSession error:", err),
  });

  const finishSessionMutation = useMutation({
    mutationFn: async (data: { id: string; durationSeconds: number; exercisesCompleted: number }) => {
      const res = await apiRequest("PATCH", `/api/training-sessions/${data.id}`, {
        durationSeconds: data.durationSeconds,
        exercisesCompleted: data.exercisesCompleted,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/training-sessions"] });
    },
    onError: (err) => console.warn("[entrenar] finishSession error:", err),
  });

  const videoSessionMutation = useMutation({
    mutationFn: async (data: { exerciseId: string; exerciseNombre: string; watchedSeconds: number; completed: boolean }) => {
      const res = await apiRequest("POST", "/api/video-sessions", data);
      return res.json();
    },
    onError: (err) => console.warn("[entrenar] videoSession error:", err),
  });

  const sendSummaryMutation = useMutation({
    mutationFn: async (data: { receiverId: string; contenido: string }) => {
      const res = await apiRequest("POST", "/api/chat", {
        receiverId: data.receiverId,
        contenido: data.contenido,
        tipo: "texto",
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
    },
    onError: (err) => console.warn("[entrenar] sendSummary error:", err),
  });

  const stopAllTimers = useCallback(() => {
    if (totalTimerRef.current) clearInterval(totalTimerRef.current);
    if (exerciseTimerRef.current) clearInterval(exerciseTimerRef.current);
    if (restTimerRef.current) clearInterval(restTimerRef.current);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (nextState) => {
      if (appStateRef.current === "background" && nextState === "active") {
        if (videoStartRef.current) {
          const elapsed = Math.round((Date.now() - videoStartRef.current) / 1000);
          const ex = exercises[currentIdx];
          if (ex && elapsed > 2) {
            videoSessionMutation.mutate({
              exerciseId: ex.id,
              exerciseNombre: ex.nombre,
              watchedSeconds: elapsed,
              completed: elapsed > 30,
            });
          }
          videoStartRef.current = null;
        }
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [exercises, currentIdx]);

  useEffect(() => {
    return () => stopAllTimers();
  }, []);

  const startTotalTimer = useCallback(() => {
    totalTimerRef.current = setInterval(() => {
      setTotalSeconds(prev => prev + 1);
    }, 1000);
  }, []);

  const startExerciseTimer = useCallback(() => {
    setExerciseSeconds(0);
    if (exerciseTimerRef.current) clearInterval(exerciseTimerRef.current);
    exerciseTimerRef.current = setInterval(() => {
      setExerciseSeconds(prev => prev + 1);
    }, 1000);
  }, []);

  const startRestTimer = useCallback((seconds: number) => {
    setRestCountdown(seconds);
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    restTimerRef.current = setInterval(() => {
      setRestCountdown(prev => {
        if (prev <= 1) {
          clearInterval(restTimerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const loadRoutineDetail = async (routine: Routine) => {
    try {
      const res = await apiRequest("GET", `/api/routines/${routine.id}`);
      const data = await res.json();
      setExercises(data.exercises || []);
      setSelectedRoutine(routine);
      setCurrentIdx(0);
      setTotalSeconds(0);
      setExerciseSeconds(0);
      setExercisesCompleted(0);
      setPhase("working");
      startTotalTimer();
      startExerciseTimer();

      const session = await startSessionMutation.mutateAsync({
        routineId: routine.id,
        routineNombre: routine.nombre,
        totalExercises: data.exercises?.length || 0,
      });
      setSessionId(session.session?.id || null);
    } catch (e) {
      Alert.alert("Error", "No se pudo cargar la rutina");
    }
  };

  const completeExercise = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (exerciseTimerRef.current) clearInterval(exerciseTimerRef.current);
    const newCompleted = exercisesCompleted + 1;
    setExercisesCompleted(newCompleted);

    const ex = exercises[currentIdx];
    const rest = parseRestSeconds(ex?.descanso);
    setRestSeconds(rest);

    if (currentIdx >= exercises.length - 1) {
      finishWorkout(newCompleted);
    } else {
      setPhase("resting");
      startRestTimer(rest);
    }
  }, [exercisesCompleted, exercises, currentIdx]);

  const continueAfterRest = useCallback(() => {
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    const nextIdx = currentIdx + 1;
    setCurrentIdx(nextIdx);
    setPhase("working");
    startExerciseTimer();
  }, [currentIdx]);

  const finishWorkout = useCallback(async (completed: number) => {
    stopAllTimers();
    setPhase("complete");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (sessionId) {
      await finishSessionMutation.mutateAsync({
        id: sessionId,
        durationSeconds: totalSeconds,
        exercisesCompleted: completed,
      });
    }

    const routines = routinesData?.routines || [];
    const routine = routines.find((r: any) => r.id === selectedRoutine?.id);
    const trainerId = routine?.trainer_id;
    if (trainerId) {
      const mins = Math.floor(totalSeconds / 60);
      sendSummaryMutation.mutate({
        receiverId: trainerId,
        contenido: `✅ ¡Entrenamiento completado!\n📋 Rutina: ${selectedRoutine?.nombre}\n⏱️ Duración: ${mins} min\n💪 Ejercicios: ${completed}/${exercises.length}`,
      });
    }

    sendLocalNotification("¡Entrenamiento completado!", `Completaste ${completed} ejercicio${completed !== 1 ? "s" : ""} en ${Math.floor(totalSeconds / 60)} minutos.`);
  }, [sessionId, totalSeconds, selectedRoutine, exercises, routinesData]);

  const openVideo = useCallback((ex: Exercise) => {
    videoStartRef.current = Date.now();
  }, []);

  const resetWorkout = useCallback(() => {
    stopAllTimers();
    setPhase("select");
    setSelectedRoutine(null);
    setExercises([]);
    setCurrentIdx(0);
    setTotalSeconds(0);
    setExerciseSeconds(0);
    setExercisesCompleted(0);
    setSessionId(null);
  }, []);

  const routines: Routine[] = routinesData?.routines || [];
  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);

  if (phase === "select") {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <View style={[styles.headerContainer, { paddingTop: topInset + 16 }]}>
          <Text style={styles.title}>Entrenar</Text>
          <Text style={styles.subtitle}>Selecciona una rutina para comenzar</Text>
        </View>
        <FlatList
          data={routines}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!routines.length}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="barbell-outline" size={64} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>Sin rutinas disponibles</Text>
              <Text style={styles.emptySubtitle}>Tu entrenador debe asignarte una rutina primero.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.routineCard, pressed && { opacity: 0.85 }]}
              onPress={() => loadRoutineDetail(item)}
            >
              <View style={styles.routineTop}>
                <View style={styles.routineIconWrap}>
                  <Ionicons name="barbell" size={24} color={Colors.primary} />
                </View>
                <View style={styles.playBtn}>
                  <Ionicons name="play" size={20} color={Colors.primaryText} />
                </View>
              </View>
              <Text style={styles.routineName}>{item.nombre}</Text>
              {item.descripcion ? (
                <Text style={styles.routineDesc} numberOfLines={2}>{item.descripcion}</Text>
              ) : null}
              <View style={styles.routineMeta}>
                <View style={styles.metaBadge}>
                  <Ionicons name="fitness" size={12} color={Colors.textMuted} />
                  <Text style={styles.metaText}>{item.nivel}</Text>
                </View>
                {(item.trainer_nombre || item.trainer_apellido) && (
                  <View style={styles.metaBadge}>
                    <Ionicons name="person" size={12} color={Colors.textMuted} />
                    <Text style={styles.metaText}>{item.trainer_nombre} {item.trainer_apellido}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          )}
        />
      </View>
    );
  }

  if (phase === "working") {
    const ex = exercises[currentIdx];
    if (!ex) return null;
    const progress = (currentIdx / exercises.length);

    return (
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <View style={[styles.workoutHeader, { paddingTop: topInset + 8 }]}>
          <Pressable onPress={() => {
            Alert.alert("¿Salir del entrenamiento?", "Perderás el progreso de esta sesión.", [
              { text: "Cancelar", style: "cancel" },
              { text: "Salir", style: "destructive", onPress: resetWorkout },
            ]);
          }}>
            <Ionicons name="close" size={24} color={Colors.textSecondary} />
          </Pressable>
          <View style={styles.workoutHeaderCenter}>
            <Text style={styles.workoutTitle}>{selectedRoutine?.nombre}</Text>
            <Text style={styles.workoutProgress}>Ejercicio {currentIdx + 1} de {exercises.length}</Text>
          </View>
          <View style={styles.totalTimer}>
            <Ionicons name="timer-outline" size={14} color={Colors.primary} />
            <Text style={styles.totalTimerText}>{formatSeconds(totalSeconds)}</Text>
          </View>
        </View>

        <View style={styles.progressBarWrap}>
          <View style={[styles.progressBarFill, { width: `${progress * 100}%` as any }]} />
        </View>

        <ScrollView contentContainerStyle={styles.workoutContent} showsVerticalScrollIndicator={false}>
          <View style={styles.exerciseCard}>
            <View style={styles.exerciseTimerCircle}>
              <Text style={styles.exerciseTimerText}>{formatSeconds(exerciseSeconds)}</Text>
              <Text style={styles.exerciseTimerLabel}>tiempo</Text>
            </View>

            <Text style={styles.exerciseName}>{ex.nombre}</Text>
            {ex.descripcion ? (
              <Text style={styles.exerciseDesc}>{ex.descripcion}</Text>
            ) : null}

            <View style={styles.exerciseStats}>
              <View style={styles.exerciseStat}>
                <Text style={styles.exerciseStatVal}>{ex.series}</Text>
                <Text style={styles.exerciseStatLabel}>Series</Text>
              </View>
              <View style={styles.exerciseStatDivider} />
              <View style={styles.exerciseStat}>
                <Text style={styles.exerciseStatVal}>{ex.repeticiones}</Text>
                <Text style={styles.exerciseStatLabel}>Reps</Text>
              </View>
              {ex.peso && (
                <>
                  <View style={styles.exerciseStatDivider} />
                  <View style={styles.exerciseStat}>
                    <Text style={styles.exerciseStatVal}>{ex.peso}</Text>
                    <Text style={styles.exerciseStatLabel}>Peso</Text>
                  </View>
                </>
              )}
              {ex.descanso && (
                <>
                  <View style={styles.exerciseStatDivider} />
                  <View style={styles.exerciseStat}>
                    <Text style={styles.exerciseStatVal}>{ex.descanso}</Text>
                    <Text style={styles.exerciseStatLabel}>Descanso</Text>
                  </View>
                </>
              )}
            </View>

            {ex.video_url && (
              <View style={styles.videoInlineWrapper}>
                <InlineVideo uri={ex.video_url} />
              </View>
            )}
          </View>

          <Pressable
            style={({ pressed }) => [styles.completeBtn, pressed && { opacity: 0.9 }]}
            onPress={completeExercise}
          >
            <Ionicons name="checkmark-circle" size={24} color={Colors.primaryText} />
            <Text style={styles.completeBtnText}>
              {currentIdx >= exercises.length - 1 ? "Finalizar Entrenamiento" : "Ejercicio Completado"}
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  if (phase === "resting") {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" }}>
        <View style={[styles.totalTimer, styles.totalTimerTop, { top: topInset + 20 }]}>
          <Ionicons name="timer-outline" size={14} color={Colors.primary} />
          <Text style={styles.totalTimerText}>{formatSeconds(totalSeconds)}</Text>
        </View>

        <Text style={styles.restLabel}>Descansando</Text>
        <View style={styles.restCircle}>
          <Text style={styles.restCountdown}>{formatSeconds(restCountdown)}</Text>
          <Text style={styles.restSub}>descanso</Text>
        </View>

        <Text style={styles.nextUpLabel}>Siguiente</Text>
        <Text style={styles.nextExerciseName}>{exercises[currentIdx + 1]?.nombre || ""}</Text>

        <Pressable
          style={({ pressed }) => [styles.skipRestBtn, pressed && { opacity: 0.85 }]}
          onPress={continueAfterRest}
        >
          <Ionicons name="play-skip-forward" size={20} color={Colors.primaryText} />
          <Text style={styles.skipRestText}>Continuar</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === "complete") {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView contentContainerStyle={[styles.completeContent, { paddingTop: topInset + 40 }]}>
          <View style={styles.completeBadge}>
            <Ionicons name="trophy" size={60} color={Colors.primary} />
          </View>
          <Text style={styles.completeTitle}>¡Entrenamiento Completado!</Text>
          <Text style={styles.completeSubtitle}>Excelente trabajo. Tu entrenador ha sido notificado.</Text>

          <View style={styles.completeSummary}>
            <View style={styles.completeStat}>
              <Text style={styles.completeStatVal}>{mins}:{String(secs).padStart(2, "0")}</Text>
              <Text style={styles.completeStatLabel}>Duración total</Text>
            </View>
            <View style={styles.completeStatDivider} />
            <View style={styles.completeStat}>
              <Text style={styles.completeStatVal}>{exercisesCompleted}</Text>
              <Text style={styles.completeStatLabel}>Ejercicios</Text>
            </View>
            <View style={styles.completeStatDivider} />
            <View style={styles.completeStat}>
              <Text style={styles.completeStatVal}>{exercises.length > 0 ? Math.round((exercisesCompleted / exercises.length) * 100) : 0}%</Text>
              <Text style={styles.completeStatLabel}>Completado</Text>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.completeBtn, styles.completeBtnFull, pressed && { opacity: 0.85 }]}
            onPress={resetWorkout}
          >
            <Text style={styles.completeBtnText}>Volver al inicio</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return null;
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
  list: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
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
    paddingHorizontal: 20,
  },
  routineCard: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  routineTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  routineIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.primary + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
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
  routineMeta: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontFamily: "Outfit_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    textTransform: "capitalize",
  },
  workoutHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  workoutHeaderCenter: { flex: 1 },
  workoutTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
    color: Colors.text,
  },
  workoutProgress: {
    fontFamily: "Outfit_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  totalTimer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.primary + "22",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  totalTimerTop: {
    position: "absolute",
    right: 20,
  },
  totalTimerText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 13,
    color: Colors.primary,
  },
  progressBarWrap: {
    height: 3,
    backgroundColor: Colors.border,
  },
  progressBarFill: {
    height: 3,
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  workoutContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 120,
    gap: 20,
  },
  exerciseCard: {
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  exerciseTimerCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    backgroundColor: Colors.primary + "11",
  },
  exerciseTimerText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 36,
    color: Colors.primary,
    letterSpacing: -1,
  },
  exerciseTimerLabel: {
    fontFamily: "Outfit_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  exerciseName: {
    fontFamily: "Outfit_700Bold",
    fontSize: 24,
    color: Colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  exerciseDesc: {
    fontFamily: "Outfit_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  exerciseStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 20,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  exerciseStat: { alignItems: "center", minWidth: 48 },
  exerciseStatVal: {
    fontFamily: "Outfit_700Bold",
    fontSize: 22,
    color: Colors.text,
  },
  exerciseStatLabel: {
    fontFamily: "Outfit_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  exerciseStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
  },
  videoInlineWrapper: {
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 8,
  },
  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 18,
  },
  completeBtnText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
    color: Colors.primaryText,
  },
  restLabel: {
    fontFamily: "Outfit_400Regular",
    fontSize: 18,
    color: Colors.textSecondary,
    marginBottom: 32,
  },
  restCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 4,
    borderColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.accent + "11",
    marginBottom: 40,
  },
  restCountdown: {
    fontFamily: "Outfit_700Bold",
    fontSize: 56,
    color: Colors.accent,
    letterSpacing: -2,
  },
  restSub: {
    fontFamily: "Outfit_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  nextUpLabel: {
    fontFamily: "Outfit_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 6,
  },
  nextExerciseName: {
    fontFamily: "Outfit_700Bold",
    fontSize: 20,
    color: Colors.text,
    marginBottom: 40,
    paddingHorizontal: 20,
    textAlign: "center",
  },
  skipRestBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  skipRestText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
    color: Colors.primaryText,
  },
  completeContent: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 60,
    gap: 16,
  },
  completeBadge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.primary + "22",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  completeTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 28,
    color: Colors.text,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  completeSubtitle: {
    fontFamily: "Outfit_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  completeSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 8,
    width: "100%",
  },
  completeStat: { flex: 1, alignItems: "center" },
  completeStatVal: {
    fontFamily: "Outfit_700Bold",
    fontSize: 28,
    color: Colors.primary,
    letterSpacing: -0.5,
  },
  completeStatLabel: {
    fontFamily: "Outfit_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
    textAlign: "center",
  },
  completeStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.border,
  },
  completeBtnFull: {
    width: "100%",
    marginTop: 8,
    flexDirection: "row",
  },
});
