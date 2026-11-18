import { describe, expect, it } from "vitest";
import { indexById } from "./utils";

describe("indexById", () => {
  it("finds every song by its id, in one pass", () => {
    const m = indexById([{ id: "a", n: 1 }, { id: "b", n: 2 }]);
    expect(m.get("b")?.n).toBe(2);
    expect(m.get("c")).toBeUndefined();
  });
  it("keeps the first of two songs with one id, as find() did", () => {
    const m = indexById([{ id: "a", n: 1 }, { id: "a", n: 2 }]);
    expect(m.get("a")?.n).toBe(1);
  });
});
