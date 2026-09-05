import { describe, it, expect } from "vitest";
import { parseLrc, activeLineIndex, stripTimestamps, hasLyrics } from "./lyrics";

describe("parseLrc", () => {
  it("reads minutes, seconds and centiseconds", () => {
    expect(parseLrc("[00:12.50]Hello")).toEqual([{ timeMs: 12_500, text: "Hello" }]);
    expect(parseLrc("[01:02.10]Two")).toEqual([{ timeMs: 62_100, text: "Two" }]);
  });

  it("treats a two-digit fraction as centiseconds, not milliseconds", () => {
    // The easy bug: reading "50" as 50ms would put every line half a second early.
    expect(parseLrc("[00:00.50]x")![0].timeMs).toBe(500);
  });

  it("reads a three-digit fraction as milliseconds", () => {
    expect(parseLrc("[00:00.500]x")![0].timeMs).toBe(500);
  });

  it("accepts a colon before the fraction", () => {
    expect(parseLrc("[00:12:50]Hello")![0].timeMs).toBe(12_500);
  });

  it("expands a line carrying several timestamps", () => {
    // A repeated chorus, so it must highlight each time round.
    expect(parseLrc("[00:10.00][01:10.00]Chorus")).toEqual([
      { timeMs: 10_000, text: "Chorus" },
      { timeMs: 70_000, text: "Chorus" },
    ]);
  });

  it("sorts by time even when the file is out of order", () => {
    const out = parseLrc("[00:30.00]Later\n[00:10.00]Earlier")!;
    expect(out.map(l => l.text)).toEqual(["Earlier", "Later"]);
  });

  it("skips the metadata header", () => {
    const out = parseLrc("[ar:Someone]\n[ti:A Song]\n[00:01.00]Words")!;
    expect(out).toEqual([{ timeMs: 1000, text: "Words" }]);
  });

  it("keeps an empty timed line, which is a pause in the lyric", () => {
    expect(parseLrc("[00:05.00]")).toEqual([{ timeMs: 5000, text: "" }]);
  });

  it("returns null for plain text with no timestamps", () => {
    expect(parseLrc("Just some words\nover two lines")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parseLrc("")).toBeNull();
  });
});

describe("activeLineIndex", () => {
  const lines = parseLrc("[00:00.00]a\n[00:10.00]b\n[00:20.00]c")!;

  it("is -1 before the first line", () => {
    expect(activeLineIndex(parseLrc("[00:05.00]a")!, 0)).toBe(-1);
  });

  it("picks the line that has started", () => {
    expect(activeLineIndex(lines, 0)).toBe(0);
    expect(activeLineIndex(lines, 9_999)).toBe(0);
    expect(activeLineIndex(lines, 10_000)).toBe(1);
    expect(activeLineIndex(lines, 19_999)).toBe(1);
  });

  it("holds on the last line past the end", () => {
    expect(activeLineIndex(lines, 999_999)).toBe(2);
  });

  it("copes with an empty list", () => {
    expect(activeLineIndex([], 1000)).toBe(-1);
  });
});

describe("stripTimestamps", () => {
  it("leaves the words and drops the stamps", () => {
    expect(stripTimestamps("[00:01.00]One\n[00:02.00]Two")).toBe("One\nTwo");
  });

  it("drops the metadata header", () => {
    expect(stripTimestamps("[ar:X]\n[00:01.00]One")).toBe("One");
  });

  it("leaves plain text alone", () => {
    expect(stripTimestamps("Plain words")).toBe("Plain words");
  });
});

describe("hasLyrics", () => {
  it("is false for nothing, blank, or stamps alone", () => {
    expect(hasLyrics(undefined)).toBe(false);
    expect(hasLyrics("")).toBe(false);
    expect(hasLyrics("   \n  ")).toBe(false);
    expect(hasLyrics("[ar:Someone]")).toBe(false);
  });

  it("is true once there are words", () => {
    expect(hasLyrics("[00:01.00]Words")).toBe(true);
    expect(hasLyrics("Words")).toBe(true);
  });
});
