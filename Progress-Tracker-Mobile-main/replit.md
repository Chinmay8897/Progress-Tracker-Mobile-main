# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Artifacts

### TaskCommand (Mobile App)
- **Type**: Expo (React Native)
- **Path**: `artifacts/mobile/`
- **Preview**: `/`
- **Description**: Intelligent team task management mobile app with role-based access control

#### Features
- Authentication: Head Manager + Team Member login with role-based access
- Head Manager Dashboard: Full task board with stats, priority/status/assignee filters, floating voice button, task creation
- Team screen: Member list with task stats, add/remove members
- Tasks screen: Full task list with status filtering
- Member Profile: Drill-down view showing member's tasks, stats, quick task assignment
- Task Detail: Full task view with status updates, edit, delete
- Settings: User profile, personal stats, logout
- Roles: Head Manager, Admin-Lite, Project Lead, Developer, Support Agent
- Priority coding: Critical (Red), High (Amber), Medium (Blue), Low (Gray)
- Status flow: Open → In Progress → Blocked → Done → Cancelled
- Data persistence: AsyncStorage (local)
- Dark mode support

#### Demo Accounts
- Head Manager: `admin@taskcommand.io` / `admin123`
- Project Lead: `jordan@taskcommand.io` / `pass123`
- Developer: `sam@taskcommand.io` / `pass123`
- Support Agent: `taylor@taskcommand.io` / `pass123`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/mobile run dev` — run mobile app

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
