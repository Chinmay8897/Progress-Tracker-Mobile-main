/**
 * AppContext — Application state provider.
 *
 * PRODUCTION VERSION: All data flows through the backend API.
 * - Authentication via JWT (stored in expo-secure-store)
 * - Tasks and users fetched from backend
 * - Optimistic UI updates with server sync
 * - Offline action queue for mutations when offline
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import {
  authApi, usersApi, tasksApi, deviceTokensApi,
  setOnUnauthorized,
  type ApiUser, type ApiTask, ApiError,
} from "@/services/api";
import {
  clearSupabaseSession,
  getSupabaseClient,
  setSupabaseSession,
} from "@/services/supabase/supabaseClient";
import {
  getToken, setToken, clearSession,
  getStoredUser, setStoredUser, clearStoredUser,
  getRefreshToken, setRefreshToken,
  type StoredUser,
} from "@/services/auth";
import {
  enqueueAction, processQueue, clearQueue,
  type QueuedAction,
} from "@/services/offlineQueue";
import { clearCachedAppData, getCachedAppData, setCachedAppData } from "@/services/cache";
import { logger } from "@/utils/logger";

// ─── Types (match frontend expectations) ─────────────────────────────────────

export type UserRole = "admin" | "manager";
export type Priority = "critical" | "high" | "medium" | "low";
export type TaskStatus = "open" | "in_progress" | "blocked" | "done" | "cancelled";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarColor: string;
  phoneNumber?: string;
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

interface AppContextType {
  currentUser: User | null;
  users: User[];
  tasks: Task[];
  login: (email: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, password: string, phoneNumber?: string, role?: UserRole) => Promise<boolean>;
  logout: () => void;
  addTask: (task: Omit<Task, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  moveTaskToDate: (taskId: string, dateKey: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  addUser: (user: { name: string; email: string; password: string; role: UserRole; avatarColor?: string; phoneNumber?: string }) => Promise<void>;
  updateUser: (userId: string, updates: Partial<User>) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  getTasksForUser: (userId: string) => Task[];
  movePendingToNextDay: (dateStr: string) => Promise<number>;
  isAdmin: boolean;
  loading: boolean;
  isOnline: boolean;
  refreshData: () => Promise<void>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function apiUserToUser(u: ApiUser): User {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as UserRole,
    avatarColor: u.avatarColor,
    phoneNumber: u.phoneNumber,
  };
}

function apiTaskToTask(t: ApiTask): Task {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    assigneeId: t.assigneeId,
    dueDate: t.dueDate,
    priority: t.priority as Priority,
    status: t.status as TaskStatus,
    tags: t.tags,
    notes: t.notes,
    createdBy: t.createdBy,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);

  const isOnlineRef = useRef(true);

  // ── Network monitoring ────────────────────────────────────────────────────

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);
      isOnlineRef.current = online;
      setIsOnline(online);

      // When coming back online, sync queued actions and refresh data
      if (online && currentUser) {
        void syncOfflineQueue();
        void fetchAllData();
      }
    });

    return () => unsubscribe();
  }, [currentUser]);

  // ── 401 handler ───────────────────────────────────────────────────────────

  useEffect(() => {
    setOnUnauthorized(() => {
      setCurrentUser(null);
      setUsers([]);
      setTasks([]);
      void clearSupabaseSession();
    });
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void fetchAllData();
      }, 300);
    };

    const channel = supabase
      .channel(`taskcommand:${currentUser.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_assignments" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, scheduleRefresh)
      .subscribe(status => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          logger.warn("Supabase", `Realtime subscription status: ${status}`);
        }
      });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel).catch(() => undefined);
    };
  }, [currentUser]);

  // ── Initialization ────────────────────────────────────────────────────────

  useEffect(() => {
    void initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      const token = await getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        await setSupabaseSession(token, refreshToken);
      }

      // Restore cached user immediately for fast UI
      const cached = await getStoredUser();
      if (cached) {
        setCurrentUser(cached as User);
      }

      const cachedData = await getCachedAppData();
      if (cachedData) {
        setUsers(cachedData.users);
        setTasks(cachedData.tasks);
      }

      // Verify token is still valid
      try {
        const me = await authApi.me();
        const user = apiUserToUser(me);
        setCurrentUser(user);
        await setStoredUser(user as StoredUser);

        // Fetch all data
        await fetchAllData();
        void registerDeviceToken();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          await clearSession();
          setCurrentUser(null);
        } else {
          // Offline — use cached user, skip data fetch
          logger.warn("AppContext", "Could not verify session (offline?)", err);
        }
      }
    } catch (err) {
      logger.error("AppContext", "Initialization failed", err);
    } finally {
      setLoading(false);
    }
  };

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchAllData = async () => {
    try {
      const [usersData, tasksData] = await Promise.all([
        usersApi.list(),
        tasksApi.list(),
      ]);
      const nextUsers = usersData.map(apiUserToUser);
      const nextTasks = tasksData.map(apiTaskToTask);
      setUsers(nextUsers);
      setTasks(nextTasks);
      await setCachedAppData(nextUsers, nextTasks);
    } catch (err) {
      logger.error("AppContext", "Failed to fetch data", err);
    }
  };

  const registerDeviceToken = async () => {
    if (Platform.OS === "web") return;
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted") {
        logger.warn("AppContext", "Push notifications permission not granted");
        return;
      }

      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });

      if (tokenData.data) {
        await deviceTokensApi.register(tokenData.data, Platform.OS);
        logger.info("AppContext", `Registered push token automatically`);
      }
    } catch (err) {
      logger.error("AppContext", "Failed to register push token", err);
    }
  };

  const refreshData = useCallback(async () => {
    await fetchAllData();
  }, []);

  // ── Offline queue sync ────────────────────────────────────────────────────

  const syncOfflineQueue = async () => {
    await processQueue(async (action: QueuedAction) => {
      switch (action.type) {
        case "CREATE_TASK":
          await tasksApi.create(action.payload as any);
          break;
        case "UPDATE_TASK": {
          const { id, ...data } = action.payload as any;
          await tasksApi.update(id, data);
          break;
        }
        case "DELETE_TASK":
          await tasksApi.delete(action.payload as string);
          break;
        case "CREATE_USER":
          await usersApi.create(action.payload as any);
          break;
        case "UPDATE_USER": {
          const { id, ...data } = action.payload as any;
          await usersApi.update(id, data);
          break;
        }
        case "DELETE_USER":
          await usersApi.delete(action.payload as string);
          break;
        case "MOVE_PENDING":
          await tasksApi.movePending(action.payload as string);
          break;
      }
    });
    // Refresh data after sync
    await fetchAllData();
  };

  // ── Auth ──────────────────────────────────────────────────────────────────

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await authApi.login(email, password);
      await setToken(response.token);
      await setRefreshToken(response.refreshToken);
      await setSupabaseSession(response.token, response.refreshToken);

      const user = apiUserToUser(response.user);
      await setStoredUser(user as StoredUser);
      setCurrentUser(user);

      // Fetch data after login
      await fetchAllData();
      void registerDeviceToken();

      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        logger.warn("AppContext", `Login failed: ${err.message}`);
        // Rethrow so UI can handle specific errors if needed, or throw generic error
        throw new Error(err.message || "Invalid email or password");
      }
      throw err;
    }
  }, []);

  const register = useCallback(async (name: string, email: string, password: string, phoneNumber?: string, role?: string): Promise<boolean> => {
    try {
      const response = await authApi.register(name, email, password, phoneNumber, role);
      await setToken(response.token);
      await setRefreshToken(response.refreshToken);
      await setSupabaseSession(response.token, response.refreshToken);

      const user = apiUserToUser(response.user);
      await setStoredUser(user as StoredUser);
      setCurrentUser(user);

      // Fetch data after registration
      await fetchAllData();
      void registerDeviceToken();

      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        logger.warn("AppContext", `Registration failed: ${err.message}`);
        // Combine field errors if present
        let errorMsg = err.message || "Registration failed";
        if (err.details) {
            const detailsList = Object.values(err.details).flat();
            if (detailsList.length > 0) {
                errorMsg = detailsList[0]; // Just take the first validation error
            }
        }
        throw new Error(errorMsg);
      }
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    void (async () => {
      try {
        // Revoke tokens server-side first (best-effort).
        await authApi.logout();
      } catch (err) {
        logger.warn("AppContext", "Server logout failed; continuing with local session cleanup", err);
      }
      try {
        await clearSession();
        await clearSupabaseSession();
        await clearQueue();
        await clearCachedAppData();
      } catch (err) {
        logger.warn("AppContext", "Local logout cleanup encountered an error", err);
      } finally {
        setCurrentUser(null);
        setUsers([]);
        setTasks([]);
      }
    })();
  }, []);

  // ── Task CRUD (with optimistic updates + offline queue) ───────────────────

  const addTask = useCallback(async (taskData: Omit<Task, "id" | "createdAt" | "updatedAt">) => {
    if (!taskData.assigneeId) {
      throw new Error("Task assignee is required before creating a task.");
    }
    if (!taskData.title.trim()) {
      throw new Error("Task title is required.");
    }

    // Optimistic: add immediately with temp ID
    const tempId = `temp_${Date.now()}`;
    const nowIso = new Date().toISOString();
    const optimistic: Task = {
      ...taskData,
      id: tempId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    setTasks(prev => [...prev, optimistic]);

    try {
      if (!isOnlineRef.current) {
        await enqueueAction("CREATE_TASK", taskData);
        return;
      }

      const created = await tasksApi.create({
        title: taskData.title,
        description: taskData.description,
        assigneeId: taskData.assigneeId,
        dueDate: taskData.dueDate,
        priority: taskData.priority,
        status: taskData.status,
        tags: taskData.tags,
        notes: taskData.notes,
      });

      // Replace optimistic entry with real server response
      setTasks(prev => {
        const normalized = apiTaskToTask(created);
        const withoutTemp = prev.filter(t => t.id !== tempId);
        const alreadyExists = withoutTemp.some(t => t.id === normalized.id);
        return alreadyExists ? withoutTemp : [...withoutTemp, normalized];
      });
    } catch (err) {
      // Revert optimistic update on failure
      setTasks(prev => prev.filter(t => t.id !== tempId));
      throw err;
    }
  }, []);

  const updateTask = useCallback(async (taskId: string, updates: Partial<Task>) => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
    ));

    try {
      if (!isOnlineRef.current) {
        await enqueueAction("UPDATE_TASK", { id: taskId, ...updates });
        return;
      }

      const updated = await tasksApi.update(taskId, updates);
      setTasks(prev => prev.map(t => t.id === taskId ? apiTaskToTask(updated) : t));
    } catch (err) {
      // Refresh on failure to get true state
      await fetchAllData();
      throw err;
    }
  }, []);

  const moveTaskToDate = useCallback(async (taskId: string, dateKey: string) => {
    await updateTask(taskId, { dueDate: dateKey });
  }, [updateTask]);

  const deleteTask = useCallback(async (taskId: string) => {
    // Optimistic removal
    const prev = tasks;
    setTasks(t => t.filter(task => task.id !== taskId));

    try {
      if (!isOnlineRef.current) {
        await enqueueAction("DELETE_TASK", taskId);
        return;
      }

      await tasksApi.delete(taskId);
    } catch (err) {
      // Revert on failure
      setTasks(prev);
      throw err;
    }
  }, [tasks]);

  // ── User CRUD ─────────────────────────────────────────────────────────────

  const addUser = useCallback(async (userData: { name: string; email: string; password: string; role: UserRole; avatarColor?: string; phoneNumber?: string }) => {
    try {
      if (!isOnlineRef.current) {
        await enqueueAction("CREATE_USER", userData);
        return;
      }

      const created = await usersApi.create({
        name: userData.name,
        email: userData.email,
        password: userData.password,
        role: userData.role,
        avatarColor: userData.avatarColor,
        phoneNumber: userData.phoneNumber,
      });
      setUsers(prev => [...prev, apiUserToUser(created)]);
    } catch (err) {
      throw err;
    }
  }, []);

  const updateUser = useCallback(async (userId: string, updates: Partial<User>) => {
    // Optimistic
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updates } : u));

    try {
      if (!isOnlineRef.current) {
        await enqueueAction("UPDATE_USER", { id: userId, ...updates });
        return;
      }

      const updated = await usersApi.update(userId, updates);
      setUsers(prev => prev.map(u => u.id === userId ? apiUserToUser(updated) : u));

      if (currentUser?.id === userId) {
        setCurrentUser(apiUserToUser(updated));
      }
    } catch (err) {
      await fetchAllData();
      throw err;
    }
  }, [currentUser]);

  const deleteUser = useCallback(async (userId: string) => {
    const prevUsers = users;
    setUsers(prev => prev.filter(u => u.id !== userId));

    try {
      if (!isOnlineRef.current) {
        await enqueueAction("DELETE_USER", userId);
        return;
      }

      await usersApi.delete(userId);

      if (currentUser?.id === userId) {
        logout();
      }
    } catch (err) {
      setUsers(prevUsers);
      throw err;
    }
  }, [currentUser, users, logout]);

  const getTasksForUser = useCallback((userId: string) => {
    return tasks.filter(t => t.assigneeId === userId);
  }, [tasks]);

  const movePendingToNextDay = useCallback(async (dateStr: string): Promise<number> => {
    try {
      if (!isOnlineRef.current) {
        await enqueueAction("MOVE_PENDING", dateStr);
        return 0;
      }

      const result = await tasksApi.movePending(dateStr);
      await fetchAllData(); // Refresh to get updated tasks
      return result.moved;
    } catch (err) {
      logger.error("AppContext", "Failed to move pending tasks", err);
      return 0;
    }
  }, []);

  // ── Context Value ─────────────────────────────────────────────────────────

  const ctxValue = useMemo<AppContextType>(() => ({
    currentUser,
    users,
    tasks,
    login,
    register,
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
    isAdmin: (currentUser?.role as UserRole) === "admin",
    loading,
    isOnline,
    refreshData,
  }), [
    currentUser, users, tasks,
    login, register, logout,
    addTask, updateTask, moveTaskToDate, deleteTask,
    addUser, updateUser, deleteUser,
    getTasksForUser, movePendingToNextDay,
    loading, isOnline, refreshData,
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
