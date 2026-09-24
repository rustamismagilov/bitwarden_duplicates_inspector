import {
  getState,
  subscribe,
  setVault,
  clearVault,
  setShowPreviews,
  setFilterText,
  toggleSelectAll,
  toggleMergeAll,
  toggleDeleteSelected,
  markDownloaded,
  hasUnsavedChanges,
  fullyDeletedGroups,
} from "./state.js";
import { buildExport } from "./core/merge.js";
import { parseVaultExport } from "./core/vault.js";
import { findOversizedFields, importSizeProblems } from "./core/limits.js";
import { renderUI, applyFilter } from "./ui/render.js";
import { attachDelegatedListener } from "./ui/events.js";
import { initTheme } from "./ui/theme.js";

const intro = document.getElementById("intro");
const nextSteps = document.getElementById("nextSteps");
const savedFileName = document.getElementById("savedFileName");
const fileInput = document.getElementById("fileInput");
const fileLabelText = document.getElementById("fileLabelText");
const filterInput = document.getElementById("filterInput");
const searchWrapper = document.getElementById("searchWrapper");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const selectAllGroupsBtn = document.getElementById("selectAllGroupsBtn");
const mergeAllGroupsBtn = document.getElementById("mergeAllGroupsBtn");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const downloadBtn = document.getElementById("downloadBtn");
const previewToggle = document.getElementById("previewToggle");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const hintEl = document.getElementById("hint");
const groupsEl = document.getElementById("groups");

const refs = {
  filterInput,
  clearSearchBtn,
  selectAllGroupsBtn,
  mergeAllGroupsBtn,
  deleteSelectedBtn,
  downloadBtn,
  summaryEl,
  hintEl,
  groupsEl,
};

initTheme(themeToggleBtn);

function setStatus(msg, isError = false) {
  statusEl.textContent = msg || "";
  statusEl.className = isError ? "error" : "";
}

// the name of the loaded file, so downloads can be named after it
let loadedFileName = "";

// a new name for every download, so a second one never lands as "(1)" next to the first
function downloadFileName(now = new Date()) {
  const base = loadedFileName.replace(/\.json$/i, "").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "bitwarden";
  const pad = n => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${base}_merged_${stamp}.json`;
}

function downloadJson(data, filename) {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // revoking right away can cancel the download in some browsers
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function listLines(lines, max = 10) {
  const shown = lines.slice(0, max).map(line => `- ${line}`);
  if (lines.length > max) shown.push(`- and ${lines.length - max} more`);
  return shown.join("\n");
}

// everything worth a second look before the file is written, asked in one go
function confirmDownload(s, outputData) {
  const sections = [];

  const gone = fullyDeletedGroups(s);
  if (gone.length) {
    sections.push(
      "These accounts will have no entry left in the file, every copy is marked for deletion:\n" +
      listLines(gone.map(g => `${g.site} / ${g.username}`))
    );
  }

  // merged notes can grow past what bitwarden accepts, and then it rejects the whole file
  const oversized = findOversizedFields(outputData.items);
  if (oversized.length) {
    sections.push(
      "Bitwarden will reject this file, because these entries have a field that is too long once encrypted. Unmark those merges or shorten the notes first:\n" +
      listLines(oversized.map(p => `${p.name}: ${p.field}`))
    );
  }

  const tooBig = importSizeProblems(outputData);
  if (tooBig.length) {
    sections.push(
      "This file is too big to import into bitwarden.com in one go. Split it into smaller files before you purge the vault. Self-hosted servers are not limited:\n" +
      listLines(tooBig)
    );
  }

  if (!sections.length) return true;
  return confirm(sections.join("\n\n") + "\n\nDownload anyway?");
}

function handleDownload() {
  try {
    const s = getState();
    if (!s.vaultData) { alert("Load a Bitwarden JSON export first."); return; }
    const outputData = buildExport({
      vaultData: s.vaultData,
      items: s.items,
      duplicateGroups: s.duplicateGroups,
      itemsToMerge: s.itemsToMerge,
      itemsToDelete: s.itemsToDelete,
    });
    if (!confirmDownload(s, outputData)) return;
    const filename = downloadFileName();
    downloadJson(outputData, filename);
    markDownloaded();
    savedFileName.textContent = filename;
    nextSteps.hidden = false;
  } catch (err) {
    alert(`Could not build export: ${err.message}`);
  }
}

function resetToEmpty(errorMessage) {
  clearVault();
  loadedFileName = "";
  fileLabelText.textContent = "Choose file";
  searchWrapper.style.display = "none";
  intro.hidden = false;
  nextSteps.hidden = true;
  setStatus(errorMessage, true);
}

function loadFile(file) {
  // an error from an earlier pick should not linger next to this one
  setStatus("");

  const reader = new FileReader();
  reader.onload = evt => {
    let data;
    try {
      data = parseVaultExport(evt.target.result);
    } catch (err) {
      // a bad pick leaves whatever is loaded alone
      setStatus("Error: " + err.message, true);
      return;
    }

    // only ask once the new file is known to be usable
    if (hasUnsavedChanges(getState()) &&
        !confirm("Load another file? The merges and deletions queued for the current file have not been downloaded and will be lost.")) {
      return;
    }

    try {
      filterInput.value = "";
      setVault(data);
    } catch (err) {
      // the vault is already swapped in at this point, so start clean rather than show half of it
      resetToEmpty("Error: that file could not be shown. " + err.message);
      return;
    }
    loadedFileName = file.name;
    fileLabelText.textContent = "Choose another file";
    setStatus(`Loaded ${file.name}.`);
    searchWrapper.style.display = "block";
    intro.hidden = true;
    nextSteps.hidden = true;
  };
  reader.onerror = () => setStatus("Error: that file could not be read.", true);
  reader.readAsText(file);
}

function handleFileChange(e) {
  const input = e.target;
  const file = input.files && input.files[0];
  // clear the input so picking the same file again still fires change
  input.value = "";
  // a cancelled picker can fire change with no file, keep what is loaded
  if (file) loadFile(file);
}

// dropping a file anywhere on the page loads it
// without this the browser would open the plaintext vault in the tab instead
// other drags, like text into the filter box, keep working as usual
const isFileDrag = e => Array.from(e.dataTransfer?.types ?? []).includes("Files");

window.addEventListener("dragover", e => {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
});
window.addEventListener("drop", e => {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file);
});

window.addEventListener("beforeunload", e => {
  if (!hasUnsavedChanges(getState())) return;
  e.preventDefault();
  e.returnValue = "";
});

filterInput.addEventListener("input", () => {
  setFilterText(filterInput.value);
  applyFilter(getState(), refs);
});
clearSearchBtn.addEventListener("click", () => {
  filterInput.value = "";
  setFilterText("");
  applyFilter(getState(), refs);
  filterInput.focus();
});

previewToggle.addEventListener("change", () => {
  setShowPreviews(previewToggle.checked);
});

fileInput.addEventListener("change", handleFileChange);
downloadBtn.addEventListener("click", handleDownload);
deleteSelectedBtn.addEventListener("click", toggleDeleteSelected);
selectAllGroupsBtn.addEventListener("click", toggleSelectAll);
mergeAllGroupsBtn.addEventListener("click", toggleMergeAll);

attachDelegatedListener(groupsEl);

subscribe((state) => renderUI(state, refs));

// a browser can bring the checkbox back ticked after a reload or back, so start from what it shows
// setShowPreviews also paints the page for the first time
setShowPreviews(previewToggle.checked);
