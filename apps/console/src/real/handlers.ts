import type { Field, RealHandler, RealResult } from "./types";

// Real browser calls. Each handler asks the browser for real data.
// Nothing here is sent anywhere. Payments never charge, credentials are never created.

const nav = (): any => navigator as any;
const win = (): any => window as any;

function explain(e: any, what: string): string {
  const name = e && e.name ? String(e.name) : "Error";
  const msg = e && e.message ? String(e.message) : "";
  switch (name) {
    case "NotAllowedError":
      return `You said no. The browser blocked ${what}, either because you declined the prompt or because a setting forbids it.`;
    case "PermissionDeniedError":
      return `You said no. ${what} was declined.`;
    case "SecurityError":
      return `The browser refused ${what} here (it needs a secure https page, or a rule blocks it). ${msg}`;
    case "NotFoundError":
      return `Nothing was found for ${what}. No matching device, or you closed the chooser.`;
    case "NotSupportedError":
      return `This browser or device does not support ${what}.`;
    case "NotReadableError":
      return `Another app is already using the hardware needed for ${what}.`;
    case "AbortError":
      return `You closed the chooser, so ${what} was cancelled.`;
    case "OverconstrainedError":
      return `No device matched the settings requested for ${what}.`;
    case "NetworkError":
      return `The device would not open for ${what}. ${msg}`;
    case "InvalidStateError":
      return `The browser said ${what} is not possible right now. ${msg}`;
    default:
      return `${what} failed: ${name}${msg ? ", " + msg : ""}`;
  }
}

const fail = (e: any, what: string): RealResult => ({ ok: false, fields: [], error: explain(e, what) });
const unsupported = (what: string, hint?: string): RealResult => ({
  ok: false,
  fields: [],
  error: `This browser does not offer ${what}.${hint ? " " + hint : ""}`,
});
const f = (name: string, value: Field["value"], unit?: string): Field => (unit ? { name, value, unit } : { name, value });
const num = (x: unknown, digits = 2): number | null =>
  typeof x === "number" && isFinite(x) ? Number(x.toFixed(digits)) : null;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function stopStream(s?: MediaStream | null) {
  try {
    s && s.getTracks().forEach((t) => t.stop());
  } catch {
    /* ignore */
  }
}

const handlers: Record<string, RealHandler> = {};
function add(ids: string[], label: string, needsGesture: boolean, run: () => Promise<RealResult>, stop?: () => void) {
  for (const id of ids) {
    handlers[id] = {
      id,
      label,
      needsGesture,
      run: async () => {
        try {
          return await run();
        } catch (e) {
          return fail(e, label.toLowerCase());
        }
      },
      stop,
    };
  }
}

// Generic Sensor API helper
function sensorHandler(ctor: string, label: string, props: Array<[string, string, string?]>, opts: any = { frequency: 10 }) {
  let sensor: any = null;
  return {
    run: async (): Promise<RealResult> => {
      const S = win()[ctor];
      if (!S) return unsupported(label, "Try Chrome on Android or a laptop with motion sensors.");
      try {
        const p = nav().permissions;
        if (p && p.query) {
          const name = ctor === "Accelerometer" ? "accelerometer" : ctor === "Gyroscope" ? "gyroscope" : ctor === "Magnetometer" ? "magnetometer" : "ambient-light-sensor";
          const r = await p.query({ name }).catch(() => null);
          if (r && r.state === "denied") return { ok: false, fields: [], error: "You said no. This sensor is blocked for this site." };
        }
      } catch {
        /* ignore */
      }
      return new Promise<RealResult>((resolve) => {
        let done = false;
        const finish = (r: RealResult) => {
          if (done) return;
          done = true;
          resolve(r);
        };
        try {
          sensor = new S(opts);
          sensor.addEventListener("reading", () => {
            const fields = props.map(([k, n, u]) => f(n, num(sensor[k], 3), u));
            const ts = sensor.timestamp;
            fields.push(f("Reading time", num(ts, 0), "ms"));
            finish({ ok: true, fields, note: "Live reading. Move your device and run it again to see it change." });
          });
          sensor.addEventListener("error", (ev: any) => finish(fail(ev.error || ev, label.toLowerCase())));
          sensor.start();
          setTimeout(() => finish({ ok: false, fields: [], error: `No reading arrived from ${label.toLowerCase()}. This device may not have that sensor.` }), 3000);
        } catch (e) {
          finish(fail(e, label.toLowerCase()));
        }
      });
    },
    stop: () => {
      try {
        sensor && sensor.stop();
      } catch {
        /* ignore */
      }
      sensor = null;
    },
  };
}

// ---------------- Location ----------------
add(["web.location.geolocation"], "Your location", true, () => {
  return new Promise<RealResult>((resolve) => {
    if (!nav().geolocation) return resolve(unsupported("location"));
    nav().geolocation.getCurrentPosition(
      (pos: GeolocationPosition) => {
        const c = pos.coords;
        resolve({
          ok: true,
          fields: [
            f("Latitude", num(c.latitude, 6), "degrees"),
            f("Longitude", num(c.longitude, 6), "degrees"),
            f("Accuracy", num(c.accuracy, 0), "metres"),
            f("Altitude", num(c.altitude, 1), "metres"),
            f("Altitude accuracy", num(c.altitudeAccuracy, 1), "metres"),
            f("Direction of travel", num(c.heading, 0), "degrees"),
            f("Speed", num(c.speed, 2), "metres per second"),
            f("Reading time", new Date(pos.timestamp).toLocaleTimeString()),
          ],
          raw: { lat: c.latitude, lon: c.longitude },
        });
      },
      (err: GeolocationPositionError) => {
        resolve({
          ok: false,
          fields: [],
          error: err.code === 1 ? "You said no. Location access was declined." : err.code === 2 ? "Your device could not work out where you are." : "Finding your location took too long.",
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
});

// ---------------- Camera, microphone, screen ----------------
let camStream: MediaStream | null = null;
add(["web.camera.camera"], "Your camera", true, async () => {
  if (!nav().mediaDevices || !nav().mediaDevices.getUserMedia) return unsupported("camera access", "It also needs an https page.");
  stopStream(camStream);
  const stream: MediaStream = await nav().mediaDevices.getUserMedia({ video: true });
  camStream = stream;
  const track: any = stream.getVideoTracks()[0];
  const st: any = track ? track.getSettings() : {};
  const caps: any = track && track.getCapabilities ? track.getCapabilities() : {};
  return {
    ok: true,
    media: stream,
    fields: [
      f("Camera name", track ? track.label : null),
      f("Picture width", st.width ?? null, "pixels"),
      f("Picture height", st.height ?? null, "pixels"),
      f("Frame rate", st.frameRate ? num(st.frameRate, 1) : null, "frames per second"),
      f("Which way it faces", st.facingMode ?? null),
      f("Zoom range", caps.zoom ? `${caps.zoom.min} to ${caps.zoom.max}` : null),
      f("Device id (stable per site)", st.deviceId ? String(st.deviceId).slice(0, 12) + "..." : null),
    ],
    note: "This is your live camera. It stays on until you press stop.",
  };
}, () => {
  stopStream(camStream);
  camStream = null;
});

let micStream: MediaStream | null = null;
let micCtx: AudioContext | null = null;
add(["web.camera.microphone"], "Your microphone", true, async () => {
  if (!nav().mediaDevices || !nav().mediaDevices.getUserMedia) return unsupported("microphone access", "It also needs an https page.");
  stopStream(micStream);
  const stream: MediaStream = await nav().mediaDevices.getUserMedia({ audio: true });
  micStream = stream;
  const track: any = stream.getAudioTracks()[0];
  const st: any = track ? track.getSettings() : {};
  const AC = win().AudioContext || win().webkitAudioContext;
  let rmsText: number | null = null;
  let peak: number | null = null;
  let db: number | null = null;
  if (AC) {
    micCtx = new AC();
    const src = micCtx!.createMediaStreamSource(stream);
    const an = micCtx!.createAnalyser();
    an.fftSize = 2048;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    let sum = 0;
    let n = 0;
    let pk = 0;
    const end = performance.now() + 1000;
    while (performance.now() < end) {
      an.getFloatTimeDomainData(buf);
      for (let i = 0; i < buf.length; i++) {
        sum += buf[i] * buf[i];
        const a = Math.abs(buf[i]);
        if (a > pk) pk = a;
      }
      n += buf.length;
      await sleep(50);
    }
    const rms = Math.sqrt(sum / Math.max(1, n));
    rmsText = num(rms, 4);
    peak = num(pk, 3);
    db = rms > 0 ? num(20 * Math.log10(rms), 1) : null;
  }
  return {
    ok: true,
    media: stream,
    fields: [
      f("Microphone name", track ? track.label : null),
      f("Loudness over 1 second (RMS)", rmsText, "0 to 1 scale"),
      f("Loudness in decibels", db, "dB below full scale"),
      f("Loudest moment", peak, "0 to 1 scale"),
      f("Sample rate", st.sampleRate ?? (micCtx ? micCtx.sampleRate : null), "Hz"),
      f("Echo cancellation", st.echoCancellation ?? null),
      f("Noise suppression", st.noiseSuppression ?? null),
    ],
    note: "Sampled your room for one second. The microphone stays on until you press stop.",
  };
}, () => {
  stopStream(micStream);
  micStream = null;
  try {
    micCtx && micCtx.close();
  } catch {
    /* ignore */
  }
  micCtx = null;
});

let screenStream: MediaStream | null = null;
add(["web.camera.display-capture"], "Screen sharing", true, async () => {
  if (!nav().mediaDevices || !nav().mediaDevices.getDisplayMedia) return unsupported("screen capture", "Phones usually cannot share their screen from a browser.");
  stopStream(screenStream);
  const stream: MediaStream = await nav().mediaDevices.getDisplayMedia({ video: true, audio: false });
  screenStream = stream;
  const track: any = stream.getVideoTracks()[0];
  const st: any = track ? track.getSettings() : {};
  return {
    ok: true,
    media: stream,
    fields: [
      f("What you shared", st.displaySurface ?? null),
      f("Source name", track ? track.label : null),
      f("Width", st.width ?? null, "pixels"),
      f("Height", st.height ?? null, "pixels"),
      f("Frame rate", st.frameRate ? num(st.frameRate, 1) : null, "frames per second"),
    ],
    note: "Your screen is being captured live. Press stop to end it.",
  };
}, () => {
  stopStream(screenStream);
  screenStream = null;
});

add(["web.camera.enumerate-devices", "web.peripherals.enumerate-devices"], "Device list", false, async () => {
  const md = nav().mediaDevices;
  if (!md || !md.enumerateDevices) return unsupported("a device list");
  const list: MediaDeviceInfo[] = await md.enumerateDevices();
  const count = (k: string) => list.filter((d) => d.kind === k).length;
  const labelled = list.filter((d) => d.label).length;
  return {
    ok: true,
    fields: [
      f("Cameras", count("videoinput")),
      f("Microphones", count("audioinput")),
      f("Speakers", count("audiooutput")),
      f("Devices with names visible", labelled),
    ],
    note: labelled ? "Names are visible because you already allowed camera or microphone access." : "Names stay hidden until you allow the camera or microphone.",
    raw: list.map((d) => ({ kind: d.kind, label: d.label })),
  };
});

// ---------------- Notifications ----------------
add(["web.notify.notifications"], "Notifications", true, async () => {
  if (!("Notification" in win())) return unsupported("notifications", "On iPhone this needs the site installed to the Home Screen.");
  const perm: string = await Notification.requestPermission();
  const fields: Field[] = [f("Permission", perm === "granted" ? "Allowed" : perm === "denied" ? "Blocked" : "Not decided")];
  if (perm !== "granted") return { ok: false, fields, error: "You said no. No notification can be shown." };
  try {
    const n = new Notification("Platform.Ontology", { body: "This is a real notification from this page.", silent: true });
    setTimeout(() => n.close(), 6000);
    fields.push(f("Notification shown", true));
  } catch (e) {
    fields.push(f("Notification shown", false));
    return { ok: false, fields, error: explain(e, "showing a notification") };
  }
  return { ok: true, fields, note: "Look for the banner in the corner of your screen." };
});

// ---------------- Clipboard ----------------
add(["web.input.clipboard-write"], "Copy to clipboard", true, async () => {
  if (!nav().clipboard || !nav().clipboard.writeText) return unsupported("clipboard writing");
  const text = "Copied by Platform.Ontology at " + new Date().toLocaleTimeString();
  await nav().clipboard.writeText(text);
  return { ok: true, fields: [f("Text copied", text), f("Characters", text.length)], note: "Paste anywhere to see it." };
});

add(["web.input.clipboard-read"], "Read your clipboard", true, async () => {
  if (!nav().clipboard || !nav().clipboard.readText) return unsupported("clipboard reading", "Firefox does not allow pages to read the clipboard.");
  const text: string = await nav().clipboard.readText();
  const preview = text.length > 120 ? text.slice(0, 120) + "..." : text;
  return {
    ok: true,
    fields: [f("Characters on your clipboard", text.length), f("Beginning of the text", text ? preview : "(empty)")],
    note: "This page just read what you last copied. Real sites can do this too once you allow it.",
  };
});

// ---------------- Vibration ----------------
add(["web.peripherals.vibration", "web.actions.vibrate"], "Vibration", true, async () => {
  if (!nav().vibrate) return unsupported("vibration", "Desktop browsers and iPhones do not vibrate.");
  const ok: boolean = nav().vibrate([200, 100, 200]);
  return { ok, fields: [f("Pattern", "buzz, pause, buzz"), f("Accepted by browser", ok)], note: ok ? "Your device should have buzzed twice." : "The browser ignored the request." };
}, () => {
  try {
    nav().vibrate && nav().vibrate(0);
  } catch {
    /* ignore */
  }
});

// ---------------- Wake lock ----------------
let wake: any = null;
add(["web.display.wake-lock", "web.notify.screen-wake-lock"], "Keep screen awake", true, async () => {
  if (!nav().wakeLock) return unsupported("screen wake lock");
  wake = await nav().wakeLock.request("screen");
  wake.addEventListener && wake.addEventListener("release", () => (wake = null));
  return { ok: true, fields: [f("Wake lock active", !wake.released), f("Type", wake.type)], note: "Your screen will not dim while this page is open. Press stop to release it." };
}, () => {
  try {
    wake && wake.release();
  } catch {
    /* ignore */
  }
  wake = null;
});

// ---------------- Fullscreen ----------------
add(["web.display.fullscreen", "web.actions.fullscreen"], "Fullscreen", true, async () => {
  const el: any = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return unsupported("fullscreen", "iPhone Safari only allows fullscreen for video.");
  await req.call(el);
  return { ok: true, fields: [f("Fullscreen on", !!(document.fullscreenElement || (document as any).webkitFullscreenElement)), f("Screen width", screen.width, "pixels"), f("Screen height", screen.height, "pixels")], note: "Press Escape to leave fullscreen." };
}, () => {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
  } catch {
    /* ignore */
  }
});

// ---------------- Orientation and motion ----------------
let orientHandlers: Array<[string, any]> = [];
function removeOrient() {
  for (const [n, h] of orientHandlers) window.removeEventListener(n, h);
  orientHandlers = [];
}
add(["web.location.device-orientation", "web.location.sensor-orientation"], "Tilt and motion", true, async () => {
  const DO: any = win().DeviceOrientationEvent;
  const DM: any = win().DeviceMotionEvent;
  if (!DO && !DM) return unsupported("tilt and motion data");
  for (const C of [DO, DM]) {
    if (C && typeof C.requestPermission === "function") {
      const r = await C.requestPermission();
      if (r !== "granted") return { ok: false, fields: [], error: "You said no. Motion access was declined." };
    }
  }
  removeOrient();
  return new Promise<RealResult>((resolve) => {
    let o: any = null;
    let m: any = null;
    const finish = () => {
      removeOrient();
      if (!o && !m) return resolve({ ok: false, fields: [], error: "No motion data arrived. This device probably has no motion sensors (most desktops do not)." });
      const fields: Field[] = [];
      if (o) fields.push(f("Compass direction (alpha)", num(o.alpha, 1), "degrees"), f("Front to back tilt (beta)", num(o.beta, 1), "degrees"), f("Left to right tilt (gamma)", num(o.gamma, 1), "degrees"), f("Compass is absolute", !!o.absolute));
      if (m) {
        const a = m.acceleration || {};
        const g = m.accelerationIncludingGravity || {};
        const r = m.rotationRate || {};
        fields.push(
          f("Acceleration x", num(a.x, 2), "m/s2"),
          f("Acceleration y", num(a.y, 2), "m/s2"),
          f("Acceleration z", num(a.z, 2), "m/s2"),
          f("Gravity x", num(g.x, 2), "m/s2"),
          f("Gravity y", num(g.y, 2), "m/s2"),
          f("Gravity z", num(g.z, 2), "m/s2"),
          f("Rotation speed alpha", num(r.alpha, 1), "degrees per second"),
          f("Rotation speed beta", num(r.beta, 1), "degrees per second"),
          f("Rotation speed gamma", num(r.gamma, 1), "degrees per second"),
          f("Sensor interval", num(m.interval, 0), "ms"),
        );
      }
      resolve({ ok: true, fields, note: "Snapshot after a moment of listening. Tilt your device and run it again." });
    };
    const ho = (e: any) => {
      if (e.alpha !== null || e.beta !== null || e.gamma !== null) o = e;
    };
    const hm = (e: any) => {
      if (e.accelerationIncludingGravity && e.accelerationIncludingGravity.x !== null) m = e;
    };
    window.addEventListener("deviceorientation", ho);
    window.addEventListener("devicemotion", hm);
    orientHandlers = [["deviceorientation", ho], ["devicemotion", hm]];
    setTimeout(finish, 1200);
  });
}, removeOrient);

{
  const acc = sensorHandler("Accelerometer", "Accelerometer", [["x", "Acceleration x", "m/s2"], ["y", "Acceleration y", "m/s2"], ["z", "Acceleration z", "m/s2"]]);
  add(["web.location.sensor-accelerometer"], "Accelerometer", true, acc.run, acc.stop);
  const gyro = sensorHandler("Gyroscope", "Gyroscope", [["x", "Rotation x", "radians per second"], ["y", "Rotation y", "radians per second"], ["z", "Rotation z", "radians per second"]]);
  add(["web.location.sensor-gyroscope"], "Gyroscope", true, gyro.run, gyro.stop);
  const mag = sensorHandler("Magnetometer", "Magnetometer", [["x", "Magnetic field x", "microtesla"], ["y", "Magnetic field y", "microtesla"], ["z", "Magnetic field z", "microtesla"]]);
  add(["web.location.sensor-magnetometer"], "Magnetometer", true, mag.run, mag.stop);
  const light = sensorHandler("AmbientLightSensor", "Light sensor", [["illuminance", "Light around you", "lux"]]);
  add(["web.location.sensor-ambient-light"], "Light sensor", true, light.run, light.stop);
}

// ---------------- Share, contacts, files ----------------
add(["web.os.web-share"], "Share sheet", true, async () => {
  if (!nav().share) return unsupported("the share sheet", "Most desktop browsers outside Chrome, Edge and Safari lack it.");
  const data = { title: "Platform.Ontology", text: "Seeing what a web page can really know about me.", url: location.href };
  const can = nav().canShare ? nav().canShare(data) : true;
  await nav().share(data);
  return { ok: true, fields: [f("Share sheet opened", true), f("Content allowed", can), f("Title shared", data.title)], note: "The page never learns which app you picked." };
});

add(["web.contacts.contact-picker"], "Contact picker", true, async () => {
  const cm = nav().contacts;
  if (!cm || !cm.select) return unsupported("the contact picker", "It exists only in Chrome on Android.");
  const supported: string[] = cm.getProperties ? await cm.getProperties() : [];
  const picked: any[] = await cm.select(["name", "tel", "email"], { multiple: false });
  const c = picked[0] || {};
  return {
    ok: true,
    fields: [
      f("Properties the browser offers", supported.join(", ")),
      f("Contacts you chose", picked.length),
      f("Name", c.name && c.name[0] ? c.name[0] : null),
      f("Phone numbers", c.tel ? c.tel.length : 0),
      f("Email addresses", c.email ? c.email.length : 0),
    ],
    note: "Only the contact you picked is shared, never your whole address book.",
  };
});

function fileInputPick(multiple: boolean, directory = false): Promise<File[]> {
  return new Promise((resolve, reject) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.multiple = multiple;
    if (directory) (inp as any).webkitdirectory = true;
    inp.style.display = "none";
    inp.addEventListener("change", () => resolve(Array.from(inp.files || [])));
    inp.addEventListener("cancel", () => reject(Object.assign(new Error("cancelled"), { name: "AbortError" })));
    document.body.appendChild(inp);
    inp.click();
    setTimeout(() => inp.remove(), 120000);
  });
}

function fileFields(files: File[], extra: Field[] = []): Field[] {
  const first = files[0];
  const total = files.reduce((a, x) => a + x.size, 0);
  return [
    ...extra,
    f("Files chosen", files.length),
    f("First file name", first ? first.name : null),
    f("First file type", first ? first.type || "unknown" : null),
    f("First file size", first ? first.size : null, "bytes"),
    f("Total size", total, "bytes"),
    f("First file last changed", first ? new Date(first.lastModified).toLocaleString() : null),
  ];
}

add(["web.files.file-system-access-pickers", "web.files.file-input"], "File picker", true, async () => {
  let files: File[];
  let via = "classic file input";
  if (win().showOpenFilePicker) {
    const handles: any[] = await win().showOpenFilePicker({ multiple: true });
    files = await Promise.all(handles.map((h) => h.getFile()));
    via = "file system access picker";
  } else {
    files = await fileInputPick(true);
  }
  if (!files.length) return { ok: false, fields: [], error: "No file was chosen." };
  return { ok: true, fields: fileFields(files, [f("Picker used", via)]), note: "Only the name, type, size and date are shown here. The file itself stays on your device." };
});

add(["web.files.directory-picker"], "Folder picker", true, async () => {
  if (win().showDirectoryPicker) {
    const dir: any = await win().showDirectoryPicker();
    let n = 0;
    const names: string[] = [];
    for await (const [name] of dir.entries()) {
      n++;
      if (names.length < 5) names.push(name);
      if (n >= 500) break;
    }
    return { ok: true, fields: [f("Folder name", dir.name), f("Items found (up to 500)", n), f("First few items", names.join(", ") || "(empty)")], note: "Reading names only. Nothing was uploaded." };
  }
  const files = await fileInputPick(true, true);
  if (!files.length) return { ok: false, fields: [], error: "No folder was chosen." };
  const root = ((files[0] as any).webkitRelativePath || "").split("/")[0];
  return { ok: true, fields: fileFields(files, [f("Folder name", root || null)]) };
});

// ---------------- Eyedropper ----------------
add(["web.peripherals.eyedropper"], "Colour picker", true, async () => {
  if (!win().EyeDropper) return unsupported("the eyedropper", "It exists in Chrome and Edge on desktop.");
  const r = await new (win().EyeDropper as any)().open();
  return { ok: true, fields: [f("Colour you picked", r.sRGBHex)], note: "You can pick any pixel on your whole screen, even outside this window." };
});

// ---------------- Hardware pickers ----------------
add(["web.peripherals.web-bluetooth"], "Bluetooth devices", true, async () => {
  if (!nav().bluetooth) return unsupported("Web Bluetooth", "It exists in Chrome and Edge, not Safari or Firefox.");
  const d: any = await nav().bluetooth.requestDevice({ acceptAllDevices: true });
  return { ok: true, fields: [f("Device name", d.name || "(unnamed)"), f("Device id (this site only)", d.id ? String(d.id).slice(0, 12) + "..." : null), f("Connected right now", d.gatt ? d.gatt.connected : false)], note: "The page only sees the device you picked." };
});

add(["web.peripherals.webusb"], "USB devices", true, async () => {
  if (!nav().usb) return unsupported("WebUSB", "It exists in Chrome and Edge on desktop and Android.");
  const d: any = await nav().usb.requestDevice({ filters: [] });
  return { ok: true, fields: [f("Product name", d.productName || null), f("Maker", d.manufacturerName || null), f("Vendor id", d.vendorId), f("Product id", d.productId), f("Serial number", d.serialNumber || null)], note: "Real sites can read the serial number of a USB device you pick." };
});

add(["web.peripherals.web-serial"], "Serial ports", true, async () => {
  if (!nav().serial) return unsupported("Web Serial", "It exists in Chrome and Edge on desktop.");
  const p: any = await nav().serial.requestPort();
  const info = p.getInfo ? p.getInfo() : {};
  return { ok: true, fields: [f("Vendor id", info.usbVendorId ?? null), f("Product id", info.usbProductId ?? null)], note: "The port was picked but never opened." };
});

add(["web.peripherals.webhid"], "HID devices", true, async () => {
  if (!nav().hid) return unsupported("WebHID", "It exists in Chrome and Edge on desktop.");
  const list: any[] = await nav().hid.requestDevice({ filters: [] });
  if (!list.length) return { ok: false, fields: [], error: "You did not pick a device." };
  const d = list[0];
  return { ok: true, fields: [f("Product name", d.productName || null), f("Vendor id", d.vendorId), f("Product id", d.productId), f("Device collections", d.collections ? d.collections.length : null)], note: "The device was picked but never opened." };
});

let midiAccess: any = null;
add(["web.peripherals.web-midi", "web.hardware.midi"], "MIDI devices", true, async () => {
  if (!nav().requestMIDIAccess) return unsupported("Web MIDI", "Safari does not offer it.");
  midiAccess = await nav().requestMIDIAccess({ sysex: false });
  const ins: string[] = [];
  const outs: string[] = [];
  midiAccess.inputs.forEach((i: any) => ins.push(i.name));
  midiAccess.outputs.forEach((o: any) => outs.push(o.name));
  return { ok: true, fields: [f("Music inputs found", ins.length), f("Music outputs found", outs.length), f("Input names", ins.join(", ") || null), f("Output names", outs.join(", ") || null)] };
}, () => {
  midiAccess = null;
});

// ---------------- Storage ----------------
add(["web.storage.persistent-storage"], "Keep my data", true, async () => {
  const st = nav().storage;
  if (!st || !st.persist) return unsupported("persistent storage");
  const before: boolean = await st.persisted();
  const granted: boolean = before || (await st.persist());
  return { ok: granted, fields: [f("Protected before", before), f("Protected now", granted)], error: granted ? undefined : "The browser did not grant protection. It decides on its own, often based on how much you use the site." };
});

add(["web.device.storage-estimate", "web.storage.storage-quota"], "Storage space", false, async () => {
  const st = nav().storage;
  if (!st || !st.estimate) return unsupported("storage estimates");
  const e: any = await st.estimate();
  const mb = (x: number | undefined) => (typeof x === "number" ? num(x / 1048576, 1) : null);
  return {
    ok: true,
    fields: [f("Space this site may use", mb(e.quota), "MB"), f("Space used so far", mb(e.usage), "MB"), f("Share used", e.quota ? num((e.usage / e.quota) * 100, 3) : null, "percent")],
    note: "The quota is based on your free disk space, so it leaks a hint about your device.",
    raw: e,
  };
});

// ---------------- Battery and network ----------------
add(["web.device.battery", "web.device.battery-status", "web.perf.battery-status"], "Battery level", false, async () => {
  if (!nav().getBattery) return unsupported("the battery status", "Safari and Firefox removed it for privacy.");
  const b: any = await nav().getBattery();
  return {
    ok: true,
    fields: [
      f("Battery level", Math.round(b.level * 100), "percent"),
      f("Charging", b.charging),
      f("Time until full", isFinite(b.chargingTime) ? num(b.chargingTime / 60, 0) : null, "minutes"),
      f("Time until empty", isFinite(b.dischargingTime) ? num(b.dischargingTime / 60, 0) : null, "minutes"),
    ],
  };
});

add(["web.network.network-information", "web.network.connection-info", "web.perf.network-information"], "Network connection", false, async () => {
  const c = nav().connection || nav().mozConnection || nav().webkitConnection;
  if (!c) return unsupported("network information", "Safari and Firefox do not share it.");
  return {
    ok: true,
    fields: [
      f("Connection class", c.effectiveType ?? null),
      f("Estimated download speed", num(c.downlink, 2), "Mbps"),
      f("Round trip time", c.rtt ?? null, "ms"),
      f("Data saver on", !!c.saveData),
      f("Link type", c.type ?? null),
      f("Online", nav().onLine),
    ],
  };
});

// ---------------- Idle detection ----------------
let idleCtl: AbortController | null = null;
add(["web.notify.idle-detection"], "Idle detection", true, async () => {
  const ID = win().IdleDetector;
  if (!ID) return unsupported("idle detection", "It exists in Chrome and Edge on desktop.");
  const perm: string = await ID.requestPermission();
  if (perm !== "granted") return { ok: false, fields: [], error: "You said no. Idle detection was declined." };
  idleCtl = new AbortController();
  const det = new ID();
  return new Promise<RealResult>((resolve, reject) => {
    det.addEventListener("change", () => {
      resolve({ ok: true, fields: [f("Are you idle", det.userState === "idle"), f("Your user state", det.userState), f("Screen locked", det.screenState === "locked"), f("Screen state", det.screenState)], note: "Real sites can tell when you walk away and lock your screen." });
    });
    det.start({ threshold: 60000, signal: idleCtl!.signal }).catch(reject);
  });
}, () => {
  try {
    idleCtl && idleCtl.abort();
  } catch {
    /* ignore */
  }
  idleCtl = null;
});

// ---------------- Fonts and window ----------------
add(["web.input.local-fonts"], "Installed fonts", true, async () => {
  if (!win().queryLocalFonts) return unsupported("the full font list", "It exists in Chrome and Edge on desktop.");
  const list: any[] = await win().queryLocalFonts();
  const fam = Array.from(new Set(list.map((x) => x.family)));
  return { ok: true, fields: [f("Font styles installed", list.length), f("Font families installed", fam.length), f("First few families", fam.slice(0, 8).join(", "))], note: "This is a strong fingerprint. Few people have the exact same fonts." };
});

add(["web.display.window-management"], "Screens and windows", true, async () => {
  if (!win().getScreenDetails) return unsupported("multi screen details", "It exists in Chrome and Edge on desktop.");
  const d: any = await win().getScreenDetails();
  const cur = d.currentScreen;
  return {
    ok: true,
    fields: [
      f("Screens connected", d.screens.length),
      f("This screen label", cur.label || null),
      f("This screen size", `${cur.width} x ${cur.height}`, "pixels"),
      f("Left position", cur.left, "pixels"),
      f("Top position", cur.top, "pixels"),
      f("Pixel density", cur.devicePixelRatio),
      f("Main screen", cur.isPrimary),
      f("Built in screen", cur.isInternal),
    ],
    note: "A page can see every monitor you plug in.",
  };
});

// ---------------- Payment and passkeys (never charge, never create) ----------------
add(["web.payments.payment-request"], "Payment check", false, async () => {
  const PR = win().PaymentRequest;
  if (!PR) return unsupported("the payment request API");
  const req = new PR([{ supportedMethods: "https://google.com/pay" }, { supportedMethods: "basic-card" }], { total: { label: "Check only", amount: { currency: "USD", value: "0.01" } } });
  let can: any = null;
  try {
    can = req.canMakePayment ? await req.canMakePayment() : null;
  } catch (e) {
    return fail(e, "the payment check");
  }
  let hasEnrolled: any = null;
  try {
    hasEnrolled = req.hasEnrolledInstrument ? await req.hasEnrolledInstrument() : null;
  } catch {
    hasEnrolled = null;
  }
  return { ok: true, fields: [f("Can make a payment", can), f("Has a saved payment method", hasEnrolled)], note: "Only asked whether payment is possible. Nothing was charged and no sheet was opened." };
});

add(["web.auth.passkeys", "web.identity.webauthn-get", "web.identity.webauthn-create"], "Passkey check", false, async () => {
  const PKC = win().PublicKeyCredential;
  if (!PKC) return unsupported("passkeys");
  const platform: boolean = PKC.isUserVerifyingPlatformAuthenticatorAvailable ? await PKC.isUserVerifyingPlatformAuthenticatorAvailable() : false;
  const cond: boolean = PKC.isConditionalMediationAvailable ? await PKC.isConditionalMediationAvailable() : false;
  return { ok: true, fields: [f("Built in fingerprint or face unlock available", platform), f("Passkey autofill available", cond)], note: "Only checked what is possible. No passkey was created or used." };
});

// ---------------- Speech ----------------
let recog: any = null;
add(["web.camera.speech-recognition"], "Speech recognition", true, () => {
  const SR = win().SpeechRecognition || win().webkitSpeechRecognition;
  if (!SR) return Promise.resolve(unsupported("speech recognition", "Firefox does not offer it."));
  return new Promise<RealResult>((resolve) => {
    recog = new SR();
    recog.lang = navigator.language || "en-US";
    recog.interimResults = false;
    recog.maxAlternatives = 1;
    let got = false;
    recog.onresult = (ev: any) => {
      got = true;
      const r = ev.results[0][0];
      resolve({ ok: true, fields: [f("What it heard", r.transcript), f("Confidence", num(r.confidence * 100, 0), "percent"), f("Language", recog.lang)], note: "In most browsers the audio is sent to a cloud service for transcription." });
    };
    recog.onerror = (ev: any) => {
      got = true;
      resolve({ ok: false, fields: [], error: ev.error === "not-allowed" || ev.error === "service-not-allowed" ? "You said no. Microphone access for speech was declined." : ev.error === "no-speech" ? "Nothing was heard. Say a sentence right after pressing the button." : `Speech recognition failed: ${ev.error}` });
    };
    recog.onend = () => {
      if (!got) resolve({ ok: false, fields: [], error: "Listening ended before anything was heard." });
    };
    try {
      recog.start();
    } catch (e) {
      resolve(fail(e, "speech recognition"));
    }
    setTimeout(() => {
      try {
        recog && recog.stop();
      } catch {
        /* ignore */
      }
    }, 8000);
  });
}, () => {
  try {
    recog && recog.abort();
  } catch {
    /* ignore */
  }
  recog = null;
});

add(["web.actions.speech-synthesis", "web.render.speechsynthesis-voices", "web.device.speech-voices"], "Speech voices", true, async () => {
  const ss: SpeechSynthesis | undefined = win().speechSynthesis;
  if (!ss) return unsupported("speech synthesis");
  let voices = ss.getVoices();
  if (!voices.length) {
    await new Promise<void>((r) => {
      const t = setTimeout(r, 1000);
      ss.addEventListener("voiceschanged", () => {
        clearTimeout(t);
        r();
      }, { once: true });
    });
    voices = ss.getVoices();
  }
  const u = new SpeechSynthesisUtterance("Hello. This is your browser speaking, and no permission was needed.");
  ss.cancel();
  ss.speak(u);
  const langs = Array.from(new Set(voices.map((v) => v.lang)));
  const def = voices.find((v) => v.default);
  return { ok: true, fields: [f("Voices installed", voices.length), f("Default voice", def ? def.name : null), f("Languages covered", langs.length), f("First few voices", voices.slice(0, 4).map((v) => v.name).join(", "))], note: "Listen for the spoken sentence. The voice list is also a fingerprint." };
}, () => {
  try {
    win().speechSynthesis && win().speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
});

// ---------------- Gamepad, pointer lock, badge ----------------
add(["web.device.gamepad-presence", "web.peripherals.gamepad"], "Game controllers", false, async () => {
  if (!nav().getGamepads) return unsupported("the gamepad API");
  const pads: any[] = Array.from(nav().getGamepads()).filter(Boolean) as any[];
  if (!pads.length) return { ok: true, fields: [f("Controllers found", 0)], note: "None visible. Browsers hide controllers until you press a button on one." };
  const p = pads[0];
  return { ok: true, fields: [f("Controllers found", pads.length), f("First controller", p.id), f("Buttons", p.buttons.length), f("Sticks and triggers", p.axes.length), f("Layout", p.mapping || "unknown")] };
});

add(["web.input.pointer-lock"], "Mouse capture", true, async () => {
  const el: any = document.documentElement;
  if (!el.requestPointerLock) return unsupported("pointer lock", "Phones do not have a mouse to lock.");
  await el.requestPointerLock();
  await sleep(150);
  return { ok: true, fields: [f("Mouse captured", document.pointerLockElement === el)], note: "Your pointer is hidden and captured. Press Escape or stop to get it back." };
}, () => {
  try {
    document.exitPointerLock();
  } catch {
    /* ignore */
  }
});

add(["web.notify.badging", "web.os.badging"], "App badge", true, async () => {
  if (!nav().setAppBadge) return unsupported("app badges", "Badges need an installed app in Chrome, Edge or Safari.");
  await nav().setAppBadge(3);
  return { ok: true, fields: [f("Badge number set", 3)], note: "Look at the app icon in your dock or taskbar. Press stop to clear it." };
}, () => {
  try {
    nav().clearAppBadge && nav().clearAppBadge();
  } catch {
    /* ignore */
  }
});

// ---------------- Keyboard, graphics, timing (no prompt, but real readings) ----------------
add(["web.input.keyboard-layout-map", "web.input.keyboard-map", "web.locale.keyboard-layout"], "Keyboard layout", false, async () => {
  if (!nav().keyboard || !nav().keyboard.getLayoutMap) return unsupported("the keyboard layout map", "Safari and Firefox do not share it.");
  const m: any = await nav().keyboard.getLayoutMap();
  const keys = ["KeyQ", "KeyW", "KeyE", "KeyY", "KeyZ", "Semicolon", "Minus", "IntlBackslash"];
  return { ok: true, fields: [f("Letters on Q W E Y Z keys", keys.slice(0, 5).map((k) => m.get(k) || "?").join(" ")), f("Keys mapped", m.size), f("Key right of L", m.get("Semicolon") || null), f("Extra key near left shift", m.get("IntlBackslash") || null)] };
});

add(["web.device.webgpu-adapter", "web.render.webgpu-adapter-info"], "Graphics chip (WebGPU)", false, async () => {
  const gpu = nav().gpu;
  if (!gpu) return unsupported("WebGPU");
  const a: any = await gpu.requestAdapter();
  if (!a) return { ok: false, fields: [], error: "WebGPU is present but no graphics adapter was offered." };
  const info: any = a.info || (a.requestAdapterInfo ? await a.requestAdapterInfo() : {});
  return { ok: true, fields: [f("Maker", info.vendor || null), f("Chip family", info.architecture || null), f("Model", info.device || null), f("Description", info.description || null), f("Largest buffer", a.limits ? num(a.limits.maxBufferSize / 1048576, 0) : null, "MB")] };
});

add(["web.perf.refresh-rate-measurement", "web.display.refresh-rate"], "Screen refresh rate", false, async () => {
  const stamps: number[] = [];
  await new Promise<void>((resolve) => {
    const tick = (t: number) => {
      stamps.push(t);
      if (stamps.length < 40) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
    setTimeout(resolve, 3000);
  });
  if (stamps.length < 5) return { ok: false, fields: [], error: "The page was hidden, so no frames were drawn. Keep this tab visible." };
  const deltas = stamps.slice(1).map((t, i) => t - stamps[i]).sort((a, b) => a - b);
  const med = deltas[Math.floor(deltas.length / 2)];
  return { ok: true, fields: [f("Refresh rate", num(1000 / med, 0), "Hz"), f("Time per frame", num(med, 2), "ms"), f("Frames measured", stamps.length)], note: "Measured by timing real frames. Gamers and phone makers differ here." };
});

add(["web.perf.cpu-benchmark"], "Processor speed test", false, async () => {
  const t0 = performance.now();
  let x = 0;
  for (let i = 1; i < 20_000_000; i++) x += Math.sqrt(i) * Math.sin(i);
  const t = performance.now() - t0;
  return { ok: true, fields: [f("Time for 20 million calculations", num(t, 0), "ms"), f("Speed score", num(20000 / Math.max(1, t), 1), "million ops per second"), f("Check value", num(x, 0))], note: "A speed score like this can tell a fast laptop from a cheap phone." };
});

add(["web.perf.performance-memory", "web.device.performance-memory"], "Browser memory use", false, async () => {
  const pm = (performance as any).memory;
  if (!pm) return unsupported("memory readings", "Only Chrome offers it.");
  const mb = (x: number) => num(x / 1048576, 1);
  return { ok: true, fields: [f("Memory in use by this page", mb(pm.usedJSHeapSize), "MB"), f("Memory the page reserved", mb(pm.totalJSHeapSize), "MB"), f("Memory limit", mb(pm.jsHeapSizeLimit), "MB")] };
});

add(["web.device.hardware-concurrency"], "CPU cores", false, async () => ({ ok: true, fields: [f("Logical processors", nav().hardwareConcurrency ?? null), f("Device memory (rounded)", nav().deviceMemory ?? null, "GB")] }));

add(["web.peripherals.barcode-detection"], "Barcode detection", false, async () => {
  const BD = win().BarcodeDetector;
  if (!BD) return unsupported("barcode detection", "It exists in Chrome on Android and some desktops.");
  const formats: string[] = BD.getSupportedFormats ? await BD.getSupportedFormats() : [];
  return { ok: true, fields: [f("Barcode types readable", formats.length), f("Types", formats.join(", "))], note: "A page could read barcodes straight from your camera." };
});

export const realHandlers: Record<string, RealHandler> = handlers;

// Shared with ./chromium, which registers the Chromium only handlers into the same table.
export { add, f, num, unsupported, fail, stopStream, sleep };
