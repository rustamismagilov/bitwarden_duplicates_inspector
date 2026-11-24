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
    // nobody is asked about a file that turned out unusable
    expect(window.confirm).not.toHaveBeenCalled();
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

  it("lets file drags through to the drop and leaves text drags alone", () => {
    const drag = types => {
      const e = new Event("dragover", { bubbles: true, cancelable: true });
      e.dataTransfer = { types, dropEffect: "none" };
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(drag(["Files"])).toBe(true);
    expect(drag(["text/plain"])).toBe(false);
  });

  it("hides the after-download note when another file loads", async () => {
    $("downloadBtn").click();
    expect($("nextSteps").hidden).toBe(false);
    await pickFile(vaultText(), "second.json");
    expect($("nextSteps").hidden).toBe(true);
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

  it("asks first when a merged entry would be too long for bitwarden", async () => {
    const long = "x".repeat(4000);
    await pickFile(vaultText([
      login("a1", "2020-01-01", { notes: long }),
      login("a2", "2021-01-01", { notes: long + " more" })
    ]), "long.json");
    document.querySelector('[data-action="merge-group"]').click();
    window.confirm = vi.fn(() => false);
    $("downloadBtn").click();
    expect(window.confirm.mock.calls[0][0]).toContain("too long once encrypted");
    expect(window.confirm.mock.calls[0][0]).toContain("a1: Notes");
    expect(downloads).toHaveLength(0);
  });

  it("asks first when a personal export is too big for bitwarden.com", async () => {
    const many = Array.from({ length: 7001 }, (_, i) => ({
      id: `m${i}`, type: 1, name: `m${i}`, creationDate: "2020-01-01",
      login: { username: "u", password: "p", uris: [{ match: null, uri: `https://site${i}.com` }] }
    }));
    await pickFile(JSON.stringify({ encrypted: false, folders: [], items: many }), "big.json");
    window.confirm = vi.fn(() => false);
    $("downloadBtn").click();
    expect(window.confirm.mock.calls[0][0]).toContain("7001 entries, bitwarden.com imports at most 7000 at once");
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
  it("keeps notes open and focus in place when one group of many re-renders on its own", async () => {
    const at = (id, site, extra = {}) => ({
      id, type: 1, name: id, creationDate: id.endsWith("1") ? "2020-01-01" : "2021-01-01", ...extra,
      login: { username: "u", password: "p", uris: [{ match: null, uri: `https://${site}` }] }
    });
    await pickFile(JSON.stringify({ encrypted: false, folders: [], items: [
      at("a1", "a.com"), at("a2", "a.com"),
      at("b1", "b.com", { notes: "note b1" }), at("b2", "b.com"),
      at("c1", "c.com", { notes: "note c1" }), at("c2", "c.com")
    ] }), "three.json");
    const untouched = document.querySelector('section.group[data-group-index="2"]');
    document.querySelector('details[data-key="item-2"]').open = true;
    document.querySelector('details[data-key="item-4"]').open = true;
    const button = document.querySelector('[data-action="merge-group"][data-group-index="1"]');
    button.focus();
    button.click();
    // only the clicked group was replaced, the others are the same nodes
    expect(document.querySelector('section.group[data-group-index="2"]')).toBe(untouched);
    expect(document.querySelector('details[data-key="item-2"]').open).toBe(true);
    expect(document.activeElement.dataset.groupIndex).toBe("1");
    expect(document.activeElement).not.toBe(button);
  });

  it("updates a group's buttons and tags when an entry is ticked", () => {
    document.querySelector('input[data-action="toggle-select"][data-index="0"]').click();
    expect(document.querySelector('[data-action="merge-group"]').textContent.trim()).toBe("Merge selected entries");
    expect(document.querySelector(".tag-selected").textContent).toBe("1 selected");
  });

  it("shows what the preview and the download will hold", () => {
    document.querySelector('[data-action="merge-group"]').click();
    expect($("summaryDownload").textContent).toContain("The download will have 1 entry");
    const toggle = $("previewToggle");
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    expect(document.querySelector(".preview-status").textContent).toBe("merged from 2");
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
  });

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

  // happy-dom may not fire toggle when .open is set from script, so the tests send it themselves
  // it does not bubble in a browser either, the page listens for it on the way down
  const setOpen = (details, open) => {
    details.open = open;
    details.dispatchEvent(new Event("toggle"));
  };

  it("puts a note's text into the page only while the note is open", async () => {
    await pickFile(vaultText([login("a1", "2020-01-01", { notes: "CANARY first note" }), login("a2", "2021-01-01")]), "lazy.json");
    const details = document.querySelector('details[data-key="item-0"]');
    expect(details.querySelector("pre").textContent).toBe("");
    setOpen(details, true);
    expect(details.querySelector("pre").textContent).toBe("CANARY first note");
    setOpen(details, false);
    expect(details.querySelector("pre").textContent).toBe("");
  });

  it("keeps merged passwords out of the page until the preview note is opened", async () => {
    await pickFile(vaultText([login("a1", "2020-01-01"), login("a2", "2021-01-01")]), "secrets.json");
    document.querySelector('[data-action="merge-group"]').click();
    const toggle = $("previewToggle");
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    // the merge writes the other entry's password into the kept entry's notes
    expect($("groups").innerHTML).not.toContain("pw-a2");
    const details = document.querySelector(".preview-container details");
    setOpen(details, true);
    expect(details.querySelector("pre").textContent).toContain("pw-a2");
    // a re-render of the group keeps the note open and fills it again
    document.querySelector('input[data-action="toggle-select"][data-index="0"]').click();
    const again = document.querySelector(".preview-container details");
    expect(again).not.toBe(details);
    expect(again.open).toBe(true);
    expect(again.querySelector("pre").textContent).toContain("pw-a2");
    setOpen(again, false);
    expect($("groups").innerHTML).not.toContain("pw-a2");
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
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
