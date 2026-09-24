// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { getState } from "../src/state.js";

// the page as the build ships it, minus the inlined script and styles
const template = readFileSync("src/template.html", "utf8");
const body = template.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script>[\s\S]*?<\/script>/, "");

const $ = id => document.getElementById(id);

const login = (id, date, extra = {}) => ({
  id, type: 1, name: id, creationDate: date, revisionDate: date, folderId: null,
  login: { username: "u@x.com", password: "pw-" + id, uris: [{ match: null, uri: "https://a.com" }] },
  ...extra
});
const vaultText = (items = [login("a1", "2020-01-01"), login("a2", "2021-01-01")]) =>
  JSON.stringify({ encrypted: false, folders: [], items });

// the file reader works asynchronously, so wait until the page reacts
async function until(check) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise(r => setTimeout(r, 5));
  }
  throw new Error("timed out waiting for the page");
}

// the page clears the status as soon as a pick starts, so wait for the status the load ends with
async function pickFile(text, name = "vault.json", endStatus = `Loaded ${name}.`) {
  const input = $("fileInput");
  Object.defineProperty(input, "files", { value: [new File([text], name)], configurable: true });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await until(() => $("status").textContent === endStatus);
}

let downloads = [];

beforeAll(async () => {
  document.body.innerHTML = body;
  // capture downloads instead of writing files
  URL.createObjectURL = blob => { downloads.push({ blob }); return "blob:test"; };
  URL.revokeObjectURL = () => {};
  HTMLAnchorElement.prototype.click = function () { downloads[downloads.length - 1].name = this.download; };
  await import("../src/main.js");
});

beforeEach(async () => {
  downloads = [];
  window.confirm = vi.fn(() => true);
  await pickFile(vaultText(), "vault.json");
});

describe("loading a file", () => {
  it("shows the groups, names the file and swaps the intro for the controls", () => {
    expect(document.querySelectorAll("section.group")).toHaveLength(1);
    expect($("status").textContent).toBe("Loaded vault.json.");
    expect($("summaryTotals").textContent).toContain("Loaded 2 entries from vault.json.");
    expect($("fileLabelText").textContent).toBe("Choose another file");
    expect($("intro").hidden).toBe(true);
    expect($("searchWrapper").style.display).toBe("block");
  });

  it("keeps the file name in the summary after the status line changes", async () => {
    await pickFile("not json", "bad.json", "Error: That file is not valid JSON.");
    expect($("summaryTotals").textContent).toContain("from vault.json");
  });

  it("keeps the loaded vault and its marks when the next file is not valid", async () => {
    document.querySelector('[data-action="merge-group"]').click();
    await pickFile("not json", "bad.json", "Error: That file is not valid JSON.");
    expect(getState().itemsToMerge.size).toBe(2);
    expect(document.querySelectorAll("section.group")).toHaveLength(1);
  });

  it("asks before replacing queued changes, and keeps them when the answer is no", async () => {
    document.querySelector('[data-action="merge-group"]').click();
    window.confirm = vi.fn(() => false);
    const next = vaultText([login("b1", "2020-01-01"), login("b2", "2021-01-01")]);
    const input = $("fileInput");
    Object.defineProperty(input, "files", { value: [new File([next], "other.json")], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await until(() => window.confirm.mock.calls.length === 1);
    expect(getState().items.map(it => it.id)).toEqual(["a1", "a2"]);
    expect(getState().itemsToMerge.size).toBe(2);
  });

  it("loads a file dropped on the page", async () => {
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    drop.dataTransfer = { types: ["Files"], files: [new File([vaultText([login("d1", "2020-01-01"), login("d2", "2021-01-01")])], "dropped.json")] };
    window.dispatchEvent(drop);
    await until(() => $("status").textContent === "Loaded dropped.json.");
    expect(drop.defaultPrevented).toBe(true);
    expect(getState().items.map(it => it.id)).toEqual(["d1", "d2"]);
  });
});

describe("downloading", () => {
  it("writes the merged vault under a name based on the loaded file and shows the next steps", async () => {
    document.querySelector('[data-action="merge-group"]').click();
    $("downloadBtn").click();
    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toMatch(/^vault_merged_\d{4}-\d{2}-\d{2}_\d{6}\.json$/);
    const out = JSON.parse(await downloads[0].blob.text());
    expect(out.items.map(it => it.id)).toEqual(["a1"]);
    expect($("nextSteps").hidden).toBe(false);
    expect($("savedFileName").textContent).toBe(downloads[0].name);
    $("dismissNextSteps").click();
    expect($("nextSteps").hidden).toBe(true);
  });

  it("asks first when every copy of an account is deleted, and writes nothing on no", () => {
    document.querySelector('[data-action="delete-group"]').click();
    window.confirm = vi.fn(() => false);
    $("downloadBtn").click();
    expect(window.confirm.mock.calls[0][0]).toContain("a.com / u@x.com");
    expect(downloads).toHaveLength(0);
  });

  it("guards against closing the page only while marks are not downloaded", () => {
    const leave = () => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(leave()).toBe(false);
    document.querySelector('[data-action="merge-group"]').click();
    expect(leave()).toBe(true);
    $("downloadBtn").click();
    expect(leave()).toBe(false);
  });
});

describe("the list", () => {
  it("keeps an open note and the focused button when a click re-renders the group", async () => {
    await pickFile(vaultText([login("a1", "2020-01-01", { notes: "first" }), login("a2", "2021-01-01")]), "notes.json");
    document.querySelector('details[data-key="item-0"]').open = true;
    const button = document.querySelector('[data-action="merge-group"]');
    button.focus();
    button.click();
    expect(document.querySelector('details[data-key="item-0"]').open).toBe(true);
    expect(document.activeElement.dataset.action).toBe("merge-group");
    expect(document.activeElement).not.toBe(button);
  });

  it("follows the preview checkbox", () => {
    document.querySelector('[data-action="merge-group"]').click();
    const toggle = $("previewToggle");
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    expect(document.querySelectorAll(".preview-container")).toHaveLength(1);
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
    expect(document.querySelectorAll(".preview-container")).toHaveLength(0);
  });
});
