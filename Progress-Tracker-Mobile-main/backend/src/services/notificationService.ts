import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";

export interface WAForwardTaskDetails {
  taskId: string;
  taskTitle: string;
  priority: "critical" | "high" | "medium" | "low";
  dueDate: string;
  assigneeName: string;
  assigneePhone: string;
  notes?: string;
}

export interface SendNotificationResult {
  success: boolean;
  ticket?: ExpoPushTicket;
  error?: string;
}

const PRIORITY_EMOJI: Record<WAForwardTaskDetails["priority"], string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🟢",
};

const expo = new Expo();

function buildWhatsAppMessage(task: WAForwardTaskDetails): string {
  const priorityBadge = `${PRIORITY_EMOJI[task.priority]} *${task.priority.toUpperCase()}*`;
  const lines = [
    "📋 *Task Assignment — TaskCommand*",
    "",
    `*Task:* ${task.taskTitle}`,
    `*Assigned To:* ${task.assigneeName}`,
    `*Priority:* ${priorityBadge}`,
    `*Due Date:* 📅 ${task.dueDate}`,
  ];

  if (task.notes && task.notes.trim().length > 0) {
    lines.push(`*Notes:* ${task.notes.trim()}`);
  }

  lines.push("", "_Please acknowledge once received. — TaskCommand_");
  return lines.join("\n");
}

export async function sendWAForwardRequest(
  adminPushToken: string,
  taskDetails: WAForwardTaskDetails,
): Promise<SendNotificationResult> {
  if (!Expo.isExpoPushToken(adminPushToken)) {
    const error = `Invalid Expo push token: "${adminPushToken}"`;
    console.error(`[NotificationService] ${error}`);
    return { success: false, error };
  }

  const messageText = buildWhatsAppMessage(taskDetails);
  const phone = taskDetails.assigneePhone.trim();

  const message: ExpoPushMessage = {
    to: adminPushToken,
    title: `📤 Forward Task to ${taskDetails.assigneeName}`,
    body: `Tap to open WhatsApp and send the assignment for: "${taskDetails.taskTitle}"`,
    sound: "default",
    priority: "high",
    channelId: "task-assignments",
    data: {
      actionType: "OPEN_WHATSAPP_FORWARD",
      phone,
      messageText,
      taskId: taskDetails.taskId,
      taskTitle: taskDetails.taskTitle,
      assigneeName: taskDetails.assigneeName,
    },
  };

  try {
    const [ticket] = await expo.sendPushNotificationsAsync([message]);
    if (ticket.status === "error") {
      const errDetail = ticket.details?.error ?? "UNKNOWN";
      return { success: false, ticket, error: `Push failed: ${errDetail}` };
    }
    return { success: true, ticket };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Unexpected error: ${msg}` };
  }
}

