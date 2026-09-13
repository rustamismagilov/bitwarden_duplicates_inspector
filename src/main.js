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
  hasQueuedChanges,
  marksSnapshot,
} from "./state.js";
import { buildExport } from "./core/merge.js";
import { parseVaultExport } from "./core/vault.js";
import { renderUI, applyFilter, togglePreviewSections } from "./ui/render.js";
import { attachDelegatedListener } from "./ui/events.js";

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

function setTheme(theme) {
  const body = document.body;
  if (theme === "dark") body.classList.add("theme-dark");
  else body.classList.remove("theme-dark");
  try { localStorage.setItem("bwTheme", theme); } catch {}
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem("bwTheme"); } catch {}
  if (saved !== "light" && saved !== "dark") {
    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    saved = prefersDark ? "dark" : "light";
  }
  setTheme(saved);
}

initTheme();

themeToggleBtn.addEventListener("click", () => {
  const isDark = document.body.classList.contains("theme-dark");
  setTheme(isDark ? "light" : "dark");
});

function setStatus(msg, isError = false) {
  statusEl.textContent = msg || "";
  statusEl.className = isError ? "error" : "";
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
  URL.revokeObjectURL(url);
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
    downloadJson(outputData, "bitwarden_merged.json");
    downloadedMarks = marksSnapshot(s);
  } catch (err) {
    alert(`Could not build export: ${err.message}`);
  }
}

// the marks as they were at the last download, null before the first one
let downloadedMarks = null;

function hasUnsavedChanges() {
  const s = getState();
  return hasQueuedChanges(s) && marksSnapshot(s) !== downloadedMarks;
}

function resetToEmpty(errorMessage) {
  clearVault();
  downloadedMarks = null;
  fileLabelText.textContent = "Choose file";
  searchWrapper.style.display = "none";
  setStatus(errorMessage, true);
}

function handleFileChange(e) {
  const input = e.target;
  const file = input.files && input.files[0];
  // clear the input so picking the same file again still fires change
  input.value = "";
  // a cancelled picker can fire change with no file, keep what is loaded
  if (!file) return;

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
    if (hasUnsavedChanges() &&
        !confirm("Load another file? The merges and deletions queued for the current file have not been downloaded and will be lost.")) {
      return;
    }

    try {
      filterInput.value = "";
      downloadedMarks = null;
      setVault(data);
    } catch (err) {
      // the vault is already swapped in at this point, so start clean rather than show half of it
      resetToEmpty("Error: that file could not be shown. " + err.message);
      return;
    }
    fileLabelText.textContent = file.name;
    setStatus("");
    searchWrapper.style.display = "block";
  };
  reader.onerror = () => setStatus("Error: that file could not be read.", true);
  reader.readAsText(file);
}

window.addEventListener("beforeunload", e => {
  if (!hasUnsavedChanges()) return;
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
  togglePreviewSections(getState(), refs);
});

fileInput.addEventListener("change", handleFileChange);
downloadBtn.addEventListener("click", handleDownload);
deleteSelectedBtn.addEventListener("click", toggleDeleteSelected);
selectAllGroupsBtn.addEventListener("click", toggleSelectAll);
mergeAllGroupsBtn.addEventListener("click", toggleMergeAll);

attachDelegatedListener(groupsEl);

subscribe((state) => renderUI(state, refs));

// Initial paint (no vault loaded yet)
renderUI(getState(), refs);
