import { renderItemRow, escapeHtml } from "./components.js";
import { mergeSameAccountGroup } from "../core/merge.js";

function buildPreviewSectionHtml(state, groupIndex) {
  const previewItems = generateGroupPreview(state, groupIndex);
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

function generateGroupPreview(state, groupIndex) {
  const g = state.duplicateGroups[groupIndex];
  const indices = g.indices;
  const kept = [];
  const toMerge = [];

  indices.forEach(i => {
    if (state.itemsToDelete.has(i)) return;
    if (state.itemsToMerge.has(i)) toMerge.push(state.items[i]);
    else kept.push(state.items[i]);
  });

  if (toMerge.length > 1) {
    const merged = mergeSameAccountGroup(toMerge);
    kept.push(merged);
  } else {
    toMerge.forEach(it => kept.push(it));
  }

  return kept;
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

function updateSelectAllGroupsBtnLabel(state, btn) {
  if (!state.duplicateGroups.length) {
    btn.textContent = "Select all entries in all groups";
    btn.disabled = true;
    return;
  }
  const allIndices = [];
  state.duplicateGroups.forEach(g => g.indices.forEach(i => allIndices.push(i)));
  if (!allIndices.length) {
    btn.textContent = "Select all entries in all groups";
    btn.disabled = true;
    return;
  }
  const allSelected = allIndices.every(i => state.selectedItems.has(i));
  btn.disabled = false;
  btn.textContent = allSelected ? "Unselect all entries in all groups" : "Select all entries in all groups";
}

function updateMergeAllGroupsBtnLabel(state, btn) {
  if (!state.duplicateGroups.length) {
    btn.textContent = "Merge all entries in all groups";
    btn.disabled = true;
    return;
  }
  btn.disabled = false;
  const allIndices = [];
  state.duplicateGroups.forEach(g => g.indices.forEach(i => allIndices.push(i)));
  const allMerged = allIndices.every(i => state.itemsToMerge.has(i));
  btn.textContent = allMerged ? "Unmark all merges" : "Merge all entries in all groups";
}

function updateDeleteSelectedBtnLabel(state, btn) {
  if (!state.selectedItems.size) {
    btn.textContent = "Mark selected for deletion";
    btn.disabled = true;
    return;
  }
  btn.disabled = false;
  const allSelectedAreDeleted = Array.from(state.selectedItems).every(i => state.itemsToDelete.has(i));
  btn.textContent = allSelectedAreDeleted ? "Unmark selected for deletion" : "Mark selected for deletion";
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

    htmlParts.push(`<div class="group">`);
    htmlParts.push(`<div class="group-header">`);
    htmlParts.push(`<div class="group-header-main">`);
    htmlParts.push(`<div class="group-header-site">${escapeHtml(site)}</div>`);
    htmlParts.push(`<div class="group-header-meta">`);

    htmlParts.push(`<div class="meta-line">
      <span class="username">${escapeHtml(usernameRaw)}</span>
    </div>`);

    htmlParts.push(`<div class="meta-line">
      <span class="count">${count} item${count === 1 ? "" : "s"}</span>`);

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

    let deleteLabel = "Mark group for deletion";
    const anySelectedDeleted = selectedInGroup.some(i => state.itemsToDelete.has(i));
    if (anySelectedDeleted) {
      deleteLabel = "Unmark selected for deletion";
    } else if (selectedCount > 0) {
      deleteLabel = "Mark selected for deletion";
    }

    let mergeLabel = "Mark to merge entire group";
    let mergeDisabled = false;
    const anySelectedMerged = selectedInGroup.some(i => state.itemsToMerge.has(i));

    if (anySelectedMerged) {
      mergeLabel = "Unmark merge";
    } else if (selectedCount > 1) {
      mergeLabel = "Merge selected entries";
    } else if (selectedCount === 1) {
      mergeLabel = "Merge selected entries";
      mergeDisabled = true;
    }

    const disabledAttr = mergeDisabled ? "disabled" : "";

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

    if (state.showPreviews && deletedInGroup < count) {
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

  const groupEls = refs.groupsEl.querySelectorAll(".group");
  state.duplicateGroups.forEach((g, groupIndex) => {
    const groupEl = groupEls[groupIndex];
    if (!groupEl) return;
    const count = g.indices.length;
    const deletedInGroup = g.indices.filter(i => state.itemsToDelete.has(i)).length;
    if (deletedInGroup >= count) return;
    groupEl.insertAdjacentHTML("beforeend", buildPreviewSectionHtml(state, groupIndex));
  });
}

export function applyFilter(refs) {
  const term = refs.filterInput.value.toLowerCase().trim();
  const groups = refs.groupsEl.querySelectorAll(".group");
  refs.clearSearchBtn.style.display = term ? "block" : "none";

  groups.forEach(group => {
    if (!term) {
      group.style.display = "";
      return;
    }
    const siteEl = group.querySelector(".group-header-site");
    const usernameEl = group.querySelector(".username");
    const site = siteEl ? siteEl.textContent.toLowerCase() : "";
    const username = usernameEl ? usernameEl.textContent.toLowerCase() : "";
    if (site.includes(term) || username.includes(term)) {
      group.style.display = "";
    } else {
      group.style.display = "none";
    }
  });
}

export function renderUI(state, refs) {
  renderSummary(state, refs);

  refs.downloadBtn.disabled = !state.items.length;

  updateSelectAllGroupsBtnLabel(state, refs.selectAllGroupsBtn);
  updateMergeAllGroupsBtnLabel(state, refs.mergeAllGroupsBtn);
  updateDeleteSelectedBtnLabel(state, refs.deleteSelectedBtn);

  if (!state.duplicateGroups.length) {
    refs.hintEl.textContent = "";
    refs.groupsEl.innerHTML = "";
    return;
  }

  refs.hintEl.textContent = "";
  refs.groupsEl.innerHTML = renderGroupsMarkup(state);
  applyFilter(refs);
}
