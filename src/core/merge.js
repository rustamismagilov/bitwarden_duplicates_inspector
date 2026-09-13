// two uris are the same when both the match rule and the address agree
function uriKey(u) {
  return JSON.stringify([u.match ?? null, u.uri ?? ""]);
}

// bitwarden trims password history to this many entries
const PASSWORD_HISTORY_LIMIT = 5;

function uniqueBy(list, keyFn) {
  const seen = new Set();
  return list.filter(x => {
    const key = keyFn(x);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// hand edited or third party files can hold numbers or objects where bitwarden writes text
// turn those into text instead of losing them
export function asText(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(x => x != null) : [];
}

// bitwarden only uses the first passkey of a login and replaces the list when a new one is saved
// so a merge keeps the passkeys of one entry, the oldest that has any, and drops the rest
function splitPasskeys(oldestFirst) {
  // an empty id would make unrelated passkeys look like the same one
  const passkeyKey = c => (typeof c.credentialId === "string" && c.credentialId !== "" ? c.credentialId : JSON.stringify(c));
  const owner = oldestFirst.find(it => asArray(it.login?.fido2Credentials).length);
  if (!owner) return { owner: null, kept: [], dropped: [] };
  const kept = asArray(owner.login.fido2Credentials);
  const keptKeys = new Set(kept.map(passkeyKey));
  const dropped = uniqueBy(
    oldestFirst.filter(it => it !== owner).flatMap(it => asArray(it.login?.fido2Credentials)),
    passkeyKey
  ).filter(c => !keptKeys.has(passkeyKey(c)));
  return { owner, kept, dropped };
}

// entries without a usable date sort last, so they never become the kept entry
function entryTime(it) {
  const t = Date.parse(it.creationDate || it.revisionDate || "");
  return Number.isNaN(t) ? Infinity : t;
}

// index of the entry a merge keeps: the oldest one, first wins on a tie
export function keptEntryIndex(groupItems) {
  let best = 0;
  groupItems.forEach((it, i) => {
    if (entryTime(it) < entryTime(groupItems[best])) best = i;
  });
  return best;
}

export function mergeSameAccountGroup(groupItems) {
  if (!groupItems.length) throw new Error("mergeSameAccountGroup called with empty list");

  const baseSrc = groupItems[keptEntryIndex(groupItems)];
  const oldestFirst = [...groupItems].sort((a, b) => entryTime(a) - entryTime(b));

  const base = JSON.parse(JSON.stringify(baseSrc));
  const allPasswords = new Set();
  const notesChunks = [];

  for (const it of groupItems) {
    const login = it.login || {};
    const pw = login.password || "";
    if (pw) allPasswords.add(pw);
    const notes = asText(it.notes).trim();
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

  // keep everything the other entries carry that the kept entry lacks
  // these used to be dropped silently along with the other entries
  const others = oldestFirst.filter(it => it !== baseSrc);

  // the dropped passkeys are only named in notes, without their keys
  const { owner: passkeyOwner, kept: keptPasskeys, dropped: droppedPasskeys } = splitPasskeys(oldestFirst);
  if (passkeyOwner && passkeyOwner !== baseSrc) baseLogin.fido2Credentials = structuredClone(keptPasskeys);

  const fields = uniqueBy(
    oldestFirst.flatMap(it => asArray(it.fields)),
    f => JSON.stringify([f.name ?? null, f.value ?? null, f.type ?? null, f.linkedId ?? null])
  );
  if (fields.length) base.fields = structuredClone(fields);

  // newest first, one entry per password
  const history = uniqueBy(
    oldestFirst
      .flatMap(it => asArray(it.passwordHistory))
      .sort((a, b) => String(b.lastUsedDate ?? "").localeCompare(String(a.lastUsedDate ?? ""))),
    h => h.password
  );
  // bitwarden keeps only the newest entries of password history on import
  // anything past that would vanish there, so it goes to notes instead
  if (history.length) base.passwordHistory = structuredClone(history.slice(0, PASSWORD_HISTORY_LIMIT));
  const olderHistory = history.slice(PASSWORD_HISTORY_LIMIT).map(h => h.password);

  if (others.some(it => it.reprompt === 1)) base.reprompt = 1;

  // an archived old duplicate merged with one still in use should come back in use
  if (base.archivedDate && groupItems.some(it => !it.archivedDate)) base.archivedDate = null;

  // an unfiled kept entry goes into the folder of the oldest entry that has one
  if (!base.folderId) {
    const filed = oldestFirst.find(it => it.folderId);
    if (filed) base.folderId = filed.folderId;
  }

  const collections = uniqueBy(oldestFirst.flatMap(it => asArray(it.collectionIds)), id => id);
  if (collections.length) base.collectionIds = collections;

  const totps = uniqueBy(oldestFirst.map(it => it.login?.totp).filter(Boolean), t => t);
  if (!baseLogin.totp && totps.length) baseLogin.totp = totps[0];
  const extraTotp = totps.filter(t => t !== baseLogin.totp);

  // the oldest entry's password stays active
  // if it has none, take the password of the oldest entry that does
  if (!baseLogin.password) {
    const donor = oldestFirst.find(it => it.login?.password);
    if (donor) {
      baseLogin.password = donor.login.password;
      if ("passwordRevisionDate" in donor.login) {
        baseLogin.passwordRevisionDate = donor.login.passwordRevisionDate;
      }
    }
  }

  // compare trimmed notes so trailing whitespace does not repeat a note
  const baseNotes = asText(base.notes).trim();
  const mergedNotes = baseNotes ? [baseNotes] : [];
  for (const n of notesChunks) {
    if (!mergedNotes.includes(n)) mergedNotes.push(n);
  }

  // one password per line, since a password can contain commas and spaces
  const extraPw = Array.from(allPasswords).filter(p => p !== baseLogin.password);
  if (extraPw.length) {
    mergedNotes.push("Additional passwords seen in merged entries:\n" + extraPw.join("\n"));
  }

  if (olderHistory.length) {
    mergedNotes.push("Older password history from merged entries:\n" + olderHistory.join("\n"));
  }

  // a login holds one totp secret, so any others go to notes like passwords do
  if (extraTotp.length) {
    mergedNotes.push("Additional TOTP secrets seen in merged entries:\n" + extraTotp.join("\n"));
  }

  if (droppedPasskeys.length) {
    const describe = c =>
      [c.rpId, c.userName, c.creationDate && `created ${String(c.creationDate).slice(0, 10)}`].filter(Boolean).join(", ") || "passkey";
    mergedNotes.push(
      "Passkeys dropped by the merge, register them again if you still need them:\n" +
      droppedPasskeys.map(describe).join("\n")
    );
  }

  const joined = mergedNotes.join("\n\n---\n");
  if (joined !== baseNotes) base.notes = joined;

  return base;
}

// reasons to look at a group before merging it, beyond the usual password and notes handling
// "passkeys": entries hold different passkeys and a merge keeps only one entry's
// "collections": entries sit in different collections and a merge puts the result in all of them
export function mergeConcerns(groupItems) {
  const concerns = [];
  const oldestFirst = [...groupItems].sort((a, b) => entryTime(a) - entryTime(b));
  if (splitPasskeys(oldestFirst).dropped.length) concerns.push("passkeys");
  const collectionSets = new Set(groupItems.map(it => JSON.stringify(asArray(it.collectionIds).sort())));
  if (collectionSets.size > 1) concerns.push("collections");
  return concerns;
}

// what the queued marks do to one group
// replaced maps the kept entry's index to the merged item, dropped holds every index that disappears
export function planGroup(items, group, itemsToMerge, itemsToDelete) {
  const replaced = new Map();
  const dropped = new Set(group.indices.filter(i => itemsToDelete.has(i)));
  const toMerge = group.indices.filter(i => itemsToMerge.has(i) && !itemsToDelete.has(i));

  if (toMerge.length > 1) {
    const mergeItems = toMerge.map(i => items[i]);
    const keptIndex = toMerge[keptEntryIndex(mergeItems)];
    replaced.set(keptIndex, mergeSameAccountGroup(mergeItems));
    toMerge.forEach(i => { if (i !== keptIndex) dropped.add(i); });
  }

  return { replaced, dropped };
}

// the entries a group turns into, in their original order, each with the index it comes from
export function resolveGroupEntries(items, group, itemsToMerge, itemsToDelete) {
  const { replaced, dropped } = planGroup(items, group, itemsToMerge, itemsToDelete);
  return group.indices
    .filter(i => !dropped.has(i))
    .map(i => ({ index: i, item: replaced.get(i) ?? items[i] }));
}

// the preview uses these so it always matches the download
export function resolveGroup(items, group, itemsToMerge, itemsToDelete) {
  return resolveGroupEntries(items, group, itemsToMerge, itemsToDelete).map(entry => entry.item);
}

export function buildExport({ vaultData, items, duplicateGroups, itemsToMerge, itemsToDelete }) {
  if (!vaultData || !Array.isArray(items)) {
    throw new Error("buildExport: vaultData and items[] are required");
  }

  const replaced = new Map();
  const dropped = new Set(itemsToDelete);
  for (const g of duplicateGroups) {
    const plan = planGroup(items, g, itemsToMerge, itemsToDelete);
    plan.replaced.forEach((merged, i) => replaced.set(i, merged));
    plan.dropped.forEach(i => dropped.add(i));
  }

  // keep the original order, with each merged entry where its kept entry was
  const resultItems = [];
  items.forEach((it, i) => {
    if (dropped.has(i)) return;
    resultItems.push(replaced.get(i) ?? it);
  });

  return Object.assign({}, vaultData, {
    items: resultItems
  });
}
