import { describe, it, expect } from "vitest";
import { escapeHtml, formatDate, renderItemRow } from "../src/ui/components.js";

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
    expect(html).toContain('aria-label="Select &lt;img src=x onerror=alert(2)&gt;"');
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
