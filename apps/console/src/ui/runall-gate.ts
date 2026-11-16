import type { AtlasNode, ScopeDef } from "../core/types";
import { permissionName, probe, RELEASE_LABEL } from "../browser/availability";
import type { Profile } from "../browser/profile";

// Can this capability actually start here, right now? Run all asks this before it queues a prompt,
// so nobody is walked through a prompt the browser, the device or a policy will refuse anyway.

export type Why = "missing" | "blocked" | "policy" | "device" | "insecure";
export type Gate = { why: Why; text: string } | null;

type Env = { cams: number; mics: number; bt: boolean | null; touch: boolean; mobile: boolean; secure: boolean; policy: any };

let envP: Promise<Env> | null = null;
/** Facts about the device that do not change during one visit. Device counts work before any permission. */
export function deviceEnv(): Promise<Env> {
  return (envP ??= (async () => {
    const nav = navigator as any;
    let cams = -1, mics = -1;
    try {
      const d: MediaDeviceInfo[] = await nav.mediaDevices.enumerateDevices();
      cams = d.filter((x) => x.kind === "videoinput").length;
      mics = d.filter((x) => x.kind === "audioinput").length;
    } catch { /* unknown */ }
    let bt: boolean | null = null;
    try { if (nav.bluetooth?.getAvailability) bt = await nav.bluetooth.getAvailability(); } catch { /* unknown */ }
    const mobile = !!nav.userAgentData?.mobile || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    return {
      cams, mics, bt, mobile, touch: (navigator.maxTouchPoints || 0) > 0, secure: window.isSecureContext,
      policy: (document as any).permissionsPolicy || (document as any).featurePolicy || null,
    };
  })());
}

const CAM = /camera|ptz/i;
const MIC = /microphone|\.mic\b/i;
const SENSOR = /^motion\.(orientation|accelerometer|gyro|compass)|^capture\.light|accelerometer|gyroscope|magnetometer|ambient-light|device-?orientation|device-?motion/i;

/** null when it can be tried; otherwise the plain reason it cannot. */
export async function gate(s: ScopeDef, node: AtlasNode | undefined, profile: Profile): Promise<Gate> {
  if (s.reference) return null; // reference cards only check availability, which always works
  const env = await deviceEnv();
  const perm = s.permission || (node && permissionName(node));
  const key = s.id + " " + (s.permission || "") + " " + (node?.perm || "");

  if (!env.secure && (s.permission || s.gesture)) return { why: "insecure", text: "Needs a secure https page." };

  if (node) {
    const a = await probe(node, profile);
    if (a.release === "not-exposed") return { why: "missing", text: "No browser gives this to a web page." };
    if (a.detect === "absent") {
      const r = a.release === "stable" || a.release === "partial" || a.release === "no" ? "Not in this copy of the browser" : RELEASE_LABEL[a.release];
      return { why: "missing", text: `${r} (${a.via} is missing).` };
    }
    if (a.detect !== "present" && ["flag", "origin-trial", "install", "enterprise", "no"].includes(a.release)) return { why: "missing", text: RELEASE_LABEL[a.release] + "." };
    if (a.permission === "denied") return { why: "blocked", text: "Blocked for this site. Allow it in site settings first." };
  }

  if (perm && env.policy?.allowsFeature) {
    try {
      const known: string[] = env.policy.features?.() || env.policy.allowedFeatures?.() || [];
      if ((!env.policy.features || known.includes(perm)) && !env.policy.allowsFeature(perm)) return { why: "policy", text: "Turned off by this site's Permissions Policy." };
    } catch { /* not a policy feature */ }
  }

  if ((perm === "camera" || (!perm && CAM.test(s.id))) && env.cams === 0) return { why: "device", text: "No camera on this device." };
  if ((perm === "microphone" || (!perm && MIC.test(s.id))) && env.mics === 0) return { why: "device", text: "No microphone on this device." };
  if (/bluetooth/i.test(key) && env.bt === false) return { why: "device", text: "Bluetooth is off or missing on this device." };
  if (SENSOR.test(key) && !env.mobile && !env.touch) return { why: "device", text: "This computer has no motion or light sensors." };
  if (/vibrat/i.test(key) && !env.mobile) return { why: "device", text: "Only phones can vibrate." };
  if (/nfc/i.test(key) && !env.mobile) return { why: "device", text: "NFC works only on Android phones." };
  return null;
}
