import { describe, it, expect } from "vitest";
import { planPlayNext, playNextInsertIndex, mergePins } from "./queue";

// Shorthand: a queue written as "abc" is three songs with those ids.
const q = (s: string) => [...s].map(id => ({ id }));
const ids = (list: { id: string }[] | null) => (list === null ? null : list.map(s => s.id).join(""));

describe("planPlayNext", () => {
  it("puts one song directly after the current track", () => {
    expect(ids(planPlayNext(q("abcd"), "a", q("d"), []))).toBe("adbc");
  });

  it("keeps a multi-song selection together and in the order given", () => {
    expect(ids(planPlayNext(q("abcdef"), "a", q("def"), []))).toBe("adefbc");
  });

  it("moves a song rather than duplicating it", () => {
    const out = planPlayNext(q("abcd"), "a", q("c"), []);
    expect(ids(out)).toBe("acbd");
    expect(out!.filter(s => s.id === "c")).toHaveLength(1);
  });

  it("lands after pins already queued, so repeated taps keep their order", () => {
    // "b" is already pinned behind the current track "a". Pinning "d" must put
    // it after "b", not shove it in front.
    expect(ids(planPlayNext(q("abcd"), "a", q("d"), ["b"]))).toBe("abdc");
  });

  it("appends after a run of existing pins, not just the first", () => {
    expect(ids(planPlayNext(q("abcde"), "a", q("e"), ["b", "c"]))).toBe("abced");
  });

  it("refuses to queue the current track after itself", () => {
    expect(planPlayNext(q("abc"), "a", q("a"), [])).toBeNull();
  });

  it("drops the current track from a selection but pins the rest", () => {
    expect(ids(planPlayNext(q("abcd"), "a", q("ad"), []))).toBe("adbc");
  });

  it("returns null when the current track is not in the queue", () => {
    // Nothing sensible to insert "after", so the caller leaves the queue alone.
    expect(planPlayNext(q("bcd"), "a", q("d"), [])).toBeNull();
  });

  it("returns null for an empty selection", () => {
    expect(planPlayNext(q("abc"), "a", [], [])).toBeNull();
  });

  it("handles the current track being last", () => {
    expect(ids(planPlayNext(q("abc"), "c", q("a"), []))).toBe("bca");
  });

  it("does not mutate the queue it was given", () => {
    const base = q("abcd");
    const copy = ids(base);
    planPlayNext(base, "a", q("d"), []);
    expect(ids(base)).toBe(copy);
  });
});

describe("playNextInsertIndex", () => {
  it("is the slot right after the current track when nothing is pinned", () => {
    expect(playNextInsertIndex(q("abcd"), 0, [])).toBe(1);
  });

  it("skips past consecutive pinned tracks", () => {
    expect(playNextInsertIndex(q("abcd"), 0, ["b", "c"])).toBe(3);
  });

  it("stops at the first unpinned track", () => {
    // "d" is pinned but "c" is not, so the run ends at "c".
    expect(playNextInsertIndex(q("abcd"), 0, ["b", "d"])).toBe(2);
  });

  it("never runs past the end of the queue", () => {
    expect(playNextInsertIndex(q("ab"), 0, ["b"])).toBe(2);
  });
});

describe("mergePins", () => {
  it("appends new ids in order", () => {
    expect(mergePins(["a"], ["b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("does not duplicate an id that is already pinned", () => {
    expect(mergePins(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("leaves the original list untouched", () => {
    const before = ["a"];
    mergePins(before, ["b"]);
    expect(before).toEqual(["a"]);
  });
});
