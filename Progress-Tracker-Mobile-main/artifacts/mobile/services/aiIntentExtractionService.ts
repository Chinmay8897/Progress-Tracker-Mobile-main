import { openaiApi } from "@/services/api";
import { validateAiIntent, type AiIntentResponse } from "@/utils/validateAiResponse";
import type { ParsedCommand, ParsedEntities } from "@/domain/voice/types";

const SYSTEM_PROMPT = `
You are a highly capable Natural Language Understanding (NLU) assistant for a task management application called "TaskCommand".
Your sole job is to extract the user's intent and any relevant entities from their voice command transcript.

Supported intents:
- create_task: User wants to create a new task.
- update_task: User wants to modify an existing task's status or details.
- delete_task: User wants to delete/remove a task.
- share_task: User wants to share a task (maps to send_whatsapp).
- reassign_task: User wants to change who a task is assigned to.
- mark_complete: User wants to mark a task as done.
- open_form: User wants to just open the new task form (e.g. "new task", "create a task").
- set_filter: User wants to filter the dashboard.
- clear_filters: User wants to clear filters.
- unknown: Fallback if you cannot understand the command.

Rules:
1. ONLY return strict JSON matching this structure exactly (no markdown formatting, just raw JSON string).
2. Do NOT hallucinate entities. If a field is not present in the user's command, leave it null.
3. The "priority" MUST be one of: "critical", "high", "medium", "low", or null.
4. If the user mentions WhatsApp, set "share_whatsapp" to true.

Output Schema:
{
  "intent": "create_task|update_task|delete_task|share_task|reassign_task|mark_complete|open_form|set_filter|clear_filters|unknown",
  "task_title": "extracted task name or null",
  "priority": "critical|high|medium|low or null",
  "assignee": "extracted person's name or null",
  "deadline": "extracted deadline/timeframe or null",
  "share_whatsapp": true|false|null
}
`;

export async function extractIntentWithAI(
  transcript: string,
  knownUsers: string[] = []
): Promise<ParsedCommand> {
  // Construct the context to help the LLM match known users better
  let userContext = "";
  if (knownUsers.length > 0) {
    userContext = `\nKnown team members (try to match assignees to these if similar): ${knownUsers.join(", ")}`;
  }

  const prompt = `User transcript: "${transcript}"${userContext}`;

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ];

  // Call the Groq proxy
  const response = await openaiApi.chat(messages as any, { temperature: 0.1 });
  
  if (!response || !response.message) {
    throw new Error("Invalid empty response from AI proxy.");
  }

  const aiData: AiIntentResponse = validateAiIntent(response.message);

  return mapAiResponseToParsedCommand(transcript, aiData);
}

function mapAiResponseToParsedCommand(rawText: string, aiData: AiIntentResponse): ParsedCommand {
  const entities: ParsedEntities = {
    taskTitle: aiData.task_title || undefined,
    assigneeName: aiData.assignee || undefined,
    priority: aiData.priority || undefined,
    deadline: aiData.deadline || undefined,
    sendWhatsApp: aiData.share_whatsapp || false,
    status: undefined, // default
  };

  let mappedIntent: string = aiData.intent;

  // Map requested AI intents to the execution intents
  if (mappedIntent === "share_task") {
    mappedIntent = "send_whatsapp";
    entities.sendWhatsApp = true;
  }
  
  if (mappedIntent === "mark_complete") {
    mappedIntent = "update_task";
    entities.status = "done";
  }

  if (mappedIntent === "reassign_task") {
    mappedIntent = "update_task";
  }

  // Handle set_filter values
  if (mappedIntent === "set_filter") {
    if (entities.priority) {
      entities.filterType = "priority";
      entities.filterValue = entities.priority;
    } else if (entities.status) {
      entities.filterType = "status";
      entities.filterValue = entities.status;
    } else {
       // if we didn't extract a status, we assume 'done' or 'open' based on words
       const lower = rawText.toLowerCase();
       if (lower.includes("done") || lower.includes("completed")) {
         entities.filterType = "status";
         entities.filterValue = "done";
       } else if (lower.includes("progress")) {
         entities.filterType = "status";
         entities.filterValue = "in_progress";
       } else if (lower.includes("blocked")) {
         entities.filterType = "status";
         entities.filterValue = "blocked";
       }
    }
  }

  return {
    intent: mappedIntent,
    rawText,
    entities,
  };
}
