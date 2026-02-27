import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  createUser, validateUser, getUserById, getTrainerClients,
  createClientRelation, getTrainerRoutines, getClientRoutines,
  createRoutine, getRoutineById, deleteRoutine, getRoutineExercises,
  createExercise, deleteExercise, getClientProgress, createProgressEntry,
  getChatMessages, sendChatMessage, getChatConversations,
  saveMediaFile, updateUserAvatar, findUserByEmail,
  createTrainingSession, finishTrainingSession, getClientTrainingSessions, getTrainerClientSessions,
  createVideoSession, getVideoSessionsByExercise, getClientVideoSessions
} from "./storage";

const PgSession = connectPgSimple(session);

const uploadsDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|mp4|mov|avi|webm|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext || mime) return cb(null, true);
    cb(new Error("Tipo de archivo no permitido"));
  },
});

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "No autenticado" });
  }
  next();
}

function requireRole(role: string) {
  return async (req: Request, res: Response, next: Function) => {
    if (!req.session?.userId) return res.status(401).json({ message: "No autenticado" });
    const user = await getUserById(req.session.userId);
    if (!user || user.role !== role) return res.status(403).json({ message: "Acceso denegado" });
    next();
  };
}

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.use(
    session({
      store: new PgSession({
        conString: process.env.DATABASE_URL,
        tableName: "sessions",
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "trainer-pro-secret-2024",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: false,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: "lax",
      },
    })
  );

  app.use("/uploads", (_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    next();
  });
  app.use("/uploads", (req, res, next) => {
    const filePath = path.join(uploadsDir, path.basename(req.path));
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      next();
    }
  });

  // AUTH ROUTES
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, nombre, apellido, role } = req.body;
      if (!email || !password || !nombre || !apellido || !role) {
        return res.status(400).json({ message: "Todos los campos son requeridos" });
      }
      if (!["entrenador", "cliente"].includes(role)) {
        return res.status(400).json({ message: "Rol inválido" });
      }
      if (password.length < 6) {
        return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres" });
      }
      const user = await createUser({ email, password, nombre, apellido, role });
      req.session.userId = user.id;
      await new Promise<void>((resolve, reject) => req.session.save((err) => err ? reject(err) : resolve()));
      return res.status(201).json({ user });
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Error al registrar" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Correo y contraseña son requeridos" });
      }
      const user = await validateUser(email, password);
      if (!user) {
        return res.status(401).json({ message: "Correo o contraseña incorrectos" });
      }
      req.session.userId = user.id;
      await new Promise<void>((resolve, reject) => req.session.save((err) => err ? reject(err) : resolve()));
      return res.json({ user });
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Error al iniciar sesión" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ message: "Sesión cerrada" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "No autenticado" });
    const user = await getUserById(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "Usuario no encontrado" });
    }
    return res.json({ user });
  });

  // UPLOAD ROUTE
  app.post("/api/upload", requireAuth, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No se encontró archivo" });
      const baseUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `http://localhost:${process.env.PORT || 5000}`;
      const url = `${baseUrl}/uploads/${req.file.filename}`;
      const media = await saveMediaFile({
        uploaderId: req.session!.userId!,
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        url,
      });
      return res.json({ url, media });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // CLIENT ROUTES (Trainer only)
  app.get("/api/clients", requireAuth, async (req, res) => {
    try {
      const user = await getUserById(req.session!.userId!);
      if (!user) return res.status(401).json({ message: "No autorizado" });
      if (user.role === "entrenador") {
        const clients = await getTrainerClients(user.id);
        return res.json({ clients });
      } else {
        return res.json({ clients: [] });
      }
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/clients", requireRole("entrenador"), async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "El correo es requerido" });
      const clientUser = await findUserByEmail(email);
      const relation = await createClientRelation(req.session!.userId!, {
        clientId: clientUser?.id,
        inviteEmail: email,
      });
      return res.status(201).json({ relation, clientUser });
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  });

  // ROUTINE ROUTES
  app.get("/api/routines", requireAuth, async (req, res) => {
    try {
      const user = await getUserById(req.session!.userId!);
      if (!user) return res.status(401).json({ message: "No autorizado" });
      let routines;
      if (user.role === "entrenador") {
        routines = await getTrainerRoutines(user.id);
      } else {
        routines = await getClientRoutines(user.id);
      }
      return res.json({ routines });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/routines", requireRole("entrenador"), async (req, res) => {
    try {
      const { nombre, descripcion, nivel, clientId } = req.body;
      if (!nombre) return res.status(400).json({ message: "El nombre es requerido" });
      const routine = await createRoutine({
        trainerId: req.session!.userId!,
        clientId,
        nombre,
        descripcion,
        nivel,
      });
      return res.status(201).json({ routine });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/routines/:id", requireAuth, async (req, res) => {
    try {
      const routine = await getRoutineById(req.params.id);
      if (!routine) return res.status(404).json({ message: "Rutina no encontrada" });
      const exercises = await getRoutineExercises(req.params.id);
      return res.json({ routine, exercises });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/routines/:id", requireRole("entrenador"), async (req, res) => {
    try {
      await deleteRoutine(req.params.id);
      return res.json({ message: "Rutina eliminada" });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // EXERCISE ROUTES
  app.post("/api/exercises", requireRole("entrenador"), async (req, res) => {
    try {
      const { routineId, nombre, descripcion, series, repeticiones, peso, descanso, imagenUrl, videoUrl, orden } = req.body;
      if (!routineId || !nombre) return res.status(400).json({ message: "routineId y nombre son requeridos" });
      const exercise = await createExercise({
        routineId, nombre, descripcion, series, repeticiones, peso, descanso, imagenUrl, videoUrl, orden
      });
      return res.status(201).json({ exercise });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/exercises/:id", requireRole("entrenador"), async (req, res) => {
    try {
      await deleteExercise(req.params.id);
      return res.json({ message: "Ejercicio eliminado" });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // PROGRESS ROUTES
  app.get("/api/progress", requireAuth, async (req, res) => {
    try {
      const user = await getUserById(req.session!.userId!);
      if (!user) return res.status(401).json({ message: "No autorizado" });
      const clientId = (req.query.clientId as string) || user.id;
      const entries = await getClientProgress(clientId);
      return res.json({ entries });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/progress", requireAuth, async (req, res) => {
    try {
      const user = await getUserById(req.session!.userId!);
      if (!user) return res.status(401).json({ message: "No autorizado" });
      const { clientId, fecha, peso, grasaCorporal, masaMuscular, pecho, cintura, caderas, notas, fotoUrl } = req.body;
      if (!fecha) return res.status(400).json({ message: "La fecha es requerida" });
      const targetClientId = user.role === "entrenador" ? (clientId || user.id) : user.id;
      const entry = await createProgressEntry({
        clientId: targetClientId,
        trainerId: user.role === "entrenador" ? user.id : undefined,
        fecha, peso, grasaCorporal, masaMuscular, pecho, cintura, caderas, notas, fotoUrl
      });
      return res.status(201).json({ entry });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // CHAT ROUTES
  app.get("/api/chat/conversations", requireAuth, async (req, res) => {
    try {
      const conversations = await getChatConversations(req.session!.userId!);
      return res.json({ conversations });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/chat/:userId", requireAuth, async (req, res) => {
    try {
      const messages = await getChatMessages(req.session!.userId!, req.params.userId);
      return res.json({ messages });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/chat", requireAuth, async (req, res) => {
    try {
      const { receiverId, contenido, tipo, mediaUrl } = req.body;
      if (!receiverId) return res.status(400).json({ message: "receiverId es requerido" });
      if (!contenido && !mediaUrl) return res.status(400).json({ message: "Mensaje o media requerido" });
      const message = await sendChatMessage({
        senderId: req.session!.userId!,
        receiverId, contenido, tipo, mediaUrl
      });
      return res.status(201).json({ message });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // TRAINING SESSION ROUTES
  app.post("/api/training-sessions", requireAuth, async (req, res) => {
    try {
      const { routineId, routineNombre, totalExercises } = req.body;
      const session = await createTrainingSession({
        clientId: req.session!.userId!,
        routineId,
        routineNombre,
        totalExercises,
      });
      return res.status(201).json({ session });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/training-sessions/:id", requireAuth, async (req, res) => {
    try {
      const { durationSeconds, exercisesCompleted, notas } = req.body;
      const session = await finishTrainingSession(req.params.id, {
        durationSeconds: durationSeconds || 0,
        exercisesCompleted: exercisesCompleted || 0,
        notas,
      });
      return res.json({ session });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/training-sessions", requireAuth, async (req, res) => {
    try {
      const user = await getUserById(req.session!.userId!);
      if (!user) return res.status(401).json({ message: "No autorizado" });
      if (user.role === "entrenador") {
        const sessions = await getTrainerClientSessions(user.id);
        return res.json({ sessions });
      } else {
        const clientId = (req.query.clientId as string) || user.id;
        const sessions = await getClientTrainingSessions(clientId);
        return res.json({ sessions });
      }
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // VIDEO SESSION ROUTES
  app.post("/api/video-sessions", requireAuth, async (req, res) => {
    try {
      const { exerciseId, exerciseNombre, watchedSeconds, completed } = req.body;
      if (!exerciseId) return res.status(400).json({ message: "exerciseId es requerido" });
      const session = await createVideoSession({
        userId: req.session!.userId!,
        exerciseId,
        exerciseNombre,
        watchedSeconds: watchedSeconds || 0,
        completed: completed || false,
      });
      return res.status(201).json({ session });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/video-sessions/:exerciseId", requireAuth, async (req, res) => {
    try {
      const sessions = await getVideoSessionsByExercise(req.params.exerciseId);
      return res.json({ sessions });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/video-sessions", requireAuth, async (req, res) => {
    try {
      const clientId = (req.query.clientId as string) || req.session!.userId!;
      const sessions = await getClientVideoSessions(clientId);
      return res.json({ sessions });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // PROFILE AVATAR ROUTE
  app.post("/api/profile/avatar", requireAuth, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No se encontró archivo" });
      const baseUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `http://localhost:${process.env.PORT || 5000}`;
      const url = `${baseUrl}/uploads/${req.file.filename}`;
      const user = await updateUserAvatar(req.session!.userId!, url);
      return res.json({ user });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
