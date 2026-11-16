import { realHandlers } from "./handlers";
import "./chromium";

export * from "./types";
export { collectPassive } from "./passive";
export { realHandlers } from "./handlers";

export function hasReal(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(realHandlers, id);
}
