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

import { supabaseAdmin } from "./supabase/supabaseClient.js";

export async function sendWAForwardRequest(
  adminPushTokens: string[],
  taskDetails: WAForwardTaskDetails,
): Promise<{ success: boolean; errors: string[] }> {
  if (!adminPushTokens || adminPushTokens.length === 0) {
    return { success: false, errors: ["No push tokens provided"] };
  }

  const validTokens: string[] = [];
  const invalidTokens: string[] = [];

  for (const token of adminPushTokens) {
    if (Expo.isExpoPushToken(token)) {
      validTokens.push(token);
    } else {
      invalidTokens.push(token);
    }
  }

  // Cleanup immediately identified invalid tokens
  if (invalidTokens.length > 0) {
    console.warn(`[NotificationService] Cleaning up invalid Expo tokens:`, invalidTokens);
    await supabaseAdmin.from("device_tokens").delete().in("token", invalidTokens);
  }

  if (validTokens.length === 0) {
    return { success: false, errors: ["No valid push tokens available"] };
  }

  const messageText = buildWhatsAppMessage(taskDetails);
  const phone = taskDetails.assigneePhone.trim();

  const messages: ExpoPushMessage[] = validTokens.map(token => ({
    to: token,
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
  }));

  const chunks = expo.chunkPushNotifications(messages);
  const tickets: ExpoPushTicket[] = [];
  const errors: string[] = [];
  const staleTokens: string[] = [];

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      console.error("[NotificationService] Error sending chunk:", error);
      errors.push(String(error));
    }
  }

  // Check for DeviceNotRegistered errors
  tickets.forEach((ticket, index) => {
    if (ticket.status === "error") {
      errors.push(`Push failed: ${ticket.details?.error ?? "UNKNOWN"}`);
      if (ticket.details && ticket.details.error === "DeviceNotRegistered") {
        staleTokens.push(messages[index].to as string);
      }
    }
  });

  if (staleTokens.length > 0) {
    console.warn(`[NotificationService] Cleaning up stale Expo tokens (DeviceNotRegistered):`, staleTokens);
    await supabaseAdmin.from("device_tokens").delete().in("token", staleTokens);
  }

  return { success: tickets.some(t => t.status === "ok"), errors };
}

