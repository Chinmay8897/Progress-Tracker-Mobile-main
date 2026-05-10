import { getJson, removeItemQueued, setJsonQueued } from "@/data/storage";
import type { Task, User } from "@/context/AppContext";

const CACHE_KEY = "taskcommand_read_cache_v1";

interface CachedAppData {
  users: User[];
  tasks: Task[];
  savedAt: string;
}

function stripSensitiveUserFields(user: User): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatarColor: user.avatarColor,
  };
}

export async function getCachedAppData(): Promise<CachedAppData | null> {
  return getJson<CachedAppData>(CACHE_KEY);
}

export async function setCachedAppData(users: User[], tasks: Task[]): Promise<void> {
  await setJsonQueued(CACHE_KEY, {
    users: users.map(stripSensitiveUserFields),
    tasks,
    savedAt: new Date().toISOString(),
  } satisfies CachedAppData);
}

export async function clearCachedAppData(): Promise<void> {
  await removeItemQueued(CACHE_KEY);
}
