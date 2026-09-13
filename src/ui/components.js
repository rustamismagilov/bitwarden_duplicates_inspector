function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(str) {
  if (!str) return "—";
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;
  return d.toLocaleString();
}

export { escapeHtml, formatDate };

// preview: a row of the result preview, which has no checkbox
// sole: the only entry of its group left after deletions
// mergeBase: the entry a queued merge keeps
export function renderItemRow(state, it, idx, { preview = false, sole = false, mergeBase = false } = {}) {
  const login = it.login || {};
  const uris = Array.isArray(login.uris) ? login.uris : [];
  const name = it.name || "";
  const created = it.creationDate || "";
  const revised = it.revisionDate || "";
  const notes = it.notes || "";

  let urisHtml = "";
  if (uris.length === 0) {
    urisHtml = "—";
  } else {
    urisHtml = "<ul class=\"uri-list\">" + uris.map(u => {
      return "<li>" + escapeHtml(u.uri || "") + "</li>";
    }).join("") + "</ul>";
  }

  let notesHtml = "";
  if (!notes) {
    notesHtml = `<span class="note-empty">—</span>`;
  } else {
    const short = notes.length > 120 ? notes.slice(0, 120) + "…" : notes;
    notesHtml =
      `<details><summary>${escapeHtml(short)}</summary>` +
      `<pre>${escapeHtml(notes)}</pre></details>`;
  }

  const favTag = it.favorite ? `<span class="tag tag-fav">★ favorite</span>` : "";
  const typeTag = it.type !== 1 ? `<span class="tag tag-no-login">type=${escapeHtml(String(it.type))}</span>` : "";
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
    else if (sole) rowClass = "row-kept";

    const checkedAttr = isSelected ? "checked" : "";
    checkHtml = `<td class="col-select" style="text-align:center;">
      <input type="checkbox" class="item-select" data-action="toggle-select" data-index="${idx}" ${checkedAttr} />
    </td>`;
  } else {
    checkHtml = `<td class="col-select" style="text-align:center; color: var(--muted); font-weight:600;">Final Result</td>`;
  }

  return `<tr class="${rowClass}" data-item-index="${idx}">
    ${checkHtml}
    <td class="col-name">
      ${escapeHtml(name || "(no name)")}
      ${favTag}${typeTag}${keptTag}
      <span class="badge badge-id">id: ${escapeHtml(it.id || "new")}</span>
    </td>
    <td class="col-dates">
      <div><span class="badge">Created</span> ${escapeHtml(formatDate(created))}</div>
      <div style="margin-top:2px;"><span class="badge">Updated</span> ${escapeHtml(formatDate(revised))}</div>
    </td>
    <td class="col-uris">${urisHtml}</td>
    <td class="col-notes">${notesHtml}</td>
  </tr>`;
}
