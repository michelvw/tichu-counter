// Assembles the deployable static site into _site/ (run after `vite build`).
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";

const out = "_site";
const include = [
  "fonts", "icons", "js", "screenshots",
  "dragon-icon.svg", "main.css", "theme.css", "manifest.json", "service-worker.js",
  ...readdirSync(".").filter((name) => name.endsWith(".html")),
];

if (!existsSync("js/cloud.js")) throw new Error("js/cloud.js is missing. Run `vite build` first.");
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const item of include) {
  if (existsSync(item)) cpSync(item, `${out}/${item}`, { recursive: true });
}
console.log(`Site assembled in ${out}/`);
