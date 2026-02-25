import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, decimal, integer, boolean, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  nombre: text("nombre").notNull(),
  apellido: text("apellido").notNull(),
  role: text("role").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trainerClients = pgTable("trainer_clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
  trainerId: varchar("trainer_id").notNull().references(() => users.id),
  clientId: varchar("client_id").references(() => users.id),
  inviteEmail: text("invite_email"),
  inviteToken: text("invite_token"),
  status: text("status").notNull().default("pendiente"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const routines = pgTable("routines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
  trainerId: varchar("trainer_id").notNull().references(() => users.id),
  clientId: varchar("client_id").references(() => users.id),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion"),
  nivel: text("nivel").default("intermedio"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const exercises = pgTable("exercises", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
  routineId: varchar("routine_id").notNull().references(() => routines.id),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion"),
  series: integer("series").default(3),
  repeticiones: text("repeticiones").default("10"),
  peso: text("peso"),
  descanso: text("descanso").default("60s"),
  imagenUrl: text("imagen_url"),
  videoUrl: text("video_url"),
  orden: integer("orden").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const progress = pgTable("progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
  clientId: varchar("client_id").notNull().references(() => users.id),
  trainerId: varchar("trainer_id").references(() => users.id),
  fecha: date("fecha").notNull(),
  peso: decimal("peso", { precision: 5, scale: 2 }),
  grasaCorporal: decimal("grasa_corporal", { precision: 5, scale: 2 }),
  masaMuscular: decimal("masa_muscular", { precision: 5, scale: 2 }),
  pecho: decimal("pecho", { precision: 5, scale: 2 }),
  cintura: decimal("cintura", { precision: 5, scale: 2 }),
  caderas: decimal("caderas", { precision: 5, scale: 2 }),
  notas: text("notas"),
  fotoUrl: text("foto_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  receiverId: varchar("receiver_id").notNull().references(() => users.id),
  contenido: text("contenido"),
  tipo: text("tipo").default("texto"),
  mediaUrl: text("media_url"),
  leido: boolean("leido").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const mediaFiles = pgTable("media_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
  uploaderId: varchar("uploader_id").notNull().references(() => users.id),
  filename: text("filename").notNull(),
  originalName: text("original_name"),
  mimeType: text("mime_type"),
  size: integer("size"),
  url: text("url").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  nombre: z.string().min(1),
  apellido: z.string().min(1),
  role: z.enum(["entrenador", "cliente"]),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type TrainerClient = typeof trainerClients.$inferSelect;
export type Routine = typeof routines.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type Progress = typeof progress.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type MediaFile = typeof mediaFiles.$inferSelect;
