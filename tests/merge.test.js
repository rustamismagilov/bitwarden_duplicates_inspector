import { describe, it, expect } from "vitest";
import { mergeSameAccountGroup, buildExport, resolveGroup, resolveGroupEntries, mergeConcerns } from "../src/core/merge.js";
import { computeDuplicateGroups } from "../src/core/dedup.js";

import simpleDupe from "./fixtures/simple-dupe.json" with { type: "json" };
import conflictingPwd from "./fixtures/conflicting-passwords.json" with { type: "json" };
import realisticDupes from "./fixtures/realistic-dupes.json" with { type: "json" };
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

  it("keeps the same URI with different match rules as separate URIs", () => {
    const merged = mergeSameAccountGroup([
      { id: "a", type: 1, creationDate: "2019-01-01", login: { username: "u", uris: [{ match: null, uri: "https://a.com" }] } },
      { id: "b", type: 1, creationDate: "2020-01-01", login: { username: "u", uris: [{ match: 3, uri: "https://a.com" }, { match: null, uri: "https://a.com" }] } }
    ]);
    expect(merged.login.uris).toEqual([
      { match: null, uri: "https://a.com" },
      { match: 3, uri: "https://a.com" }
    ]);
  });

  it("adds no password section to notes when all passwords are identical", () => {
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

  it("takes the password from another entry when the oldest has none", () => {
    for (const empty of [null, ""]) {
      const merged = mergeSameAccountGroup([
        { id: "old", type: 1, creationDate: "2019-01-01", login: { username: "u", password: empty, uris: [] } },
        { id: "new", type: 1, creationDate: "2024-01-01", login: { username: "u", password: "only-pw", uris: [] } }
      ]);
      expect(merged.id).toBe("old");
      expect(merged.login.password).toBe("only-pw");
      expect(merged.notes ?? "").not.toMatch(/Additional passwords/);
    }
  });

  it("keeps the other passwords in notes when the oldest entry has none", () => {
    const merged = mergeSameAccountGroup([
      { id: "old", type: 1, creationDate: "2019-01-01", login: { username: "u", password: "", uris: [] } },
      { id: "mid", type: 1, creationDate: "2020-01-01", login: { username: "u", password: "mid-pw", uris: [] } },
      { id: "new", type: 1, creationDate: "2024-01-01", login: { username: "u", password: "new-pw", uris: [] } }
    ]);
    expect(merged.login.password).toBe("mid-pw");
    expect(merged.notes).toBe("Additional passwords seen in merged entries:\nnew-pw");
  });

  it("lists each extra password on its own line", () => {
    const merged = mergeSameAccountGroup([
      { id: "a", type: 1, creationDate: "2019-01-01", login: { username: "u", password: "base", uris: [] } },
      { id: "b", type: 1, creationDate: "2020-01-01", login: { username: "u", password: "has, comma", uris: [] } },
      { id: "c", type: 1, creationDate: "2021-01-01", login: { username: "u", password: "plain", uris: [] } }
    ]);
    expect(merged.notes).toBe("Additional passwords seen in merged entries:\nhas, comma\nplain");
  });

  it("never keeps an entry without dates over a dated one", () => {
    const merged = mergeSameAccountGroup([
      { id: "undated", type: 1, login: { username: "u", password: "a", uris: [] } },
      { id: "dated", type: 1, creationDate: "2019-01-01", login: { username: "u", password: "b", uris: [] } }
    ]);
    expect(merged.id).toBe("dated");
  });

  it("does not repeat a note that differs only in surrounding whitespace", () => {
    const merged = mergeSameAccountGroup([
      { id: "a", type: 1, creationDate: "2019-01-01", notes: "pin 1234\n", login: { username: "u", password: "p", uris: [] } },
      { id: "b", type: 1, creationDate: "2020-01-01", notes: "pin 1234", login: { username: "u", password: "p", uris: [] } }
    ]);
    expect(merged.notes).toBe("pin 1234\n");
  });

  it("keeps notes that are not text as text instead of crashing", () => {
    const merged = mergeSameAccountGroup([
      { id: "a", type: 1, creationDate: "2019-01-01", notes: 1234, login: { username: "u", password: "p", uris: [] } },
      { id: "b", type: 1, creationDate: "2020-01-01", notes: "real note", login: { username: "u", password: "p", uris: [] } },
      { id: "c", type: 1, creationDate: "2021-01-01", notes: { pin: 1 }, login: { username: "u", password: "p", uris: [] } }
    ]);
    expect(merged.notes).toBe('1234\n\n---\nreal note\n\n---\n{"pin":1}');
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

describe("mergeSameAccountGroup on a realistic export", () => {
  const [oldBare, newWith2fa] = realisticDupes.items;
  const sourceSnapshot = structuredClone([oldBare, newWith2fa]);
  const merged = mergeSameAccountGroup([oldBare, newWith2fa]);

  it("keeps the oldest entry as the base", () => {
    expect(merged.id).toBe("old-bare");
    expect(merged.folderId).toBe("f-work");
    expect(merged.login.password).toBe("old-pw");
  });

  it("carries the TOTP secret over from the newer entry", () => {
    expect(merged.login.totp).toBe(newWith2fa.login.totp);
  });

  it("carries passkeys over from the newer entry", () => {
    expect(merged.login.fido2Credentials).toEqual(newWith2fa.login.fido2Credentials);
  });

  it("carries custom fields over from the newer entry", () => {
    expect(merged.fields).toEqual(newWith2fa.fields);
  });

  it("carries password history over from the newer entry", () => {
    expect(merged.passwordHistory).toEqual(newWith2fa.passwordHistory);
  });

  it("keeps master password reprompt when any merged entry had it", () => {
    expect(merged.reprompt).toBe(1);
  });

  it("keeps URI match types from the newer entry", () => {
    expect(merged.login.uris).toEqual([
      { match: null, uri: "https://github.com/login" },
      { match: 3, uri: "https://github.com/sessions/two-factor" }
    ]);
  });

  it("keeps the newer password and notes in notes", () => {
    expect(merged.notes).toBe(
      "recovery codes are in the fields\n\n---\nAdditional passwords seen in merged entries:\ncurrent-pw"
    );
  });

  it("does not modify the source entries", () => {
    expect([oldBare, newWith2fa]).toEqual(sourceSnapshot);
    expect(oldBare.login.totp).toBeNull();
  });
});

describe("mergeSameAccountGroup field conflicts", () => {
  const entry = (id, date, extra = {}, login = {}) => ({
    id, type: 1, creationDate: date, revisionDate: date, ...extra,
    login: { username: "u", password: "p", uris: [], ...login }
  });

  it("keeps the kept entry's TOTP and lists the others in notes", () => {
    const merged = mergeSameAccountGroup([
      entry("a", "2019-01-01", {}, { totp: "otpauth://totp/A" }),
      entry("b", "2020-01-01", {}, { totp: "otpauth://totp/B" }),
      entry("c", "2021-01-01", {}, { totp: "otpauth://totp/A" })
    ]);
    expect(merged.login.totp).toBe("otpauth://totp/A");
    expect(merged.notes).toBe("Additional TOTP secrets seen in merged entries:\notpauth://totp/B");
  });

  it("unions custom fields without repeating identical ones", () => {
    const pin = { name: "PIN", value: "1234", type: 1, linkedId: null };
    const merged = mergeSameAccountGroup([
      entry("a", "2019-01-01", { fields: [pin] }),
      entry("b", "2020-01-01", { fields: [{ ...pin }, { name: "PIN", value: "9999", type: 1, linkedId: null }] })
    ]);
    expect(merged.fields.map(f => f.value)).toEqual(["1234", "9999"]);
  });

  it("merges password history newest first with one entry per password", () => {
    const merged = mergeSameAccountGroup([
      entry("a", "2019-01-01", { passwordHistory: [{ lastUsedDate: "2019-06-01T00:00:00.000Z", password: "x" }] }),
      entry("b", "2020-01-01", { passwordHistory: [
        { lastUsedDate: "2021-06-01T00:00:00.000Z", password: "y" },
        { lastUsedDate: "2020-06-01T00:00:00.000Z", password: "x" }
      ] })
    ]);
    expect(merged.passwordHistory).toEqual([
      { lastUsedDate: "2021-06-01T00:00:00.000Z", password: "y" },
      { lastUsedDate: "2020-06-01T00:00:00.000Z", password: "x" }
    ]);
  });

  it("keeps the 5 newest history entries and moves older ones to notes", () => {
    const h = (pw, day) => ({ lastUsedDate: `2020-01-${String(day).padStart(2, "0")}T00:00:00.000Z`, password: pw });
    const merged = mergeSameAccountGroup([
      entry("a", "2019-01-01", { passwordHistory: [h("h1", 1), h("h3", 3), h("h5", 5), h("h7", 7)] }),
      entry("b", "2020-01-01", { passwordHistory: [h("h2", 2), h("h4", 4), h("h6", 6)] })
    ]);
    expect(merged.passwordHistory.map(x => x.password)).toEqual(["h7", "h6", "h5", "h4", "h3"]);
    expect(merged.notes).toBe("Older password history from merged entries:\nh2\nh1");
  });

  it("keeps the passkeys of one entry and names the others in notes, without their keys", () => {
    const merged = mergeSameAccountGroup([
      entry("a", "2019-01-01", {}, { fido2Credentials: [{ credentialId: "one", rpId: "x.com", keyValue: "k1" }] }),
      entry("b", "2020-01-01", {}, { fido2Credentials: [
        { credentialId: "one", rpId: "x.com", keyValue: "k1" },
        { credentialId: "two", rpId: "x.com", userName: "u", creationDate: "2024-05-05T00:00:00.000Z", keyValue: "secret-key" }
      ] })
    ]);
    expect(merged.login.fido2Credentials.map(c => c.credentialId)).toEqual(["one"]);
    expect(merged.notes).toBe("Passkeys dropped by the merge, register them again if you still need them:\nx.com, u, created 2024-05-05");
    expect(merged.notes).not.toContain("secret-key");
  });

  it("takes the passkeys of the oldest entry that has any when the kept entry has none", () => {
    const merged = mergeSameAccountGroup([
      entry("a", "2019-01-01", {}, { fido2Credentials: [] }),
      entry("b", "2020-01-01", {}, { fido2Credentials: [{ credentialId: "b1", rpId: "x.com" }] }),
      entry("c", "2021-01-01", {}, { fido2Credentials: [{ credentialId: "c1", rpId: "x.com" }] })
    ]);
    expect(merged.id).toBe("a");
    expect(merged.login.fido2Credentials.map(c => c.credentialId)).toEqual(["b1"]);
    expect(merged.notes).toBe("Passkeys dropped by the merge, register them again if you still need them:\nx.com");
  });

  it("unions collection ids and ignores the null placeholder", () => {
    const merged = mergeSameAccountGroup([
      entry("a", "2019-01-01", { organizationId: "o1", collectionIds: ["c1"] }),
      entry("b", "2020-01-01", { organizationId: "o1", collectionIds: [null, "c2", "c1"] })
    ]);
    expect(merged.collectionIds).toEqual(["c1", "c2"]);
  });

  it("keeps the merged entry active when any merged entry was not archived", () => {
    const merged = mergeSameAccountGroup([
      entry("old", "2019-01-01", { archivedDate: "2022-01-01T00:00:00.000Z" }),
      entry("new", "2020-01-01", { archivedDate: null })
    ]);
    expect(merged.id).toBe("old");
    expect(merged.archivedDate).toBeNull();
  });

  it("keeps the merged entry archived when every merged entry was", () => {
    const merged = mergeSameAccountGroup([
      entry("old", "2019-01-01", { archivedDate: "2022-01-01T00:00:00.000Z" }),
      entry("new", "2020-01-01", { archivedDate: "2023-01-01T00:00:00.000Z" })
    ]);
    expect(merged.archivedDate).toBe("2022-01-01T00:00:00.000Z");
  });

  it("puts an unfiled kept entry into the folder of the oldest entry that has one", () => {
    const merged = mergeSameAccountGroup([
      entry("old", "2019-01-01", { folderId: null }),
      entry("mid", "2020-01-01", { folderId: "f-work" }),
      entry("new", "2021-01-01", { folderId: "f-home" })
    ]);
    expect(merged.folderId).toBe("f-work");
  });

  it("leaves the kept entry's own folder alone", () => {
    const merged = mergeSameAccountGroup([
      entry("old", "2019-01-01", { folderId: "f-home" }),
      entry("new", "2020-01-01", { folderId: "f-work" })
    ]);
    expect(merged.folderId).toBe("f-home");
  });

  it("leaves the null collection placeholder alone when there is nothing to add", () => {
    const merged = mergeSameAccountGroup([
      entry("a", "2019-01-01", { collectionIds: [null] }),
      entry("b", "2020-01-01", { collectionIds: [null] })
    ]);
    expect(merged.collectionIds).toEqual([null]);
  });
});

describe("mergeConcerns", () => {
  const login = (id, date, extra = {}, passkeys) => ({
    id, type: 1, creationDate: date, ...extra,
    login: { username: "u", password: "p", uris: [], fido2Credentials: passkeys }
  });

  it("finds nothing for ordinary duplicates", () => {
    expect(mergeConcerns([login("a", "2019-01-01", { collectionIds: null }), login("b", "2020-01-01", { collectionIds: [null] })])).toEqual([]);
  });

  it("flags passkeys only when a merge would drop one", () => {
    const one = { credentialId: "one", rpId: "x.com" };
    const two = { credentialId: "two", rpId: "x.com" };
    expect(mergeConcerns([login("a", "2019-01-01", {}, [one]), login("b", "2020-01-01", {}, [one])])).toEqual([]);
    expect(mergeConcerns([login("a", "2019-01-01", {}, []), login("b", "2020-01-01", {}, [two])])).toEqual([]);
    expect(mergeConcerns([login("a", "2019-01-01", {}, [one]), login("b", "2020-01-01", {}, [two])])).toEqual(["passkeys"]);
  });

  it("does not mistake different passkeys with an empty id for the same one", () => {
    const blank = key => ({ credentialId: "", rpId: "x.com", keyValue: key });
    expect(mergeConcerns([login("a", "2019-01-01", {}, [blank("k1")]), login("b", "2020-01-01", {}, [blank("k2")])])).toEqual(["passkeys"]);
    const merged = mergeSameAccountGroup([login("a", "2019-01-01", {}, [blank("k1")]), login("b", "2020-01-01", {}, [blank("k2")])]);
    expect(merged.notes).toBe("Passkeys dropped by the merge, register them again if you still need them:\nx.com");
  });

  it("flags entries that sit in different collections", () => {
    expect(mergeConcerns([
      login("a", "2019-01-01", { organizationId: "o", collectionIds: ["c1"] }),
      login("b", "2020-01-01", { organizationId: "o", collectionIds: ["c2"] })
    ])).toEqual(["collections"]);
    expect(mergeConcerns([
      login("a", "2019-01-01", { organizationId: "o", collectionIds: ["c1", "c2"] }),
      login("b", "2020-01-01", { organizationId: "o", collectionIds: ["c2", "c1"] })
    ])).toEqual([]);
  });
});

describe("resolveGroup", () => {
  it("returns exactly the entries the export writes for that group", () => {
    const entry = (id, date, pw, notes) => ({ id, type: 1, name: "Amazon", creationDate: date, revisionDate: date, notes,
      login: { username: "me@x.com", password: pw, uris: [{ match: null, uri: "https://amazon.com" }] } });
    const items = [
      entry("c1", "2018-01-01", "old-pw", "first"),
      entry("c2", "2020-01-01", "mid-pw", ""),
      entry("c3", "2024-01-01", "new-pw", "third")
    ];
    const groups = computeDuplicateGroups(items);
    expect(groups).toHaveLength(1);
    for (const marks of [
      { itemsToMerge: new Set([1, 2]), itemsToDelete: new Set([0]) },
      { itemsToMerge: new Set([0, 1, 2]), itemsToDelete: new Set() },
      { itemsToMerge: new Set([2]), itemsToDelete: new Set([1]) }
    ]) {
      const exported = buildExport({ vaultData: { encrypted: false, folders: [], items }, items, duplicateGroups: groups, ...marks });
      const preview = resolveGroup(items, groups[0], marks.itemsToMerge, marks.itemsToDelete);
      expect(preview).toEqual(exported.items);
    }
  });

  it("tells which entry each result comes from", () => {
    const vault = structuredClone(simpleDupe);
    const groups = computeDuplicateGroups(vault.items);
    const entries = resolveGroupEntries(vault.items, groups[0], new Set([0, 1]), new Set());
    expect(entries.map(e => [e.index, e.item.id])).toEqual([[0, "a1"]]);
    expect(resolveGroupEntries(vault.items, groups[0], new Set(), new Set([0])).map(e => e.index)).toEqual([1]);
  });

  it("returns an empty list when every entry is deleted", () => {
    const vault = structuredClone(simpleDupe);
    const groups = computeDuplicateGroups(vault.items);
    expect(resolveGroup(vault.items, groups[0], new Set(), new Set([0, 1]))).toEqual([]);
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

  it("keeps entries in their original order and puts the merged entry where the kept one was", () => {
    const at = (id, date, user) => ({ id, type: 1, name: id, creationDate: date, revisionDate: date,
      login: { username: user, password: "p", uris: [{ match: null, uri: "https://x.com" }] } });
    const items = [
      at("lonely", "2020-01-01", "solo"),
      at("newer", "2022-01-01", "u"),
      at("between", "2020-01-01", "other"),
      at("older", "2021-01-01", "u"),
      at("last", "2020-01-01", "someone")
    ];
    const groups = computeDuplicateGroups(items);
    const result = buildExport({
      vaultData: { encrypted: false, folders: [], items },
      items, duplicateGroups: groups,
      itemsToMerge: new Set([1, 3]), itemsToDelete: new Set()
    });
    expect(result.items.map(it => it.id)).toEqual(["lonely", "between", "older", "last"]);
  });

  it("keeps a lone merge mark in a group as an ordinary entry", () => {
    const items = JSON.parse(JSON.stringify(simpleDupe.items));
    const result = buildExport({
      vaultData: { encrypted: false, folders: [], items },
      items, duplicateGroups: computeDuplicateGroups(items),
      itemsToMerge: new Set([1]), itemsToDelete: new Set()
    });
    expect(result.items).toEqual(items);
  });

  it("drops a merge-marked entry that is also marked for deletion", () => {
    const entry = (id, date, pw, notes) => ({ id, type: 1, name: "Amazon", creationDate: date, revisionDate: date, notes,
      login: { username: "me@x.com", password: pw, uris: [{ match: null, uri: "https://amazon.com" }] } });
    const items = [
      entry("c1", "2018-01-01", "old-pw", "first"),
      entry("c2", "2020-01-01", "mid-pw", ""),
      entry("c3", "2024-01-01", "new-pw", "third")
    ];
    const result = buildExport({
      vaultData: { encrypted: false, folders: [], items },
      items, duplicateGroups: computeDuplicateGroups(items),
      itemsToMerge: new Set([0, 1, 2]), itemsToDelete: new Set([0])
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("c2");
    expect(result.items[0].notes).toMatch(/new-pw/);
    expect(result.items[0].notes).not.toMatch(/old-pw/);
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
