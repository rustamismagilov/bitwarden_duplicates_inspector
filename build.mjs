import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

// bundles the app and inlines everything into one html file that works offline
export async function buildPage() {
  const { version } = JSON.parse(readFileSync("package.json", "utf8"));

  const result = await build({
    entryPoints: ["src/main.js"],
    bundle: true,
    format: "iife",
    minify: true,
    write: false,
    logLevel: "warning",
  });

  const js = result.outputFiles[0].text;
  const css = readFileSync("src/styles.css", "utf8");
  let html = readFileSync("src/template.html", "utf8");

  // a missing or doubled marker would ship a page without styles or code, so fail loudly
  // the callback keeps $ sequences in the css or js from being read as replacement patterns
  function fill(marker, value) {
    const count = html.split(marker).length - 1;
    if (count !== 1) throw new Error(`src/template.html must contain ${marker} exactly once, found ${count}`);
    html = html.replace(marker, () => value);
  }

  // any of these inside an inline script can end it early or swallow the rest of the page
  const unsafe = js.match(/<\/script|<script|<!--/i);
  if (unsafe) throw new Error(`the bundled script contains ${unsafe[0]} and cannot be inlined`);

  // the content security policy allows this exact script and nothing else
  const scriptHash = createHash("sha256").update(js, "utf8").digest("base64");
  fill("__CSP_SCRIPT_HASH__", `'sha256-${scriptHash}'`);
  fill("__VERSION__", version);
  fill("/*__INLINE_CSS__*/", css);
  fill("/*__INLINE_JS__*/", js);

  return html;
}

// compare real paths, so running through a symlink or junction still counts as running this file
function isRunDirectly() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isRunDirectly()) {
  const html = await buildPage();
  mkdirSync("dist", { recursive: true });
  writeFileSync("dist/index.html", html);
  console.log(`Wrote dist/index.html (${html.length.toLocaleString()} bytes)`);
}
