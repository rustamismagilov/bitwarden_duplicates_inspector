import { renderItemRow, escapeHtml } from "./components.js";
import { resolveGroupEntries, mergeSelection } from "../core/merge.js";
import { groupAction, groupTags, isGroupVisible, selectAllAction, mergeAllAction, deleteSelectedAction } from "../state.js";

// the group table and its preview share their columns
const COLUMN_COUNT = 5;

function tableHtml(firstHeader, rowsHtml) {
  return `<table>
    <thead><tr>
      <th class="col-select">${firstHeader}</th>
      <th class="col-name">Name</th>
      <th class="col-dates">Created / Updated</th>
      <th class="col-uris">URIs</th>
      <th class="col-notes">Notes</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>`;
}

function buildPreviewSectionHtml(state, groupIndex) {
  const g = state.duplicateGroups[groupIndex];
  const previewEntries = resolveGroupEntries(state.items, g, state.itemsToMerge, state.itemsToDelete);
  const { toMerge, keptIndex } = mergeSelection(state.items, g, state.itemsToMerge, state.itemsToDelete);
  // key open notes by the entry a row comes from, so they stay with it when rows shift
  const rowsHtml = previewEntries.length
    ? previewEntries.map(({ index, item }) => renderItemRow(state, item, index, {
      preview: true,
      previewStatus: index === keptIndex ? `merged from ${toMerge.length}` : "unchanged",
      key: `preview-${groupIndex}-${index}`,
    })).join("")
    : `<tr><td colspan="${COLUMN_COUNT}" class="preview-empty">Every entry in this group will be deleted. Nothing from it ends up in the export.</td></tr>`;
  return `<div class="preview-container">
    <div class="preview-arrow">▼ Result Preview</div>
    ${tableHtml("Result", rowsHtml)}
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
    const { toMerge, keptIndex } = mergeSelection(state.items, g, state.itemsToMerge, state.itemsToDelete);
    if (keptIndex !== -1) mergeReduction += toMerge.length - 1;
  });

  const finalExportCount = totalItems - state.itemsToDelete.size - mergeReduction;

  if (!totalItems) {
    writeHtml(refs.summaryTotalsEl, "");
    writeHtml(refs.summaryDownloadEl, "");
    return;
  }

  // the totals only change with a new file, the download count changes with every mark
  // only the download count is a live region, so a click does not re-read the totals
  writeHtml(refs.summaryTotalsEl,
    `Loaded <strong>${plural(totalItems, "entry", "entries")}</strong>.<br>` +
    `Found <strong>${plural(groupsCount, "duplicate group")}</strong> ` +
    `involving <strong>${plural(dupItemsCount, "entry", "entries")}</strong>.<br>` +
    `<strong>${uniqueCount}</strong> ${uniqueCount === 1 ? "entry has" : "entries have"} no duplicates.`
  );
  writeHtml(refs.summaryDownloadEl,
    `The download will have <strong>${plural(finalExportCount, "entry", "entries")}</strong><br>` +
    `<small class="text-muted">(${state.itemsToDelete.size} deleted, ${mergeReduction} merged)</small>`
  );
}

function renderGlobalButton(btn, action) {
  btn.textContent = action.label;
  btn.disabled = action.disabled;
}

// what each tag that asks for a look means, shown on hover
const TAG_TITLES = {
  passkeys: "These entries hold different passkeys. A Bitwarden login only uses one, so a merge keeps the passkeys of the oldest entry that has any and lists the others in notes, without their keys.",
  "match rules": "These entries use different Bitwarden match rules (host with port, starts with, exact or regular expression). People set those to tell separate accounts on one server apart, so check before merging.",
  collections: "These entries are in different collections. A merge puts the result in all of them, so everyone with access to any of those collections sees everything that was merged in.",
  email: "Some entries have no URL for this site, so they were grouped by their email domain. Check that they are the same account before merging.",
  name: "Some entries have no URL for this site, so they were grouped by their entry name. Check that they are the same account before merging.",
};

// the tags under a group heading: why to check it, and what is queued
function groupTagsHtml(state, groupIndex, { count, selectedCount, mergedInGroup, deletedInGroup }) {
  const g = state.duplicateGroups[groupIndex];
  const tags = groupTags(g, state.groupConcerns[groupIndex]).map(({ key, label }) =>
    `<span class="tag tag-weak" title="${escapeHtml(TAG_TITLES[key])}">${escapeHtml(label)}</span>`
  );

  if (selectedCount > 0) {
    tags.push(`<span class="tag tag-selected">${selectedCount === count ? "all selected" : `${selectedCount} selected`}</span>`);
  }

  if (mergedInGroup > 1) {
    tags.push(`<span class="tag tag-merge">${mergedInGroup} will be merged into one</span>`);
  } else if (mergedInGroup === 1) {
    tags.push(`<span class="tag tag-merge">1 marked for merge, mark another to merge</span>`);
  }

  if (deletedInGroup === count) {
    tags.push(`<span class="tag tag-deleted">all ${count} will be deleted, none kept</span>`);
  } else if (deletedInGroup > 0) {
    tags.push(`<span class="tag tag-deleted">${deletedInGroup} will be deleted</span>`);
  }

  return tags.join("");
}

// every group has the same three buttons, so each also names its group for screen readers
function groupButtonsHtml(state, groupIndex, allSelected) {
  const mergeAction = groupAction(state, groupIndex, "merge");
  const deleteAction = groupAction(state, groupIndex, "delete");
  const mergeDisabled = mergeAction.disabled ? `disabled title="${escapeHtml(mergeAction.hint)}"` : "";
  const describedBy = `aria-describedby="group-${groupIndex}-site group-${groupIndex}-user"`;
  return `<div class="group-actions">
    <button type="button" class="btn btn-secondary btn-select-group" data-action="select-group" data-group-index="${groupIndex}" ${describedBy}>
      ${allSelected ? "Unselect all in group" : "Select all in group"}
    </button>
    <button type="button" class="btn btn-merge-group" data-action="merge-group" data-group-index="${groupIndex}" ${describedBy} ${mergeDisabled}>
      ${escapeHtml(mergeAction.label)}
    </button>
    <button type="button" class="btn btn-danger btn-delete-group" data-action="delete-group" data-group-index="${groupIndex}" ${describedBy}>
      ${escapeHtml(deleteAction.label)}
    </button>
  </div>`;
}

function renderGroupMarkup(state, groupIndex) {
  const g = state.duplicateGroups[groupIndex];
  const count = g.indices.length;
  const selectedCount = g.indices.filter(i => state.selectedItems.has(i)).length;
  // mergeBase is the entry a merge keeps, so the table can point it out
  const { toMerge, keptIndex: mergeBase } = mergeSelection(state.items, g, state.itemsToMerge, state.itemsToDelete);
  const deletedInGroup = g.indices.filter(i => state.itemsToDelete.has(i)).length;
  const tagsHtml = groupTagsHtml(state, groupIndex, { count, selectedCount, mergedInGroup: toMerge.length, deletedInGroup });

  const rowsHtml = g.indices.map(idx => {
    // the only entry of the group left after deletions
    const lastLeft = !state.itemsToDelete.has(idx) && count - deletedInGroup === 1;
    return renderItemRow(state, state.items[idx], idx, { lastLeft, mergeBase: idx === mergeBase });
  }).join("");

  return `<section class="group" data-group-index="${groupIndex}" aria-labelledby="group-${groupIndex}-site">
    <div class="group-header">
      <div class="group-header-main">
        <h2 class="group-header-site" id="group-${groupIndex}-site">${escapeHtml(g.site)}</h2>
        <div class="group-header-meta">
          <div class="meta-line"><span class="username" id="group-${groupIndex}-user">${escapeHtml(g.usernameRaw)}</span></div>
          <div class="meta-line"><span class="count">${plural(count, "entry", "entries")}</span>${tagsHtml}</div>
        </div>
      </div>
      ${groupButtonsHtml(state, groupIndex, selectedCount === count)}
    </div>
    ${tableHtml("Select", rowsHtml)}
    ${shouldShowPreview(state, g) ? buildPreviewSectionHtml(state, groupIndex) : ""}
  </section>`;
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

// a group's markup only depends on the preview switch and the marks on its own entries
// the rest (entries, tags, dates) is fixed for a loaded vault, so the markup is reused until those change
let groupCache = [];

function groupSignature(state, g) {
  let sig = state.showPreviews ? "p" : "-";
  for (const i of g.indices) {
    sig += (state.selectedItems.has(i) ? "s" : "-") + (state.itemsToMerge.has(i) ? "m" : "-") + (state.itemsToDelete.has(i) ? "d" : "-");
  }
  return sig;
}

function groupMarkup(state, groupIndex) {
  const sig = groupSignature(state, state.duplicateGroups[groupIndex]);
  const cached = groupCache[groupIndex];
  if (cached && cached.sig === sig) return cached.html;
  const html = renderGroupMarkup(state, groupIndex);
  groupCache[groupIndex] = { sig, html };
  return html;
}

export function renderUI(state, refs) {
  renderSummary(state, refs);
  refs.downloadBtn.disabled = !state.items.length;

  if (renderedItems !== state.items) groupCache = [];
  const markup = state.duplicateGroups.map((g, gi) => groupMarkup(state, gi));
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
