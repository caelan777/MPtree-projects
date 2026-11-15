import { describe, expect, it } from "vitest";
import { DriveError, isDriveFull } from "./drive";

describe("isDriveFull", () => {
  it("knows a full Google storage from a JSON call", () => {
    expect(isDriveFull(new DriveError(403, "storageQuotaExceeded"))).toBe(true);
  });
  it("knows it from a native song upload", () => {
    const e = new Error('HTTP 403 {"error":{"errors":[{"reason":"storageQuotaExceeded"}],"message":"The user\'s Drive storage quota has been exceeded."}}');
    expect(isDriveFull(e)).toBe(true);
  });
  it("does not take a rate limit or anything else for it", () => {
    expect(isDriveFull(new DriveError(403, "userRateLimitExceeded"))).toBe(false);
    expect(isDriveFull(new DriveError(403, "rateLimitExceeded"))).toBe(false);
    expect(isDriveFull(new DriveError(500, ""))).toBe(false);
    expect(isDriveFull(null)).toBe(false);
  });
});
