import {
  getState,
  subscribe,
  setVault,
  clearVault,
  notify,
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
  } catch (err) {
    alert(`Could not build export: ${err.message}`);
  }
}

function handleDeleteSelected() {
  const s = getState();
  if (!s.selectedItems.size) {
    alert("No entries selected.");
    return;
  }
  const selected = Array.from(s.selectedItems);
  const allDeleted = selected.every(i => s.itemsToDelete.has(i));
  if (allDeleted) selected.forEach(i => s.itemsToDelete.delete(i));
  else selected.forEach(i => s.itemsToDelete.add(i));
  notify();
}

function handleSelectAllGroupsClick() {
  const s = getState();
  if (!s.duplicateGroups.length) return;
  const allIndices = s.duplicateGroups.flatMap(g => g.indices);
  const allSelected = allIndices.every(i => s.selectedItems.has(i));
  if (allSelected) allIndices.forEach(i => s.selectedItems.delete(i));
  else allIndices.forEach(i => s.selectedItems.add(i));
  notify();
}

function handleMergeAllGroupsClick() {
  const s = getState();
  if (!s.duplicateGroups.length) return;
  const allIndices = s.duplicateGroups.flatMap(g => g.indices);
  const allMerged = allIndices.every(i => s.itemsToMerge.has(i));
  if (allMerged) allIndices.forEach(i => s.itemsToMerge.delete(i));
  else allIndices.forEach(i => {
    s.itemsToMerge.add(i);
    s.itemsToDelete.delete(i);
  });
  notify();
}

function handleFileChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) {
    clearVault();
    fileLabelText.textContent = "Choose file";
    setStatus("");
    searchWrapper.style.display = "none";
    return;
  }

  fileLabelText.textContent = file.name;

  const reader = new FileReader();
  reader.onload = evt => {
    try {
      setVault(parseVaultExport(evt.target.result));
      setStatus("");
      searchWrapper.style.display = "block";
    } catch (err) {
      setStatus("Error: " + err.message, true);
      clearVault();
      fileLabelText.textContent = "Choose file";
      searchWrapper.style.display = "none";
    }
  };
  reader.onerror = () => {
    setStatus("Error reading file.", true);
    searchWrapper.style.display = "none";
  };
  reader.readAsText(file);
}

filterInput.addEventListener("input", () => applyFilter(refs));
clearSearchBtn.addEventListener("click", () => {
  filterInput.value = "";
  applyFilter(refs);
});

previewToggle.addEventListener("change", () => {
  const s = getState();
  s.showPreviews = previewToggle.checked;
  // toggle previews in place
  // a full rebuild lags on large vaults
  togglePreviewSections(s, refs);
});

fileInput.addEventListener("change", handleFileChange);
downloadBtn.addEventListener("click", handleDownload);
deleteSelectedBtn.addEventListener("click", handleDeleteSelected);
selectAllGroupsBtn.addEventListener("click", handleSelectAllGroupsClick);
mergeAllGroupsBtn.addEventListener("click", handleMergeAllGroupsClick);

attachDelegatedListener(groupsEl);

subscribe((state) => renderUI(state, refs));

// Initial paint (no vault loaded yet)
renderUI(getState(), refs);
