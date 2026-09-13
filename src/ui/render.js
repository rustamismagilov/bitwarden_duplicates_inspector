import { renderItemRow, escapeHtml } from "./components.js";
import { resolveGroupEntries, keptEntryIndex } from "../core/merge.js";
import { groupAction, isGroupVisible, selectAllAction, mergeAllAction, deleteSelectedAction } from "../state.js";

function buildPreviewSectionHtml(state, groupIndex) {
  const g = state.duplicateGroups[groupIndex];
  const previewEntries = resolveGroupEntries(state.items, g, state.itemsToMerge, state.itemsToDelete);
  // key open notes by the entry a row comes from, so they stay with it when rows shift
  const rowsHtml = previewEntries.length
    ? previewEntries.map(({ index, item }) => renderItemRow(state, item, index, { preview: true, key: `preview-${groupIndex}-${index}` })).join("")
    : `<tr><td colspan="5" class="preview-empty">Every entry in this group will be deleted. Nothing from it ends up in the export.</td></tr>`;
  return `<div class="preview-container">
    <div class="preview-arrow">▼ Result Preview</div>
    <table>
     <thead><tr>
      <th class="col-select">Status</th>
      <th class="col-name">Name</th>
      <th class="col-dates">Created / Updated</th>
      <th class="col-uris">URIs</th>
      <th class="col-notes">Notes</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
    </table>
  </div>`;
}

function plural(n, one, many = one + "s") {
  return `${n} ${n === 1 ? one : many}`;
}

// previews only show for groups with something queued
// otherwise they would just repeat the main table
function shouldShowPreview(state, g) {
  return state.showPreviews && g.indices.some(i => state.itemsToMerge.has(i) || state.itemsToDelete.has(i));
}

// the summary and hint are live regions, so a screen reader announces every write
// only touch them when the text really changes
const lastHtml = new WeakMap();

function writeHtml(el, html) {
  if (lastHtml.get(el) === html) return;
  lastHtml.set(el, html);
  el.innerHTML = html;
}

function renderSummary(state, refs) {
  const totalItems = state.items.length;
  const groupsCount = state.duplicateGroups.length;

  const dupIndexSet = new Set();
  state.duplicateGroups.forEach(g => g.indices.forEach(i => dupIndexSet.add(i)));
  const dupItemsCount = dupIndexSet.size;
  const uniqueCount = totalItems - dupItemsCount;

  let mergeReduction = 0;
  state.duplicateGroups.forEach(g => {
    const merging = g.indices.filter(i => state.itemsToMerge.has(i) && !state.itemsToDelete.has(i));
    if (merging.length > 1) {
      mergeReduction += (merging.length - 1);
    }
  });

  const finalExportCount = totalItems - state.itemsToDelete.size - mergeReduction;

  if (!totalItems) {
    writeHtml(refs.summaryEl, "");
    return;
  }

  const leftHtml = `Loaded <strong>${plural(totalItems, "entry", "entries")}</strong>.<br>` +
    `Found <strong>${plural(groupsCount, "duplicate group")}</strong> ` +
    `involving <strong>${plural(dupItemsCount, "entry", "entries")}</strong>.<br>` +
    `<strong>${uniqueCount}</strong> ${uniqueCount === 1 ? "entry has" : "entries have"} no duplicates.`;

  const rightHtml = `<div style="text-align: right;">` +
    `Final Export: <strong>${finalExportCount}</strong> ${finalExportCount === 1 ? "entry" : "entries"}<br>` +
    `<small class="text-muted">(${state.itemsToDelete.size} deleted, ${mergeReduction} merged)</small>` +
    `</div>`;

  writeHtml(refs.summaryEl, `<div>${leftHtml}</div>${rightHtml}`);
}

function renderGlobalButton(btn, action) {
  btn.textContent = action.label;
  btn.disabled = action.disabled;
}

function renderGroupMarkup(state, groupIndex) {
  const g = state.duplicateGroups[groupIndex];
  const htmlParts = [];

  const site = g.site;
  const usernameRaw = g.usernameRaw || g.usernameLower;
  const count = g.indices.length;

  const selectedInGroup = g.indices.filter(i => state.selectedItems.has(i));
  const selectedCount = selectedInGroup.length;
  const allSelected = selectedCount === count && count > 0;
  const mergingIndices = g.indices.filter(i => state.itemsToMerge.has(i) && !state.itemsToDelete.has(i));
  const mergedInGroup = mergingIndices.length;
  const deletedInGroup = g.indices.filter(i => state.itemsToDelete.has(i)).length;
  // the entry a merge keeps, so the table can point it out
  const mergeBase = mergedInGroup > 1 ? mergingIndices[keptEntryIndex(mergingIndices.map(i => state.items[i]))] : -1;

  htmlParts.push(`<div class="group" data-group-index="${groupIndex}">`);
  htmlParts.push(`<div class="group-header">`);
  htmlParts.push(`<div class="group-header-main">`);
  htmlParts.push(`<div class="group-header-site">${escapeHtml(site)}</div>`);
  htmlParts.push(`<div class="group-header-meta">`);

  htmlParts.push(`<div class="meta-line">
    <span class="username">${escapeHtml(usernameRaw)}</span>
  </div>`);

  htmlParts.push(`<div class="meta-line">
    <span class="count">${count} item${count === 1 ? "" : "s"}</span>`);

  if (g.matchedBy !== "uri") {
    const how = g.matchedBy === "email" ? "email domain" : "entry name";
    htmlParts.push(`<span class="tag tag-weak" title="Some entries have no URL for this site, so they were grouped by their ${how}. Check that they are the same account before merging.">matched by ${how}</span>`);
  }

  if (selectedCount > 0) {
    const selectedText = allSelected ? "all selected" : `${selectedCount} selected`;
    htmlParts.push(`<span class="tag tag-selected">${escapeHtml(selectedText)}</span>`);
  }

  if (mergedInGroup > 1) {
    htmlParts.push(`<span class="tag tag-merge">${mergedInGroup} will be merged into one</span>`);
  } else if (mergedInGroup === 1) {
    htmlParts.push(`<span class="tag tag-merge">1 marked for merge, mark another to merge</span>`);
  }

  if (deletedInGroup === count) {
    htmlParts.push(`<span class="tag tag-deleted">all ${count} will be deleted, none kept</span>`);
  } else if (deletedInGroup > 0) {
    htmlParts.push(`<span class="tag tag-deleted">${deletedInGroup} will be deleted</span>`);
  }

  htmlParts.push(`</div>`);
  htmlParts.push(`</div>`);
  htmlParts.push(`</div>`);

  const selectAllLabel = allSelected ? "Unselect all in group" : "Select all in group";
  const mergeAction = groupAction(state, groupIndex, "merge");
  const deleteAction = groupAction(state, groupIndex, "delete");
  const mergeLabel = mergeAction.label;
  const deleteLabel = deleteAction.label;
  const disabledAttr = mergeAction.disabled ? `disabled title="Select at least two entries to merge"` : "";

  htmlParts.push(`<div class="group-actions">
    <button type="button"
            class="btn btn-secondary btn-select-group"
            data-action="select-group"
            data-group-index="${groupIndex}">
      ${escapeHtml(selectAllLabel)}
    </button>
    <button type="button"
            class="btn btn-merge-group"
            data-action="merge-group"
            data-group-index="${groupIndex}" ${disabledAttr}>
      ${escapeHtml(mergeLabel)}
    </button>
    <button type="button"
            class="btn btn-danger btn-delete-group"
            data-action="delete-group"
            data-group-index="${groupIndex}">
      ${escapeHtml(deleteLabel)}
    </button>
  </div>`);

  htmlParts.push(`</div>`);

  htmlParts.push(`<table>`);
  htmlParts.push(`<thead><tr>
    <th class="col-select">Select</th>
    <th class="col-name">Name</th>
    <th class="col-dates">Created / Updated</th>
    <th class="col-uris">URIs</th>
    <th class="col-notes">Notes</th>
  </tr></thead><tbody>`);

  g.indices.forEach(idx => {
    const it = state.items[idx];
    // the only entry left after deletions
    const sole = !state.itemsToDelete.has(idx) && count - deletedInGroup === 1;
    htmlParts.push(renderItemRow(state, it, idx, { sole, mergeBase: idx === mergeBase }));
  });

  htmlParts.push(`</tbody></table>`);

  if (shouldShowPreview(state, g)) {
    htmlParts.push(buildPreviewSectionHtml(state, groupIndex));
  }

  htmlParts.push(`</div>`);

  return htmlParts.join("");
}


// the global buttons depend on the filter, so they refresh with it
function renderControls(state, refs) {
  renderGlobalButton(refs.selectAllGroupsBtn, selectAllAction(state));
  renderGlobalButton(refs.mergeAllGroupsBtn, mergeAllAction(state));
  renderGlobalButton(refs.deleteSelectedBtn, deleteSelectedAction(state));
  refs.clearSearchBtn.style.display = state.filterText ? "block" : "none";

  let hint = "";
  if (state.vaultData && !state.duplicateGroups.length) {
    hint = "No duplicates found. Only login entries with a username are compared.";
  } else if (state.filterText && !state.duplicateGroups.some((g, gi) => isGroupVisible(state, gi))) {
    hint = "No groups match the filter.";
  }
  if (refs.hintEl.textContent !== hint) refs.hintEl.textContent = hint;
}

// hides groups that do not match the filter without rebuilding the list
export function applyFilter(state, refs) {
  refs.groupsEl.querySelectorAll(".group").forEach(el => {
    el.hidden = !isGroupVisible(state, Number(el.dataset.groupIndex));
  });
  renderControls(state, refs);
}

// replacing a group closes its open notes and drops keyboard focus
// so remember both before and put them back after
function captureViewState(el) {
  const open = [...el.querySelectorAll("details[open][data-key]")].map(d => d.dataset.key);
  const active = document.activeElement;
  const focus = active && el.contains(active) && active.dataset.action
    ? { ...active.dataset }
    : null;
  return { open, focus };
}

function restoreViewState(el, { open, focus }) {
  const openKeys = new Set(open);
  el.querySelectorAll("details[data-key]").forEach(d => {
    if (openKeys.has(d.dataset.key)) d.open = true;
  });
  if (!focus) return;
  const match = [...el.querySelectorAll(`[data-action="${focus.action}"]`)].find(candidate =>
    candidate.dataset.index === focus.index && candidate.dataset.groupIndex === focus.groupIndex
  );
  match?.focus({ preventScroll: true });
}

// what the list was last rendered from, so a click only replaces the groups it changed
// rebuilding every group on each click took hundreds of milliseconds on large vaults
let renderedItems = null;
let renderedGroups = [];

export function renderUI(state, refs) {
  renderSummary(state, refs);
  refs.downloadBtn.disabled = !state.items.length;

  const markup = state.duplicateGroups.map((g, gi) => renderGroupMarkup(state, gi));
  const groupEls = refs.groupsEl.children;
  const sameList = renderedItems === state.items &&
    renderedGroups.length === markup.length &&
    groupEls.length === markup.length;
  const changed = sameList ? markup.flatMap((html, gi) => (html === renderedGroups[gi] ? [] : [gi])) : [];

  if (!sameList) {
    // a new vault starts with every note closed
    refs.groupsEl.innerHTML = markup.join("");
  } else if (changed.length > markup.length / 2) {
    // one big swap is faster than hundreds of small ones after a bulk action
    const viewState = captureViewState(refs.groupsEl);
    refs.groupsEl.innerHTML = markup.join("");
    restoreViewState(refs.groupsEl, viewState);
  } else {
    for (const gi of changed) {
      const oldEl = groupEls[gi];
      const viewState = captureViewState(oldEl);
      const template = document.createElement("template");
      template.innerHTML = markup[gi];
      const newEl = template.content.firstElementChild;
      oldEl.replaceWith(newEl);
      restoreViewState(newEl, viewState);
    }
  }

  renderedItems = state.items;
  renderedGroups = markup;
  applyFilter(state, refs);
}
