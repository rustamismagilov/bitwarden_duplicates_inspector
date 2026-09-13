import { computeDuplicateGroups } from "./core/dedup.js";

const subscribers = new Set();

const state = {
  vaultData: null,
  items: [],
  duplicateGroups: [],
  itemsToMerge: new Set(),
  itemsToDelete: new Set(),
  selectedItems: new Set(),
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

export function setVault(vaultData) {
  state.vaultData = vaultData;
  state.items = Array.isArray(vaultData?.items) ? vaultData.items : [];
  state.duplicateGroups = computeDuplicateGroups(state.items);
  resetMarks();
  notify();
}

export function clearVault() {
  state.vaultData = null;
  state.items = [];
  state.duplicateGroups = [];
  resetMarks();
  notify();
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

function allGroupIndices(s) {
  return s.duplicateGroups.flatMap(g => g.indices);
}

export function selectAllAction(s) {
  const targets = allGroupIndices(s);
  const all = allIn(s.selectedItems, targets);
  return {
    targets,
    disabled: targets.length === 0,
    label: all ? "Unselect all entries in all groups" : "Select all entries in all groups",
  };
}

export function toggleSelectAll() {
  const { targets, disabled } = selectAllAction(state);
  if (disabled) return;
  toggleAllIn(state.selectedItems, targets);
  notify();
}

export function mergeAllAction(s) {
  const targets = allGroupIndices(s);
  const all = allIn(s.itemsToMerge, targets);
  return {
    targets,
    mark: !all,
    disabled: targets.length === 0,
    label: all ? "Unmark all merges" : "Merge all entries in all groups",
  };
}

export function toggleMergeAll() {
  const { targets, mark, disabled } = mergeAllAction(state);
  if (disabled) return;
  setMarks("merge", targets, mark);
  notify();
}

export function deleteSelectedAction(s) {
  const targets = [...s.selectedItems];
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
