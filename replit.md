# Diego App

A fully Spanish personal trainer mobile app built with React Native/Expo and Express/PostgreSQL backend.

## Stack
- **Frontend**: React Native + Expo SDK 54 (Expo Go compatible), expo-router file-based routing, TypeScript
- **Backend**: Express + TypeScript + PostgreSQL (via pg), session auth with connect-pg-simple
- **Styling**: react-native StyleSheet, Outfit font, dark theme (#09090B), electric lime accent (#C9F93E)
- **State**: @tanstack/react-query (5min staleTime / 60min gcTime), React Context for auth
- **Media**: expo-image-picker + XHR upload, files saved to /uploads dir + media_files table

## Architecture

### Navigation
Root Stack → (auth) login/register | (entrenador) Stack → (tabs) + rutina/[id] + chat/[id] | (cliente) Stack → (tabs) + rutina/[id] + chat/[id]

### Roles
- **entrenador**: dashboard, clientes, rutinas, progreso, chat
- **cliente**: dashboard, mis-rutinas, entrenar (workout timer), mi-progreso, chat

## Database Tables
- `users` - auth (VARCHAR id, email, password, nombre, apellido, role, avatar_url)
- `trainer_clients` - trainer↔client relationships
- `routines` - workout routines (trainer_id, client_id, nombre, nivel)
- `exercises` - exercises per routine (nombre, series, repeticiones, peso, descanso, imagen_url, video_url)
- `progress` - client body measurements + photo
- `chat_messages` - real-time chat (sender_id, receiver_id, contenido, tipo, media_url)
- `media_files` - uploaded file metadata
- `training_sessions` - client workout sessions (duration, exercises_completed, routine_id)
- `training_video_sessions` - video watch tracking per exercise

## Key Features
- Full CRUD for routines and exercises (trainer)
- Image/video upload for exercises and chat with progress bar (XHR)
- Inverted FlatList chat with 3s refetch, multimedia ChatMedia bubbles
- Client workout timer: exercise timer + rest countdown + total timer + completion summary
- Auto-send workout summary to trainer via chat on completion
- Video watch tracking (AppState detection when returning from video)
- Trainer dashboard shows recent client training sessions
- Haptic feedback on workout exercise completion

## File Structure
```
app/
  (auth)/          - login, register screens
  (entrenador)/    - trainer screens + Stack layout
    (tabs)/        - dashboard, clientes, rutinas, progreso, chat
    rutina/[id]    - routine detail + exercise CRUD + media upload
    chat/[id]      - multimedia chat detail
  (cliente)/       - client screens + Stack layout
    (tabs)/        - dashboard, mis-rutinas, entrenar, mi-progreso, chat
    rutina/[id]    - read-only routine detail with exercise videos
    chat/[id]      - multimedia chat detail
server/
  index.ts         - Express app setup
  routes.ts        - All API routes (auth, upload, clients, routines, exercises, progress, chat, training sessions, video sessions)
  storage.ts       - Database query functions
hooks/
  useUpload.ts     - XHR image/video upload with progress
  useNotifications.ts - Haptic + vibration feedback helper
components/
  MediaViewer.tsx  - ChatMedia bubbles, image lightbox, UploadProgressBar
  ErrorBoundary.tsx
constants/
  colors.ts        - Design tokens
```

## API Routes
- POST/GET /api/auth/(login|register|logout|me)
- POST /api/upload - File upload (multer)
- GET/POST /api/clients - Trainer client management
- GET/POST/DELETE /api/routines, GET /api/routines/:id
- POST/DELETE /api/exercises
- GET/POST /api/progress
- GET/POST /api/chat, GET /api/chat/conversations, GET /api/chat/:userId
- POST/PATCH/GET /api/training-sessions
- POST/GET /api/video-sessions, GET /api/video-sessions/:exerciseId
- POST /api/profile/avatar

## User Preferences
- App must remain fully in Spanish
- Dark theme throughout
- Electric lime (#C9F93E) as primary accent color
- Outfit font family
