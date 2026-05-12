import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const result = await build({
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "iife",
  minify: true,
  write: false,
  logLevel: "info",
});

const js = result.outputFiles[0].text;
const css = readFileSync("src/styles.css", "utf8");
const template = readFileSync("src/index.html", "utf8");

const html = template
  .replace("/*__INLINE_CSS__*/", () => css)
  .replace("/*__INLINE_JS__*/", () => js);

mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", html);

console.log(`Wrote dist/index.html (${html.length.toLocaleString()} bytes)`);
