import { resolveUserFromName } from "../userResolutionService";
import type { User } from "../../context/AppContext";

const mockUsers: User[] = [
  { id: "1", name: "Rahul Kumar", email: "rahul@test.com", role: "admin", avatarColor: "red" },
  { id: "2", name: "Rahul Sharma", email: "sharma@test.com", role: "user", avatarColor: "blue" },
  { id: "3", name: "Aditya", email: "adi@test.com", role: "user", avatarColor: "green", aliases: ["Adi"] } as User,
  { id: "4", name: "Sarah Jane", email: "sarah@test.com", role: "manager", avatarColor: "pink" },
];

describe("userResolutionService", () => {
  describe("resolveUserFromName", () => {
    it("matches exact full names with highest confidence", () => {
      const result = resolveUserFromName("Sarah Jane", mockUsers);
      expect(result.user?.id).toBe("4");
      expect(result.ambiguous).toBe(false);
      expect(result.candidates[0].strategy).toBe("exact");
    });

    it("matches aliases correctly", () => {
      const result = resolveUserFromName("Adi", mockUsers);
      expect(result.user?.id).toBe("3");
      expect(result.ambiguous).toBe(false);
      expect(result.candidates[0].strategy).toBe("alias");
    });

    it("matches first names safely when unambiguous", () => {
      const result = resolveUserFromName("Sarah", mockUsers);
      expect(result.user?.id).toBe("4");
      expect(result.ambiguous).toBe(false);
      expect(result.candidates[0].strategy).toBe("first_name");
    });

    it("detects ambiguity when queries match multiple users closely", () => {
      const result = resolveUserFromName("Rahul", mockUsers);
      expect(result.user).toBeNull();
      expect(result.ambiguous).toBe(true);
      expect(result.clarification).toContain("Did you mean Rahul Kumar or Rahul Sharma?");
    });

    it("matches last names when unambiguous", () => {
      const result = resolveUserFromName("Sharma", mockUsers);
      expect(result.user?.id).toBe("2");
      expect(result.ambiguous).toBe(false);
      expect(result.candidates[0].strategy).toBe("last_name");
    });

    it("returns null safely when no match is found", () => {
      const result = resolveUserFromName("Zebra", mockUsers);
      expect(result.user).toBeNull();
      expect(result.ambiguous).toBe(false);
      expect(result.clarification).toContain('Could not find a user named "Zebra"');
    });

    it("uses fuzzy matching for typos", () => {
      const result = resolveUserFromName("Sareh", mockUsers);
      expect(result.user?.id).toBe("4");
      expect(result.ambiguous).toBe(false);
      expect(result.candidates[0].strategy).toBe("fuzzy");
    });
    
    it("handles partial multi-token queries safely", () => {
      const result = resolveUserFromName("Rahul K", mockUsers);
      expect(result.user?.id).toBe("1");
      expect(result.ambiguous).toBe(false);
    });
  });
});
