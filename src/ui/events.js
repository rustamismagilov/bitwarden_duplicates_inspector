import { getState, toggleSelected, toggleSelectGroup, applyGroupAction } from "../state.js";
import { syncNote } from "./render.js";

const actions = {
  "toggle-select": data => toggleSelected(Number(data.index)),
  "select-group": data => toggleSelectGroup(Number(data.groupIndex)),
  "merge-group": data => applyGroupAction(Number(data.groupIndex), "merge"),
  "delete-group": data => applyGroupAction(Number(data.groupIndex), "delete"),
};

export function attachDelegatedListener(container) {
  // buttons act on click, checkboxes on change
  container.addEventListener("click", e => {
    const trigger = e.target.closest("[data-action]");
    if (!trigger || !container.contains(trigger)) return;
    if (trigger.matches('input[type="checkbox"]') || trigger.disabled) return;
    actions[trigger.dataset.action]?.(trigger.dataset);
  });

  container.addEventListener("change", e => {
    const trigger = e.target.closest('input[type="checkbox"][data-action]');
    if (!trigger || !container.contains(trigger)) return;
    actions[trigger.dataset.action]?.(trigger.dataset);
  });

  // opening a note puts its text in, closing takes it out again
  // toggle does not bubble, so it is caught on the way down
  container.addEventListener("toggle", e => {
    if (e.target.matches?.("details[data-key]")) syncNote(getState(), e.target);
  }, true);
}
