import { computeDuplicateGroups } from "./core/dedup.js";

const subscribers = new Set();

const state = {
  vaultData: null,
  items: [],
  duplicateGroups: [],
  itemsToMerge: new Set(),
  itemsToDelete: new Set(),
  selectedItems: new Set(),
  // lowercased text the filter looks through, one string per group
  groupSearchText: [],
  filterText: "",
  showPreviews: false,
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
}

// site, username, and every entry's name and uris
function searchTextFor(items, group) {
  const parts = [group.site, group.usernameRaw];
  for (const i of group.indices) {
    const it = items[i];
    parts.push(it.name);
    for (const u of Array.isArray(it.login?.uris) ? it.login.uris : []) parts.push(u?.uri);
  }
  return parts.filter(Boolean).join("\n").toLowerCase();
}

export function setVault(vaultData) {
  state.vaultData = vaultData;
  state.items = Array.isArray(vaultData?.items) ? vaultData.items : [];
  state.duplicateGroups = computeDuplicateGroups(state.items);
  state.groupSearchText = state.duplicateGroups.map(g => searchTextFor(state.items, g));
  state.filterText = "";
  resetMarks();
  notify();
}

export function clearVault() {
  state.vaultData = null;
  state.items = [];
  state.duplicateGroups = [];
  state.groupSearchText = [];
  state.filterText = "";
  resetMarks();
  notify();
}

// no notify here either
// filtering only hides groups, so the page updates in place
export function setFilterText(text) {
  state.filterText = String(text || "").trim().toLowerCase();
}

export function isGroupVisible(s, groupIndex) {
  return !s.filterText || s.groupSearchText[groupIndex].includes(s.filterText);
}

// no notify here
// previews get patched into the page in place, a full re-render lags on large vaults
export function setShowPreviews(show) {
  state.showPreviews = Boolean(show);
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
    // merging a single entry would do nothing
    const disabled = kind === "merge" && selected.length < 2;
    return { mark: true, targets: selected, clearSelection: true, disabled, label: labels.markSelected };
  }

  if (g.indices.some(i => marked.has(i))) {
    return { mark: false, targets: g.indices, clearSelection: false, disabled: false, label: labels.unmarkGroup };
  }
  return { mark: true, targets: g.indices, clearSelection: false, disabled: false, label: labels.markGroup };
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

function scopeText(s) {
  return s.filterText ? "visible groups" : "all groups";
}

export function selectAllAction(s) {
  const targets = visibleIndices(s);
  const all = allIn(s.selectedItems, targets);
  return {
    targets,
    disabled: targets.length === 0,
    label: `${all ? "Unselect" : "Select"} all entries in ${scopeText(s)}`,
  };
}

export function toggleSelectAll() {
  const { targets, disabled } = selectAllAction(state);
  if (disabled) return;
  toggleAllIn(state.selectedItems, targets);
  notify();
}

// groups matched only by an email domain or an entry name are guesses
// merge all leaves them alone, the user has to merge those one by one
export function mergeAllAction(s) {
  const targets = s.duplicateGroups.flatMap((g, gi) =>
    isGroupVisible(s, gi) && g.matchedBy === "uri" ? g.indices : []
  );
  const all = allIn(s.itemsToMerge, targets);
  const scope = s.filterText ? "visible" : "all";
  return {
    targets,
    mark: !all,
    disabled: targets.length === 0,
    label: `${all ? "Unmark" : "Merge"} ${scope} groups matched by URL`,
  };
}

export function toggleMergeAll() {
  const { targets, mark, disabled } = mergeAllAction(state);
  if (disabled) return;
  setMarks("merge", targets, mark);
  notify();
}

export function deleteSelectedAction(s) {
  const visible = new Set(visibleIndices(s));
  const targets = [...s.selectedItems].filter(i => visible.has(i));
  const all = allIn(s.itemsToDelete, targets);
  return {
    targets,
    mark: !all,
    disabled: targets.length === 0,
    label: all ? "Unmark selected for deletion" : "Mark selected for deletion",
  };
}

export function toggleDeleteSelected() {
  const { targets, mark, disabled } = deleteSelectedAction(state);
  if (disabled) return;
  setMarks("delete", targets, mark);
  notify();
}
