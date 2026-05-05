import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getJson, removeItemQueued, setJsonQueued } from "@/data/storage";
import { moveTaskDueDateNormalized, TaskMutationError, updateTaskInList } from "@/domain/tasks/taskMutations";
import { addDaysToDateKey, normalizeDateKey, todayDateKey } from "@/utils/date";

export type Role = "head_manager" | "admin_lite" | "project_lead" | "developer" | "support_agent";
export type Priority = "critical" | "high" | "medium" | "low";
export type TaskStatus = "open" | "in_progress" | "blocked" | "done" | "cancelled";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  password: string;
  avatarColor: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assigneeId: string;
  dueDate: string;
  priority: Priority;
  status: TaskStatus;
  tags: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

interface AppState {
  currentUser: User | null;
  users: User[];
  tasks: Task[];
}

interface AppContextType extends AppState {
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  addTask: (task: Omit<Task, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  moveTaskToDate: (taskId: string, dateKey: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  addUser: (user: Omit<User, "id">) => Promise<void>;
  updateUser: (userId: string, updates: Partial<User>) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  getTasksForUser: (userId: string) => Task[];
  movePendingToNextDay: (dateStr: string) => Promise<number>;
  isHeadManager: boolean;
  loading: boolean;
}

const STORAGE_KEYS = {
  USERS: "taskcommand_users",
  TASKS: "taskcommand_tasks",
  CURRENT_USER: "taskcommand_current_user",
};

const AVATAR_COLORS = [
  "#1a6cf5", "#16a34a", "#9333ea", "#dc2626", "#ea580c",
  "#0891b2", "#ca8a04", "#be185d", "#4f46e5", "#059669",
];

const DEFAULT_USERS: User[] = [
  {
    id: "user_head",
    name: "Alex Rivera",
    email: "admin@taskcommand.io",
    password: "admin123",
    role: "head_manager",
    avatarColor: "#1a6cf5",
  },
  {
    id: "user_2",
    name: "Jordan Chen",
    email: "jordan@taskcommand.io",
    password: "pass123",
    role: "project_lead",
    avatarColor: "#16a34a",
  },
  {
    id: "user_3",
    name: "Sam Patel",
    email: "sam@taskcommand.io",
    password: "pass123",
    role: "developer",
    avatarColor: "#9333ea",
  },
  {
    id: "user_4",
    name: "Taylor Kim",
    email: "taylor@taskcommand.io",
    password: "pass123",
    role: "support_agent",
    avatarColor: "#ea580c",
  },
  {
    id: "user_5",
    name: "Morgan Lee",
    email: "morgan@taskcommand.io",
    password: "pass123",
    role: "admin_lite",
    avatarColor: "#0891b2",
  },
];

const DEFAULT_TASKS: Task[] = [
  {
    id: "task_1",
    title: "Critical security patch deployment",
    description: "Deploy security patches to production servers. Coordinate with DevOps for zero-downtime rollout.",
    assigneeId: "user_3",
    dueDate: "2026-04-13",
    priority: "critical",
    status: "in_progress",
    tags: ["security", "production"],
    notes: "Coordinate with DevOps team",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: "user_head",
  },
  {
    id: "task_2",
    title: "Q2 Product roadmap finalization",
    description: "Finalize product roadmap for Q2, including feature prioritization and resource allocation.",
    assigneeId: "user_2",
    dueDate: "2026-04-15",
    priority: "high",
    status: "open",
    tags: ["planning", "roadmap"],
    notes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: "user_head",
  },
  {
    id: "task_3",
    title: "Customer onboarding flow redesign",
    description: "Redesign the customer onboarding flow to improve activation rate. Focus on first 3 steps.",
    assigneeId: "user_3",
    dueDate: "2026-04-20",
    priority: "medium",
    status: "open",
    tags: ["ux", "onboarding"],
    notes: "Review analytics data first",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: "user_head",
  },
  {
    id: "task_4",
    title: "Resolve payment gateway timeout",
    description: "Investigate and fix payment gateway timeouts affecting 5% of transactions.",
    assigneeId: "user_4",
    dueDate: "2026-04-14",
    priority: "critical",
    status: "blocked",
    tags: ["payments", "bug"],
    notes: "Waiting on Stripe support ticket",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: "user_head",
  },
  {
    id: "task_5",
    title: "Update API documentation",
    description: "Update REST API documentation with latest endpoints and examples.",
    assigneeId: "user_3",
    dueDate: "2026-04-25",
    priority: "low",
    status: "open",
    tags: ["docs", "api"],
    notes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: "user_head",
  },
  {
    id: "task_6",
    title: "Team performance review cycle",
    description: "Conduct Q1 performance reviews. Schedule 1:1s with all team members.",
    assigneeId: "user_5",
    dueDate: "2026-04-18",
    priority: "high",
    status: "in_progress",
    tags: ["hr", "reviews"],
    notes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: "user_head",
  },
  {
    id: "task_7",
    title: "Database index optimization",
    description: "Optimize slow database queries identified in the performance audit.",
    assigneeId: "user_3",
    dueDate: "2026-04-22",
    priority: "high",
    status: "open",
    tags: ["database", "performance"],
    notes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: "user_head",
  },
  {
    id: "task_8",
    title: "Customer support knowledge base",
    description: "Build out knowledge base articles for top 20 support tickets.",
    assigneeId: "user_4",
    dueDate: "2026-04-30",
    priority: "medium",
    status: "done",
    tags: ["support", "docs"],
    notes: "Completed initial 10 articles",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: "user_head",
  },
];

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  const usersRef = useRef<User[]>([]);
  const tasksRef = useRef<Task[]>([]);
  const currentUserRef = useRef<User | null>(null);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    void initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      const usersList = (await getJson<User[]>(STORAGE_KEYS.USERS)) ?? DEFAULT_USERS;
      const tasksList = (await getJson<Task[]>(STORAGE_KEYS.TASKS)) ?? DEFAULT_TASKS;
      const storedUser = await getJson<User>(STORAGE_KEYS.CURRENT_USER);

      setUsers(usersList);
      setTasks(tasksList);

      if (storedUser) {
        const freshUser = usersList.find(u => u.id === storedUser.id);
        if (freshUser) setCurrentUser(freshUser);
      }
    } catch (e) {
      setUsers(DEFAULT_USERS);
      setTasks(DEFAULT_TASKS);
    } finally {
      setLoading(false);
      setHydrated(true);
    }
  };

  // Persist state changes in the background (queued + deferred)
  useEffect(() => {
    if (!hydrated) return;
    void setJsonQueued(STORAGE_KEYS.USERS, users);
  }, [users, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    void setJsonQueued(STORAGE_KEYS.TASKS, tasks);
  }, [tasks, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (currentUser) {
      void setJsonQueued(STORAGE_KEYS.CURRENT_USER, currentUser);
    } else {
      void removeItemQueued(STORAGE_KEYS.CURRENT_USER);
    }
  }, [currentUser, hydrated]);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    const user = usersRef.current.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (user) {
      setCurrentUser(user);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setCurrentUser(null);
  }, []);

  const addTask = useCallback(async (taskData: Omit<Task, "id" | "createdAt" | "updatedAt">) => {
    const cu = currentUserRef.current;
    if (!cu) {
      throw new Error("You must be logged in to create tasks.");
    }

    const isHeadManager = cu.role === "head_manager";
    const nowIso = new Date().toISOString();

    const newTask: Task = {
      ...taskData,
      // All users can create tasks, but only head manager can assign to others.
      assigneeId: isHeadManager ? taskData.assigneeId : cu.id,
      createdBy: cu.id,
      id: `task_${Date.now()}${Math.random().toString(36).substr(2, 5)}`,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    setTasks(prev => [...prev, newTask]);
  }, []);

  const updateTask = useCallback(async (taskId: string, updates: Partial<Task>) => {
    const nowIso = new Date().toISOString();
    setTasks(prev => updateTaskInList(prev, taskId, updates, nowIso));
  }, []);

  const moveTaskToDate = useCallback(async (taskId: string, dateKey: string) => {
    const normalized = normalizeDateKey(dateKey);
    if (!normalized) throw new TaskMutationError("Invalid date. Expected YYYY-MM-DD");
    const todayKey = todayDateKey();
    if (normalized < todayKey) throw new TaskMutationError("Past dates are not allowed");

    const nowIso = new Date().toISOString();
    setTasks(prev => moveTaskDueDateNormalized(prev, taskId, normalized, nowIso));
  }, []);

  const deleteTask = useCallback(async (taskId: string) => {
    setTasks(prev => {
      const idx = prev.findIndex(t => t.id === taskId);
      if (idx === -1) return prev;
      const next = prev.slice();
      next.splice(idx, 1);
      return next;
    });
  }, []);

  const addUser = useCallback(async (userData: Omit<User, "id">) => {
    const newUser: User = {
      ...userData,
      id: `user_${Date.now()}${Math.random().toString(36).substr(2, 5)}`,
      avatarColor: AVATAR_COLORS[usersRef.current.length % AVATAR_COLORS.length],
    };
    setUsers(prev => [...prev, newUser]);
  }, []);

  const updateUser = useCallback(async (userId: string, updates: Partial<User>) => {
    const source = usersRef.current;
    const idx = source.findIndex(u => u.id === userId);
    if (idx === -1) return;

    const nextUser = { ...source[idx], ...updates };
    const nextUsers = source.slice();
    nextUsers[idx] = nextUser;
    setUsers(nextUsers);

    if (currentUserRef.current?.id === userId) {
      setCurrentUser(nextUser);
    }
  }, []);

  const deleteUser = useCallback(async (userId: string) => {
    setUsers(prev => {
      const idx = prev.findIndex(u => u.id === userId);
      if (idx === -1) return prev;
      const next = prev.slice();
      next.splice(idx, 1);
      return next;
    });
    if (currentUserRef.current?.id === userId) {
      setCurrentUser(null);
    }
  }, []);

  const getTasksForUser = useCallback((userId: string) => {
    return tasksRef.current.filter(t => t.assigneeId === userId);
  }, []);

  const movePendingToNextDay = useCallback(async (dateStr: string): Promise<number> => {
    const dateKey = normalizeDateKey(dateStr);
    if (!dateKey) return 0;

    const source = tasksRef.current;
    const pending = source.filter(t => {
      const taskDate = normalizeDateKey(t.dueDate) ?? t.dueDate.slice(0, 10);
      return taskDate === dateKey && t.status !== "done" && t.status !== "cancelled";
    });
    if (pending.length === 0) return 0;

    const now = new Date().toISOString();
    const pendingIds = new Set(pending.map(p => p.id));
    const updated = source.map(t => {
      if (pendingIds.has(t.id)) {
        const nextKey = addDaysToDateKey(t.dueDate, 1) ?? dateKey;
        return { ...t, dueDate: nextKey, updatedAt: now };
      }
      return t;
    });
    setTasks(updated);
    return pending.length;
  }, []);

  const ctxValue = useMemo<AppContextType>(() => ({
    currentUser,
    users,
    tasks,
    login,
    logout,
    addTask,
    updateTask,
    moveTaskToDate,
    deleteTask,
    addUser,
    updateUser,
    deleteUser,
    getTasksForUser,
    movePendingToNextDay,
    isHeadManager: currentUser?.role === "head_manager",
    loading,
  }), [
    currentUser,
    users,
    tasks,
    login,
    logout,
    addTask,
    updateTask,
    moveTaskToDate,
    deleteTask,
    addUser,
    updateUser,
    deleteUser,
    getTasksForUser,
    movePendingToNextDay,
    loading,
  ]);

  return (
    <AppContext.Provider value={ctxValue}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
