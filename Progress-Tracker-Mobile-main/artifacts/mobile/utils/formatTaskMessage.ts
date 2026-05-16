import { Task } from "../context/AppContext";

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

export function formatTaskMessage(task: Task): string {
  const priority = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);
  const status = STATUS_LABELS[task.status] || task.status;
  const date = new Date(task.dueDate).toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return `📌 *Task Assigned*

📝 *Task:* ${task.title}
📄 *Description:* ${task.description || "N/A"}
📅 *Deadline:* ${date}
⚡ *Priority:* ${priority}
📊 *Status:* ${status}

Please complete this task on time.`;
}
