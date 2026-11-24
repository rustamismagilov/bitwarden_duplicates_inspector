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
  // a browser reads crlf as lf before it hashes an inline block, so a windows checkout must not change the hashes
  const css = readFileSync("src/styles.css", "utf8").replace(/\r\n/g, "\n");
  let html = readFileSync("src/template.html", "utf8").replace(/\r\n/g, "\n");

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

  if (/<\/style/i.test(css)) throw new Error("src/styles.css contains </style and cannot be inlined");
  if (js.includes("\r") || css.includes("\r")) throw new Error("a carriage return in the script or styles would break their hashes");

  // the content security policy allows this exact script and this exact style block, and nothing else
  // so markup that slips in can bring neither a script, a style attribute nor a style element
  const sha256 = text => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;
  fill("__CSP_SCRIPT_HASH__", sha256(js));
  fill("__CSP_STYLE_HASH__", sha256(css));
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
  console.log(`Wrote dist/index.html (${Buffer.byteLength(html).toLocaleString()} bytes)`);
}
