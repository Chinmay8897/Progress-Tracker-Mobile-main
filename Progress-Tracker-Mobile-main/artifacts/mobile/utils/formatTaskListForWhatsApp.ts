import { Task } from "../context/AppContext";

const MAX_URL_CHARS = 2000; // safe limit for whatsapp web/app deep links

const FILTER_HEADERS: Record<string, string> = {
  All: "📋 All Tasks",
  Active: "🟢 Active Tasks",
  Blocked: "🔴 Blocked Tasks",
  Done: "✅ Completed Tasks",
};

export function formatTaskListForWhatsApp(tasks: Task[], filterName: string): string {
  if (tasks.length === 0) return `You have no ${filterName.toLowerCase()} tasks. 🎉`;

  const header = FILTER_HEADERS[filterName] || `📋 ${filterName} Tasks`;
  let message = `*${header}*\n\n`;
  let taskCount = 0;

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const priority = t.priority.charAt(0).toUpperCase() + t.priority.slice(1);
    
    let dateStr = "N/A";
    if (t.dueDate) {
      const d = new Date(t.dueDate);
      if (!Number.isNaN(d.getTime())) {
        dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      } else {
        dateStr = t.dueDate;
      }
    }
    
    const taskBlock = `${i + 1}. *${t.title}*\n   Priority: ${priority}\n   Due: ${dateStr}\n\n`;
    
    if (encodeURIComponent(message + taskBlock).length > MAX_URL_CHARS) {
        message += `_...and ${tasks.length - i} more tasks. Please check the app for full details._\n`;
        break;
    }

    message += taskBlock;
    taskCount++;
  }

  if (filterName !== "Done") {
    message += `\nPlease review and complete these tasks.`;
  }
  return message;
}
