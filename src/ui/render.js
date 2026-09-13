import { renderItemRow, escapeHtml } from "./components.js";
import { resolveGroup } from "../core/merge.js";
import { groupAction, isGroupVisible, selectAllAction, mergeAllAction, deleteSelectedAction } from "../state.js";

function buildPreviewSectionHtml(state, groupIndex) {
  const g = state.duplicateGroups[groupIndex];
  const previewItems = resolveGroup(state.items, g, state.itemsToMerge, state.itemsToDelete);
  const rowsHtml = previewItems
    .map((pit, pidx) => renderItemRow(state, pit, pidx, true))
    .join("");
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
    refs.summaryEl.innerHTML = "";
    return;
  }

  const leftHtml = `Loaded <strong>${totalItems}</strong> entries.<br>` +
    `Found <strong>${groupsCount}</strong> duplicate group${groupsCount === 1 ? "" : "s"} ` +
    `involving <strong>${dupItemsCount}</strong> entries.<br>` +
    `<strong>${uniqueCount}</strong> entries have no duplicates.`;

  const rightHtml = `<div style="text-align: right;">` +
    `Final Export: <strong>${finalExportCount}</strong> entries<br>` +
    `<small class="text-muted">(${state.itemsToDelete.size} deleted, ${mergeReduction} merged)</small>` +
    `</div>`;

  refs.summaryEl.innerHTML = `<div>${leftHtml}</div>${rightHtml}`;
}

function renderGlobalButton(btn, action) {
  btn.textContent = action.label;
  btn.disabled = action.disabled;
}

function renderGroupsMarkup(state) {
  const htmlParts = [];

  state.duplicateGroups.forEach((g, groupIndex) => {
    const site = g.site;
    const usernameRaw = g.usernameRaw || g.usernameLower;
    const count = g.indices.length;

    const selectedInGroup = g.indices.filter(i => state.selectedItems.has(i));
    const selectedCount = selectedInGroup.length;
    const allSelected = selectedCount === count && count > 0;
    const mergedInGroup = g.indices.filter(i => state.itemsToMerge.has(i)).length;
    const deletedInGroup = g.indices.filter(i => state.itemsToDelete.has(i)).length;

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

    if (mergedInGroup > 0) {
      htmlParts.push(`<span class="tag tag-merge">${mergedInGroup} will be merged</span>`);
    }

    if (deletedInGroup > 0) {
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
      const isDeleted = state.itemsToDelete.has(idx);
      let isKept = false;
      if (!isDeleted && (count - deletedInGroup === 1)) {
        isKept = true;
      }
      htmlParts.push(renderItemRow(state, it, idx, false, isKept));
    });

    htmlParts.push(`</tbody></table>`);

    // skip preview when nothing is queued
    // otherwise it just duplicates the main table
    if (state.showPreviews && deletedInGroup < count && (mergedInGroup > 0 || deletedInGroup > 0)) {
      htmlParts.push(buildPreviewSectionHtml(state, groupIndex));
    }

    htmlParts.push(`</div>`);
  });

  return htmlParts.join("");
}

// insert and remove preview sections in place
// avoids a full groupsEl rebuild
export function togglePreviewSections(state, refs) {
  refs.groupsEl.querySelectorAll(".preview-container").forEach(el => el.remove());
  if (!state.showPreviews) return;

  state.duplicateGroups.forEach((g, groupIndex) => {
    const groupEl = refs.groupsEl.querySelector(`.group[data-group-index="${groupIndex}"]`);
    if (!groupEl) return;
    const count = g.indices.length;
    const deletedInGroup = g.indices.filter(i => state.itemsToDelete.has(i)).length;
    const mergedInGroup = g.indices.filter(i => state.itemsToMerge.has(i)).length;
    if (deletedInGroup >= count) return;
    // skip groups with no actions queued
    // preview would just duplicate the main table
    if (mergedInGroup === 0 && deletedInGroup === 0) return;
    groupEl.insertAdjacentHTML("beforeend", buildPreviewSectionHtml(state, groupIndex));
  });
}

// the global buttons depend on the filter, so they refresh with it
function renderControls(state, refs) {
  renderGlobalButton(refs.selectAllGroupsBtn, selectAllAction(state));
  renderGlobalButton(refs.mergeAllGroupsBtn, mergeAllAction(state));
  renderGlobalButton(refs.deleteSelectedBtn, deleteSelectedAction(state));
  refs.clearSearchBtn.style.display = state.filterText ? "block" : "none";
}

// hides groups that do not match the filter without rebuilding the list
export function applyFilter(state, refs) {
  refs.groupsEl.querySelectorAll(".group").forEach(el => {
    el.hidden = !isGroupVisible(state, Number(el.dataset.groupIndex));
  });
  renderControls(state, refs);
}

export function renderUI(state, refs) {
  renderSummary(state, refs);

  refs.downloadBtn.disabled = !state.items.length;
  refs.hintEl.textContent = "";
  refs.groupsEl.innerHTML = state.duplicateGroups.length ? renderGroupsMarkup(state) : "";
  applyFilter(state, refs);
}
