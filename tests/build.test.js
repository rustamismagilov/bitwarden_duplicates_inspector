import { describe, it, expect, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildPage } from "../build.mjs";

describe("built page", () => {
  let html;

  beforeAll(async () => {
    html = await buildPage();
  });

  it("fills in every template marker", () => {
    expect(html).not.toMatch(/__INLINE_CSS__|__INLINE_JS__|__VERSION__|__CSP_SCRIPT_HASH__/);
  });

  it("shows the version from package.json", () => {
    const { version } = JSON.parse(readFileSync("package.json", "utf8"));
    expect(html).toContain(`v${version}</span>`);
  });

  it("allows exactly the inlined script in its content security policy", () => {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).not.toMatch(/<\/script|<script|<!--/i);
    const hash = createHash("sha256").update(scripts[0], "utf8").digest("base64");
    const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
    expect(policy).toContain(`script-src 'sha256-${hash}'`);
    expect(policy).toContain("default-src 'none'");
  });

  it("does not load anything from outside the file", () => {
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=|@import|url\(\s*['"]?https?:/i);
  });
});