// two uris are the same when both the match rule and the address agree
function uriKey(u) {
  return JSON.stringify([u.match ?? null, u.uri ?? ""]);
}

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
  const notesChunks = [];

  for (const it of groupItems) {
    const login = it.login || {};
    const pw = login.password || "";
    if (pw) allPasswords.add(pw);
    const notes = (it.notes || "").trim();
    if (notes) notesChunks.push(notes);
    if (it.favorite) base.favorite = true;
  }

  const baseLogin = base.login || (base.login = {});
  if (!Array.isArray(baseLogin.uris)) baseLogin.uris = [];

  // copy the uri objects as they are
  // rebuilding them from a string key turned match numbers into strings
  const urisSeen = new Set(baseLogin.uris.filter(Boolean).map(uriKey));
  for (const it of groupItems) {
    const uris = Array.isArray(it.login?.uris) ? it.login.uris : [];
    for (const u of uris) {
      if (!u) continue;
      const key = uriKey(u);
      if (urisSeen.has(key)) continue;
      urisSeen.add(key);
      baseLogin.uris.push(structuredClone(u));
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

  return Object.assign({}, vaultData, {
    items: resultItems
  });
}
