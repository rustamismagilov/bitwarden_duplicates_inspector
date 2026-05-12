import { computeDuplicateGroups } from "./core/dedup.js";

const subscribers = new Set();

const state = {
  vaultData: null,
  items: [],
  duplicateGroups: [],
  itemsToMerge: new Set(),
  itemsToDelete: new Set(),
  selectedItems: new Set(),
  filterText: "",
  showPreviews: false,
};

export function notify() {
  for (const fn of subscribers) fn(state);
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function setVault(vaultData) {
  state.vaultData = vaultData;
  state.items = Array.isArray(vaultData?.items) ? vaultData.items : [];
  state.duplicateGroups = computeDuplicateGroups(state.items);
  state.itemsToMerge = new Set();
  state.itemsToDelete = new Set();
  state.selectedItems = new Set();
  state.filterText = "";
  notify();
}

export function clearVault() {
  state.vaultData = null;
  state.items = [];
  state.duplicateGroups = [];
  state.itemsToMerge = new Set();
  state.itemsToDelete = new Set();
  state.selectedItems = new Set();
  state.filterText = "";
  notify();
}

export function toggleSelected(itemIndex) {
  if (state.selectedItems.has(itemIndex)) state.selectedItems.delete(itemIndex);
  else state.selectedItems.add(itemIndex);
  notify();
}

export function selectAllInGroup(groupIndex) {
  const g = state.duplicateGroups[groupIndex];
  if (!g) return;
  const allSelected = g.indices.every(i => state.selectedItems.has(i));
  if (allSelected) g.indices.forEach(i => state.selectedItems.delete(i));
  else g.indices.forEach(i => state.selectedItems.add(i));
  notify();
}

export function selectAllGroups() {
  const allIndices = state.duplicateGroups.flatMap(g => g.indices);
  const allSelected = allIndices.every(i => state.selectedItems.has(i));
  if (allSelected) allIndices.forEach(i => state.selectedItems.delete(i));
  else allIndices.forEach(i => state.selectedItems.add(i));
  notify();
}

export function setMergeForGroup(groupIndex, shouldMerge) {
  const g = state.duplicateGroups[groupIndex];
  if (!g) return;
  if (shouldMerge) g.indices.forEach(i => state.itemsToMerge.add(i));
  else g.indices.forEach(i => state.itemsToMerge.delete(i));
  notify();
}

export function toggleMergeForAllGroups() {
  const allIndices = state.duplicateGroups.flatMap(g => g.indices);
  const allMarked = allIndices.every(i => state.itemsToMerge.has(i));
  if (allMarked) allIndices.forEach(i => state.itemsToMerge.delete(i));
  else allIndices.forEach(i => state.itemsToMerge.add(i));
  notify();
}

export function toggleDeleteForSelected() {
  const selected = Array.from(state.selectedItems);
  if (!selected.length) return;
  const allDeleted = selected.every(i => state.itemsToDelete.has(i));
  if (allDeleted) selected.forEach(i => state.itemsToDelete.delete(i));
  else selected.forEach(i => state.itemsToDelete.add(i));
  notify();
}

export function setFilterText(text) {
  state.filterText = String(text || "");
  notify();
}

export function setShowPreviews(show) {
  state.showPreviews = Boolean(show);
  notify();
}
