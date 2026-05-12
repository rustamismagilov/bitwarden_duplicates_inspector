import { describe, it, expect } from "vitest";
import { mergeSameAccountGroup, shareUrisWithinSite, buildExport } from "../src/core/merge.js";
import { computeDuplicateGroups } from "../src/core/dedup.js";

import simpleDupe from "./fixtures/simple-dupe.json" with { type: "json" };
import conflictingPwd from "./fixtures/conflicting-passwords.json" with { type: "json" };
import bitwardenSample from "./fixtures/bitwarden-sample.json" with { type: "json" };

describe("mergeSameAccountGroup", () => {
  it("throws on empty input", () => {
    expect(() => mergeSameAccountGroup([])).toThrow(/empty list/);
  });

  it("picks the entry with the oldest creationDate as base", () => {
    const merged = mergeSameAccountGroup(simpleDupe.items);
    expect(merged.id).toBe("a1");
    expect(merged.creationDate).toBe("2020-01-01T00:00:00.000Z");
  });

  it("deduplicates URIs by (match, uri) tuple across source entries", () => {
    const merged = mergeSameAccountGroup(simpleDupe.items);
    const uriStrings = merged.login.uris.map(u => u.uri).sort();
    expect(uriStrings).toEqual([
      "https://google.com",
      "https://www.google.com/account"
    ]);
  });

  it("sets favorite to true when any source entry was favorited", () => {
    const merged = mergeSameAccountGroup(simpleDupe.items);
    expect(merged.favorite).toBe(true);
  });

  it("does NOT change notes when all passwords are identical", () => {
    const merged = mergeSameAccountGroup(simpleDupe.items);
    expect(merged.notes).toBe("secondary");
    expect(merged.notes).not.toMatch(/Additional passwords/);
  });

  it("appends 'Additional passwords seen' to notes when passwords differ", () => {
    const merged = mergeSameAccountGroup(conflictingPwd.items);
    expect(merged.notes).toMatch(/Additional passwords seen in merged entries/);
    expect(merged.notes).toMatch(/mid-pw/);
    expect(merged.notes).toMatch(/new-pw/);
  });

  it("preserves the oldest entry's password as base password", () => {
    const merged = mergeSameAccountGroup(conflictingPwd.items);
    expect(merged.login.password).toBe("old-pw");
  });

  it("does not duplicate identical note chunks", () => {
    const items = [
      { id: "a", type: 1, name: "x", creationDate: "2020-01-01", revisionDate: "2020-01-01",
        favorite: false, notes: "same note",
        login: { username: "u@x.com", password: "p", uris: [] } },
      { id: "b", type: 1, name: "x", creationDate: "2020-02-01", revisionDate: "2020-02-01",
        favorite: false, notes: "same note",
        login: { username: "u@x.com", password: "p", uris: [] } }
    ];
    const merged = mergeSameAccountGroup(items);
    expect((merged.notes.match(/same note/g) || []).length).toBe(1);
  });
});

describe("shareUrisWithinSite", () => {
  it("shares the union of URIs among entries on the same canonical site", () => {
    const items = [
      { type: 1, name: "x", login: { username: "u@x.com", uris: [{ match: null, uri: "https://x.com/a" }] } },
      { type: 1, name: "x", login: { username: "u@x.com", uris: [{ match: null, uri: "https://x.com/b" }] } }
    ];
    shareUrisWithinSite(items);
    const uris0 = items[0].login.uris.map(u => u.uri).sort();
    const uris1 = items[1].login.uris.map(u => u.uri).sort();
    expect(uris0).toEqual(["https://x.com/a", "https://x.com/b"]);
    expect(uris1).toEqual(["https://x.com/a", "https://x.com/b"]);
  });

  it("does not cross sites", () => {
    const items = [
      { type: 1, name: "x", login: { username: "u@x.com", uris: [{ match: null, uri: "https://x.com" }] } },
      { type: 1, name: "y", login: { username: "u@y.com", uris: [{ match: null, uri: "https://y.com" }] } }
    ];
    shareUrisWithinSite(items);
    expect(items[0].login.uris.map(u => u.uri)).toEqual(["https://x.com"]);
    expect(items[1].login.uris.map(u => u.uri)).toEqual(["https://y.com"]);
  });
});

describe("buildExport", () => {
  it("throws when vaultData is missing", () => {
    expect(() => buildExport({
      vaultData: null, items: [], duplicateGroups: [],
      itemsToMerge: new Set(), itemsToDelete: new Set()
    })).toThrow();
  });

  it("preserves entries not in any group, not deleted, not merged", () => {
    const vault = {
      encrypted: false, folders: [],
      items: [
        { id: "k", type: 1, name: "Lonely", creationDate: "2020-01-01", revisionDate: "2020-01-01",
          login: { username: "u@k.com", uris: [{ match: null, uri: "https://k.com" }] } }
      ]
    };
    const result = buildExport({
      vaultData: vault, items: vault.items, duplicateGroups: [],
      itemsToMerge: new Set(), itemsToDelete: new Set()
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("k");
  });

  it("clears folderId on all output items", () => {
    const vault = {
      encrypted: false, folders: [{ id: "f1", name: "F" }],
      items: [
        { id: "k", type: 1, name: "X", folderId: "f1", creationDate: "2020-01-01", revisionDate: "2020-01-01",
          login: { username: "u@x.com", uris: [{ match: null, uri: "https://x.com" }] } }
      ]
    };
    const result = buildExport({
      vaultData: vault, items: vault.items, duplicateGroups: [],
      itemsToMerge: new Set(), itemsToDelete: new Set()
    });
    expect(result.items[0].folderId).toBeNull();
    expect(result.folders).toEqual([]);
  });

  it("excludes items in itemsToDelete from output", () => {
    const items = [
      { id: "a", type: 1, name: "X", creationDate: "2020-01-01", revisionDate: "2020-01-01",
        login: { username: "u@x.com", uris: [{ match: null, uri: "https://x.com" }] } },
      { id: "b", type: 1, name: "X", creationDate: "2020-02-01", revisionDate: "2020-02-01",
        login: { username: "u@x.com", uris: [{ match: null, uri: "https://x.com" }] } }
    ];
    const groups = computeDuplicateGroups(items);
    const result = buildExport({
      vaultData: { encrypted: false, folders: [], items },
      items, duplicateGroups: groups,
      itemsToMerge: new Set(),
      itemsToDelete: new Set([1])
    });
    expect(result.items.map(it => it.id)).toEqual(["a"]);
  });

  it("merges items in itemsToMerge into a single kept entry", () => {
    const items = JSON.parse(JSON.stringify(simpleDupe.items));
    const groups = computeDuplicateGroups(items);
    const allIndices = groups.flatMap(g => g.indices);
    const result = buildExport({
      vaultData: { encrypted: false, folders: [], items },
      items, duplicateGroups: groups,
      itemsToMerge: new Set(allIndices),
      itemsToDelete: new Set()
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("a1");
  });

  it("preserves original vaultData shape (encrypted flag)", () => {
    const result = buildExport({
      vaultData: { encrypted: false, folders: [], items: [] },
      items: [], duplicateGroups: [],
      itemsToMerge: new Set(), itemsToDelete: new Set()
    });
    expect(result.encrypted).toBe(false);
    expect(result.folders).toEqual([]);
  });

  it("passes the real Bitwarden sample through unchanged when nothing is selected", () => {
    const items = JSON.parse(JSON.stringify(bitwardenSample.items));
    const result = buildExport({
      vaultData: bitwardenSample,
      items,
      duplicateGroups: [],
      itemsToMerge: new Set(),
      itemsToDelete: new Set(),
    });
    expect(result.items).toHaveLength(bitwardenSample.items.length);
    const ids = result.items.map(it => it.id).sort();
    const expectedIds = bitwardenSample.items.map(it => it.id).sort();
    expect(ids).toEqual(expectedIds);
  });
});
