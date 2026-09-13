import { canonicalWebsiteKey } from "./dedup.js";

export function mergeSameAccountGroup(groupItems) {
  if (!groupItems.length) throw new Error("mergeSameAccountGroup called with empty list");

  function revKey(it) {
    return it.creationDate || it.revisionDate || "";
  }

  let baseSrc = groupItems[0];
  for (const it of groupItems) {
    if (revKey(it) < revKey(baseSrc)) baseSrc = it;
  }

  const base = JSON.parse(JSON.stringify(baseSrc));
  const allPasswords = new Set();
  const urisSeen = new Set();
  const notesChunks = [];

  function collectUris(item) {
    const login = item.login || {};
    const uris = Array.isArray(login.uris) ? login.uris : [];
    for (const u of uris) {
      const key = String(u.match ?? "") + "::" + String(u.uri ?? "");
      urisSeen.add(key);
    }
  }

  for (const it of groupItems) {
    const login = it.login || {};
    const pw = login.password || "";
    if (pw) allPasswords.add(pw);
    const notes = (it.notes || "").trim();
    if (notes) notesChunks.push(notes);
    collectUris(it);
    if (it.favorite) base.favorite = true;
  }

  const baseLogin = base.login || (base.login = {});
  if (!Array.isArray(baseLogin.uris)) baseLogin.uris = [];

  const existing = new Set(
    baseLogin.uris.map(u => String(u.match ?? "") + "::" + String(u.uri ?? ""))
  );
  for (const key of urisSeen) {
    if (!existing.has(key)) {
      const [matchPart, uriPart] = key.split("::");
      const matchVal = matchPart === "" ? null : matchPart;
      baseLogin.uris.push({ match: matchVal, uri: uriPart });
    }
  }

  const mergedNotes = [];
  if (base.notes) mergedNotes.push(base.notes);
  for (const n of notesChunks) {
    if (n && !mergedNotes.includes(n)) mergedNotes.push(n);
  }

  if (allPasswords.size > 1) {
    const basePw = baseLogin.password || "";
    const extraPw = Array.from(allPasswords).filter(p => p && p !== basePw);
    if (extraPw.length) {
      mergedNotes.push(
        "Additional passwords seen in merged entries: " +
        extraPw.join(", ")
      );
    }
  }

  if (mergedNotes.length) base.notes = mergedNotes.join("\n\n---\n");

  return base;
}

export function shareUrisWithinSite(itemsArr) {
  const sites = new Map();
  itemsArr.forEach(it => {
    const siteKey = canonicalWebsiteKey(it);
    if (!siteKey) return;
    if (!sites.has(siteKey)) sites.set(siteKey, []);
    sites.get(siteKey).push(it);
  });

  for (const [, siteItems] of sites.entries()) {
    const unionMap = new Map();

    for (const it of siteItems) {
      const login = it.login || {};
      const uris = Array.isArray(login.uris) ? login.uris : [];
      for (const u of uris) {
        const key = String(u.match ?? "") + "::" + String(u.uri ?? "");
        if (!unionMap.has(key)) {
          unionMap.set(key, {
            match: u.match ?? null,
            uri: u.uri ?? ""
          });
        }
      }
    }

    for (const it of siteItems) {
      const login = it.login || (it.login = {});
      if (!Array.isArray(login.uris)) login.uris = [];
      const existing = new Set(
        login.uris.map(u => String(u.match ?? "") + "::" + String(u.uri ?? ""))
      );
      for (const [key, val] of unionMap.entries()) {
        if (!existing.has(key)) {
          login.uris.push({ match: val.match, uri: val.uri });
        }
      }
    }
  }
}

export function buildExport({ vaultData, items, duplicateGroups, itemsToMerge, itemsToDelete }) {
  if (!vaultData || !Array.isArray(items)) {
    throw new Error("buildExport: vaultData and items[] are required");
  }

  const itemCount = items.length;
  const removed = new Array(itemCount).fill(false);
  const resultItems = [];

  duplicateGroups.forEach((g) => {
    const indices = g.indices;
    const kept = indices.filter(i => !itemsToDelete.has(i));
    const toMerge = kept.filter(i => itemsToMerge.has(i));
    const leftOver = kept.filter(i => !itemsToMerge.has(i));

    if (toMerge.length > 1) {
      const merged = mergeSameAccountGroup(toMerge.map(i => items[i]));
      resultItems.push(merged);
      toMerge.forEach(i => removed[i] = true);
    }

    leftOver.forEach(i => {
      resultItems.push(items[i]);
      removed[i] = true;
    });

    indices.forEach(i => {
      if (itemsToDelete.has(i)) removed[i] = true;
    });
  });

  for (let i = 0; i < itemCount; i++) {
    if (itemsToDelete.has(i)) continue;
    if (removed[i]) continue;
    resultItems.push(items[i]);
  }

  shareUrisWithinSite(resultItems);

  return Object.assign({}, vaultData, {
    items: resultItems
  });
}
