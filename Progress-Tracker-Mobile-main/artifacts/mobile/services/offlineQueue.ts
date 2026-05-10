/**
 * Offline action queue.
 *
 * When the device is offline, mutations are queued in AsyncStorage.
 * When connectivity resumes, queued actions are replayed in order.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { logger } from "@/utils/logger";

const QUEUE_KEY = "taskcommand_offline_queue";

export type QueuedActionType =
  | "CREATE_TASK"
  | "UPDATE_TASK"
  | "DELETE_TASK"
  | "CREATE_USER"
  | "UPDATE_USER"
  | "DELETE_USER"
  | "MOVE_PENDING";

export interface QueuedAction {
  id: string;
  type: QueuedActionType;
  payload: unknown;
  createdAt: string;
  retryCount: number;
}

// ─── Queue Persistence ───────────────────────────────────────────────────────

async function loadQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedAction[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Add an action to the offline queue.
 */
export async function enqueueAction(type: QueuedActionType, payload: unknown): Promise<void> {
  const queue = await loadQueue();
  const action: QueuedAction = {
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  };
  queue.push(action);
  await saveQueue(queue);
  logger.info("OfflineQueue", `Queued ${type} (${queue.length} pending)`);
}

/**
 * Get the number of pending actions in the queue.
 */
export async function getQueueSize(): Promise<number> {
  const queue = await loadQueue();
  return queue.length;
}

/**
 * Process all queued actions using the provided executor.
 * Actions that fail are re-queued with incremented retry count.
 * Actions with more than 5 retries are dropped.
 */
export async function processQueue(
  executor: (action: QueuedAction) => Promise<void>,
): Promise<{ processed: number; failed: number; dropped: number }> {
  const queue = await loadQueue();
  if (queue.length === 0) return { processed: 0, failed: 0, dropped: 0 };

  logger.info("OfflineQueue", `Processing ${queue.length} queued actions`);

  const failed: QueuedAction[] = [];
  let processed = 0;
  let dropped = 0;

  for (const action of queue) {
    try {
      await executor(action);
      processed++;
    } catch (err) {
      if (action.retryCount >= 5) {
        logger.warn("OfflineQueue", `Dropping action ${action.id} after 5 retries`);
        dropped++;
      } else {
        failed.push({ ...action, retryCount: action.retryCount + 1 });
      }
    }
  }

  await saveQueue(failed);

  logger.info("OfflineQueue", `Done: ${processed} processed, ${failed.length} failed, ${dropped} dropped`);

  return { processed, failed: failed.length, dropped };
}

/**
 * Clear the entire queue (e.g., on logout).
 */
export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
