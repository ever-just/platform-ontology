#!/usr/bin/env node
// Control coverage gate. Every button, input, select, textarea and clickable element in the console
// should carry a stable data-control id so the AI can list and press it. This scans the .tsx sources,
// prints coverage per file, and exits non zero when coverage drops below the threshold.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../src", import.meta.url).pathname;
const MIN = Number(process.env.CONTROL_COVERAGE_MIN || 95);
const verbose = process.argv.includes("--list");

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".tsx")) files.push(p);
  }
})(ROOT);

/** Read a JSX opening tag starting at i (the "<"), skipping braces and strings, and return its text. */
function openTag(src, i) {
  let depth = 0, q = null;
  for (let j = i + 1; j < src.length; j++) {
    const c = src[j];
    if (q) { if (c === "\\") j++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") { if (depth > 0 || c !== "`") q = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(i, j + 1);
  }
  return src.slice(i);
}

const NATIVE = /^<(button|input|select|textarea)\b/;
let total = 0, covered = 0;
const rows = [], missing = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  let t = 0, c = 0;
  const re = /<([A-Za-z][\w.]*)\b/g;
  let m;
  while ((m = re.exec(src))) {
    const tag = openTag(src, m.index);
    // Only real JSX: skip generic type arguments like Array<string> and comparisons.
    if (!/^<[A-Za-z][\w.]*(\s|\/?>)/.test(tag)) continue;
    if (!NATIVE.test(tag) && !/\sonClick=/.test(tag)) continue;
    // Hidden file inputs are driven by a visible button that carries the id.
    if (/type="file"/.test(tag) && /hidden|display:\s*"none"/.test(tag)) continue;
    t++;
    // A spread passes the caller's data-control through (kit components).
    if (/\sdata-control=|\{\s*\.\.\./.test(tag)) c++;
    else missing.push(`${relative(ROOT, f)}:${src.slice(0, m.index).split("\n").length}  ${tag.split("\n")[0].slice(0, 90)}`);
  }
  if (t) rows.push([relative(ROOT, f), c, t]);
  total += t; covered += c;
}

rows.sort((a, b) => a[1] / a[2] - b[1] / b[2]);
for (const [f, c, t] of rows) if (c < t || verbose) console.log(`${String(Math.round((100 * c) / t)).padStart(4)}%  ${c}/${t}  ${f}`);
if (verbose) missing.forEach((l) => console.log("  missing " + l));
const pct = total ? (100 * covered) / total : 100;
console.log(`\nControl coverage: ${covered}/${total} = ${pct.toFixed(1)}% (minimum ${MIN}%)`);
if (pct < MIN) {
  console.error(`Control coverage is below ${MIN}%. Add data-control="scope.thing" to the elements listed by: node scripts/control-coverage.mjs --list`);
  process.exit(1);
}
