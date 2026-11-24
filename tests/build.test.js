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
    expect(html).not.toMatch(/__INLINE_CSS__|__INLINE_JS__|__VERSION__|__CSP_SCRIPT_HASH__|__CSP_STYLE_HASH__/);
    expect(html).not.toContain("\r");
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

  it("allows exactly the inlined style block, and no style attributes or images", () => {
    const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]);
    expect(styles).toHaveLength(1);
    const hash = createHash("sha256").update(styles[0], "utf8").digest("base64");
    const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
    expect(policy).toContain(`style-src 'sha256-${hash}'`);
    expect(policy).not.toContain("unsafe-inline");
    expect(policy).not.toContain("img-src");
    // a style attribute would be blocked by the policy, so none may be left in the page or in what the script renders
    expect(html.replace(/<style>[\s\S]*?<\/style>/, "")).not.toMatch(/\sstyle\s*=/i);
  });

  it("opts out of browser translation", () => {
    expect(html).toMatch(/<html[^>]*translate="no"/);
    expect(html).toContain('<meta name="google" content="notranslate"');
  });

  it("does not load anything from outside the file", () => {
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=/i);
    // remote css would come in through @import or url(), which only matter inside the style block
    const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
    expect(css).not.toMatch(/@import|url\(\s*['"]?https?:/i);
  });
});