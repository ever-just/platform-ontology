#!/usr/bin/env node
// Builds the static lookup tables in public/data/ref from official sources.
//   Bluetooth SIG assigned numbers: https://bitbucket.org/bluetooth-SIG/public (assigned_numbers/)
//   USB vendor ids: http://www.linux-usb.org/usb.ids (GPL-2.0-or-later or BSD-3-Clause)
// Run: node scripts/gen-ref-data.mjs   (needs network). Output is committed so the app works offline.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data", "ref");
const SIG = "https://bitbucket.org/bluetooth-SIG/public/raw/main/assigned_numbers/";
const USB = "http://www.linux-usb.org/usb.ids";

const get = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
};
const unq = (s) => s.trim().replace(/^'(.*)'$/, "$1").replace(/^"(.*)"$/, "$1").replace(/''/g, "'");
const hex = (n, w) => "0x" + n.toString(16).toUpperCase().padStart(w, "0");

/** The SIG files are flat lists of `- key: value` blocks; a tiny line parser is enough. */
function items(yaml, first) {
  const out = [];
  let cur = null;
  for (const raw of yaml.split("\n")) {
    if (raw.trimStart().startsWith("#")) continue;
    const m = raw.match(/^\s*(-\s+)?(\w+):\s*(.*)$/);
    if (!m) continue;
    if (m[1] && m[2] === first) { cur = {}; out.push(cur); }
    if (cur) cur[m[2]] = unq(m[3]);
  }
  return out;
}

const companies = Object.fromEntries(items(await get(SIG + "company_identifiers/company_identifiers.yaml"), "value").map((x) => [hex(Number(x.value), 4), x.name]));
const services = Object.fromEntries(items(await get(SIG + "uuids/service_uuids.yaml"), "uuid").map((x) => [hex(Number(x.uuid), 4), x.name]));
const characteristics = Object.fromEntries(items(await get(SIG + "uuids/characteristic_uuids.yaml"), "uuid").map((x) => [hex(Number(x.uuid), 4), x.name]));

// Appearance = category << 6 | subcategory. Nested lists, so walk by indentation.
const appearance = {};
{
  let cat = null, catName = "";
  for (const raw of (await get(SIG + "core/appearance_values.yaml")).split("\n")) {
    if (raw.trimStart().startsWith("#")) continue;
    let m;
    if ((m = raw.match(/^\s*-\s+category:\s*(\S+)/))) { cat = Number(m[1]); continue; }
    if ((m = raw.match(/^\s*-\s+value:\s*(\S+)/))) { appearance.__sub = Number(m[1]); continue; }
    if ((m = raw.match(/^(\s*)name:\s*(.*)$/)) && cat !== null) {
      if (m[1].length <= 3) { catName = unq(m[2]); appearance[cat << 6] = catName; delete appearance.__sub; }
      else if (appearance.__sub !== undefined) { appearance[(cat << 6) | appearance.__sub] = `${catName}: ${unq(m[2])}`; delete appearance.__sub; }
    }
  }
  delete appearance.__sub;
}

// USB vendors only (top-level lines "vvvv  Name"); product lists are tab-indented and skipped to keep the file small.
const usbVendors = {};
for (const line of (await get(USB)).split("\n")) {
  if (line.startsWith("C ")) break; // device classes section starts here
  const m = line.match(/^([0-9a-f]{4})\s{2}(.+)$/);
  if (m) usbVendors[hex(parseInt(m[1], 16), 4)] = m[2].trim();
}

const meta = {
  generated: new Date().toISOString().slice(0, 10),
  sources: { bluetooth: SIG, usb: USB },
  counts: { companies: Object.keys(companies).length, services: Object.keys(services).length, characteristics: Object.keys(characteristics).length, appearance: Object.keys(appearance).length, usbVendors: Object.keys(usbVendors).length },
  notice: "Bluetooth assigned numbers are published by Bluetooth SIG, Inc. USB vendor names come from the linux-usb.org usb.ids list (GPL-2.0-or-later or BSD-3-Clause).",
};
await mkdir(OUT, { recursive: true });
const files = { "bt-companies.json": companies, "bt-services.json": services, "bt-characteristics.json": characteristics, "bt-appearance.json": appearance, "usb-vendors.json": usbVendors, "meta.json": meta };
for (const [f, v] of Object.entries(files)) await writeFile(join(OUT, f), JSON.stringify(v) + "\n");
console.log(meta.counts);
