import { z } from "zod";

export const AiIntentSchema = z.object({
  intent: z.enum([
    "create_task",
    "update_task",
    "delete_task",
    "share_task",
    "reassign_task",
    "mark_complete",
    "open_form",
    "set_filter",
    "clear_filters",
    "unknown",
  ]),
  task_title: z.string().nullable().optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).nullable().optional(),
  assignee: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  share_whatsapp: z.boolean().nullable().optional(),
});

export type AiIntentResponse = z.infer<typeof AiIntentSchema>;

/**
 * Validates and parses the raw JSON string returned from the AI.
 * Throws a ZodError or SyntaxError if parsing fails.
 */
export function validateAiIntent(jsonStr: string): AiIntentResponse {
  try {
    // Attempt to extract JSON if the AI wrapped it in markdown code blocks
    let cleanJson = jsonStr.trim();
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson.replace(/^```json/, "").replace(/```$/, "").trim();
    } else if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```/, "").replace(/```$/, "").trim();
    }

    const parsed = JSON.parse(cleanJson);
    return AiIntentSchema.parse(parsed);
  } catch (error) {
    console.error("[validateAiIntent] Failed to validate AI output:", error);
    throw error;
  }
}
