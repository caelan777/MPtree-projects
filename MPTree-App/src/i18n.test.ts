import { describe, it, expect } from "vitest";
import { NL } from "./i18n-nl";
import { ES } from "./i18n-es";
import { RU } from "./i18n-ru";

// A sentence that one language has and another lacks shows up in English in
// the middle of a translated screen. The two files must cover the same ground.
const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(" ");

describe("translations", () => {
  it("Spanish has every sentence Dutch has, and no others", () => {
    expect(Object.keys(ES).sort()).toEqual(Object.keys(NL).sort());
  });

  it("Russian has every sentence Dutch has, and no others", () => {
    expect(Object.keys(RU).sort()).toEqual(Object.keys(NL).sort());
  });

  it("Russian keeps every placeholder in each of its forms", () => {
    const broken = Object.entries(RU).filter(([en, own]) => own.split("|").some(f => placeholders(en) !== placeholders(f)));
    expect(broken).toEqual([]);
  });

  for (const [name, table] of [["Dutch", NL], ["Spanish", ES]] as const) {
    it(`${name} keeps every placeholder`, () => {
      const broken = Object.entries(table).filter(([en, own]) => placeholders(en) !== placeholders(own));
      expect(broken).toEqual([]);
    });
  }
});
