import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getState,
  subscribe,
  setVault,
  clearVault,
  toggleSelected,
  toggleSelectGroup,
  groupAction,
  applyGroupAction,
  selectAllAction,
  toggleSelectAll,
  mergeAllAction,
  toggleMergeAll,
  deleteSelectedAction,
  toggleDeleteSelected,
  setFilterText,
  isGroupVisible,
} from "../src/state.js";

const login = (id, user, uri) => ({
  id, type: 1, name: id, creationDate: "2020-01-01", revisionDate: "2020-01-01",
  login: { username: user, password: "p", uris: [{ match: null, uri }] }
});

// group 0 is a.com with three entries, group 1 is b.com with two
function loadVault() {
  setVault({
    encrypted: false, folders: [],
    items: [
      login("a1", "u", "https://a.com"),
      login("a2", "u", "https://a.com"),
      login("a3", "u", "https://a.com"),
      login("b1", "u", "https://b.com"),
      login("b2", "u", "https://b.com"),
      login("solo", "u", "https://c.com")
    ]
  });
}

const sorted = set => [...set].sort((x, y) => x - y);

beforeEach(loadVault);

describe("loading", () => {
  it("finds the groups and starts with nothing queued", () => {
    const s = getState();
    expect(s.duplicateGroups.map(g => g.indices)).toEqual([[0, 1, 2], [3, 4]]);
    expect(s.itemsToMerge.size + s.itemsToDelete.size + s.selectedItems.size).toBe(0);
  });

  it("clears marks when another vault is loaded", () => {
    applyGroupAction(0, "merge");
    toggleSelected(3);
    loadVault();
    const s = getState();
    expect(s.itemsToMerge.size + s.selectedItems.size).toBe(0);
  });

  it("clears everything on clearVault", () => {
    applyGroupAction(0, "delete");
    clearVault();
    const s = getState();
    expect(s.items).toEqual([]);
    expect(s.duplicateGroups).toEqual([]);
    expect(s.itemsToDelete.size).toBe(0);
  });

  it("tells subscribers about changes", () => {
    const fn = vi.fn();
    const unsubscribe = subscribe(fn);
    toggleSelected(0);
    unsubscribe();
    toggleSelected(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("selection", () => {
  it("toggles one entry", () => {
    toggleSelected(1);
    expect(sorted(getState().selectedItems)).toEqual([1]);
    toggleSelected(1);
    expect(getState().selectedItems.size).toBe(0);
  });

  it("ignores indices that do not exist", () => {
    toggleSelected(NaN);
    toggleSelected(99);
    expect(getState().selectedItems.size).toBe(0);
  });

  it("selects a whole group, then unselects it", () => {
    toggleSelected(0);
    toggleSelectGroup(0);
    expect(sorted(getState().selectedItems)).toEqual([0, 1, 2]);
    toggleSelectGroup(0);
    expect(getState().selectedItems.size).toBe(0);
  });
});

describe("group merge and delete buttons", () => {
  it("marks the whole group when nothing is ticked, and the next click unmarks it", () => {
    expect(groupAction(getState(), 0, "merge").label).toBe("Mark to merge entire group");
    applyGroupAction(0, "merge");
    expect(sorted(getState().itemsToMerge)).toEqual([0, 1, 2]);
    expect(groupAction(getState(), 0, "merge").label).toBe("Unmark group merge");
    applyGroupAction(0, "merge");
    expect(getState().itemsToMerge.size).toBe(0);
  });

  it("marks only the ticked entries and clears the ticks", () => {
    toggleSelected(0);
    toggleSelected(2);
    expect(groupAction(getState(), 0, "merge").label).toBe("Merge selected entries");
    applyGroupAction(0, "merge");
    expect(sorted(getState().itemsToMerge)).toEqual([0, 2]);
    expect(getState().selectedItems.size).toBe(0);
  });

  it("labels the button with what the next click really does after a partial merge", () => {
    toggleSelected(0);
    toggleSelected(1);
    applyGroupAction(0, "merge");
    const action = groupAction(getState(), 0, "merge");
    expect(action.label).toBe("Unmark group merge");
    applyGroupAction(0, "merge");
    expect(getState().itemsToMerge.size).toBe(0);
  });

  it("disables merge with a single entry ticked and ignores the click", () => {
    toggleSelected(1);
    expect(groupAction(getState(), 0, "merge").disabled).toBe(true);
    applyGroupAction(0, "merge");
    expect(getState().itemsToMerge.size).toBe(0);
    expect(sorted(getState().selectedItems)).toEqual([1]);
  });

  it("unmarks only the ticked entries that were marked", () => {
    applyGroupAction(0, "delete");
    toggleSelected(1);
    expect(groupAction(getState(), 0, "delete").label).toBe("Unmark selected for deletion");
    applyGroupAction(0, "delete");
    expect(sorted(getState().itemsToDelete)).toEqual([0, 2]);
  });

  it("clears a deletion when the entry is marked for merge, and the other way round", () => {
    applyGroupAction(0, "delete");
    applyGroupAction(0, "merge");
    expect(getState().itemsToDelete.size).toBe(0);
    expect(sorted(getState().itemsToMerge)).toEqual([0, 1, 2]);
    toggleSelected(2);
    applyGroupAction(0, "delete");
    expect(sorted(getState().itemsToMerge)).toEqual([0, 1]);
    expect(sorted(getState().itemsToDelete)).toEqual([2]);
  });

  it("does nothing for a group that does not exist", () => {
    applyGroupAction(7, "merge");
    expect(getState().itemsToMerge.size).toBe(0);
  });
});

describe("filter", () => {
  it("matches the site, the username, entry names and full URIs, ignoring case", () => {
    setVault({
      encrypted: false, folders: [],
      items: [
        { id: "1", type: 1, name: "Work GitHub", creationDate: "2020-01-01",
          login: { username: "Octo", uris: [{ match: null, uri: "https://github.com/orgs/acme" }] } },
        { id: "2", type: 1, name: "GitHub", creationDate: "2021-01-01",
          login: { username: "octo", uris: [{ match: null, uri: "https://github.com" }] } }
      ]
    });
    const visibleFor = text => {
      setFilterText(text);
      return isGroupVisible(getState(), 0);
    };
    expect(visibleFor("GITHUB.COM")).toBe(true);
    expect(visibleFor("octo")).toBe(true);
    expect(visibleFor("work")).toBe(true);
    expect(visibleFor("orgs/acme")).toBe(true);
    expect(visibleFor("gitlab")).toBe(false);
    expect(visibleFor("   ")).toBe(true);
  });

  it("is cleared when a vault is loaded", () => {
    setFilterText("a.com");
    loadVault();
    expect(getState().filterText).toBe("");
  });
});

describe("global buttons", () => {
  it("selects every grouped entry, then unselects them", () => {
    expect(selectAllAction(getState()).label).toBe("Select all entries in all groups");
    toggleSelectAll();
    expect(sorted(getState().selectedItems)).toEqual([0, 1, 2, 3, 4]);
    expect(selectAllAction(getState()).label).toBe("Unselect all entries in all groups");
    toggleSelectAll();
    expect(getState().selectedItems.size).toBe(0);
  });

  it("merges every group and clears deletions, then unmarks", () => {
    applyGroupAction(1, "delete");
    toggleMergeAll();
    expect(sorted(getState().itemsToMerge)).toEqual([0, 1, 2, 3, 4]);
    expect(getState().itemsToDelete.size).toBe(0);
    expect(mergeAllAction(getState()).label).toBe("Unmark all groups matched by URL");
    toggleMergeAll();
    expect(getState().itemsToMerge.size).toBe(0);
  });

  it("marks selected entries for deletion and clears their merge marks", () => {
    applyGroupAction(0, "merge");
    toggleSelected(1);
    expect(deleteSelectedAction(getState()).disabled).toBe(false);
    toggleDeleteSelected();
    expect(sorted(getState().itemsToDelete)).toEqual([1]);
    expect(sorted(getState().itemsToMerge)).toEqual([0, 2]);
    expect(deleteSelectedAction(getState()).label).toBe("Unmark selected for deletion");
    toggleDeleteSelected();
    expect(getState().itemsToDelete.size).toBe(0);
  });

  it("only acts on groups the filter leaves visible", () => {
    setFilterText("b.com");
    expect(selectAllAction(getState()).label).toBe("Select all entries in visible groups");
    toggleSelectAll();
    expect(sorted(getState().selectedItems)).toEqual([3, 4]);
    toggleMergeAll();
    expect(sorted(getState().itemsToMerge)).toEqual([3, 4]);
    expect(mergeAllAction(getState()).label).toBe("Unmark visible groups matched by URL");
  });

  it("does not delete selected entries that the filter hides", () => {
    toggleSelected(0);
    toggleSelected(3);
    setFilterText("b.com");
    expect(deleteSelectedAction(getState()).targets).toEqual([3]);
    toggleDeleteSelected();
    expect(sorted(getState().itemsToDelete)).toEqual([3]);
  });

  it("leaves groups matched only by email domain or name out of merge all", () => {
    setVault({
      encrypted: false, folders: [],
      items: [
        login("a1", "u", "https://a.com"),
        login("a2", "u", "https://a.com"),
        { id: "forum", type: 1, name: "Forum", login: { username: "me@gmail.com", uris: [] } },
        { id: "shop", type: 1, name: "Shop", login: { username: "me@gmail.com", uris: [] } },
        { id: "acme1", type: 1, name: "Login at acme.io", login: { username: "bob", uris: [] } },
        { id: "acme2", type: 1, name: "Acme.io support", login: { username: "bob", uris: [] } }
      ]
    });
    const s = getState();
    expect(s.duplicateGroups.map(g => [g.site, g.matchedBy])).toEqual([
      ["a.com", "uri"],
      ["acme.io", "name"],
      ["gmail.com", "email"]
    ]);
    expect(mergeAllAction(s).label).toBe("Merge all groups matched by URL");
    toggleMergeAll();
    expect(sorted(s.itemsToMerge)).toEqual([0, 1]);
    applyGroupAction(2, "merge");
    expect(sorted(s.itemsToMerge)).toEqual([0, 1, 2, 3]);
  });

  it("disables the buttons when there is nothing to act on", () => {
    clearVault();
    const s = getState();
    expect(selectAllAction(s).disabled).toBe(true);
    expect(mergeAllAction(s).disabled).toBe(true);
    expect(deleteSelectedAction(s).disabled).toBe(true);
  });
});
