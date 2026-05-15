# Supabase Production Setup

## 1. Project

Create a Supabase project and copy:

- Project URL
- Public `anon` key
- Server-only `service_role` key

Only the backend may use `SUPABASE_SERVICE_ROLE_KEY`.

## 2. Migration

Apply:

```text
supabase/migrations/202605090001_initial_schema.sql
supabase/migrations/202605120000_device_tokens.sql
```

The migrations create:

- `users`
- `tasks`
- `task_assignments`
- `notifications`
- `voice_logs`
- `audit_logs`
- `device_tokens`

It also adds enum types, foreign keys, constraints, indexes, timestamp triggers, RLS policies, and realtime publication entries for `tasks`, `task_assignments`, and `notifications`.

## 3. Auth

The app uses Supabase Auth sessions:

- Backend `/api/auth/login` and `/api/auth/register` call Supabase Auth.
- Mobile stores access and refresh tokens in `expo-secure-store`.
- Mobile binds the Supabase session for realtime using the same tokens.
- Backend validates bearer tokens with Supabase before every protected request.

Profile data lives in `public.users`, keyed by `auth.users.id`.

## 4. Backend Environment

Copy:

```bash
cp backend/.env.example backend/.env
```

Set:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-public-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
GROQ_API_KEY=your-groq-key
GROQ_CHAT_MODEL=llama-3.3-70b-versatile
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_TRANSCRIPTION_MODEL=whisper-large-v3-turbo

PORT=3001
CORS_ORIGINS=http://localhost:8081,http://localhost:19006
NODE_ENV=development
```

## 5. Mobile Environment

Copy:

```bash
cp artifacts/mobile/.env.example artifacts/mobile/.env
```

Set:

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:3001
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
```

For Android emulator use `http://10.0.2.2:3001`. For devices use the backend host LAN IP or a deployed HTTPS API.

For EAS builds, set the same `EXPO_PUBLIC_*` values in `artifacts/mobile/eas.json` or, preferably, in EAS environment variables.

## 6. Seed Data

Optional:

```bash
pnpm --filter @workspace/backend run seed
```

This creates Supabase Auth users, profile rows, and sample assignments. Do not run seed data in production unless those accounts are intentionally part of the tenant.

## 7. Security Checklist

- Keep service-role keys backend-only.
- Keep Groq keys backend-only.
- Verify RLS policies after every schema change.
- Use HTTPS API URLs for production APKs.
- Configure Supabase Auth email confirmation and password policies.
- Configure backups, monitoring, and log retention.
- Keep the Supabase project active on a plan that does not pause if long idle periods are unacceptable.

## 8. Operational Notes

- `backend/data/*.db` files are legacy local artifacts and are ignored; the backend code path now uses Supabase.
- Local mobile cache is only for offline recovery and excludes phone numbers.
- WhatsApp forwarding requires valid phone numbers in E.164 format and configured Expo push credentials.
