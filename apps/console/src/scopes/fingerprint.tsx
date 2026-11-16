import type { Ctx, InstrumentProps, ScopeDef } from "../core/types";
import { every, noise, series, unsupported } from "../core/harness";
import { DOMAIN_COLOR, Frame, Readout, Spark, Waiting, fmt, lastData } from "../ui/kit";
import "./capture-device-fp.css";

// Fingerprint: canvas, WebGL and audio signals, and installed fonts. Both are passive or nearly so.

const COLOR = DOMAIN_COLOR.fingerprint;
const win = () => window as any;

// ---------- Hashing ----------

function fnv(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

async function hash(s: string): Promise<string> {
  try {
    if (crypto?.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
      return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch { /* insecure context */ }
  return fnv(s) + fnv(s.split("").reverse().join(""));
}

// ---------- Signals ----------

function paintCanvas(): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = 280;
  cv.height = 60;
  const g = cv.getContext("2d")!;
  g.textBaseline = "alphabetic";
  g.fillStyle = "#f60";
  g.fillRect(120, 1, 62, 20);
  g.fillStyle = "#069";
  g.font = "15px Arial, sans-serif";
  g.fillText("Cwm fjordbank glyphs vext quiz, \u{1F603}", 2, 15);
  g.fillStyle = "rgba(102, 204, 0, 0.7)";
  g.font = "italic 17px Georgia, serif";
  g.fillText("Cwm fjordbank glyphs vext quiz", 4, 37);
  g.globalCompositeOperation = "multiply";
  [["#f2f", 60, 45], ["#2ff", 90, 45], ["#ff2", 75, 30]].forEach(([c, x, y]) => {
    g.fillStyle = c as string;
    g.beginPath();
    g.arc(x as number, y as number, 14, 0, Math.PI * 2);
    g.fill();
  });
  const grad = g.createLinearGradient(180, 0, 280, 60);
  grad.addColorStop(0, "#fa0");
  grad.addColorStop(1, "#08f");
  g.fillStyle = grad;
  g.fillRect(190, 24, 80, 30);
  return cv;
}

type Gl = { vendor: string; renderer: string; params: string; masked: boolean };

function readWebGL(): Gl | null {
  const cv = document.createElement("canvas");
  const gl = (cv.getContext("webgl") || cv.getContext("experimental-webgl")) as WebGLRenderingContext | null;
  if (!gl) return null;
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const vendor = ext ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR));
  const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  const p = [gl.MAX_TEXTURE_SIZE, gl.MAX_VIEWPORT_DIMS, gl.MAX_VERTEX_ATTRIBS, gl.MAX_VARYING_VECTORS, gl.ALIASED_LINE_WIDTH_RANGE, gl.ALIASED_POINT_SIZE_RANGE, gl.MAX_RENDERBUFFER_SIZE, gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS]
    .map((k) => { const v: any = gl.getParameter(k); return v && v.length !== undefined ? Array.from(v as ArrayLike<number>).join("x") : String(v); }).join("|");
  const exts = (gl.getSupportedExtensions() || []).sort().join(",");
  return { vendor, renderer, params: p + "#" + exts, masked: !ext };
}

async function readAudio(): Promise<number | null> {
  const OAC = win().OfflineAudioContext || win().webkitOfflineAudioContext;
  if (!OAC) return null;
  const ac = new OAC(1, 5000, 44100);
  const osc = ac.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = 10000;
  const comp = ac.createDynamicsCompressor();
  [["threshold", -50], ["knee", 40], ["ratio", 12], ["attack", 0], ["release", 0.25]].forEach(([k, v]) => { comp[k as string].value = v; });
  osc.connect(comp);
  comp.connect(ac.destination);
  osc.start(0);
  const buf: AudioBuffer = await ac.startRendering();
  const d = buf.getChannelData(0);
  let sum = 0;
  for (let i = 4500; i < 5000; i++) sum += Math.abs(d[i]);
  return sum;
}

// ---------- Canvas / WebGL / audio fingerprint ----------

type FpRec = {
  bits: number; canvas_bits: number; gpu_bits: number; webgl_bits: number; audio_bits: number;
  canvas_hash: string; webgl_hash: string; audio_value: number | null; vendor: string; renderer: string; stable: boolean; spoofed: boolean;
};

let preview = "";

/** Rough bits of entropy per signal, from published browser fingerprint studies. */
function score(o: { canvas: boolean; stable: boolean; gl: Gl | null; audio: number | null }) {
  const canvas_bits = o.canvas && o.stable ? 8.6 : 0;
  const gpu_bits = o.gl ? (o.gl.masked ? 2.1 : 7.1) : 0;
  const webgl_bits = o.gl ? 4.8 : 0;
  const audio_bits = o.audio ? 5.4 : 0;
  return { canvas_bits, gpu_bits, webgl_bits, audio_bits, bits: canvas_bits + gpu_bits + webgl_bits + audio_bits };
}

async function fpLive(ctx: Ctx) {
  ctx.granted();
  const a = paintCanvas();
  const b = paintCanvas();
  const urlA = a.toDataURL();
  const stable = urlA === b.toDataURL();
  preview = urlA;
  const canvas_hash = await hash(urlA);
  const gl = readWebGL();
  const webgl_hash = gl ? await hash(gl.params) : "unavailable";
  let audio: number | null = null;
  try { audio = await readAudio(); } catch { ctx.log("audio fingerprint blocked or unavailable"); }
  if (!stable) ctx.log("two identical canvas draws gave different pixels: the browser is adding noise to resist fingerprinting");
  const rec: FpRec = {
    ...score({ canvas: true, stable, gl, audio }), canvas_hash, webgl_hash, audio_value: audio,
    vendor: gl?.vendor || "n/a", renderer: gl?.renderer || "n/a", stable, spoofed: !stable,
  };
  ctx.emit(rec);
  return every(2000, () => ctx.emit(rec));
}

function fpSim(ctx: Ctx) {
  ctx.granted();
  const rec: FpRec = {
    ...score({ canvas: true, stable: true, gl: { vendor: "Apple", renderer: "Apple M2 Pro", params: "", masked: false }, audio: 124.04347527516074 }),
    canvas_hash: "3f9a1c07b2d84e6a51c0d9e7", webgl_hash: "a81d44f0c3e2967b0fd5a1c8", audio_value: 124.04347527516074, vendor: "Apple", renderer: "Apple M2 Pro", stable: true, spoofed: false,
  };
  return every(2000, () => ctx.emit({ ...rec, audio_value: (rec.audio_value as number) + noise(1e-13) }));
}

function FingerprintInstrument({ session }: InstrumentProps) {
  const d = lastData<FpRec>(session);
  const rows: [string, number, string][] = d ? [
    ["Canvas drawing", d.canvas_bits, d.stable ? "stable pixels" : "noised by browser"],
    ["Graphics card name", d.gpu_bits, d.renderer],
    ["WebGL limits", d.webgl_bits, "parameters and extensions"],
    ["Audio processing", d.audio_bits, "compressor output sum"],
  ] : [];
  return (
    <Frame
      visual={d ? (
        <div>
          <div className="cdf-bars">
            {rows.map(([name, bits]) => (
              <div className="cdf-bar" key={name}>
                <span>{name}</span>
                <div className="cdf-bar-track"><div className="cdf-bar-fill" style={{ width: `${Math.min(100, (bits / 10) * 100)}%` }} /></div>
                <b>{fmt(bits, 1)} bits</b>
              </div>
            ))}
          </div>
          <div className="cdf-hashes">
            <div className="cdf-hash"><span>Canvas hash</span><code>{d.canvas_hash}</code></div>
            <div className="cdf-hash"><span>WebGL hash</span><code>{d.webgl_hash}</code></div>
            <div className="cdf-hash"><span>Graphics card</span><code>{d.vendor} / {d.renderer}</code></div>
            <div className="cdf-hash"><span>Audio sum</span><code>{d.audio_value == null ? "unavailable" : String(d.audio_value)}</code></div>
          </div>
          {preview && <img className="cdf-canvas-prev" src={preview} alt="The test drawing whose pixels are hashed" width={280} height={60} />}
          <p className="cdf-note">The same drawing looks slightly different on every device because of the graphics card, drivers and font engine. The hash needs no cookie and survives clearing site data. Bit values are rough estimates from published studies.</p>
        </div>
      ) : <Waiting session={session} what="Draws a hidden image and hashes it, reads the graphics card name and processes a sound. No prompt." />}
      side={
        <>
          <Readout rows={[
            { k: "Total", v: d?.bits ?? null, u: "bits", digits: 1, hot: true },
            { k: "Matches 1 in", v: d ? Math.round(Math.pow(2, d.bits)) : null, digits: 0 },
            { k: "Canvas stable", v: d?.stable ?? null },
          ]} />
          <Spark values={series(session.records, "bits", 60)} w={220} h={26} color={COLOR} min={0} />
        </>
      }
    />
  );
}

// ---------- Fonts ----------

const CANDIDATES = [
  "Arial", "Arial Black", "Arial Narrow", "Avenir", "Avenir Next", "Baskerville", "Bookman Old Style", "Calibri", "Cambria", "Candara",
  "Century Gothic", "Comic Sans MS", "Consolas", "Constantia", "Corbel", "Courier New", "Didot", "Futura", "Garamond", "Geneva",
  "Georgia", "Gill Sans", "Helvetica", "Helvetica Neue", "Hoefler Text", "Impact", "Lucida Console", "Lucida Grande", "Lucida Sans Unicode", "Menlo",
  "Monaco", "MS Gothic", "MS Sans Serif", "Optima", "Palatino", "Palatino Linotype", "Papyrus", "Rockwell", "Segoe UI", "SF Pro Text",
  "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana", "Roboto", "Open Sans", "Noto Sans", "Ubuntu", "DejaVu Sans", "Liberation Sans",
  "Cantarell", "Fira Sans", "Source Sans Pro", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Hiragino Sans", "PingFang SC", "Microsoft YaHei", "Yu Gothic",
];

type FontRec = { count: number; present: string[]; absent: string[]; probed: number; method: string; extra: number };

function probeFonts(): string[] {
  const g = document.createElement("canvas").getContext("2d")!;
  const text = "mmmmmmmmmmlli WwQq 0123";
  const bases = ["monospace", "serif", "sans-serif"];
  const width = (font: string) => { g.font = font; return g.measureText(text).width; };
  const baseW = bases.map((b) => width(`72px ${b}`));
  return CANDIDATES.filter((f) => bases.some((b, i) => width(`72px "${f}", ${b}`) !== baseW[i]));
}

const fontRec = (present: string[], method: string, count: number): FontRec => ({
  count, present, absent: CANDIDATES.filter((f) => !present.includes(f)), probed: CANDIDATES.length, method, extra: Math.max(0, count - present.length),
});

async function fontsLive(ctx: Ctx) {
  const w = win();
  if (w.queryLocalFonts) {
    try {
      const list: { family: string }[] = await w.queryLocalFonts();
      const fams = [...new Set(list.map((f) => f.family))];
      ctx.granted();
      ctx.log(`permission granted: ${fams.length} font families returned by name`);
      ctx.emit(fontRec(CANDIDATES.filter((f) => fams.includes(f)), "queryLocalFonts", fams.length));
      return;
    } catch (e: any) {
      if (e?.name === "NotAllowedError" || e?.name === "SecurityError") ctx.log("permission refused. Falling back to measuring text widths, which needs no permission at all");
      else ctx.log(`queryLocalFonts failed (${e?.name || "error"}); measuring text widths instead`);
    }
  } else ctx.log("queryLocalFonts is not available; measuring text widths instead");
  if (!document.createElement("canvas").getContext) unsupported("canvas text measurement");
  ctx.granted();
  const present = probeFonts();
  ctx.emit(fontRec(present, "width probe", present.length));
}

function fontsSim(ctx: Ctx) {
  ctx.granted();
  const have = new Set(["Arial", "Arial Black", "Arial Narrow", "Avenir", "Avenir Next", "Baskerville", "Courier New", "Didot", "Futura", "Geneva", "Georgia", "Gill Sans", "Helvetica", "Helvetica Neue", "Hoefler Text", "Impact", "Lucida Grande", "Menlo", "Monaco", "Optima", "Palatino", "Papyrus", "SF Pro Text", "Times New Roman", "Trebuchet MS", "Verdana", "Apple Color Emoji", "Hiragino Sans", "PingFang SC", "Comic Sans MS"]);
  const all = CANDIDATES.filter((f) => have.has(f));
  let n = 0;
  return every(120, () => {
    n = Math.min(all.length, n + 1);
    ctx.emit(fontRec(all.slice(0, n), "width probe", n));
  });
}

function FontsInstrument({ session }: InstrumentProps) {
  const d = lastData<FontRec>(session);
  const set = new Set(d?.present || []);
  return (
    <Frame
      visual={d ? (
        <div>
          <div className="cdf-chips-head"><b>{d.count}</b><span>font families found by {d.method}{d.extra > 0 ? `, ${d.extra} beyond the ${d.probed} on this checklist` : ""}</span></div>
          <div className="cdf-chips">{CANDIDATES.map((f) => <span key={f} className={"cdf-chip" + (set.has(f) ? " on" : "")}>{f}</span>)}</div>
          <p className="cdf-note">Highlighted fonts are installed. Design tools, language packs and office suites each add fonts, so the list says a lot about your job, your country and your software.</p>
        </div>
      ) : <Waiting session={session} what="Checks which of about 60 common fonts you have installed. Chrome may ask for permission; if you refuse, a width trick still works." />}
      side={
        <>
          <Readout rows={[
            { k: "Families", v: d?.count ?? null, hot: true, digits: 0 },
            { k: "Checklist hits", v: d ? `${d.present.length} of ${d.probed}` : null },
            { k: "Method", v: d?.method ?? null },
          ]} />
          <Spark values={series(session.records, "count", 80)} w={220} h={26} color={COLOR} min={0} />
        </>
      }
    />
  );
}

export const fingerprintScopes: ScopeDef[] = [
  {
    id: "fingerprint.canvas", name: "Canvas, GPU and audio", domain: "fingerprint",
    atlas: ["web.render.canvas-2d-fingerprint", "web.render.webgl-render-hash", "web.device.webgl-renderer", "web.render.audio-offline-fingerprint"],
    summary: "Builds a device signature from how your machine draws an image and processes a sound.",
    call: "canvas.toDataURL(); gl.getParameter(UNMASKED_RENDERER_WEBGL); new OfflineAudioContext(...).startRendering()",
    passive: true,
    reveals: ["A near unique id that survives clearing cookies", "Your graphics card model and driver family", "Whether your browser is trying to hide (noise added to the image)"],
    feeds: ["device.profile", "fingerprint.fonts", "device.battery"],
    metrics: [{ key: "bits", label: "identifying", unit: "bits", digits: 1 }, { key: "canvas_bits", label: "canvas", unit: "bits", digits: 1 }, { key: "audio_bits", label: "audio", unit: "bits", digits: 1 }],
    live: fpLive, sim: fpSim, Instrument: FingerprintInstrument,
  },
  {
    id: "fingerprint.fonts", name: "Installed fonts", domain: "fingerprint",
    atlas: ["web.input.local-fonts", "web.render.font-enumeration-metrics", "web.device.installed-fonts", "web.render.fonts"],
    summary: "Finds which fonts are installed on your machine.",
    call: "await window.queryLocalFonts()  // fallback: canvas measureText width probe",
    permission: "local-fonts", gesture: true,
    reveals: ["Which apps you have (Office, Adobe, language packs)", "Your operating system and its language", "A font list is often unique to one machine"],
    feeds: ["fingerprint.canvas", "device.profile"],
    metrics: [{ key: "count", label: "fonts", digits: 0 }],
    live: fontsLive, sim: fontsSim, Instrument: FontsInstrument,
  },
];
