# TaskCommand Mobile

Production React Native + Expo task command app with an Express API and Supabase PostgreSQL backend.

## Architecture

- `artifacts/mobile`: Expo mobile app using `expo-router`, secure session storage, realtime subscriptions, task/user UI, calendar workflows, voice commands, and WhatsApp sharing.
- `backend`: Express API that owns privileged Supabase operations, validates input with Zod, protects routes with Supabase Auth sessions, proxies OpenAI transcription/chat requests, and logs audit/notification/voice events.
- `supabase/migrations`: PostgreSQL schema, constraints, indexes, RLS policies, triggers, and realtime publication setup.
- `lib/*`: shared API/schema tooling used by the monorepo.

The mobile app does not store production task/user data as the source of truth. Supabase PostgreSQL is authoritative. Local storage is used only for secure tokens, theme preference, and a lightweight offline read/action cache.

## Core Stack

- Mobile: Expo, React Native, `expo-router`, `expo-secure-store`, `expo-av`, `expo-notifications`, `@supabase/supabase-js`
- Backend: Node.js, Express, Supabase Auth, Supabase PostgreSQL, Zod, Helmet, rate limiting
- Database: Supabase PostgreSQL with RLS
- Voice: native/web speech capture, backend OpenAI proxy, local command parser/executor, Supabase voice logs
- WhatsApp: mobile deep links plus backend push-forward support using Supabase-backed users/tasks

## Setup

1. Install dependencies from the repo root:

```bash
pnpm install
```

2. Create a Supabase project and apply:

```text
supabase/migrations/202605090001_initial_schema.sql
```

3. Configure backend environment:

```bash
cd backend
cp .env.example .env
```

Required backend values:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-public-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
GROQ_API_KEY=your-groq-key
GROQ_CHAT_MODEL=llama-3.3-70b-versatile
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_TRANSCRIPTION_MODEL=whisper-large-v3-turbo
OPENAI_TRANSCRIPTION_API_KEY=your-openai-key-for-whisper
PORT=3001
CORS_ORIGINS=http://localhost:8081,http://localhost:19006
NODE_ENV=development
```

How to get each backend key:
- `SUPABASE_URL`: Supabase Dashboard -> Project Settings -> API -> Project URL.
- `SUPABASE_ANON_KEY`: same page -> `anon` `public` key.
- `SUPABASE_SERVICE_ROLE_KEY`: same page -> `service_role` `secret` key (backend only).
- `GROQ_API_KEY`: Groq Console -> API Keys -> create key (used for chat/NLP).
- `OPENAI_TRANSCRIPTION_API_KEY`: optional OpenAI key for Whisper transcription.
- `GROQ_TRANSCRIPTION_MODEL`: optional; defaults to `whisper-large-v3-turbo` when Groq is used for transcription fallback.

4. Configure mobile environment:

```bash
cd artifacts/mobile
cp .env.example .env
```

Required mobile values:

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:3001
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
```

For Android emulator, use `http://10.0.2.2:3001`. For a physical device, use your backend machine LAN IP.

After changing any `.env` values:
- Stop backend + Expo.
- Restart backend first, then Expo.
- For Expo env updates, clear cache once: `pnpm --filter @workspace/mobile exec expo start -c`.

5. Optional seed:

```bash
pnpm --filter @workspace/backend run seed
```

6. Run locally:

```bash
pnpm --filter @workspace/backend run dev
pnpm --filter @workspace/mobile run dev
```

## Supabase Model

Tables:

- `users`: Supabase Auth profile rows, roles, phone numbers, avatar color, timestamps
- `tasks`: task metadata, priority/status, deadline, creator, tags, notes
- `task_assignments`: many-to-many task assignment join table
- `notifications`: notification history and WhatsApp forwarding actions
- `voice_logs`: lightweight command, intent, status, and metadata records
- `audit_logs`: administrative and security-relevant event trail

Security:

- RLS is enabled on all production tables.
- Service-role keys are backend-only.
- Expo only receives the public anon key.
- Regular users cannot mutate user profiles directly through Supabase.
- Backend route permissions enforce head-manager-only user management and task deletion.

## Production Notes

- Store backend secrets in your hosting provider secret manager.
- Store Expo public values in EAS environment variables for APK builds.
- Keep `SUPABASE_SERVICE_ROLE_KEY` out of mobile config, source control, and `app.json`.
- Configure Supabase Auth email behavior to match onboarding.
- Keep the Supabase project on a plan that will not pause if long idle periods are unacceptable.
- Configure database backups, log retention, and monitoring before launch.
- Register Android notification channels and push credentials before relying on WhatsApp forward notifications.

## Validation

Useful checks:

```bash
pnpm --filter @workspace/backend run typecheck
pnpm --filter @workspace/mobile run typecheck
pnpm --filter @workspace/backend run build
pnpm --filter @workspace/mobile run build
```

If `pnpm` is unavailable in a constrained shell, run the local TypeScript binaries from `backend/node_modules/.bin` and `artifacts/mobile/node_modules/.bin`.
