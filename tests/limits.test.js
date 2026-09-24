import { describe, it, expect } from "vitest";
import { encryptedLength, findOversizedFields, importSizeProblems } from "../src/core/limits.js";
import { mergeSameAccountGroup } from "../src/core/merge.js";

describe("encryptedLength", () => {
  it("matches the length of a real encrypted string", () => {
    // "2." + 24 char iv + "|" + 24 char data + "|" + 44 char mac
    expect(encryptedLength("")).toBe(96);
    expect(encryptedLength("a".repeat(15))).toBe(96);
    expect(encryptedLength("a".repeat(16))).toBe(116);
  });

  it("counts bytes, not characters", () => {
    expect(encryptedLength("ж".repeat(8))).toBe(encryptedLength("a".repeat(16)));
  });

  it("puts the notes limit at 7439 bytes of text", () => {
    expect(encryptedLength("a".repeat(7439))).toBeLessThanOrEqual(10000);
    expect(encryptedLength("a".repeat(7440))).toBeGreaterThan(10000);
  });
});

describe("importSizeProblems", () => {
  const many = n => Array.from({ length: n }, (_, i) => ({ id: String(i) }));

  it("accepts a personal export within the bitwarden.com limits", () => {
    expect(importSizeProblems({ items: many(7000), folders: many(2000) })).toEqual([]);
  });

  it("reports too many entries or folders", () => {
    expect(importSizeProblems({ items: many(7001), folders: many(2001) })).toEqual([
      "7001 entries, bitwarden.com imports at most 7000 at once",
      "2001 folders, bitwarden.com imports at most 2000 at once"
    ]);
  });

  it("leaves organization exports alone, their limits are set per server", () => {
    expect(importSizeProblems({ items: many(9000), collections: [] })).toEqual([]);
  });
});

describe("findOversizedFields", () => {
  it("finds nothing in ordinary entries", () => {
    expect(findOversizedFields([
      { name: "GitHub", notes: "short", login: { username: "u", password: "p", uris: [{ uri: "https://github.com" }] } },
      { name: "Note", type: 2, notes: null }
    ])).toEqual([]);
  });

  it("flags notes that only become too long after a merge", () => {
    const note = "x".repeat(4000);
    const items = [
      { id: "a", type: 1, name: "Big", creationDate: "2020-01-01", notes: note, login: { username: "u", password: "p" } },
      { id: "b", type: 1, name: "Big", creationDate: "2021-01-01", notes: note + " more", login: { username: "u", password: "p" } }
    ];
    expect(findOversizedFields(items)).toEqual([]);
    expect(findOversizedFields([mergeSameAccountGroup(items)])).toEqual([{ name: "Big", field: "Notes" }]);
  });

  it("checks passwords, custom fields and URIs too", () => {
    expect(findOversizedFields([{
      name: "Huge",
      fields: [{ name: "key", value: "k".repeat(4000), type: 1 }],
      login: { password: "p".repeat(4000), uris: [{ uri: "https://x.com/" + "q".repeat(8000) }] }
    }])).toEqual([
      { name: "Huge", field: "Password" },
      { name: "Huge", field: "URI" },
      { name: "Huge", field: "Custom field" }
    ]);
  });
});
