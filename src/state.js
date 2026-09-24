import { computeDuplicateGroups } from "./core/dedup.js";
import { mergeConcerns, mergeSelection } from "./core/merge.js";

const subscribers = new Set();

const state = {
  vaultData: null,
  // the name of the loaded file, shown in the summary and used to name downloads
  fileName: "",
  items: [],
  duplicateGroups: [],
  itemsToMerge: new Set(),
  itemsToDelete: new Set(),
  selectedItems: new Set(),
  // lowercased text the filter looks through, one string per group
  groupSearchText: [],
  // reasons to check a group before merging it, see mergeConcerns
  groupConcerns: [],
  filterText: "",
  showPreviews: false,
  // the marks as they were at the last download, null before the first one
  downloadedMarks: null,
};

function notify() {
  for (const fn of subscribers) fn(state);
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function resetMarks() {
  state.itemsToMerge = new Set();
  state.itemsToDelete = new Set();
  state.selectedItems = new Set();
  state.downloadedMarks = null;
}

// the tags that ask the user to look at a group before merging it, in the order the page shows them
// merge all leaves every tagged group alone
const TAG_LABELS = {
  passkeys: "different passkeys",
  "match rules": "different match rules",
  collections: "different collections",
  email: "matched by email domain",
  name: "matched by entry name",
};

export function groupTags(group, concerns) {
  const keys = [...concerns];
  if (group.matchedBy !== "uri") keys.push(group.matchedBy);
  return Object.keys(TAG_LABELS)
    .filter(key => keys.includes(key))
    .map(key => ({ key, label: TAG_LABELS[key] }));
}

// the filter word that shows every tagged group and nothing else
export const TAGGED_FILTER = "check";

// site, username, every entry's name and uris, and the tag labels
function searchTextFor(items, group, tags) {
  const parts = [group.site, group.siteLabel, group.usernameRaw, ...tags.map(t => t.label)];
  for (const i of group.indices) {
    const it = items[i];
    parts.push(it.name);
    for (const u of Array.isArray(it.login?.uris) ? it.login.uris : []) parts.push(u?.uri);
  }
  return parts.filter(Boolean).join("\n").toLowerCase();
}

export function setVault(vaultData, fileName = "") {
  state.vaultData = vaultData;
  state.fileName = fileName;
  state.items = Array.isArray(vaultData?.items) ? vaultData.items : [];
  state.duplicateGroups = computeDuplicateGroups(state.items);
  state.groupConcerns = state.duplicateGroups.map(g => mergeConcerns(g.indices.map(i => state.items[i])));
  state.groupSearchText = state.duplicateGroups.map((g, gi) =>
    searchTextFor(state.items, g, groupTags(g, state.groupConcerns[gi]))
  );
  state.filterText = "";
  resetMarks();
  notify();
}

export function clearVault() {
  state.vaultData = null;
  state.fileName = "";
  state.items = [];
  state.duplicateGroups = [];
  state.groupSearchText = [];
  state.groupConcerns = [];
  state.filterText = "";
  resetMarks();
  notify();
}

// no notify here
// filtering only hides groups, so the page updates in place
export function setFilterText(text) {
  state.filterText = String(text || "").trim().toLowerCase();
}

export function isGroupVisible(s, groupIndex) {
  if (!s.filterText) return true;
  // a plain substring search for "check" would also match sites like check24.de
  if (s.filterText === TAGGED_FILTER) {
    return groupTags(s.duplicateGroups[groupIndex], s.groupConcerns[groupIndex]).length > 0;
  }
  return s.groupSearchText[groupIndex].includes(s.filterText);
}

export function setShowPreviews(show) {
  state.showPreviews = Boolean(show);
  notify();
}

export function hasQueuedChanges(s) {
  return s.itemsToMerge.size > 0 || s.itemsToDelete.size > 0;
}

// a snapshot of the queued marks, to tell whether they changed since the last download
export function marksSnapshot(s) {
  const sortedList = set => [...set].sort((a, b) => a - b);
  return JSON.stringify([sortedList(s.itemsToMerge), sortedList(s.itemsToDelete)]);
}

// no notify here, nothing on the page shows it
export function markDownloaded() {
  state.downloadedMarks = marksSnapshot(state);
}

// queued work that would be lost by closing the page or loading another file
export function hasUnsavedChanges(s) {
  return hasQueuedChanges(s) && marksSnapshot(s) !== s.downloadedMarks;
}

// accounts that would have no entry left in the download, every copy marked for deletion
export function fullyDeletedGroups(s) {
  return s.duplicateGroups
    .filter(g => g.indices.every(i => s.itemsToDelete.has(i)))
    .map(g => ({ site: g.siteLabel, username: g.usernameRaw }));
}

function allIn(set, indices) {
  return indices.length > 0 && indices.every(i => set.has(i));
}

function toggleAllIn(set, indices) {
  const all = allIn(set, indices);
  indices.forEach(i => (all ? set.delete(i) : set.add(i)));
}

// marking an entry one way clears the other mark
// so an entry is never queued for both merge and deletion
function setMarks(kind, indices, on) {
  const target = kind === "merge" ? state.itemsToMerge : state.itemsToDelete;
  const other = kind === "merge" ? state.itemsToDelete : state.itemsToMerge;
  indices.forEach(i => {
    if (on) {
      target.add(i);
      other.delete(i);
    } else {
      target.delete(i);
    }
  });
}

export function toggleSelected(index) {
  if (!Number.isInteger(index) || !state.items[index]) return;
  toggleAllIn(state.selectedItems, [index]);
  notify();
}

export function toggleSelectGroup(groupIndex) {
  const g = state.duplicateGroups[groupIndex];
  if (!g) return;
  toggleAllIn(state.selectedItems, g.indices);
  notify();
}

const GROUP_LABELS = {
  merge: {
    unmarkSelected: "Unmark selected from merge",
    markSelected: "Merge selected entries",
    unmarkGroup: "Unmark group merge",
    markGroup: "Mark to merge entire group",
    markRest: "Merge the entries not deleted",
  },
  delete: {
    unmarkSelected: "Unmark selected for deletion",
    markSelected: "Mark selected for deletion",
    unmarkGroup: "Unmark group for deletion",
    markGroup: "Mark group for deletion",
  },
};

// what a group's merge or delete button does right now
// the button label and the click both come from here, so they cannot disagree
// with entries ticked it acts on those, otherwise on the whole group
export function groupAction(s, groupIndex, kind) {
  const g = s.duplicateGroups[groupIndex];
  const marked = kind === "merge" ? s.itemsToMerge : s.itemsToDelete;
  const labels = GROUP_LABELS[kind];
  const selected = g.indices.filter(i => s.selectedItems.has(i));

  if (selected.length) {
    const markedSelected = selected.filter(i => marked.has(i));
    if (markedSelected.length) {
      return { mark: false, targets: markedSelected, clearSelection: true, disabled: false, label: labels.unmarkSelected };
    }
    // a merge needs two entries, and the ones already queued for merge in this group count too
    const alreadyMerging = mergeSelection(s.items, g, s.itemsToMerge, s.itemsToDelete).toMerge;
    const disabled = kind === "merge" && selected.length + alreadyMerging.length < 2;
    const hint = disabled ? "Select at least two entries to merge" : "";
    return { mark: true, targets: selected, clearSelection: true, disabled, hint, label: labels.markSelected };
  }

  if (g.indices.some(i => marked.has(i))) {
    return { mark: false, targets: g.indices, clearSelection: false, disabled: false, hint: "", label: labels.unmarkGroup };
  }

  // merging the whole group leaves entries queued for deletion deleted
  // only ticking an entry and merging it on purpose takes it back
  if (kind === "merge") {
    const rest = g.indices.filter(i => !s.itemsToDelete.has(i));
    const disabled = rest.length < 2;
    return {
      mark: true,
      targets: rest,
      clearSelection: false,
      disabled,
      hint: disabled ? "Fewer than two entries are left that are not marked for deletion" : "",
      label: rest.length < g.indices.length ? labels.markRest : labels.markGroup,
    };
  }
  return { mark: true, targets: g.indices, clearSelection: false, disabled: false, hint: "", label: labels.markGroup };
}

export function applyGroupAction(groupIndex, kind) {
  if (!state.duplicateGroups[groupIndex]) return;
  const action = groupAction(state, groupIndex, kind);
  if (action.disabled) return;
  setMarks(kind, action.targets, action.mark);
  if (action.clearSelection) action.targets.forEach(i => state.selectedItems.delete(i));
  notify();
}

// the global buttons only reach groups the filter leaves visible
function visibleIndices(s) {
  return s.duplicateGroups.flatMap((g, gi) => (isGroupVisible(s, gi) ? g.indices : []));
}

// the global button labels say whether a filter narrows what they reach
function scopeWord(s) {
  return s.filterText ? "visible" : "all";
}

export function selectAllAction(s) {
  const targets = visibleIndices(s);
  const all = allIn(s.selectedItems, targets);
  return {
    targets,
    disabled: targets.length === 0,
    label: `${all ? "Unselect" : "Select"} all entries in ${scopeWord(s)} groups`,
  };
}

export function toggleSelectAll() {
  const { targets, disabled } = selectAllAction(state);
  if (disabled) return;
  toggleAllIn(state.selectedItems, targets);
  notify();
}

// groups matched only by an email domain or an entry name are guesses
// and groups with merge concerns need a look first
// merge all leaves both alone, the user has to merge those one by one
// it also leaves entries queued for deletion deleted
export function mergeAllAction(s) {
  let groups = 0;
  let skipped = 0;
  const targets = s.duplicateGroups.flatMap((g, gi) => {
    if (!isGroupVisible(s, gi)) return [];
    if (groupTags(g, s.groupConcerns[gi]).length) {
      skipped++;
      return [];
    }
    // like the group button, a group needs two entries left to merge
    const rest = g.indices.filter(i => !s.itemsToDelete.has(i));
    if (rest.length < 2) return [];
    groups++;
    return rest;
  });
  const all = allIn(s.itemsToMerge, targets);
  return {
    targets,
    groups,
    skipped,
    mark: !all,
    disabled: targets.length === 0,
    label: `${all ? "Unmark" : "Merge"} ${scopeWord(s)} untagged groups`,
  };
}

// returns what it did, so the page can say how many tagged groups were left for the user
export function toggleMergeAll() {
  const action = mergeAllAction(state);
  if (action.disabled) return null;
  setMarks("merge", action.targets, action.mark);
  notify();
  return action;
}

export function deleteSelectedAction(s) {
  const visible = new Set(visibleIndices(s));
  const targets = [...s.selectedItems].filter(i => visible.has(i));
  const all = allIn(s.itemsToDelete, targets);
  return {
    targets,
    mark: !all,
    disabled: targets.length === 0,
    label: GROUP_LABELS.delete[all ? "unmarkSelected" : "markSelected"],
  };
}

export function toggleDeleteSelected() {
  const { targets, mark, disabled } = deleteSelectedAction(state);
  if (disabled) return;
  setMarks("delete", targets, mark);
  notify();
}
