import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function dbQuery(text: string, params?: unknown[]) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

export async function createUser(data: {
  email: string;
  password: string;
  nombre: string;
  apellido: string;
  role: string;
}) {
  const existing = await dbQuery("SELECT id FROM users WHERE email = $1", [data.email.toLowerCase()]);
  if (existing.rows.length > 0) {
    throw new Error("Ya existe una cuenta con este correo electrónico");
  }
  const hashedPassword = await bcrypt.hash(data.password, 12);
  const result = await dbQuery(
    `INSERT INTO users (email, password, nombre, apellido, role)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, email, nombre, apellido, role, avatar_url, created_at`,
    [data.email.toLowerCase(), hashedPassword, data.nombre, data.apellido, data.role]
  );
  return result.rows[0];
}

export async function validateUser(email: string, password: string) {
  const result = await dbQuery("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
  if (result.rows.length === 0) return null;
  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return null;
  const { password: _pw, ...safeUser } = user;
  return safeUser;
}

export async function getUserById(id: string) {
  const result = await dbQuery(
    "SELECT id, email, nombre, apellido, role, avatar_url, created_at FROM users WHERE id = $1",
    [id]
  );
  return result.rows[0] || null;
}

export async function getTrainerClients(trainerId: string) {
  const result = await dbQuery(
    `SELECT tc.*, u.nombre, u.apellido, u.email, u.avatar_url, u.role
     FROM trainer_clients tc
     LEFT JOIN users u ON tc.client_id = u.id
     WHERE tc.trainer_id = $1
     ORDER BY tc.created_at DESC`,
    [trainerId]
  );
  return result.rows;
}

export async function createClientRelation(trainerId: string, data: {
  clientId?: string;
  inviteEmail?: string;
}) {
  if (data.clientId) {
    const exists = await dbQuery(
      "SELECT id FROM trainer_clients WHERE trainer_id = $1 AND client_id = $2",
      [trainerId, data.clientId]
    );
    if (exists.rows.length > 0) throw new Error("Este cliente ya está en tu lista");
  }
  const token = Math.random().toString(36).substring(2, 15);
  const result = await dbQuery(
    `INSERT INTO trainer_clients (trainer_id, client_id, invite_email, invite_token, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [trainerId, data.clientId || null, data.inviteEmail || null, token, data.clientId ? "activo" : "pendiente"]
  );
  return result.rows[0];
}

export async function getTrainerRoutines(trainerId: string) {
  const result = await dbQuery(
    `SELECT r.*, u.nombre as client_nombre, u.apellido as client_apellido
     FROM routines r
     LEFT JOIN users u ON r.client_id = u.id
     WHERE r.trainer_id = $1
     ORDER BY r.created_at DESC`,
    [trainerId]
  );
  return result.rows;
}

export async function getClientRoutines(clientId: string) {
  const result = await dbQuery(
    `SELECT r.*, u.nombre as trainer_nombre, u.apellido as trainer_apellido
     FROM routines r
     LEFT JOIN users u ON r.trainer_id = u.id
     WHERE r.client_id = $1
     ORDER BY r.created_at DESC`,
    [clientId]
  );
  return result.rows;
}

export async function createRoutine(data: {
  trainerId: string;
  clientId?: string;
  nombre: string;
  descripcion?: string;
  nivel?: string;
}) {
  const result = await dbQuery(
    `INSERT INTO routines (trainer_id, client_id, nombre, descripcion, nivel)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.trainerId, data.clientId || null, data.nombre, data.descripcion || null, data.nivel || "intermedio"]
  );
  return result.rows[0];
}

export async function getRoutineById(routineId: string) {
  const result = await dbQuery("SELECT * FROM routines WHERE id = $1", [routineId]);
  return result.rows[0] || null;
}

export async function deleteRoutine(routineId: string) {
  await dbQuery("DELETE FROM routines WHERE id = $1", [routineId]);
}

export async function getRoutineExercises(routineId: string) {
  const result = await dbQuery(
    "SELECT * FROM exercises WHERE routine_id = $1 ORDER BY orden ASC, created_at ASC",
    [routineId]
  );
  return result.rows;
}

export async function createExercise(data: {
  routineId: string;
  nombre: string;
  descripcion?: string;
  series?: number;
  repeticiones?: string;
  peso?: string;
  descanso?: string;
  imagenUrl?: string;
  videoUrl?: string;
  orden?: number;
}) {
  const result = await dbQuery(
    `INSERT INTO exercises (routine_id, nombre, descripcion, series, repeticiones, peso, descanso, imagen_url, video_url, orden)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [
      data.routineId, data.nombre, data.descripcion || null,
      data.series || 3, data.repeticiones || "10", data.peso || null,
      data.descanso || "60s", data.imagenUrl || null, data.videoUrl || null, data.orden || 0
    ]
  );
  return result.rows[0];
}

export async function deleteExercise(exerciseId: string) {
  await dbQuery("DELETE FROM exercises WHERE id = $1", [exerciseId]);
}

export async function getClientProgress(clientId: string) {
  const result = await dbQuery(
    "SELECT * FROM progress WHERE client_id = $1 ORDER BY fecha DESC LIMIT 50",
    [clientId]
  );
  return result.rows;
}

export async function createProgressEntry(data: {
  clientId: string;
  trainerId?: string;
  fecha: string;
  peso?: number;
  grasaCorporal?: number;
  masaMuscular?: number;
  pecho?: number;
  cintura?: number;
  caderas?: number;
  notas?: string;
  fotoUrl?: string;
}) {
  const result = await dbQuery(
    `INSERT INTO progress (client_id, trainer_id, fecha, peso, grasa_corporal, masa_muscular, pecho, cintura, caderas, notas, foto_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [
      data.clientId, data.trainerId || null, data.fecha,
      data.peso || null, data.grasaCorporal || null, data.masaMuscular || null,
      data.pecho || null, data.cintura || null, data.caderas || null,
      data.notas || null, data.fotoUrl || null
    ]
  );
  return result.rows[0];
}

export async function getChatMessages(userId1: string, userId2: string) {
  const result = await dbQuery(
    `SELECT m.*, 
       su.nombre as sender_nombre, su.apellido as sender_apellido, su.avatar_url as sender_avatar
     FROM chat_messages m
     JOIN users su ON m.sender_id = su.id
     WHERE (m.sender_id = $1 AND m.receiver_id = $2)
        OR (m.sender_id = $2 AND m.receiver_id = $1)
     ORDER BY m.created_at ASC`,
    [userId1, userId2]
  );
  await dbQuery(
    "UPDATE chat_messages SET leido = TRUE WHERE sender_id = $1 AND receiver_id = $2 AND leido = FALSE",
    [userId2, userId1]
  );
  return result.rows;
}

export async function sendChatMessage(data: {
  senderId: string;
  receiverId: string;
  contenido?: string;
  tipo?: string;
  mediaUrl?: string;
}) {
  const result = await dbQuery(
    `INSERT INTO chat_messages (sender_id, receiver_id, contenido, tipo, media_url)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.senderId, data.receiverId, data.contenido || null, data.tipo || "texto", data.mediaUrl || null]
  );
  return result.rows[0];
}

export async function getChatConversations(userId: string) {
  const result = await dbQuery(
    `SELECT DISTINCT ON (other_id)
       other_id,
       u.nombre, u.apellido, u.avatar_url, u.role,
       last_msg, last_tipo, last_at,
       (SELECT COUNT(*) FROM chat_messages 
        WHERE sender_id = other_id AND receiver_id = $1 AND leido = FALSE) as unread_count
     FROM (
       SELECT 
         CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END as other_id,
         contenido as last_msg,
         tipo as last_tipo,
         created_at as last_at
       FROM chat_messages
       WHERE sender_id = $1 OR receiver_id = $1
       ORDER BY created_at DESC
     ) sub
     JOIN users u ON u.id = sub.other_id
     ORDER BY other_id, last_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function saveMediaFile(data: {
  uploaderId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}) {
  const result = await dbQuery(
    `INSERT INTO media_files (uploader_id, filename, original_name, mime_type, size, url)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [data.uploaderId, data.filename, data.originalName, data.mimeType, data.size, data.url]
  );
  return result.rows[0];
}

export async function updateUserAvatar(userId: string, avatarUrl: string) {
  const result = await dbQuery(
    "UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING id, email, nombre, apellido, role, avatar_url, created_at",
    [avatarUrl, userId]
  );
  return result.rows[0];
}

export async function findUserByEmail(email: string) {
  const result = await dbQuery(
    "SELECT id, email, nombre, apellido, role, avatar_url FROM users WHERE email = $1",
    [email.toLowerCase()]
  );
  return result.rows[0] || null;
}

// TRAINING SESSIONS
export async function createTrainingSession(data: {
  clientId: string;
  routineId?: string;
  routineNombre?: string;
  totalExercises?: number;
}) {
  const result = await dbQuery(
    `INSERT INTO training_sessions (client_id, routine_id, routine_nombre, total_exercises)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [data.clientId, data.routineId || null, data.routineNombre || null, data.totalExercises || 0]
  );
  return result.rows[0];
}

export async function finishTrainingSession(id: string, data: {
  durationSeconds: number;
  exercisesCompleted: number;
  notas?: string;
}) {
  const result = await dbQuery(
    `UPDATE training_sessions
     SET ended_at = NOW(), duration_seconds = $2, exercises_completed = $3, notas = $4
     WHERE id = $1 RETURNING *`,
    [id, data.durationSeconds, data.exercisesCompleted, data.notas || null]
  );
  return result.rows[0];
}

export async function getClientTrainingSessions(clientId: string, limit = 20) {
  const result = await dbQuery(
    `SELECT ts.*, r.nombre as routine_nombre_ref
     FROM training_sessions ts
     LEFT JOIN routines r ON ts.routine_id = r.id
     WHERE ts.client_id = $1
     ORDER BY ts.created_at DESC LIMIT $2`,
    [clientId, limit]
  );
  return result.rows;
}

export async function getTrainerClientSessions(trainerId: string, limit = 50) {
  const result = await dbQuery(
    `SELECT ts.*, u.nombre as client_nombre, u.apellido as client_apellido
     FROM training_sessions ts
     JOIN users u ON ts.client_id = u.id
     JOIN trainer_clients tc ON tc.client_id = ts.client_id
     WHERE tc.trainer_id = $1
     ORDER BY ts.created_at DESC LIMIT $2`,
    [trainerId, limit]
  );
  return result.rows;
}

// VIDEO SESSIONS
export async function createVideoSession(data: {
  userId: string;
  exerciseId: string;
  exerciseNombre?: string;
  watchedSeconds: number;
  completed?: boolean;
}) {
  const result = await dbQuery(
    `INSERT INTO training_video_sessions (user_id, exercise_id, exercise_nombre, watched_seconds, completed)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.userId, data.exerciseId, data.exerciseNombre || null, data.watchedSeconds, data.completed || false]
  );
  return result.rows[0];
}

export async function getVideoSessionsByExercise(exerciseId: string) {
  const result = await dbQuery(
    `SELECT tvs.*, u.nombre, u.apellido
     FROM training_video_sessions tvs
     JOIN users u ON tvs.user_id = u.id
     WHERE tvs.exercise_id = $1
     ORDER BY tvs.created_at DESC`,
    [exerciseId]
  );
  return result.rows;
}

export async function getClientVideoSessions(clientId: string) {
  const result = await dbQuery(
    `SELECT tvs.*, e.nombre as exercise_nombre_ref
     FROM training_video_sessions tvs
     LEFT JOIN exercises e ON tvs.exercise_id = e.id
     WHERE tvs.user_id = $1
     ORDER BY tvs.created_at DESC LIMIT 30`,
    [clientId]
  );
  return result.rows;
}
