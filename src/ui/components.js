import { asText, SECRET_NOTE_SECTIONS } from "../core/merge.js";

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(str) {
  if (!str) return "-";
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;
  return d.toLocaleString();
}

// the collapsed notes line is readable without a click, so it stops before the passwords
// and totp secrets a merge writes into notes, the open note still shows everything
function notesSummary(notes) {
  const cut = Math.min(...SECRET_NOTE_SECTIONS.map(h => notes.indexOf(h)).filter(i => i !== -1));
  if (!Number.isFinite(cut)) return notes.length > 120 ? notes.slice(0, 120) + "…" : notes;
  const before = notes.slice(0, cut).replace(/[\s-]+$/, "");
  const shown = before.length > 120 ? before.slice(0, 120) + "…" : before;
  return (shown ? shown + " " : "") + "(merged passwords hidden, open to show)";
}

export { escapeHtml, formatDate, notesSummary };

// preview: a row of the result preview, which has no checkbox
// previewStatus: what a preview row says about its entry, like "merged from 3"
// lastLeft: the only entry of its group left after deletions
// mergeBase: the entry a queued merge keeps
// key: identifies the row's notes so they can stay open across re-renders
export function renderItemRow(state, it, idx, { preview = false, previewStatus = "", lastLeft = false, mergeBase = false, key = `item-${idx}` } = {}) {
  const login = it.login || {};
  const uris = (Array.isArray(login.uris) ? login.uris : []).filter(Boolean);
  const name = it.name || "";
  const created = it.creationDate || "";
  const revised = it.revisionDate || "";
  const notes = asText(it.notes);

  let urisHtml = "";
  if (uris.length === 0) {
    urisHtml = "-";
  } else {
    urisHtml = "<ul class=\"uri-list\">" + uris.map(u => {
      return "<li>" + escapeHtml(u.uri || "") + "</li>";
    }).join("") + "</ul>";
  }

  let notesHtml = "";
  if (!notes) {
    notesHtml = `<span class="note-empty">-</span>`;
  } else {
    notesHtml =
      `<details data-key="${escapeHtml(key)}"><summary>${escapeHtml(notesSummary(notes))}</summary>` +
      `<pre>${escapeHtml(notes)}</pre></details>`;
  }

  const favTag = it.favorite ? `<span class="tag tag-fav">★ favorite</span>` : "";
  const typeTag = it.type !== 1 ? `<span class="tag tag-no-login">type=${escapeHtml(String(it.type))}</span>` : "";
  const archivedTag = it.archivedDate ? `<span class="tag">archived</span>` : "";
  const keptTag = mergeBase
    ? `<span class="tag tag-kept" title="The merge keeps this entry, the oldest one, and adds what the others have. Passwords that differ are written to its notes.">kept in merge</span>`
    : "";

  let rowClass = "";
  let checkHtml = "";

  if (!preview) {
    const isDeleted = state.itemsToDelete.has(idx);
    const isMerged = state.itemsToMerge.has(idx);
    const isSelected = state.selectedItems.has(idx);

    if (isDeleted) rowClass = "row-deleted";
    else if (isMerged) rowClass = "row-merged";
    else if (lastLeft) rowClass = "row-last-left";

    const checkedAttr = isSelected ? "checked" : "";
    checkHtml = `<td class="col-select">
      <input type="checkbox" class="item-select" data-action="toggle-select" data-index="${idx}" aria-label="Select ${escapeHtml(name || "(no name)")}, created ${escapeHtml(formatDate(created))}" ${checkedAttr} />
    </td>`;
  } else {
    checkHtml = `<td class="col-select preview-status">${escapeHtml(previewStatus)}</td>`;
  }

  return `<tr class="${rowClass}">
    ${checkHtml}
    <td class="col-name">
      ${escapeHtml(name || "(no name)")}
      ${favTag}${typeTag}${archivedTag}${keptTag}
      <span class="badge badge-id">id: ${escapeHtml(it.id || "new")}</span>
    </td>
    <td class="col-dates">
      <div><span class="badge">Created</span> ${escapeHtml(formatDate(created))}</div>
      <div class="dates-updated"><span class="badge">Updated</span> ${escapeHtml(formatDate(revised))}</div>
    </td>
    <td class="col-uris">${urisHtml}</td>
    <td class="col-notes">${notesHtml}</td>
  </tr>`;
}
