import { useSyncExternalStore } from "react";

// Lookup tables built by scripts/gen-ref-data.mjs from the Bluetooth SIG assigned numbers and the usb.ids list.
// Fetched once on first use (about 270 KB total, cached by the browser), then read synchronously.

type Table = Record<string, string>;
const NAMES = ["bt-companies", "bt-services", "bt-characteristics", "bt-appearance", "usb-vendors"] as const;
type Name = (typeof NAMES)[number];

const tables: Partial<Record<Name, Table>> = {};
const subs = new Set<() => void>();
let version = 0;
let started = false;

function load() {
  if (started) return;
  started = true;
  const base = import.meta.env.BASE_URL + "data/ref/";
  NAMES.forEach((n) =>
    fetch(base + n + ".json")
      .then((r) => (r.ok ? r.json() : {}))
      .then((t: Table) => { tables[n] = t; version++; subs.forEach((f) => f()); })
      .catch(() => { /* lookups fall back to raw numbers */ }),
  );
}

const hex4 = (n: number) => "0x" + (n & 0xffff).toString(16).toUpperCase().padStart(4, "0");

/** Re-render when the tables arrive. */
export function useRefData() {
  load();
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => version);
}

export const btCompany = (id: number) => { load(); return tables["bt-companies"]?.[hex4(id)] ?? null; };
export const btAppearance = (v: number) => { load(); return tables["bt-appearance"]?.[String(v)] ?? tables["bt-appearance"]?.[String(v & ~0x3f)] ?? null; };
export const usbVendor = (id: number | undefined | null) => { load(); return id == null ? null : tables["usb-vendors"]?.[hex4(id)] ?? null; };

/** 16-bit SIG UUIDs appear as 0000xxxx-0000-1000-8000-00805f9b34fb; anything else is vendor specific. */
export function btUuid(uuid: string | number): { short: string; name: string | null; kind: "service" | "characteristic" | "custom" } {
  load();
  let n: number | null = null;
  if (typeof uuid === "number") n = uuid;
  else {
    const m = uuid.toLowerCase().match(/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/) || uuid.toLowerCase().match(/^(?:0x)?([0-9a-f]{4})$/);
    if (m) n = parseInt(m[1], 16);
  }
  if (n === null) return { short: String(uuid).slice(0, 8), name: null, kind: "custom" };
  const k = hex4(n);
  const s = tables["bt-services"]?.[k];
  if (s) return { short: k, name: s, kind: "service" };
  const c = tables["bt-characteristics"]?.[k];
  return { short: k, name: c ?? null, kind: c ? "characteristic" : "custom" };
}
