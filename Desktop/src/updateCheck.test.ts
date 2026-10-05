import { describe, it, expect } from "vitest";
import { isNewer } from "./updateCheck";

// isNewer decides whether anyone is told about an update at all. Getting it
// wrong is quiet in both directions: too eager and everyone is nagged forever,
// too shy and nobody ever hears about a release.
describe("isNewer", () => {
  it("sees a newer patch, minor and major", () => {
    expect(isNewer("0.1.3", "0.1.2")).toBe(true);
    expect(isNewer("0.2.0", "0.1.9")).toBe(true);
    expect(isNewer("1.0.0", "0.9.9")).toBe(true);
  });

  it("says no to the same version", () => {
    expect(isNewer("0.1.2", "0.1.2")).toBe(false);
  });

  it("says no to an older version", () => {
    expect(isNewer("0.1.1", "0.1.2")).toBe(false);
    expect(isNewer("0.9.9", "1.0.0")).toBe(false);
  });

  it("compares numerically, not as text", () => {
    // The string comparison everyone writes by accident says "0.1.10" < "0.1.9".
    expect(isNewer("0.1.10", "0.1.9")).toBe(true);
    expect(isNewer("0.1.9", "0.1.10")).toBe(false);
  });

  it("treats a missing segment as zero", () => {
    expect(isNewer("0.2", "0.1.9")).toBe(true);
    expect(isNewer("0.1", "0.1.0")).toBe(false);
  });

  it("does not announce an update for unparseable input", () => {
    // A malformed manifest must fail closed. Nagging people about a version
    // that does not exist is worse than staying quiet.
    expect(isNewer("", "0.1.2")).toBe(false);
    expect(isNewer("banana", "0.1.2")).toBe(false);
  });
});
