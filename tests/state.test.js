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
    expect(mergeAllAction(getState()).label).toBe("Unmark all merges");
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

  it("disables the buttons when there is nothing to act on", () => {
    clearVault();
    const s = getState();
    expect(selectAllAction(s).disabled).toBe(true);
    expect(mergeAllAction(s).disabled).toBe(true);
    expect(deleteSelectedAction(s).disabled).toBe(true);
  });
});
