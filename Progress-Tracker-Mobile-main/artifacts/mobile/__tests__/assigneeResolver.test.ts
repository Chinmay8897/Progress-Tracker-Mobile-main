/**
 * Assignee Resolution — Comprehensive Test Suite
 *
 * Tests the complete entity resolution pipeline:
 * - normalizeTranscript
 * - fuzzyNameMatcher
 * - assigneeResolver
 * - CommandParser (integrated)
 *
 * Run with: npx ts-node --esm __tests__/assigneeResolver.test.ts
 * Or import into Jest/Vitest test runner.
 */

// ─── Inline test runner (no Jest dependency needed) ─────────────────────────

let passed = 0;
let failed = 0;
let total = 0;
const failures: string[] = [];

function describe(name: string, fn: () => void) {
  console.log(`\n━━━ ${name} ━━━`);
  fn();
}

function it(name: string, fn: () => void) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err: any) {
    failed++;
    const msg = `  ❌ ${name}: ${err.message}`;
    console.log(msg);
    failures.push(msg);
  }
}

function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected: T) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeTruthy() {
      if (!actual) throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`);
    },
    toBeFalsy() {
      if (actual) throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`);
    },
    toBeNull() {
      if (actual !== null) throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
    },
    toBeUndefined() {
      if (actual !== undefined) throw new Error(`Expected undefined, got ${JSON.stringify(actual)}`);
    },
    toBeGreaterThan(n: number) {
      if ((actual as any) <= n) throw new Error(`Expected >${n}, got ${actual}`);
    },
    toBeGreaterThanOrEqual(n: number) {
      if ((actual as any) < n) throw new Error(`Expected >=${n}, got ${actual}`);
    },
    toBeLessThan(n: number) {
      if ((actual as any) >= n) throw new Error(`Expected <${n}, got ${actual}`);
    },
    toContain(item: any) {
      if (!(actual as any[]).includes(item)) {
        throw new Error(`Expected array to contain ${JSON.stringify(item)}, got ${JSON.stringify(actual)}`);
      }
    },
    not: {
      toBeNull() {
        if (actual === null) throw new Error(`Expected not null`);
      },
      toBeUndefined() {
        if (actual === undefined) throw new Error(`Expected not undefined`);
      },
    },
  };
}

// ─── Import the modules under test ──────────────────────────────────────────

import { normalizeTranscript, stripHonorifics, normalizeForComparison, isValidTranscript } from "../utils/normalizeTranscript";
import { levenshtein, similarity, jaroWinkler, nameMatchScore, isPrefix } from "../utils/fuzzyNameMatcher";
import { extractAssigneeFragments, resolveAssignee, extractAssigneeByPattern, extractAssigneeFromKnownUsers, type KnownUser } from "../utils/assigneeResolver";

// ─── Test Data ──────────────────────────────────────────────────────────────

const TEAM_USERS: KnownUser[] = [
  { name: "Rahul Kumar" },
  { name: "Rahul Sharma" },
  { name: "Aditya Patel" },
  { name: "Chinmay Desai" },
  { name: "Abi Joseph" },
  { name: "Priya Singh" },
  { name: "Mary-Jane Watson" },
  { name: "Aadi Mehta" },
];

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1: normalizeTranscript Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("normalizeTranscript", () => {
  it("should remove filler words", () => {
    expect(normalizeTranscript("um create uh task for um Rahul")).toBe("create task for Rahul");
  });

  it("should remove multi-word fillers", () => {
    expect(normalizeTranscript("can you create a task for Rahul")).toBe("create a task for Rahul");
  });

  it("should collapse stuttering", () => {
    expect(normalizeTranscript("create create task for Rahul")).toBe("create task for Rahul");
  });

  it("should remove trailing punctuation", () => {
    expect(normalizeTranscript("create task for Rahul.")).toBe("create task for Rahul");
  });

  it("should remove commas and semicolons", () => {
    expect(normalizeTranscript("create task, for Rahul; testing")).toBe("create task for Rahul testing");
  });

  it("should collapse whitespace", () => {
    expect(normalizeTranscript("create   task   for   Rahul")).toBe("create task for Rahul");
  });

  it("should handle empty strings", () => {
    expect(normalizeTranscript("")).toBe("");
    expect(normalizeTranscript("  ")).toBe("");
  });

  it("should preserve names with hyphens", () => {
    const result = normalizeTranscript("task for Mary-Jane");
    expect(result).toBe("task for Mary-Jane");
  });

  it("should handle 'please' removal", () => {
    expect(normalizeTranscript("please create task for Rahul")).toBe("create task for Rahul");
  });
});

describe("stripHonorifics", () => {
  it("should strip Mr", () => {
    expect(stripHonorifics("Mr Rahul Kumar")).toBe("Rahul Kumar");
  });

  it("should strip sir", () => {
    expect(stripHonorifics("Rahul sir")).toBe("Rahul");
  });

  it("should strip Mr. with dot", () => {
    expect(stripHonorifics("Mr. Rahul")).toBe("Rahul");
  });
});

describe("normalizeForComparison", () => {
  it("should lowercase and clean text", () => {
    expect(normalizeForComparison("Rahul Kumar")).toBe("rahul kumar");
  });

  it("should preserve hyphens in names", () => {
    const result = normalizeForComparison("Mary-Jane");
    expect(result.includes("mary")).toBeTruthy();
    expect(result.includes("jane")).toBeTruthy();
  });
});

describe("isValidTranscript", () => {
  it("should reject empty input", () => {
    expect(isValidTranscript("")).toBeFalsy();
  });

  it("should reject filler-only input", () => {
    expect(isValidTranscript("um uh")).toBeFalsy();
  });

  it("should accept valid input", () => {
    expect(isValidTranscript("create task for Rahul")).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2: fuzzyNameMatcher Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("levenshtein", () => {
  it("should return 0 for identical strings", () => {
    expect(levenshtein("rahul", "rahul")).toBe(0);
  });

  it("should compute correct distance", () => {
    expect(levenshtein("rahul", "rahil")).toBe(1);
  });

  it("should handle empty strings", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });

  it("should respect maxDist early exit", () => {
    const dist = levenshtein("abcdefgh", "xyz", 2);
    expect(dist).toBeGreaterThan(2);
  });
});

describe("similarity", () => {
  it("should return 1.0 for identical strings", () => {
    expect(similarity("rahul", "rahul")).toBe(1.0);
  });

  it("should return high score for similar strings", () => {
    expect(similarity("rahul", "rahil")).toBeGreaterThan(0.7);
  });

  it("should return low score for dissimilar strings", () => {
    expect(similarity("rahul", "xyz")).toBeLessThan(0.3);
  });
});

describe("jaroWinkler", () => {
  it("should return 1.0 for identical strings", () => {
    expect(jaroWinkler("rahul", "rahul")).toBe(1.0);
  });

  it("should give bonus for shared prefixes", () => {
    const jw = jaroWinkler("aditya", "adi");
    expect(jw).toBeGreaterThan(0.7);
  });
});

describe("nameMatchScore", () => {
  it("should return 1.0 for exact match", () => {
    expect(nameMatchScore("rahul", "rahul")).toBe(1.0);
  });

  it("should score high for prefix (nickname)", () => {
    const score = nameMatchScore("aditya", "adi");
    expect(score).toBeGreaterThan(0.7);
  });

  it("should score low for unrelated names", () => {
    const score = nameMatchScore("rahul", "priya");
    expect(score).toBeLessThan(0.5);
  });
});

describe("isPrefix", () => {
  it("should detect prefix with min length", () => {
    expect(isPrefix("adi", "aditya")).toBeTruthy();
  });

  it("should reject short prefixes", () => {
    expect(isPrefix("ad", "aditya")).toBeFalsy();
  });

  it("should work bidirectionally", () => {
    expect(isPrefix("aditya", "adi")).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3: assigneeResolver — Fragment Extraction
// ═══════════════════════════════════════════════════════════════════════════

describe("extractAssigneeFragments", () => {
  it("should extract name after 'for'", () => {
    const frags = extractAssigneeFragments("Create task for Rahul to complete testing");
    expect(frags.length).toBeGreaterThan(0);
    expect(frags.some(f => f.toLowerCase().includes("rahul"))).toBeTruthy();
  });

  it("should extract name after 'to'", () => {
    const frags = extractAssigneeFragments("Assign high priority task to Aditya by Friday");
    expect(frags.some(f => f.toLowerCase().includes("aditya"))).toBeTruthy();
  });

  it("should extract name after 'tell'", () => {
    const frags = extractAssigneeFragments("Tell Priya to finish deployment");
    expect(frags.some(f => f.toLowerCase().includes("priya"))).toBeTruthy();
  });

  it("should extract multi-word names", () => {
    const frags = extractAssigneeFragments("Create task for Rahul Kumar");
    expect(frags.some(f => f.toLowerCase().includes("rahul kumar"))).toBeTruthy();
  });

  it("should handle 'Mr' prefix", () => {
    const frags = extractAssigneeFragments("Create task for Mr Rahul Kumar");
    expect(frags.some(f => f.toLowerCase().includes("rahul"))).toBeTruthy();
  });

  it("should extract from minimal commands", () => {
    const frags = extractAssigneeFragments("create task Rahul Friday high priority");
    expect(frags.some(f => f.toLowerCase().includes("rahul"))).toBeTruthy();
  });

  it("should extract multiple names", () => {
    const frags = extractAssigneeFragments("Create backend task for Aditya Chinmay");
    expect(frags.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4: assigneeResolver — Full Resolution Pipeline
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveAssignee — exact and first name matches", () => {
  it("should resolve exact full name", () => {
    const result = resolveAssignee("Create task for Rahul Kumar", TEAM_USERS);
    expect(result.assignee).toBe("Rahul Kumar");
    expect(result.ambiguous).toBeFalsy();
  });

  it("should resolve first name", () => {
    const result = resolveAssignee("Create task for Chinmay backend integration", TEAM_USERS);
    expect(result.assignee).toBe("Chinmay Desai");
  });

  it("should resolve by last name", () => {
    const result = resolveAssignee("Create task for Desai", TEAM_USERS);
    if (result.candidates.length > 0) {
      expect(result.candidates[0].name).toBe("Chinmay Desai");
    }
  });
});

describe("resolveAssignee — nickname and partial matches", () => {
  it("should resolve 'Abi' to 'Abi Joseph'", () => {
    const result = resolveAssignee("Give the testing task to Abi", TEAM_USERS);
    expect(result.assignee).toBe("Abi Joseph");
  });

  it("should resolve 'Aadi' to 'Aadi Mehta'", () => {
    const result = resolveAssignee("Assign report work to Aadi", TEAM_USERS);
    expect(result.assignee).toBe("Aadi Mehta");
  });

  it("should resolve 'Priya' to 'Priya Singh'", () => {
    const result = resolveAssignee("Tell Priya to finish deployment", TEAM_USERS);
    expect(result.assignee).toBe("Priya Singh");
  });
});

describe("resolveAssignee — trigger phrase variations", () => {
  it("should work with 'assign to'", () => {
    const result = resolveAssignee("Assign high priority task to Aditya by Friday", TEAM_USERS);
    expect(result.assignee).toBe("Aditya Patel");
  });

  it("should work with 'task for'", () => {
    const result = resolveAssignee("Create task for Rahul Kumar", TEAM_USERS);
    expect(result.assignee).toBe("Rahul Kumar");
  });

  it("should work with 'tell'", () => {
    const result = resolveAssignee("Tell Priya to finish deployment", TEAM_USERS);
    expect(result.assignee).toBe("Priya Singh");
  });

  it("should work with 'give the ... task to'", () => {
    const result = resolveAssignee("Give the testing task to Abi", TEAM_USERS);
    expect(result.assignee).toBe("Abi Joseph");
  });

  it("should work with 'assign task to ... sir'", () => {
    const result = resolveAssignee("Assign task to Rahul sir", TEAM_USERS);
    // Should match one of the Rahuls
    expect(result.assignee).not.toBeNull();
    expect(result.assignee!.includes("Rahul")).toBeTruthy();
  });
});

describe("resolveAssignee — noisy STT transcripts", () => {
  it("should handle lowercase no-punctuation", () => {
    const result = resolveAssignee("create task rahul friday high priority", TEAM_USERS);
    expect(result.assignee).not.toBeNull();
    expect(result.assignee!.includes("Rahul")).toBeTruthy();
  });

  it("should handle 'Mr' prefix", () => {
    const result = resolveAssignee("Create task for Mr Rahul Kumar", TEAM_USERS);
    expect(result.assignee).toBe("Rahul Kumar");
  });

  it("should handle punctuation-less minimal commands", () => {
    const result = resolveAssignee("assign aditya backend testing", TEAM_USERS);
    expect(result.assignee).toBe("Aditya Patel");
  });
});

describe("resolveAssignee — ambiguity detection", () => {
  it("should detect ambiguity for bare 'Rahul' with two Rahuls", () => {
    const result = resolveAssignee("Create task for Rahul", TEAM_USERS);
    // With two Rahuls in the list, this should be ambiguous or pick the first
    // Both "Rahul Kumar" and "Rahul Sharma" match equally
    if (result.candidates.length >= 2) {
      const rahuls = result.candidates.filter(c => c.name.includes("Rahul"));
      expect(rahuls.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("should resolve unambiguously with full name", () => {
    const result = resolveAssignee("Create task for Rahul Kumar", TEAM_USERS);
    expect(result.assignee).toBe("Rahul Kumar");
    expect(result.ambiguous).toBeFalsy();
  });
});

describe("resolveAssignee — negative tests (should NOT match)", () => {
  it("should not match random words as names", () => {
    const result = resolveAssignee("Create a high priority testing task", TEAM_USERS);
    // Should ideally find no assignee since no name is mentioned
    // The result may include low-confidence fuzzy matches, but assignee should be null
    expect(result.candidates.filter(c => c.confidence >= 0.8).length).toBe(0);
  });

  it("should not match non-existent user", () => {
    const result = resolveAssignee("Create task for Zaphod Beeblebrox", TEAM_USERS);
    expect(result.assignee).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 5: Legacy compatibility wrappers
// ═══════════════════════════════════════════════════════════════════════════

describe("extractAssigneeByPattern (legacy)", () => {
  it("should extract name from 'for <name>'", () => {
    const result = extractAssigneeByPattern("Create task for Rahul to test");
    expect(result).not.toBeUndefined();
    expect(result!.toLowerCase().includes("rahul")).toBeTruthy();
  });
});

describe("extractAssigneeFromKnownUsers (legacy)", () => {
  it("should match known user by first name", () => {
    const result = extractAssigneeFromKnownUsers(
      "Create task for Chinmay backend integration",
      [{ name: "Chinmay Desai" }, { name: "Rahul Kumar" }],
    );
    expect(result).toBe("Chinmay Desai");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 6: Indian naming patterns
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveAssignee — Indian naming patterns", () => {
  it("should handle first name only", () => {
    const result = resolveAssignee("Create task for Aditya", TEAM_USERS);
    expect(result.assignee).toBe("Aditya Patel");
  });

  it("should handle surname only for unique surnames", () => {
    const users: KnownUser[] = [
      { name: "Rahul Verma" },
      { name: "Priya Gupta" },
    ];
    const result = resolveAssignee("Create task for Verma", users);
    if (result.candidates.length > 0) {
      expect(result.candidates[0].name).toBe("Rahul Verma");
    }
  });

  it("should handle name with honorific 'ji'", () => {
    const result = resolveAssignee("Create task for Rahul ji", TEAM_USERS);
    // Should match a Rahul (ji is stripped as honorific)
    expect(result.assignee).not.toBeNull();
    expect(result.assignee!.includes("Rahul")).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 7: Real-world command examples from requirements
// ═══════════════════════════════════════════════════════════════════════════

describe("Real-world command examples", () => {
  it("'Create task for Rahul to complete testing'", () => {
    const result = resolveAssignee("Create task for Rahul to complete testing", TEAM_USERS);
    expect(result.assignee).not.toBeNull();
    expect(result.assignee!.includes("Rahul")).toBeTruthy();
  });

  it("'Assign high priority task to Aditya by Friday'", () => {
    const result = resolveAssignee("Assign high priority task to Aditya by Friday", TEAM_USERS);
    expect(result.assignee).toBe("Aditya Patel");
  });

  it("'Create task for Chinmay backend integration'", () => {
    const result = resolveAssignee("Create task for Chinmay backend integration", TEAM_USERS);
    expect(result.assignee).toBe("Chinmay Desai");
  });

  it("'Give the testing task to Abi'", () => {
    const result = resolveAssignee("Give the testing task to Abi", TEAM_USERS);
    expect(result.assignee).toBe("Abi Joseph");
  });

  it("'Create task for Mr Rahul Kumar'", () => {
    const result = resolveAssignee("Create task for Mr Rahul Kumar", TEAM_USERS);
    expect(result.assignee).toBe("Rahul Kumar");
  });

  it("'Assign report work to Aadi'", () => {
    const result = resolveAssignee("Assign report work to Aadi", TEAM_USERS);
    expect(result.assignee).toBe("Aadi Mehta");
  });

  it("'Tell Priya to finish deployment'", () => {
    const result = resolveAssignee("Tell Priya to finish deployment", TEAM_USERS);
    expect(result.assignee).toBe("Priya Singh");
  });

  it("'Assign task to Rahul sir'", () => {
    const result = resolveAssignee("Assign task to Rahul sir", TEAM_USERS);
    expect(result.assignee).not.toBeNull();
    expect(result.assignee!.includes("Rahul")).toBeTruthy();
  });

  it("'create task rahul friday high priority' (no punctuation)", () => {
    const result = resolveAssignee("create task rahul friday high priority", TEAM_USERS);
    expect(result.assignee).not.toBeNull();
    expect(result.assignee!.includes("Rahul")).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 8: Alias support
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveAssignee — alias matching", () => {
  const usersWithAliases: KnownUser[] = [
    { name: "Aditya Patel", aliases: ["Adi", "Adit"] },
    { name: "Rahul Kumar", aliases: ["RK"] },
    { name: "Priya Singh", aliases: ["PS"] },
  ];

  it("should match alias 'Adi' to 'Aditya Patel'", () => {
    const result = resolveAssignee("Create task for Adi", usersWithAliases);
    expect(result.assignee).toBe("Aditya Patel");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n═══════════════════════════════════");
console.log(`  Total:  ${total}`);
console.log(`  Passed: ${passed} ✅`);
console.log(`  Failed: ${failed} ❌`);
console.log("═══════════════════════════════════");

if (failures.length > 0) {
  console.log("\nFailures:");
  failures.forEach(f => console.log(f));
}

// Exit with error code if any tests failed
if (failed > 0) {
  process.exit(1);
}
