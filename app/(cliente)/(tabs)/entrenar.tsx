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
import { useAuth } from "@/context/auth";
import { sendLocalNotification } from "@/hooks/useNotifications";
import { supabase } from "@/lib/supabase";

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
  orden?: number;
}

interface Routine {
  id: string;
  nombre: string;
  descripcion: string | null;
  nivel: string;
  trainer_nombre: string | null;
  trainer_apellido: string | null;
  trainer_id?: string;
  ejercicios?: Exercise[]; // <-- Agregamos los ejercicios aquí
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

  const [currentExIdx, setCurrentExIdx] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  const [setsCompleted, setSetsCompleted] = useState(0);
  const [exercisesCompleted, setExercisesCompleted] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const [totalSeconds, setTotalSeconds] = useState(0);
  const [setSeconds, setSetSeconds] = useState(0);
  const [restCountdown, setRestCountdown] = useState(60);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const totalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const setTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPausedRef = useRef(false);
  const restTypeRef = useRef<"set" | "exercise">("set");
  const bgTimeRef = useRef<number | null>(null);
  const phaseRef = useRef<WorkoutPhase>("select");
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const totalSecondsRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const exercisesRef = useRef<Exercise[]>([]);
  const selectedRoutineRef = useRef<Routine | null>(null);
  const currentExIdxRef = useRef(0);
  const currentSetRef = useRef(1);
  const exercisesCompletedRef = useRef(0);
  const setsCompletedRef = useRef(0);

  useEffect(() => { totalSecondsRef.current = totalSeconds; }, [totalSeconds]);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { exercisesRef.current = exercises; }, [exercises]);
  useEffect(() => { selectedRoutineRef.current = selectedRoutine; }, [selectedRoutine]);
  useEffect(() => { currentExIdxRef.current = currentExIdx; }, [currentExIdx]);
  useEffect(() => { currentSetRef.current = currentSet; }, [currentSet]);
  useEffect(() => { exercisesCompletedRef.current = exercisesCompleted; }, [exercisesCompleted]);
  useEffect(() => { setsCompletedRef.current = setsCompleted; }, [setsCompleted]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // 1. CARGAR RUTINAS Y EJERCICIOS JUNTOS (Para que funcione Offline)
  const { data: routinesData } = useQuery({
    queryKey: ["client_routines_list_offline", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rutinas")
        .select(`
          *,
          perfiles:entrenador_id (nombre, apellido),
          ejercicios (*) 
        `) // <-- La magia está aquí: Traemos los ejercicios anidados
        .eq("cliente_id", user?.id)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);

      const formatted = (data || []).map((r: any) => ({
        ...r,
        trainer_nombre: r.perfiles?.nombre,
        trainer_apellido: r.perfiles?.apellido,
        trainer_id: r.entrenador_id,
        ejercicios: r.ejercicios?.sort((a: any, b: any) => (a.orden || 0) - (b.orden || 0)) || []
      }));

      return { routines: formatted };
    },
    staleTime: 1000 * 60 * 60, // Mantenemos la caché viva por 1 hora
  });

  // 2. INICIAR SESIÓN DE ENTRENAMIENTO (Tolerante a fallos offline)
  const startSessionMutation = useMutation({
    mutationFn: async (data: { routineId: string; totalExercises: number }) => {
      const { data: sessionData, error } = await supabase
        .from("sesiones_entrenamiento")
        .insert([{
          cliente_id: user?.id,
          rutina_id: data.routineId,
          total_ejercicios: data.totalExercises,
          ejercicios_completados: 0,
          duracion_segundos: 0,
        }])
        .select()
        .single();

      if (error) throw new Error(error.message);
      return sessionData;
    },
    onError: (err) => console.log("[Modo Offline] No se pudo crear la sesión en DB, pero el cronómetro seguirá."),
  });

  // 3. FINALIZAR SESIÓN DE ENTRENAMIENTO
  const finishSessionMutation = useMutation({
    mutationFn: async (data: { id: string; durationSeconds: number; exercisesCompleted: number }) => {
      const { error } = await supabase
        .from("sesiones_entrenamiento")
        .update({
          duracion_segundos: data.durationSeconds,
          ejercicios_completados: data.exercisesCompleted,
        })
        .eq("id", data.id);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
    onError: (err) => console.log("[Modo Offline] El progreso se quedará en local."),
  });

  // 4. ENVIAR RESUMEN AL ENTRENADOR VÍA CHAT
  const sendSummaryMutation = useMutation({
    mutationFn: async (data: { receiverId: string; contenido: string }) => {
      const { error } = await supabase
        .from("mensajes")
        .insert([{
          emisor_id: user?.id,
          receptor_id: data.receiverId,
          texto: data.contenido,
          tipo: "texto",
        }]);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client_chats_preview"] }),
  });

  const stopAllTimers = useCallback(() => {
    if (totalTimerRef.current) { clearInterval(totalTimerRef.current); totalTimerRef.current = null; }
    if (setTimerRef.current) { clearInterval(setTimerRef.current); setTimerRef.current = null; }
    if (restTimerRef.current) { clearInterval(restTimerRef.current); restTimerRef.current = null; }
  }, []);

  const startTotalTimer = useCallback(() => {
    if (totalTimerRef.current) clearInterval(totalTimerRef.current);
    totalTimerRef.current = setInterval(() => {
      if (!isPausedRef.current) setTotalSeconds(prev => prev + 1);
    }, 1000);
  }, []);

  const startSetTimer = useCallback(() => {
    setSetSeconds(0);
    if (setTimerRef.current) clearInterval(setTimerRef.current);
    setTimerRef.current = setInterval(() => {
      if (!isPausedRef.current) setSetSeconds(prev => prev + 1);
    }, 1000);
  }, []);

  const startRestTimer = useCallback((seconds: number) => {
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    setRestCountdown(seconds);
    restTimerRef.current = setInterval(() => {
      if (!isPausedRef.current) {
        setRestCountdown(prev => {
          if (prev <= 1) {
            clearInterval(restTimerRef.current!);
            restTimerRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (appStateRef.current === "active" && nextState === "background") {
        bgTimeRef.current = Date.now();
      }
      if (appStateRef.current === "background" && nextState === "active") {
        if (bgTimeRef.current && !isPausedRef.current) {
          const elapsed = Math.round((Date.now() - bgTimeRef.current) / 1000);
          const p = phaseRef.current;
          if (p === "working") {
            setTotalSeconds(prev => prev + elapsed);
            setSetSeconds(prev => prev + elapsed);
          } else if (p === "resting") {
            setTotalSeconds(prev => prev + elapsed);
            setRestCountdown(prev => Math.max(0, prev - elapsed));
          }
        }
        bgTimeRef.current = null;
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => () => stopAllTimers(), []);

  const togglePause = useCallback(() => {
    const next = !isPausedRef.current;
    isPausedRef.current = next;
    setIsPaused(next);
    if (!next) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const loadRoutineDetail = async (routine: Routine) => {
    try {
      // YA NO HACEMOS FETCH A LA BASE DE DATOS AQUÍ.
      // Usamos los ejercicios que ya vienen anidados desde la caché.
      const exList = routine.ejercicios || [];

      if (exList.length === 0) {
        Alert.alert("Rutina vacía", "Esta rutina no tiene ejercicios asignados.");
        return;
      }

      setExercises(exList);
      setSelectedRoutine(routine);
      setCurrentExIdx(0);
      setCurrentSet(1);
      setSetsCompleted(0);
      setExercisesCompleted(0);
      setTotalSeconds(0);
      setSetSeconds(0);
      setIsPaused(false);
      isPausedRef.current = false;
      setPhase("working");

      startTotalTimer();
      startSetTimer();

      // Intentamos iniciar la sesión en DB. Si falla (por falta de internet), 
      // generamos un ID falso para que la app no crashee y permita seguir.
      try {
        const session = await startSessionMutation.mutateAsync({
          routineId: routine.id,
          totalExercises: exList.length,
        });
        setSessionId(session.id || null);
      } catch (e) {
        setSessionId("offline_session_" + Date.now()); // Fallback offline
      }
      
    } catch {
      Alert.alert("Error", "No se pudo cargar la rutina");
    }
  };

  const finishWorkout = useCallback(async (completed: number, setsCompl: number) => {
    stopAllTimers();
    setPhase("complete");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const currentTotal = totalSecondsRef.current;
    const sid = sessionIdRef.current;
    const exList = exercisesRef.current;
    const selRoutine = selectedRoutineRef.current;

    // Solo intentamos actualizar en DB si el ID no es el que generamos offline
    if (sid && !sid.startsWith("offline_")) {
      finishSessionMutation.mutate({
        id: sid,
        durationSeconds: currentTotal,
        exercisesCompleted: completed,
      });
    }

    const routines = routinesData?.routines || [];
    const routine = routines.find((r: any) => r.id === selRoutine?.id);
    const trainerId = routine?.trainer_id;

    if (trainerId) {
      const mins = Math.floor(currentTotal / 60);
      const totalSetsInRoutine = exList.reduce((sum, ex) => sum + (ex.series || 1), 0);
      
      let reporte = `✅ ¡Entrenamiento Completado!\n`;
      reporte += `📋 Rutina: ${selRoutine?.nombre}\n`;
      reporte += `⏱️ Tiempo: ${mins} min\n`;
      reporte += `📊 Progreso: ${completed}/${exList.length} ejercicios (${setsCompl}/${totalSetsInRoutine} series)\n\n`;
      reporte += `*Desglose de ejercicios:*\n`;

      for (let i = 0; i < completed; i++) {
        const ex = exList[i];
        if (ex) {
          reporte += `- ${ex.nombre}: ${ex.series} series x ${ex.repeticiones} reps`;
          if (ex.peso) reporte += ` (${ex.peso})`;
          reporte += `\n`;
        }
      }

      if (completed < exList.length) {
         reporte += `\n⚠️ Nota: El entrenamiento se terminó antes de completar todos los ejercicios.`;
      }

      sendSummaryMutation.mutate({
        receiverId: trainerId,
        contenido: reporte,
      });
    }

    sendLocalNotification(
      "¡Entrenamiento completado!",
      `Completaste ${completed} ejercicio${completed !== 1 ? "s" : ""} en ${Math.floor(currentTotal / 60)} minutos.`
    );
  }, [stopAllTimers, routinesData, finishSessionMutation, sendSummaryMutation]);

  const handleFinishSet = useCallback(() => {
    const exIdx = currentExIdxRef.current;
    const set = currentSetRef.current;
    const exCompleted = exercisesCompletedRef.current;
    const setsCompl = setsCompletedRef.current;
    const exList = exercisesRef.current;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (setTimerRef.current) { clearInterval(setTimerRef.current); setTimerRef.current = null; }

    const ex = exList[exIdx];
    const totalSets = ex?.series || 1;
    const restSecs = parseRestSeconds(ex?.descanso);
    const newSetsCompleted = setsCompl + 1;
    setSetsCompleted(newSetsCompleted);

    if (set < totalSets) {
      restTypeRef.current = "set";
      setPhase("resting");
      startRestTimer(restSecs);
    } else {
      const newExCompleted = exCompleted + 1;
      setExercisesCompleted(newExCompleted);

      if (exIdx >= exList.length - 1) {
        finishWorkout(newExCompleted, newSetsCompleted);
      } else {
        restTypeRef.current = "exercise";
        setCurrentExIdx(exIdx + 1);
        setCurrentSet(1);
        setPhase("resting");
        startRestTimer(restSecs);
      }
    }
  }, [startRestTimer, finishWorkout]);

  const continueAfterRest = useCallback(() => {
    if (restTimerRef.current) { clearInterval(restTimerRef.current); restTimerRef.current = null; }
    if (restTypeRef.current === "set") {
      setCurrentSet(prev => prev + 1);
    }
    setPhase("working");
    startSetTimer();
  }, [startSetTimer]);

  const resetWorkout = useCallback(() => {
    stopAllTimers();
    isPausedRef.current = false;
    setIsPaused(false);
    setPhase("select");
    setSelectedRoutine(null);
    setExercises([]);
    setCurrentExIdx(0);
    setCurrentSet(1);
    setSetsCompleted(0);
    setExercisesCompleted(0);
    setTotalSeconds(0);
    setSetSeconds(0);
    setSessionId(null);
  }, [stopAllTimers]);

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
    const ex = exercises[currentExIdx];
    if (!ex) return null;
    const totalSets = ex.series || 1;
    const exerciseProgress = currentExIdx / exercises.length;
    const setProgress = (currentSet - 1) / totalSets;
    const overallProgress = (currentExIdx + setProgress) / exercises.length;

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
            <Text style={styles.workoutTitle} numberOfLines={1}>{selectedRoutine?.nombre}</Text>
            <Text style={styles.workoutProgress}>
              Ejercicio {currentExIdx + 1}/{exercises.length} · Serie {currentSet}/{totalSets}
            </Text>
          </View>

          <Pressable onPress={togglePause} style={styles.pauseBtn}>
            <Ionicons
              name={isPaused ? "play" : "pause"}
              size={16}
              color={Colors.primary}
            />
          </Pressable>

          <View style={styles.totalTimer}>
            <Ionicons name="timer-outline" size={14} color={Colors.primary} />
            <Text style={styles.totalTimerText}>{formatSeconds(totalSeconds)}</Text>
          </View>
        </View>

        <View style={styles.progressBarWrap}>
          <View style={[styles.progressBarFill, { width: `${overallProgress * 100}%` as any }]} />
        </View>

        {isPaused && (
          <View style={styles.pausedBanner}>
            <Ionicons name="pause-circle" size={16} color={Colors.primary} />
            <Text style={styles.pausedText}>Pausado</Text>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.workoutContent} showsVerticalScrollIndicator={false}>
          <View style={styles.exerciseCard}>
            <View style={styles.phaseRow}>
              <View style={styles.phaseBadge}>
                <Ionicons name="flame" size={12} color={Colors.primaryText} />
                <Text style={styles.phaseBadgeText}>Entrenando</Text>
              </View>
              <View style={styles.setIndicatorRow}>
                {Array.from({ length: totalSets }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.setDot,
                      i < currentSet - 1 && styles.setDotDone,
                      i === currentSet - 1 && styles.setDotActive,
                    ]}
                  />
                ))}
              </View>
              <Text style={styles.setLabel}>Serie {currentSet}/{totalSets}</Text>
            </View>

            <View style={styles.exerciseTimerCircle}>
              <Text style={styles.exerciseTimerText}>{formatSeconds(setSeconds)}</Text>
              <Text style={styles.exerciseTimerLabel}>tiempo serie</Text>
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
              {ex.peso ? (
                <>
                  <View style={styles.exerciseStatDivider} />
                  <View style={styles.exerciseStat}>
                    <Text style={styles.exerciseStatVal}>{ex.peso}</Text>
                    <Text style={styles.exerciseStatLabel}>Peso</Text>
                  </View>
                </>
              ) : null}
              {ex.descanso ? (
                <>
                  <View style={styles.exerciseStatDivider} />
                  <View style={styles.exerciseStat}>
                    <Text style={styles.exerciseStatVal}>{ex.descanso}</Text>
                    <Text style={styles.exerciseStatLabel}>Descanso</Text>
                  </View>
                </>
              ) : null}
            </View>

            {ex.video_url && !isPaused ? (
              <View style={styles.videoInlineWrapper}>
                <InlineVideo uri={ex.video_url} />
              </View>
            ) : null}
          </View>

          <Pressable
            style={({ pressed }) => [styles.finishSetBtn, pressed && { opacity: 0.9 }]}
            onPress={handleFinishSet}
            testID="finish-set-btn"
          >
            <Ionicons name="checkmark-circle" size={24} color={Colors.primaryText} />
            <Text style={styles.finishSetBtnText}>Finalizar serie</Text>
          </Pressable>

          {currentExIdx >= exercises.length - 1 && currentSet >= totalSets && (
            <Text style={styles.lastSetHint}>Última serie del último ejercicio</Text>
          )}
        </ScrollView>
      </View>
    );
  }

  if (phase === "resting") {
    const isRestBetweenSets = restTypeRef.current === "set";
    const nextEx = exercises[currentExIdx];
    const nextSetNum = isRestBetweenSets ? currentSet + 1 : 1;
    const nextExName = isRestBetweenSets ? nextEx?.nombre : exercises[currentExIdx]?.nombre;

    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" }}>
        <View style={[styles.totalTimer, styles.totalTimerTop, { top: topInset + 20 }]}>
          <Ionicons name="timer-outline" size={14} color={Colors.primary} />
          <Text style={styles.totalTimerText}>{formatSeconds(totalSeconds)}</Text>
        </View>

        {isPaused && (
          <View style={[styles.pausedBanner, { marginBottom: 16 }]}>
            <Ionicons name="pause-circle" size={16} color={Colors.primary} />
            <Text style={styles.pausedText}>Pausado</Text>
          </View>
        )}

        <Text style={styles.restLabel}>Descansando</Text>

        <View style={styles.restCircle}>
          <Text style={styles.restCountdown}>{formatSeconds(restCountdown)}</Text>
          <Text style={styles.restSub}>descanso</Text>
        </View>

        <View style={styles.nextUpBlock}>
          <Text style={styles.nextUpLabel}>
            {isRestBetweenSets ? `Serie ${nextSetNum}` : "Siguiente ejercicio"}
          </Text>
          <Text style={styles.nextExerciseName}>{nextExName || ""}</Text>
          {isRestBetweenSets && nextEx && (
            <Text style={styles.nextSetSub}>
              Serie {nextSetNum} de {nextEx.series} · {nextEx.repeticiones} reps
              {nextEx.peso ? ` · ${nextEx.peso}` : ""}
            </Text>
          )}
        </View>

        <View style={styles.restActions}>
          <Pressable
            style={({ pressed }) => [styles.pauseRestBtn, pressed && { opacity: 0.85 }]}
            onPress={togglePause}
          >
            <Ionicons name={isPaused ? "play" : "pause"} size={18} color={Colors.text} />
            <Text style={styles.pauseRestText}>{isPaused ? "Reanudar" : "Pausar"}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.skipRestBtn, pressed && { opacity: 0.85 }]}
            onPress={continueAfterRest}
            testID="skip-rest-btn"
          >
            <Ionicons name="play-skip-forward" size={20} color={Colors.primaryText} />
            <Text style={styles.skipRestText}>Saltar descanso</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (phase === "complete") {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const totalSetsInRoutine = exercises.reduce((sum, ex) => sum + (ex.series || 1), 0);

    return (
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView contentContainerStyle={[styles.completeContent, { paddingTop: topInset + 40 }]}>
          <View style={styles.completeBadge}>
            <Ionicons name="trophy" size={60} color={Colors.primary} />
          </View>
          <Text style={styles.completeTitle}>¡Entrenamiento Completado!</Text>
          <Text style={styles.completeSubtitle}>
            Excelente trabajo. Tu entrenador ha sido notificado (si tienes conexión).
          </Text>

          <View style={styles.completeSummary}>
            <View style={styles.completeStat}>
              <Text style={styles.completeStatVal}>{mins}:{String(secs).padStart(2, "0")}</Text>
              <Text style={styles.completeStatLabel}>Duración</Text>
            </View>
            <View style={styles.completeStatDivider} />
            <View style={styles.completeStat}>
              <Text style={styles.completeStatVal}>{exercisesCompleted}</Text>
              <Text style={styles.completeStatLabel}>Ejercicios</Text>
            </View>
            <View style={styles.completeStatDivider} />
            <View style={styles.completeStat}>
              <Text style={styles.completeStatVal}>{setsCompleted}/{totalSetsInRoutine}</Text>
              <Text style={styles.completeStatLabel}>Series</Text>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.finishSetBtn, styles.finishSetBtnFull, pressed && { opacity: 0.85 }]}
            onPress={resetWorkout}
          >
            <Text style={styles.finishSetBtnText}>Volver al inicio</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return null;
}

// ... LOS ESTILOS SE MANTIENEN EXACTAMENTE IGUAL A TU CÓDIGO ANTERIOR ...
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
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  workoutHeaderCenter: { flex: 1 },
  workoutTitle: {
    fontFamily: "Outfit_700Bold",
    fontSize: 15,
    color: Colors.text,
  },
  workoutProgress: {
    fontFamily: "Outfit_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 1,
  },
  pauseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary + "22",
    alignItems: "center",
    justifyContent: "center",
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
  pausedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primary + "22",
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginHorizontal: 20,
    marginTop: 8,
    borderRadius: 12,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  pausedText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 13,
    color: Colors.primary,
  },
  workoutContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120,
    gap: 16,
  },
  exerciseCard: {
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 16,
  },
  phaseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  phaseBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  phaseBadgeText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 11,
    color: Colors.primaryText,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  setIndicatorRow: {
    flexDirection: "row",
    gap: 5,
    flex: 1,
  },
  setDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
  },
  setDotDone: {
    backgroundColor: Colors.primary,
  },
  setDotActive: {
    backgroundColor: Colors.primary,
    width: 20,
    borderRadius: 4,
  },
  setLabel: {
    fontFamily: "Outfit_700Bold",
    fontSize: 13,
    color: Colors.text,
  },
  exerciseTimerCircle: {
    alignSelf: "center",
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: Colors.primary + "15",
    borderWidth: 3,
    borderColor: Colors.primary + "40",
    alignItems: "center",
    justifyContent: "center",
  },
  exerciseTimerText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 30,
    color: Colors.primary,
    letterSpacing: -1,
  },
  exerciseTimerLabel: {
    fontFamily: "Outfit_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  exerciseName: {
    fontFamily: "Outfit_700Bold",
    fontSize: 22,
    color: Colors.text,
    letterSpacing: -0.3,
  },
  exerciseDesc: {
    fontFamily: "Outfit_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  exerciseStats: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: 16,
    padding: 16,
  },
  exerciseStat: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  exerciseStatVal: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  exerciseStatLabel: {
    fontFamily: "Outfit_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  exerciseStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
  },
  videoInlineWrapper: {
    borderRadius: 12,
    overflow: "hidden",
  },
  finishSetBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.primary,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 24,
  },
  finishSetBtnFull: {
    marginTop: 8,
  },
  finishSetBtnText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 17,
    color: Colors.primaryText,
  },
  lastSetHint: {
    fontFamily: "Outfit_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
  },
  restLabel: {
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 20,
  },
  restCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: Colors.primary + "15",
    borderWidth: 4,
    borderColor: Colors.primary + "40",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  restCountdown: {
    fontFamily: "Outfit_700Bold",
    fontSize: 48,
    color: Colors.primary,
    letterSpacing: -2,
  },
  restSub: {
    fontFamily: "Outfit_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  nextUpBlock: {
    alignItems: "center",
    gap: 4,
    marginBottom: 36,
    paddingHorizontal: 40,
  },
  nextUpLabel: {
    fontFamily: "Outfit_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  nextExerciseName: {
    fontFamily: "Outfit_700Bold",
    fontSize: 22,
    color: Colors.text,
    textAlign: "center",
  },
  nextSetSub: {
    fontFamily: "Outfit_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 2,
  },
  restActions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
  },
  pauseRestBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.card,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pauseRestText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 15,
    color: Colors.text,
  },
  skipRestBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  skipRestText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 15,
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
    backgroundColor: Colors.primary + "20",
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
    marginBottom: 8,
  },
  completeSummary: {
    flexDirection: "row",
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    alignSelf: "stretch",
    marginBottom: 8,
  },
  completeStat: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  completeStatVal: {
    fontFamily: "Outfit_700Bold",
    fontSize: 22,
    color: Colors.text,
  },
  completeStatLabel: {
    fontFamily: "Outfit_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  completeStatDivider: {
    width: 1,
    backgroundColor: Colors.border,
  },
});