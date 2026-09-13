import { describe, it, expect } from "vitest";
import { mergeSameAccountGroup, buildExport } from "../src/core/merge.js";
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

  it("keeps numeric match values on merged URIs", () => {
    const merged = mergeSameAccountGroup([
      { id: "a", type: 1, creationDate: "2020-01-01", login: { username: "u", uris: [{ match: 0, uri: "https://a.com" }] } },
      { id: "b", type: 1, creationDate: "2021-01-01", login: { username: "u", uris: [{ match: 3, uri: "https://a.com/login" }, { match: null, uri: "https://a.com/x" }] } }
    ]);
    expect(merged.login.uris).toEqual([
      { match: 0, uri: "https://a.com" },
      { match: 3, uri: "https://a.com/login" },
      { match: null, uri: "https://a.com/x" }
    ]);
  });

  it("keeps URIs that contain a double colon intact", () => {
    const merged = mergeSameAccountGroup([
      { id: "a", type: 1, creationDate: "2020-01-01", login: { username: "u", uris: [{ match: null, uri: "https://nas.lan" }] } },
      { id: "b", type: 1, creationDate: "2021-01-01", login: { username: "u", uris: [{ match: null, uri: "https://[fe80::1]:5001/login" }] } }
    ]);
    expect(merged.login.uris.map(u => u.uri)).toEqual(["https://nas.lan", "https://[fe80::1]:5001/login"]);
  });

  it("does not share URI objects with the source entries", () => {
    const items = [
      { id: "a", type: 1, creationDate: "2020-01-01", login: { username: "u", uris: [] } },
      { id: "b", type: 1, creationDate: "2021-01-01", login: { username: "u", uris: [{ match: null, uri: "https://a.com" }] } }
    ];
    const merged = mergeSameAccountGroup(items);
    merged.login.uris[0].uri = "changed";
    expect(items[1].login.uris[0].uri).toBe("https://a.com");
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

  it("keeps folders and each item's folderId", () => {
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
    expect(result.items[0].folderId).toBe("f1");
    expect(result.folders).toEqual([{ id: "f1", name: "F" }]);
  });

  it("does not add a folders key to an organization export", () => {
    const vault = {
      encrypted: false, collections: [{ id: "c1", name: "Team" }],
      items: [
        { id: "k", type: 1, name: "X", organizationId: "o1", collectionIds: ["c1"],
          creationDate: "2020-01-01", revisionDate: "2020-01-01",
          login: { username: "u@x.com", uris: [{ match: null, uri: "https://x.com" }] } }
      ]
    };
    const result = buildExport({
      vaultData: vault, items: vault.items, duplicateGroups: [],
      itemsToMerge: new Set(), itemsToDelete: new Set()
    });
    expect(Object.keys(result).sort()).toEqual(["collections", "encrypted", "items"]);
    expect(result.items[0].collectionIds).toEqual(["c1"]);
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
    const vault = structuredClone(bitwardenSample);
    const result = buildExport({
      vaultData: vault,
      items: vault.items,
      duplicateGroups: computeDuplicateGroups(vault.items),
      itemsToMerge: new Set(),
      itemsToDelete: new Set(),
    });
    expect(result).toEqual(bitwardenSample);
  });

  it("does not copy URIs between different accounts on the same site", () => {
    const items = [
      { id: "alice", type: 1, name: "GitHub", creationDate: "2020-01-01", revisionDate: "2020-01-01",
        login: { username: "alice", uris: [{ match: null, uri: "https://github.com/login" }] } },
      { id: "bob", type: 1, name: "GitHub", creationDate: "2020-01-01", revisionDate: "2020-01-01",
        login: { username: "bob", uris: [{ match: null, uri: "https://github.com/enterprise" }] } }
    ];
    const result = buildExport({
      vaultData: { encrypted: false, folders: [], items },
      items, duplicateGroups: computeDuplicateGroups(items),
      itemsToMerge: new Set(), itemsToDelete: new Set()
    });
    expect(result.items[0].login.uris.map(u => u.uri)).toEqual(["https://github.com/login"]);
    expect(result.items[1].login.uris.map(u => u.uri)).toEqual(["https://github.com/enterprise"]);
  });

  it("leaves the loaded items untouched, so a second export gives the same result", () => {
    const vault = {
      encrypted: false, folders: [{ id: "f1", name: "F" }],
      items: [
        { id: "a", type: 1, name: "X", folderId: "f1", creationDate: "2020-01-01", revisionDate: "2020-01-01",
          login: { username: "u@x.com", password: "p1", uris: [{ match: null, uri: "https://x.com/a" }] } },
        { id: "b", type: 1, name: "X", folderId: null, creationDate: "2021-01-01", revisionDate: "2021-01-01",
          login: { username: "u@x.com", password: "p2", uris: [{ match: 3, uri: "https://x.com/b" }] } },
        { id: "c", type: 1, name: "X", folderId: "f1", creationDate: "2022-01-01", revisionDate: "2022-01-01",
          login: { username: "u@x.com", password: "p1", uris: [{ match: null, uri: "https://x.com/c" }] } }
      ]
    };
    const snapshot = structuredClone(vault);
    const args = {
      vaultData: vault, items: vault.items, duplicateGroups: computeDuplicateGroups(vault.items),
      itemsToMerge: new Set([0, 1]), itemsToDelete: new Set()
    };
    const first = buildExport(args);
    expect(vault).toEqual(snapshot);
    expect(buildExport(args)).toEqual(first);
  });
});
