import { normalizeTranscript, stripHonorifics, normalizeForComparison, isValidTranscript } from "../normalizeTranscript";

describe("normalizeTranscript", () => {
  it("lowercases the transcript", () => {
    expect(normalizeTranscript("Create Task")).toBe("create task");
    expect(normalizeTranscript("ASSIGN BACKEND TESTING TASK TO RAHUL KUMAR")).toBe("assign backend testing task to rahul kumar");
  });

  it("removes punctuation but preserves safe characters", () => {
    expect(normalizeTranscript("hello, world.")).toBe("hello world");
    expect(normalizeTranscript("what time is it?")).toBe("what time is it");
    expect(normalizeTranscript("task; name: testing!")).toBe("task name testing");
    // Should preserve hyphens and apostrophes
    expect(normalizeTranscript("O'Brien's test-task")).toBe("o'brien's test-task");
  });

  it("removes filler words and phrases", () => {
    expect(normalizeTranscript("uh create task for rahul friday please")).toBe("create task for rahul friday");
    expect(normalizeTranscript("um basically i want you to just create a task actually")).toBe("create a task");
    expect(normalizeTranscript("okay so please reassign this literally right now")).toBe("reassign this right now");
  });

  it("collapses repeated words", () => {
    expect(normalizeTranscript("the the task")).toBe("the task");
    expect(normalizeTranscript("create create task for for rahul")).toBe("create task for rahul");
    expect(normalizeTranscript("assign to to to rahul")).toBe("assign to rahul");
  });

  it("normalizes whitespace", () => {
    expect(normalizeTranscript("  create   task\tfor rahul  \n")).toBe("create task for rahul");
  });

  it("handles empty or null inputs", () => {
    expect(normalizeTranscript("")).toBe("");
    expect(normalizeTranscript("   ")).toBe("");
  });
});

describe("stripHonorifics", () => {
  it("removes titles from names", () => {
    expect(stripHonorifics("Mr Rahul Kumar")).toBe("Rahul Kumar");
    expect(stripHonorifics("Dr. Sarah Jane")).toBe("Sarah Jane");
    expect(stripHonorifics("Rahul sir")).toBe("Rahul");
    expect(stripHonorifics("didi please")).toBe("please"); // Note: 'please' is kept here as stripHonorifics only removes honorifics
  });
});

describe("normalizeForComparison", () => {
  it("strips most punctuation and lowercases", () => {
    expect(normalizeForComparison("O'Brien-Jane!")).toBe("o'brien-jane");
    expect(normalizeForComparison("Mr. Rahul")).toBe("mr rahul");
  });
});

describe("isValidTranscript", () => {
  it("returns true for valid transcripts", () => {
    expect(isValidTranscript("create task")).toBe(true);
    expect(isValidTranscript("a b")).toBe(true);
  });

  it("returns false for invalid transcripts", () => {
    expect(isValidTranscript("")).toBe(false);
    expect(isValidTranscript("a")).toBe(false); // Too short
    expect(isValidTranscript("uh um please")).toBe(false); // Only fillers, will normalize to empty
    expect(isValidTranscript("123")).toBe(false); // No alphabetical chars
  });
});
