import { getState, notify } from "../state.js";

function handleToggleSelect(state, idx) {
  if (Number.isNaN(idx)) return;
  if (state.selectedItems.has(idx)) state.selectedItems.delete(idx);
  else state.selectedItems.add(idx);
}

function handleSelectGroup(state, idx) {
  const g = state.duplicateGroups[idx];
  if (!g) return;
  const indices = g.indices;
  const allSelected = indices.every(i => state.selectedItems.has(i));
  if (allSelected) indices.forEach(i => state.selectedItems.delete(i));
  else indices.forEach(i => state.selectedItems.add(i));
}

function handleMergeGroup(state, idx) {
  const g = state.duplicateGroups[idx];
  if (!g) return;
  const indices = g.indices;
  const selectedInGroup = indices.filter(i => state.selectedItems.has(i));

  if (selectedInGroup.length > 0) {
    const anyMerged = selectedInGroup.some(i => state.itemsToMerge.has(i));
    if (anyMerged) {
      selectedInGroup.forEach(i => {
        if (state.itemsToMerge.has(i)) {
          state.itemsToMerge.delete(i);
          if (!state.itemsToDelete.has(i)) state.selectedItems.delete(i);
        }
      });
    } else {
      selectedInGroup.forEach(i => {
        state.itemsToMerge.add(i);
        state.itemsToDelete.delete(i);
        state.selectedItems.delete(i);
      });
    }
  } else {
    const anyMerged = indices.some(i => state.itemsToMerge.has(i));
    if (anyMerged) {
      indices.forEach(i => state.itemsToMerge.delete(i));
    } else {
      indices.forEach(i => {
        state.itemsToMerge.add(i);
        state.itemsToDelete.delete(i);
      });
    }
  }
}

function handleDeleteGroup(state, idx) {
  const g = state.duplicateGroups[idx];
  if (!g) return;
  const indices = g.indices;
  const selectedInGroup = indices.filter(i => state.selectedItems.has(i));

  if (selectedInGroup.length > 0) {
    const anyDeleted = selectedInGroup.some(i => state.itemsToDelete.has(i));
    if (anyDeleted) {
      selectedInGroup.forEach(i => {
        if (state.itemsToDelete.has(i)) {
          state.itemsToDelete.delete(i);
          if (!state.itemsToMerge.has(i)) state.selectedItems.delete(i);
        }
      });
    } else {
      selectedInGroup.forEach(i => {
        state.itemsToDelete.add(i);
        state.itemsToMerge.delete(i);
        state.selectedItems.delete(i);
      });
    }
  } else {
    const anyDeleted = indices.some(i => state.itemsToDelete.has(i));
    if (anyDeleted) {
      indices.forEach(i => state.itemsToDelete.delete(i));
    } else {
      indices.forEach(i => {
        state.itemsToDelete.add(i);
        state.itemsToMerge.delete(i);
      });
    }
  }
}

function dispatch(action, dataset) {
  const state = getState();
  switch (action) {
    case "toggle-select":
      handleToggleSelect(state, parseInt(dataset.index, 10));
      break;
    case "select-group":
      handleSelectGroup(state, parseInt(dataset.groupIndex, 10));
      break;
    case "merge-group":
      handleMergeGroup(state, parseInt(dataset.groupIndex, 10));
      break;
    case "delete-group":
      handleDeleteGroup(state, parseInt(dataset.groupIndex, 10));
      break;
    default:
      return false;
  }
  notify();
  return true;
}

export function attachDelegatedListener(container) {
  container.addEventListener("click", e => {
    const trigger = e.target.closest("[data-action]");
    if (!trigger || !container.contains(trigger)) return;
    // Skip change-driven actions on click; they're handled below.
    if (trigger.tagName === "INPUT" && trigger.type === "checkbox") return;
    if (trigger.hasAttribute("disabled")) return;
    dispatch(trigger.dataset.action, trigger.dataset);
  });

  container.addEventListener("change", e => {
    const trigger = e.target.closest("[data-action]");
    if (!trigger || !container.contains(trigger)) return;
    if (trigger.tagName !== "INPUT" || trigger.type !== "checkbox") return;
    dispatch(trigger.dataset.action, trigger.dataset);
  });
}
