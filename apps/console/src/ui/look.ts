import { useSyncExternalStore } from "react";
import { resetTokens } from "./kit";

// The console look: three takes on Blueprint's open source theme (@blueprintjs/core, Apache 2.0).
// ops: Blueprint dark gray, the default. midnight: deeper black with cerulean, for dim rooms.
// light: Blueprint's light theme.

export type Look = "ops" | "midnight" | "light";
export const LOOKS: { id: Look; label: string; hint: string }[] = [
  { id: "ops", label: "Dark", hint: "Blueprint dark gray" },
  { id: "midnight", label: "Midnight", hint: "Deeper black, cerulean accent" },
  { id: "light", label: "Light", hint: "Blueprint light" },
];
const KEY = "po.look";
const subs = new Set<() => void>();

function read(): Look {
  try {
    const q = new URLSearchParams(location.search).get("look");
    const v = (q || localStorage.getItem(KEY)) as Look | null;
    if (v && LOOKS.some((l) => l.id === v)) return v;
  } catch { /* private mode */ }
  return "ops";
}

let current: Look = read();

export function applyLook(l: Look = current) {
  current = l;
  document.documentElement.dataset.look = l;
  document.body.classList.toggle("bp6-dark", l !== "light");
  resetTokens();
  subs.forEach((f) => f());
}

export function setLook(l: Look) {
  try { localStorage.setItem(KEY, l); } catch { /* private mode */ }
  applyLook(l);
}

export const useLook = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => current);
