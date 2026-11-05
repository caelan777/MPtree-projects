import { describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/preferences", () => ({ Preferences: { get: async () => ({ value: null }), set: async () => {} } }));

import { openLicence, licenceChip } from "./discover";

describe("openLicence", () => {
  it("lets through what allows any use with credit", () => {
    expect(openLicence("http://creativecommons.org/licenses/by/3.0/")).toBe("CC BY 3.0");
    expect(openLicence("https://creativecommons.org/licenses/by-sa/2.5/")).toBe("CC BY-SA 2.5");
    expect(openLicence("http://creativecommons.org/publicdomain/zero/1.0/")).toBe("CC0");
    expect(openLicence("http://creativecommons.org/publicdomain/mark/1.0/")).toBe("Public domain");
  });
  it("never lets through non-commercial or no-derivatives", () => {
    expect(openLicence("http://creativecommons.org/licenses/by-nc/3.0/")).toBeNull();
    expect(openLicence("http://creativecommons.org/licenses/by-nc-sa/3.0/")).toBeNull();
    expect(openLicence("http://creativecommons.org/licenses/by-nd/3.0/")).toBeNull();
    expect(openLicence("http://creativecommons.org/licenses/by-nc-nd/2.5/")).toBeNull();
    expect(openLicence(undefined)).toBeNull();
    expect(openLicence("")).toBeNull();
  });
});

describe("licenceChip", () => {
  it("is short", () => {
    expect(licenceChip("CC BY 3.0")).toBe("CC BY");
    expect(licenceChip("CC BY-SA 2.5")).toBe("CC BY-SA");
    expect(licenceChip("CC0")).toBe("CC0");
    expect(licenceChip("Public domain")).toBe("PD");
    expect(licenceChip("")).toBe("OML");
  });
});
