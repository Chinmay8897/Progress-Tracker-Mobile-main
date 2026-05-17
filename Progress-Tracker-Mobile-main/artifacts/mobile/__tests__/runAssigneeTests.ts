/**
 * Standalone test runner — no path aliases, no Jest dependency.
 * Run: npx tsx artifacts/mobile/__tests__/runAssigneeTests.ts
 */

// ─── Inline imports (relative paths) ────────────────────────────────────────
import { normalizeTranscript, stripHonorifics } from "../utils/normalizeTranscript";
import { levenshtein, similarity, jaroWinkler, nameMatchScore } from "../utils/fuzzyNameMatcher";
import { extractAssigneeFragments, resolveAssignee, type KnownUser } from "../utils/assigneeResolver";

let passed = 0, failed = 0, total = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  total++;
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e: any) { failed++; const m = `  ❌ ${name}: ${e.message}`; console.log(m); failures.push(m); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

const USERS: KnownUser[] = [
  { name: "Rahul Kumar" }, { name: "Rahul Sharma" },
  { name: "Aditya Patel" }, { name: "Chinmay Desai" },
  { name: "Abi Joseph" }, { name: "Priya Singh" }, { name: "Aadi Mehta" },
];

// ── normalizeTranscript ─────────────────────────────────────────────────────
console.log("\n━━━ normalizeTranscript ━━━");
test("removes fillers", () => assert(normalizeTranscript("um create uh task") === "create task", "filler removal"));
test("removes please", () => assert(normalizeTranscript("please create task") === "create task", "please"));
test("collapses stutter", () => assert(normalizeTranscript("create create task") === "create task", "stutter"));
test("strips honorifics", () => assert(stripHonorifics("Mr Rahul sir") === "Rahul", "honorifics"));

// ── fuzzyNameMatcher ────────────────────────────────────────────────────────
console.log("\n━━━ fuzzyNameMatcher ━━━");
test("levenshtein identical=0", () => assert(levenshtein("rahul","rahul") === 0, "should be 0"));
test("levenshtein edit=1", () => assert(levenshtein("rahul","rahil") === 1, "should be 1"));
test("similarity identical=1", () => assert(similarity("rahul","rahul") === 1.0, "should be 1"));
test("prefix nickname score high", () => assert(nameMatchScore("aditya","adi") > 0.7, "adi→aditya"));
test("unrelated score low", () => assert(nameMatchScore("rahul","priya") < 0.5, "rahul≠priya"));

// ── extractAssigneeFragments ────────────────────────────────────────────────
console.log("\n━━━ extractAssigneeFragments ━━━");
test("extracts after 'for'", () => {
  const f = extractAssigneeFragments("Create task for Rahul to test");
  assert(f.some(x => x.toLowerCase().includes("rahul")), "should find Rahul");
});
test("extracts after 'tell'", () => {
  const f = extractAssigneeFragments("Tell Priya to finish deployment");
  assert(f.some(x => x.toLowerCase().includes("priya")), "should find Priya");
});
test("extracts multi-word name", () => {
  const f = extractAssigneeFragments("Create task for Rahul Kumar");
  assert(f.some(x => x.toLowerCase().includes("rahul kumar")), "should find full name");
});

// ── resolveAssignee — required examples ─────────────────────────────────────
console.log("\n━━━ resolveAssignee — required examples ━━━");

const cases: [string, string | null][] = [
  ["Create task for Rahul to complete testing", "Rahul"],
  ["Assign high priority task to Aditya by Friday", "Aditya Patel"],
  ["Create task for Chinmay backend integration", "Chinmay Desai"],
  ["Give the testing task to Abi", "Abi Joseph"],
  ["Create task for Mr Rahul Kumar", "Rahul Kumar"],
  ["Assign report work to Aadi", "Aadi Mehta"],
  ["Tell Priya to finish deployment", "Priya Singh"],
  ["Assign task to Rahul sir", "Rahul"],
  ["create task rahul friday high priority", "Rahul"],
];

for (const [cmd, expected] of cases) {
  test(`"${cmd}"`, () => {
    const r = resolveAssignee(cmd, USERS);
    if (expected === null) {
      assert(r.assignee === null, `expected null, got ${r.assignee}`);
    } else {
      assert(r.assignee !== null, `expected match for "${expected}", got null`);
      assert(r.assignee!.includes(expected), `expected "${expected}" in "${r.assignee}"`);
    }
  });
}

// ── Ambiguity ───────────────────────────────────────────────────────────────
console.log("\n━━━ Ambiguity detection ━━━");
test("full name is unambiguous", () => {
  const r = resolveAssignee("Create task for Rahul Kumar", USERS);
  assert(r.assignee === "Rahul Kumar", "should pick Rahul Kumar");
  assert(!r.ambiguous, "should not be ambiguous");
});
test("bare 'Rahul' finds both Rahuls", () => {
  const r = resolveAssignee("Create task for Rahul", USERS);
  const rahuls = r.candidates.filter(c => c.name.includes("Rahul"));
  assert(rahuls.length >= 2, "should find 2 Rahul candidates");
});

// ── Negative tests ──────────────────────────────────────────────────────────
console.log("\n━━━ Negative tests ━━━");
test("no match for nonexistent user", () => {
  const r = resolveAssignee("Create task for Zaphod Beeblebrox", USERS);
  assert(r.assignee === null, `should be null, got ${r.assignee}`);
});

// ── Alias support ───────────────────────────────────────────────────────────
console.log("\n━━━ Alias support ━━━");
test("alias 'Adi' → Aditya Patel", () => {
  const u: KnownUser[] = [{ name: "Aditya Patel", aliases: ["Adi"] }, { name: "Rahul Kumar" }];
  const r = resolveAssignee("Create task for Adi", u);
  assert(r.assignee === "Aditya Patel", `expected Aditya Patel, got ${r.assignee}`);
});

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n═══ Results: ${passed}/${total} passed, ${failed} failed ═══`);
if (failures.length) { console.log("\nFailures:"); failures.forEach(f => console.log(f)); }
if (failed > 0) process.exit(1);
