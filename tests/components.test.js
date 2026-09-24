import { describe, it, expect } from "vitest";
import { escapeHtml, formatDate, renderItemRow, notesSummary } from "../src/ui/components.js";
import { mergeSameAccountGroup } from "../src/core/merge.js";

const emptyState = () => ({ itemsToMerge: new Set(), itemsToDelete: new Set(), selectedItems: new Set() });

describe("escapeHtml", () => {
  it("escapes every character that can break out of text or an attribute", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });

  it("turns null and undefined into an empty string and keeps numbers", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(0)).toBe("0");
  });
});

describe("formatDate", () => {
  it("shows a dash for a missing date", () => {
    expect(formatDate("")).toBe("-");
    expect(formatDate(null)).toBe("-");
  });

  it("returns text that is not a date as it is", () => {
    expect(formatDate("YYYY-MM-00T00:00:00.000Z")).toBe("YYYY-MM-00T00:00:00.000Z");
  });
});

describe("notesSummary with merged secrets", () => {
  it("hides a merged totp secret or older password history too", () => {
    const totpOnly = mergeSameAccountGroup([
      { id: "a", type: 1, creationDate: "2019-01-01", login: { username: "u", password: "p", totp: "otpauth://A", uris: [] } },
      { id: "b", type: 1, creationDate: "2020-01-01", login: { username: "u", password: "p", totp: "otpauth://SECRET", uris: [] } }
    ]);
    expect(totpOnly.notes).toContain("otpauth://SECRET");
    expect(notesSummary(totpOnly.notes)).toBe("(merged passwords hidden, open to show)");

    const h = (pw, day) => ({ lastUsedDate: `2020-01-0${day}T00:00:00.000Z`, password: pw });
    const historyOnly = mergeSameAccountGroup([
      { id: "a", type: 1, creationDate: "2019-01-01", passwordHistory: [h("h1", 1), h("h2", 2), h("h3", 3)], login: { username: "u", password: "p", uris: [] } },
      { id: "b", type: 1, creationDate: "2020-01-01", passwordHistory: [h("h4", 4), h("h5", 5), h("h6", 6)], login: { username: "u", password: "p", uris: [] } }
    ]);
    expect(historyOnly.notes).toContain("h1");
    expect(notesSummary(historyOnly.notes)).toBe("(merged passwords hidden, open to show)");
  });

  it("keeps the secret out of the row's summary line but in the opened note", () => {
    const merged = mergeSameAccountGroup([
      { id: "a", type: 1, creationDate: "2019-01-01", notes: "own note", login: { username: "u", password: "old", uris: [] } },
      { id: "b", type: 1, creationDate: "2020-01-01", login: { username: "u", password: "secret-new", uris: [] } }
    ]);
    const html = renderItemRow(emptyState(), merged, 0);
    const summary = html.match(/<summary>([\s\S]*?)<\/summary>/)[1];
    const opened = html.match(/<pre>([\s\S]*?)<\/pre>/)[1];
    expect(summary).not.toContain("secret-new");
    expect(opened).toContain("secret-new");
  });
});

describe("notesSummary", () => {
  it("shows short notes as they are and cuts long ones", () => {
    expect(notesSummary("pin in the safe")).toBe("pin in the safe");
    expect(notesSummary("x".repeat(130))).toBe("x".repeat(120) + "…");
  });

  it("stops before the passwords and totp secrets a merge wrote", () => {
    const merged = mergeSameAccountGroup([
      { id: "a", type: 1, creationDate: "2019-01-01", notes: "recovery in the safe", login: { username: "u", password: "old", totp: "otpauth://A", uris: [] } },
      { id: "b", type: 1, creationDate: "2020-01-01", login: { username: "u", password: "secret-new", totp: "otpauth://B", uris: [] } }
    ]);
    expect(merged.notes).toContain("secret-new");
    expect(notesSummary(merged.notes)).toBe("recovery in the safe (merged passwords hidden, open to show)");
  });

  it("says so when the notes start with merged secrets", () => {
    const merged = mergeSameAccountGroup([
      { id: "a", type: 1, creationDate: "2019-01-01", login: { username: "u", password: "old", uris: [] } },
      { id: "b", type: 1, creationDate: "2020-01-01", login: { username: "u", password: "secret-new", uris: [] } }
    ]);
    expect(notesSummary(merged.notes)).toBe("(merged passwords hidden, open to show)");
  });
});

describe("renderItemRow", () => {
  const hostile = {
    id: `"><script>alert(1)</script>`,
    type: 1,
    name: `<img src=x onerror=alert(2)>`,
    notes: `</pre><svg onload=alert(3)>`,
    creationDate: `<b>date</b>`,
    login: { uris: [{ match: null, uri: `javascript:alert(4)"><i>` }] }
  };

  it("escapes every value that comes from the vault", () => {
    const html = renderItemRow(emptyState(), hostile, 0);
    expect(html).not.toMatch(/<script|<img|<svg|<b>|<i>/);
    expect(html).toContain("&lt;img src=x onerror=alert(2)&gt;");
    expect(html).toContain('aria-label="Select &lt;img src=x onerror=alert(2)&gt;, created &lt;b&gt;date&lt;/b&gt;"');
  });

  it("skips empty slots in the URI list instead of crashing", () => {
    const html = renderItemRow(emptyState(), { type: 1, name: "x", login: { uris: [null, { uri: "https://a.com" }] } }, 0);
    expect(html).toContain("<li>https://a.com</li>");
  });

  it("renders a checkbox for the main table and none for the preview", () => {
    expect(renderItemRow(emptyState(), hostile, 3)).toContain('data-action="toggle-select" data-index="3"');
    expect(renderItemRow(emptyState(), hostile, 3, { preview: true })).not.toContain("toggle-select");
  });

  it("reflects the queued marks and the kept entry", () => {
    const state = emptyState();
    state.itemsToDelete.add(1);
    state.selectedItems.add(2);
    expect(renderItemRow(state, hostile, 1)).toContain('class="row-deleted"');
    expect(renderItemRow(state, hostile, 2)).toMatch(/data-index="2"[^>]*checked/);
    expect(renderItemRow(state, hostile, 0, { mergeBase: true })).toContain("kept in merge");
  });
});
