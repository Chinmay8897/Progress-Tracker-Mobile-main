import { resolveTaskFromTitle } from "../taskResolutionService";
import type { Task } from "../../context/AppContext";

const mockTasks: Task[] = [
  { id: "1", title: "Backend Testing Integration", description: "", assigneeId: "1", dueDate: "2024-05-20", priority: "high", status: "open", tags: [], notes: "", createdAt: new Date(), updatedAt: new Date(), createdBy: "1" },
  { id: "2", title: "Backend API Integration", description: "", assigneeId: "1", dueDate: "2024-05-20", priority: "high", status: "open", tags: [], notes: "", createdAt: new Date(), updatedAt: new Date(), createdBy: "1" },
  { id: "3", title: "Fix Login Bug", description: "", assigneeId: "2", dueDate: "2024-05-20", priority: "critical", status: "open", tags: [], notes: "", createdAt: new Date(), updatedAt: new Date(), createdBy: "1" },
];

describe("taskResolutionService", () => {
  describe("resolveTaskFromTitle", () => {
    it("matches exact full titles", () => {
      const result = resolveTaskFromTitle("Fix Login Bug", mockTasks);
      expect(result.task?.id).toBe("3");
      expect(result.ambiguous).toBe(false);
      expect(result.candidates[0].strategy).toBe("exact");
    });

    it("matches partial tokens cleanly (shortened names)", () => {
      // Not a direct substring, so it falls to partial_tokens
      const result = resolveTaskFromTitle("fix bug", mockTasks);
      expect(result.task?.id).toBe("3");
      expect(result.ambiguous).toBe(false);
      expect(result.candidates[0].strategy).toBe("partial_tokens");
    });

    it("matches substring cleanly", () => {
      const result = resolveTaskFromTitle("ix logi", mockTasks);
      expect(result.task?.id).toBe("3");
      expect(result.ambiguous).toBe(false);
      expect(result.candidates[0].strategy).toBe("contains");
    });

    it("detects ambiguity safely", () => {
      // Both tasks have "backend" and "test/api"
      // Let's use "backend integration" to cause ambiguity because both tasks are "Backend Testing Integration" and "Backend API Integration"
      // Wait, "backend integration" has coverage 2/3 for BOTH tasks!
      const ambigResult = resolveTaskFromTitle("backend integration", mockTasks);
      expect(ambigResult.task).toBeNull();
      expect(ambigResult.ambiguous).toBe(true);
      expect(ambigResult.clarification).toContain("Backend Testing Integration");
      expect(ambigResult.clarification).toContain("Backend API Integration");
    });

    it("uses fuzzy matching for typos", () => {
      const result = resolveTaskFromTitle("backend testin", mockTasks);
      // Wait, this might be a contains match! Let's use a clear typo
      const typoResult = resolveTaskFromTitle("Backnd Testin Integration", mockTasks);
      expect(typoResult.task?.id).toBe("1");
      expect(typoResult.ambiguous).toBe(false);
    });

    it("returns null safely when no match is found", () => {
      const result = resolveTaskFromTitle("Make Coffee", mockTasks);
      expect(result.task).toBeNull();
      expect(result.ambiguous).toBe(false);
    });
  });
});
