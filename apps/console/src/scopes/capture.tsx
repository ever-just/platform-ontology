import { useEffect, useRef } from "react";
import type { Ctx, InstrumentProps, ScopeDef } from "../core/types";
import { every, noise, series, unsupported } from "../core/harness";
import { C, DOMAIN_COLOR, Frame, Gauge, Readout, Spark, Waiting, fmt, lastData } from "../ui/kit";
import "./capture-device-fp.css";

// Capture: camera, microphone, screen, speech, light, clipboard. Media scopes call ctx.setMedia so the
// harness owns the stream and stops its tracks; the Instrument reads session.media.

const COLOR = DOMAIN_COLOR.capture;
const win = () => window as any;
const mono = '10px "Geist Mono", ui-monospace, monospace';

function Vid({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.srcObject = stream;
    void v.play().catch(() => {});
  }, [stream]);
  return <video ref={ref} className="cdf-video" autoPlay muted playsInline />;
}

/** Canvas that redraws on every render (renders only happen when a new record arrives). */
function Cv({ draw, w, h, className }: { draw: (g: CanvasRenderingContext2D, w: number, h: number) => void; w: number; h: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = ref.current?.getContext("2d");
    if (g) draw(g, w, h);
  });
  return <canvas ref={ref} width={w} height={h} className={className} />;
}

// ---------- Camera ----------

type CamRec = { fps: number; width: number; height: number; brightness: number; faces: number; hist: number[]; boxes: number[][]; detector: boolean };

const BINS = 32;

/** Average luma (0..255) and a 32 bin luminance histogram of a video or canvas frame. */
function analyze(src: CanvasImageSource, cv: HTMLCanvasElement) {
  const g = cv.getContext("2d", { willReadFrequently: true });
  const hist = new Array(BINS).fill(0);
  if (!g) return { brightness: 0, hist };
  g.drawImage(src, 0, 0, cv.width, cv.height);
  const px = g.getImageData(0, 0, cv.width, cv.height).data;
  let sum = 0;
  const n = px.length / 4;
  for (let i = 0; i < px.length; i += 4) {
    const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    sum += l;
    hist[Math.min(BINS - 1, Math.floor((l / 256) * BINS))]++;
  }
  const mx = Math.max(...hist) || 1;
  return { brightness: sum / n, hist: hist.map((h) => +(h / mx).toFixed(3)) };
}

async function cameraLive(ctx: Ctx) {
  if (!navigator.mediaDevices?.getUserMedia) unsupported("getUserMedia");
  const [w, h] = String(ctx.params.resolution).split("x").map(Number);
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: String(ctx.params.facing), width: { ideal: w }, height: { ideal: h } },
    audio: false,
  });
  ctx.granted();
  ctx.setMedia(stream);
  const track = stream.getVideoTracks()[0];
  const set = track?.getSettings?.() || {};
  ctx.log(`camera "${track?.label || "unnamed"}" opened at ${set.width}x${set.height}`);

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play().catch(() => {});

  let frames = 0;
  let fps = set.frameRate || 0;
  let alive = true;
  const rvfc = (video as any).requestVideoFrameCallback?.bind(video);
  const onFrame = () => {
    if (!alive) return;
    frames++;
    rvfc(onFrame);
  };
  if (rvfc) rvfc(onFrame);
  const fpsTimer = setInterval(() => {
    if (rvfc) fps = frames;
    frames = 0;
  }, 1000);

  const cv = document.createElement("canvas");
  cv.width = 64;
  cv.height = 36;
  const FD = win().FaceDetector;
  const detector = FD ? new FD({ fastMode: true, maxDetectedFaces: 5 }) : null;
  let boxes: number[][] = [];
  let busy = false;
  const timer = every(250, () => {
    if (video.readyState < 2) return;
    const vw = video.videoWidth || w;
    const vh = video.videoHeight || h;
    if (detector && !busy) {
      busy = true;
      detector.detect(video).then((f: any[]) => {
        boxes = f.map((x) => [x.boundingBox.x / vw, x.boundingBox.y / vh, x.boundingBox.width / vw, x.boundingBox.height / vh]);
      }).catch(() => {}).finally(() => { busy = false; });
    }
    const a = analyze(video, cv);
    ctx.emit({ fps, width: vw, height: vh, brightness: a.brightness, faces: boxes.length, hist: a.hist, boxes, detector: !!detector } satisfies CamRec);
  });
  return () => {
    alive = false;
    clearInterval(fpsTimer);
    timer();
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
}

/** A canvas painted with a moving pattern; becomes a MediaStream when captureStream exists. */
function paintedStream(w: number, h: number, paint: (g: CanvasRenderingContext2D, t: number) => void, ctx: Ctx) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d")!;
  let draws = 0;
  const t0 = performance.now();
  const timer = setInterval(() => { paint(g, performance.now() - t0); draws++; }, 40);
  paint(g, 0);
  const stream: MediaStream | null = (cv as any).captureStream ? (cv as any).captureStream(25) : null;
  if (stream) ctx.setMedia(stream);
  return { cv, drawn: () => draws, stop: () => { clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); } };
}

function cameraSim(ctx: Ctx) {
  ctx.granted();
  const W = 640, H = 360;
  const face = { x: 0.5, y: 0.45 };
  const src = paintedStream(W, H, (g, t) => {
    const hue = (t / 60) % 360;
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, `hsl(${hue} 55% ${52 + Math.sin(t / 3000) * 14}%)`);
    grad.addColorStop(1, `hsl(${(hue + 80) % 360} 50% 28%)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    face.x = 0.5 + Math.sin(t / 2200) * 0.12;
    face.y = 0.45 + Math.cos(t / 3100) * 0.05;
    g.fillStyle = "rgba(255,220,190,0.92)";
    g.beginPath();
    g.ellipse(face.x * W, face.y * H, 54, 70, 0, 0, Math.PI * 2);
    g.fill();
  }, ctx);
  const cv = document.createElement("canvas");
  cv.width = 64;
  cv.height = 36;
  let last = 0;
  let lastN = 0;
  const timer = every(250, () => {
    const now = performance.now();
    const fps = last ? ((src.drawn() - lastN) * 1000) / (now - last) : 25;
    last = now;
    lastN = src.drawn();
    const a = analyze(src.cv, cv);
    ctx.emit({ fps: fps + noise(0.4), width: W, height: H, brightness: a.brightness, faces: 1, hist: a.hist, boxes: [[face.x - 0.085, face.y - 0.19, 0.17, 0.38]], detector: true } satisfies CamRec);
  });
  return () => { timer(); src.stop(); };
}

function CameraInstrument({ session }: InstrumentProps) {
  const d = lastData<CamRec>(session);
  const draw = (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.clearRect(0, 0, w, h);
    if (!d) return;
    const bh = h * 0.24;
    const bw = (w * 0.34) / BINS;
    d.hist.forEach((v, i) => {
      g.fillStyle = "rgba(255,255,255,0.85)";
      g.fillRect(14 + i * bw, h - 14 - v * bh, bw - 1, v * bh);
    });
    g.strokeStyle = C.ink;
    g.lineWidth = 1;
    g.strokeRect(14, h - 14 - bh, w * 0.34, bh);
    g.fillStyle = C.ink;
    g.font = mono;
    g.fillText("luminance 0 to 255", 18, h - 18 - bh);
    g.strokeStyle = COLOR;
    g.lineWidth = 2;
    d.boxes.forEach((b) => g.strokeRect(b[0] * w, b[1] * h, b[2] * w, b[3] * h));
  };
  return (
    <Frame
      visual={
        <div>
          <div className="cdf-stage">
            {session.media ? <Vid stream={session.media} /> : null}
            {!d && <div className="cdf-stage-empty"><Waiting session={session} what="A live camera preview with a luminance histogram and face boxes." /></div>}
            {d && !session.media && <div className="cdf-stage-empty"><span className="cdf-note">Simulated frame (this browser cannot stream a canvas)</span></div>}
            <Cv draw={draw} w={640} h={360} className="cdf-overlay" />
          </div>
          {d && !d.detector && <p className="cdf-note">FaceDetector is not available in this browser, so faces are not counted. Any page could still run its own model on these frames.</p>}
        </div>
      }
      side={
        <>
          <Readout rows={[
            { k: "Frame rate", v: d?.fps ?? null, u: "fps", digits: 0, hot: true },
            { k: "Resolution", v: d ? `${d.width} x ${d.height}` : null },
            { k: "Brightness", v: d?.brightness ?? null, u: "/ 255", digits: 0 },
            { k: "Faces", v: d ? (d.detector ? d.faces : "no detector") : null },
          ]} />
          <Spark values={series(session.records, "brightness", 80)} w={220} h={30} color={COLOR} min={0} max={255} />
        </>
      }
    />
  );
}

// ---------- Microphone ----------

type MicRec = { db: number; peak_hz: number; rms: number; wave: number[]; spec: number[] };
const SPEC_BINS = 56;
const DB_FLOOR = -90;

async function micLive(ctx: Ctx) {
  if (!navigator.mediaDevices?.getUserMedia) unsupported("getUserMedia");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  ctx.granted();
  ctx.setMedia(stream);
  const AC = win().AudioContext || win().webkitAudioContext;
  if (!AC) unsupported("AudioContext");
  const ac: AudioContext = new AC();
  const an = ac.createAnalyser();
  an.fftSize = 2048;
  an.smoothingTimeConstant = 0.6;
  ac.createMediaStreamSource(stream).connect(an);
  const time = new Float32Array(an.fftSize);
  const freq = new Float32Array(an.frequencyBinCount);
  const timer = every(66, () => {
    an.getFloatTimeDomainData(time);
    an.getFloatFrequencyData(freq);
    let sum = 0;
    for (let i = 0; i < time.length; i++) sum += time[i] * time[i];
    const rms = Math.sqrt(sum / time.length);
    let peak = 2;
    for (let i = 2; i < freq.length; i++) if (freq[i] > freq[peak]) peak = i;
    const hz = (peak * ac.sampleRate) / an.fftSize;
    const wave = Array.from({ length: 128 }, (_, i) => +time[Math.floor((i / 128) * time.length)].toFixed(3));
    const spec = Array.from({ length: SPEC_BINS }, (_, i) => {
      const a = Math.floor(Math.pow(freq.length, i / SPEC_BINS));
      const b = Math.max(a + 1, Math.floor(Math.pow(freq.length, (i + 1) / SPEC_BINS)));
      let m = DB_FLOOR;
      for (let k = a; k < b && k < freq.length; k++) m = Math.max(m, freq[k]);
      return +Math.max(0, Math.min(1, (m - DB_FLOOR) / 80)).toFixed(3);
    });
    ctx.emit({ db: Math.max(-100, 20 * Math.log10(rms || 1e-5)), peak_hz: hz, rms, wave, spec } satisfies MicRec);
  });
  return () => { timer(); stream.getTracks().forEach((t) => t.stop()); void ac.close().catch(() => {}); };
}

function micSim(ctx: Ctx) {
  ctx.granted();
  const t0 = Date.now();
  return every(66, () => {
    const t = (Date.now() - t0) / 1000;
    const talk = Math.max(0, Math.sin(t * 1.7) * Math.sin(t * 0.43 + 1)) ** 0.6;
    const amp = 0.01 + talk * 0.22 + Math.random() * 0.004;
    const f0 = 120 + 40 * Math.sin(t * 0.9);
    const wave = Array.from({ length: 128 }, (_, i) => +(amp * (Math.sin(i * 0.4 + t * 30) * 0.7 + Math.sin(i * 0.9 + t * 11) * 0.3) + noise(0.004)).toFixed(3));
    const spec = Array.from({ length: SPEC_BINS }, (_, i) => {
      const x = i / SPEC_BINS;
      const form = Math.exp(-Math.pow((x - 0.28) / 0.07, 2)) * 0.8 + Math.exp(-Math.pow((x - 0.5) / 0.09, 2)) * 0.5 + Math.exp(-Math.pow((x - 0.15) / 0.05, 2));
      return +Math.max(0.02, Math.min(1, 0.12 + form * talk * 0.8 + Math.random() * 0.05)).toFixed(3);
    });
    const rms = amp * 0.62;
    ctx.emit({ db: 20 * Math.log10(rms), peak_hz: f0 * (1 + Math.round(talk * 3)) + noise(6), rms, wave, spec } satisfies MicRec);
  });
}

function MicInstrument({ session }: InstrumentProps) {
  const d = lastData<MicRec>(session);
  const wave = (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = C.line;
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    if (!d) return;
    g.strokeStyle = COLOR;
    g.lineWidth = 1.5;
    g.beginPath();
    d.wave.forEach((v, i) => {
      const x = (i / (d.wave.length - 1)) * w;
      const y = h / 2 - Math.max(-1, Math.min(1, v * 3)) * (h / 2 - 4);
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    });
    g.stroke();
  };
  const spec = (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.clearRect(0, 0, w, h);
    if (!d) return;
    const bw = w / d.spec.length;
    g.fillStyle = COLOR;
    d.spec.forEach((v, i) => g.fillRect(i * bw + 1, h - v * (h - 4), bw - 2, v * (h - 4)));
  };
  const lvl = d ? Math.max(0, Math.min(1, (d.db + 80) / 80)) : 0;
  return (
    <Frame
      visual={d ? (
        <div className="cdf-mic">
          <div className="cdf-mic-main">
            <div><p className="cdf-label">Waveform</p><Cv draw={wave} w={640} h={220} className="cdf-canvas" /></div>
            <div><p className="cdf-label">Spectrum, 20 Hz to 20 kHz (log)</p><Cv draw={spec} w={640} h={300} className="cdf-canvas tall" /></div>
          </div>
          <div className="cdf-meter" title="Level in dB full scale">
            {[-60, -40, -20, 0].map((t) => <div key={t} className="cdf-meter-tick" style={{ bottom: `${((t + 80) / 80) * 100}%` }}>{t}</div>)}
            <div className="cdf-meter-fill" style={{ height: `${lvl * 100}%` }} />
            <div className="cdf-meter-peak" style={{ bottom: `${lvl * 100}%` }} />
            <div className="cdf-meter-val">{fmt(d.db, 0)}</div>
          </div>
        </div>
      ) : <Waiting session={session} what="A waveform, spectrum and level meter from your microphone." />}
      side={
        <>
          <Readout rows={[
            { k: "Level", v: d?.db ?? null, u: "dBFS", digits: 1, hot: true },
            { k: "Loudest pitch", v: d?.peak_hz ?? null, u: "Hz", digits: 0 },
            { k: "RMS", v: d?.rms ?? null, digits: 4 },
          ]} />
          <Spark values={series(session.records, "db", 100)} w={220} h={30} color={COLOR} />
        </>
      }
    />
  );
}

// ---------- Screen ----------

type ScreenRec = { width: number; height: number; surface: string; frame_rate: number; label: string };

async function screenLive(ctx: Ctx) {
  if (!navigator.mediaDevices?.getDisplayMedia) unsupported("getDisplayMedia");
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  ctx.granted();
  ctx.setMedia(stream);
  const track = stream.getVideoTracks()[0];
  track.addEventListener("ended", () => ctx.log("you stopped sharing from the browser bar"));
  const read = () => {
    const s: any = track.getSettings();
    ctx.emit({ width: s.width || 0, height: s.height || 0, surface: s.displaySurface || "unknown", frame_rate: s.frameRate || 0, label: track.label || "" } satisfies ScreenRec);
  };
  const timer = every(1000, read);
  return () => { timer(); stream.getTracks().forEach((t) => t.stop()); };
}

function screenSim(ctx: Ctx) {
  ctx.granted();
  const W = 1280, H = 720;
  const src = paintedStream(W, H, (g, t) => {
    g.fillStyle = "#f5f5f7"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#fff"; g.strokeStyle = "#d8d8dc";
    g.fillRect(80, 60, 700, 480); g.strokeRect(80, 60, 700, 480);
    g.fillStyle = "#ececef"; g.fillRect(80, 60, 700, 34);
    g.fillStyle = "#cfcfd4";
    for (let i = 0; i < 9; i++) g.fillRect(110, 124 + i * 44, 300 + ((i * 97 + Math.floor(t / 400)) % 300), 14);
    g.fillStyle = "#1f4bff"; g.fillRect(820 + Math.sin(t / 900) * 30, 220, 320, 200);
  }, ctx);
  const timer = every(1000, () => ctx.emit({ width: W, height: H, surface: "monitor", frame_rate: 25, label: "screen:0:0 (simulated)" } satisfies ScreenRec));
  return () => { timer(); src.stop(); };
}

function ScreenInstrument({ session }: InstrumentProps) {
  const d = lastData<ScreenRec>(session);
  return (
    <Frame
      visual={
        <div>
          <div className="cdf-stage">
            {session.media ? <Vid stream={session.media} /> : null}
            {!d && <div className="cdf-stage-empty"><Waiting session={session} what="The browser asks which screen, window or tab to share, then shows it live." /></div>}
          </div>
          {d && <p className="cdf-note">The page receives every pixel of what you chose, including notifications and other tabs when you share a whole screen.</p>}
        </div>
      }
      side={<Readout rows={[
        { k: "Surface", v: d?.surface ?? null, hot: true },
        { k: "Width", v: d?.width ?? null, u: "px", digits: 0 },
        { k: "Height", v: d?.height ?? null, u: "px", digits: 0 },
        { k: "Frame rate", v: d?.frame_rate ?? null, u: "fps", digits: 0 },
        { k: "Source", v: d?.label || null },
      ]} />}
    />
  );
}

// ---------- Speech ----------

type SpeechRec = { final: string; interim: string; words: number; wpm: number; confidence: number | null };

const countWords = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

function wpmTracker() {
  const hist: { t: number; w: number }[] = [];
  const t0 = Date.now();
  return (words: number) => {
    const now = Date.now();
    hist.push({ t: now, w: words });
    while (hist.length > 2 && now - hist[0].t > 30000) hist.shift();
    const dt = now - hist[0].t;
    if (dt >= 4000) return ((words - hist[0].w) * 60000) / dt;
    return words ? (words * 60000) / Math.max(4000, now - t0) : 0;
  };
}

async function speechLive(ctx: Ctx) {
  const SR = win().SpeechRecognition || win().webkitSpeechRecognition;
  if (!SR) unsupported("SpeechRecognition");
  const rec = new SR();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = navigator.language || "en-US";
  const wpm = wpmTracker();
  let finalText = "";
  let interim = "";
  let conf: number | null = null;
  let stopped = false;
  let started = false;
  const push = () => {
    const n = countWords(finalText + " " + interim);
    ctx.emit({ final: finalText, interim, words: n, wpm: wpm(n), confidence: conf } satisfies SpeechRec);
  };
  rec.onresult = (e: any) => {
    let f = "";
    let i = "";
    for (let k = 0; k < e.results.length; k++) {
      const r = e.results[k];
      if (r.isFinal) { f += r[0].transcript + " "; conf = r[0].confidence; } else i += r[0].transcript;
    }
    finalText = f;
    interim = i;
    push();
  };
  rec.onend = () => { if (!stopped) { try { rec.start(); } catch { /* already started */ } } };
  await new Promise<void>((res, rej) => {
    rec.onaudiostart = () => { started = true; res(); };
    rec.onerror = (e: any) => {
      if (!started) {
        const err = new Error(`speech recognition: ${e.error}`);
        err.name = e.error === "not-allowed" || e.error === "service-not-allowed" ? "NotAllowedError" : "Error";
        rej(err);
      } else ctx.log(`speech error: ${e.error}`);
    };
    rec.start();
  });
  ctx.granted();
  ctx.log("listening; in Chrome the audio is sent to a cloud service for transcription");
  push();
  const tick = every(1000, push);
  return () => { stopped = true; tick(); try { rec.abort(); } catch { /* ignore */ } };
}

const SIM_SPEECH = [
  "Hey, can you hear me okay. I am calling about the delivery that was supposed to arrive on Thursday.",
  "My card number ends in four two one nine and the order is under the name on the account.",
  "I will be at the office until about five, then I am heading home, so send it to the side door.",
  "Actually, remind me to call Priya tomorrow morning about the quarterly numbers.",
];

function speechSim(ctx: Ctx) {
  ctx.granted();
  const wpm = wpmTracker();
  let si = 0;
  let ci = 0;
  let finalText = "";
  return every(90, () => {
    const s = SIM_SPEECH[si % SIM_SPEECH.length];
    ci = Math.min(s.length, ci + 2 + Math.floor(Math.random() * 2));
    if (ci >= s.length) {
      finalText += s + " ";
      if (finalText.length > 260) finalText = "";
      si++;
      ci = 0;
      const n = countWords(finalText);
      ctx.emit({ final: finalText, interim: "", words: n, wpm: Math.max(0, wpm(n) + noise(3)), confidence: 0.9 + Math.random() * 0.09 } satisfies SpeechRec);
    } else {
      const partial = s.slice(0, ci);
      const n = countWords(finalText + " " + partial);
      ctx.emit({ final: finalText, interim: partial, words: n, wpm: Math.max(0, wpm(n) + noise(3)), confidence: null } satisfies SpeechRec);
    }
  });
}

function SpeechInstrument({ session }: InstrumentProps) {
  const d = lastData<SpeechRec>(session);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: 1e6 }); });
  return (
    <Frame
      visual={d ? (
        <div className="cdf-speech">
          <div className="cdf-wpm">{fmt(d.wpm, 0)}<em>words per minute</em></div>
          <div className="cdf-transcript" ref={ref}>
            {d.final}<span className="cdf-interim">{d.interim}</span><span className="cdf-caret" />
          </div>
        </div>
      ) : <Waiting session={session} what="Words you speak appear as a live transcript, greyed while the engine is still guessing." />}
      side={
        <>
          <Readout rows={[
            { k: "Words heard", v: d?.words ?? null, hot: true, digits: 0 },
            { k: "Speaking rate", v: d?.wpm ?? null, u: "wpm", digits: 0 },
            { k: "Confidence", v: d?.confidence != null ? d.confidence * 100 : null, u: "%", digits: 0 },
          ]} />
          <Spark values={series(session.records, "wpm", 80)} w={220} h={30} color={COLOR} min={0} />
        </>
      }
    />
  );
}

// ---------- Ambient light ----------

type LightRec = { lux: number };
const LIGHT_SCALE: [string, number, string][] = [["Direct sunlight", 32000, "32,000+"], ["Overcast day", 1000, "1,000"], ["Bright office", 400, "400"], ["Living room", 100, "100"], ["Dim lamp", 10, "10"], ["Dark room", 0, "0"]];

async function lightLive(ctx: Ctx) {
  const ALS = win().AmbientLightSensor;
  if (!ALS) unsupported("AmbientLightSensor");
  const sensor = new ALS({ frequency: 10 });
  await new Promise<void>((res, rej) => {
    sensor.addEventListener("error", (e: any) => rej(e.error || new Error("sensor error")), { once: true });
    sensor.addEventListener("reading", () => res(), { once: true });
    sensor.start();
  });
  ctx.granted();
  sensor.addEventListener("reading", () => ctx.emit({ lux: sensor.illuminance } satisfies LightRec));
  ctx.emit({ lux: sensor.illuminance } satisfies LightRec);
  return () => sensor.stop();
}

function lightSim(ctx: Ctx) {
  ctx.granted();
  const t0 = Date.now();
  return every(200, () => {
    const t = (Date.now() - t0) / 1000;
    const lux = Math.max(0, 320 + Math.sin(t / 5) * 180 + (Math.sin(t / 17) > 0.8 ? 600 : 0) + noise(8));
    ctx.emit({ lux } satisfies LightRec);
  });
}

function LightInstrument({ session }: InstrumentProps) {
  const d = lastData<LightRec>(session);
  const lux = d?.lux ?? 0;
  const hit = LIGHT_SCALE.find((s) => lux >= s[1]) || LIGHT_SCALE[LIGHT_SCALE.length - 1];
  return (
    <Frame
      visual={d ? (
        <div className="cdf-light">
          <Gauge value={Math.log10(1 + lux) / Math.log10(1 + 100000)} label={fmt(lux, 0)} sub="lux" color={COLOR} size={190} />
          <div className="cdf-scale">{LIGHT_SCALE.map((s) => <div key={s[0]} className={s === hit ? "on" : ""}><span>{s[0]}</span><span>{s[2]} lx</span></div>)}</div>
        </div>
      ) : <Waiting session={session} what="A gauge of the light level around your device, in lux." />}
      side={
        <>
          <Readout rows={[{ k: "Illuminance", v: d?.lux ?? null, u: "lux", digits: 0, hot: true }, { k: "Looks like", v: d ? hit[0] : null }]} />
          <Spark values={series(session.records, "lux", 100)} w={220} h={30} color={COLOR} min={0} />
        </>
      }
    />
  );
}

// ---------- Clipboard ----------

type ClipRec = { length: number; kind: string; preview: string; lines: number };

function guess(t: string): string {
  const s = t.trim();
  if (!s) return "empty";
  if (/^https?:\/\/\S+$/i.test(s)) return "url";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "email";
  if (/^[-+]?[\d.,\s]+$/.test(s)) return "number";
  return "text";
}

const clipRec = (t: string): ClipRec => ({ length: t.length, kind: guess(t), preview: t.slice(0, 24), lines: t ? t.split("\n").length : 0 });

async function clipLive(ctx: Ctx) {
  if (!navigator.clipboard?.readText) unsupported("clipboard.readText");
  const text = await navigator.clipboard.readText();
  ctx.granted();
  ctx.log(`read ${text.length} characters; only the first 24 are kept for display`);
  ctx.emit(clipRec(text));
}

function clipSim(ctx: Ctx) {
  ctx.granted();
  ctx.emit(clipRec("https://bank.example.com/reset?token=9f3a1c77d2"));
  return () => {};
}

function ClipInstrument({ session }: InstrumentProps) {
  const d = lastData<ClipRec>(session);
  const rest = d ? Math.min(40, Math.max(0, d.length - 24)) : 0;
  return (
    <Frame
      visual={d ? (
        <div className="cdf-clip">
          <div className="cdf-big">{fmt(d.length, 0)}<em>characters</em></div>
          <div><span className="cdf-tag">looks like: {d.kind}</span></div>
          <div className="cdf-mask">{d.preview || "(nothing on the clipboard)"}{rest > 0 && <i>{"•".repeat(rest)}{d.length - 24 > 40 ? "…" : ""}</i>}</div>
          <p className="cdf-note">This console masks everything after 24 characters. A real page receives the whole text, which is often a password, a one-time code or a copied address.</p>
        </div>
      ) : <Waiting session={session} what="Reads whatever you last copied. Chrome asks first; Safari shows a Paste bubble." />}
      side={<Readout rows={[{ k: "Length", v: d?.length ?? null, u: "chars", digits: 0, hot: true }, { k: "Type guess", v: d?.kind ?? null }, { k: "Lines", v: d?.lines ?? null, digits: 0 }]} />}
    />
  );
}

export const captureScopes: ScopeDef[] = [
  {
    id: "capture.camera", name: "Camera", domain: "capture", atlas: ["web.camera.camera"],
    summary: "Streams live video from your camera and lets the page read every frame.",
    call: 'navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })',
    permission: "camera", gesture: true,
    reveals: ["Your face, surroundings and what is on the wall behind you", "How many people are in the room", "Time of day and room lighting from frame brightness"],
    feeds: ["surroundings.media_devices", "capture.microphone", "capture.light"],
    metrics: [{ key: "fps", label: "fps", digits: 0 }, { key: "brightness", label: "brightness", digits: 0 }, { key: "faces", label: "faces", digits: 0 }],
    params: [
      { key: "facing", label: "Camera", type: "select", value: "user", options: ["user", "environment"] },
      { key: "resolution", label: "Resolution", type: "select", value: "1280x720", options: ["640x480", "1280x720", "1920x1080"] },
    ],
    live: cameraLive, sim: cameraSim, Instrument: CameraInstrument,
  },
  {
    id: "capture.microphone", name: "Microphone", domain: "capture", atlas: ["web.camera.microphone"],
    summary: "Streams live audio from your microphone and measures loudness and pitch.",
    call: "navigator.mediaDevices.getUserMedia({ audio: true })",
    permission: "microphone", gesture: true,
    reveals: ["Whether you are alone, in a crowd or in a car", "Your voice pitch and when you speak", "Background sounds such as TV, music or a baby"],
    feeds: ["capture.speech", "surroundings.media_devices"],
    metrics: [{ key: "db", label: "level", unit: "dB", digits: 0 }, { key: "peak_hz", label: "pitch", unit: "Hz", digits: 0 }, { key: "rms", label: "rms", digits: 3 }],
    live: micLive, sim: micSim, Instrument: MicInstrument,
  },
  {
    id: "capture.screen", name: "Screen share", domain: "capture", atlas: ["web.camera.display-capture"],
    summary: "Captures a screen, window or tab as live video after you pick it.",
    call: "navigator.mediaDevices.getDisplayMedia({ video: true })",
    gesture: true,
    reveals: ["Everything visible on the surface you share, including other people's messages", "Which kind of surface you chose: whole monitor, window or browser tab", "Your screen resolution"],
    feeds: ["device.screens", "device.profile"],
    metrics: [{ key: "width", label: "width", unit: "px", digits: 0 }, { key: "height", label: "height", unit: "px", digits: 0 }],
    live: screenLive, sim: screenSim, Instrument: ScreenInstrument,
  },
  {
    id: "capture.speech", name: "Speech to text", domain: "capture", atlas: ["web.camera.speech-recognition"],
    summary: "Turns what you say into text while you talk.",
    call: "new (window.SpeechRecognition || window.webkitSpeechRecognition)().start()",
    permission: "microphone", gesture: true,
    reveals: ["Everything you say, as searchable text", "Your language, accent and speaking pace", "Names, numbers and addresses spoken aloud"],
    feeds: ["capture.microphone"],
    metrics: [{ key: "words", label: "words", digits: 0 }, { key: "wpm", label: "pace", unit: "wpm", digits: 0 }],
    live: speechLive, sim: speechSim, Instrument: SpeechInstrument,
  },
  {
    id: "capture.light", name: "Ambient light", domain: "capture", atlas: ["web.location.sensor-ambient-light"],
    summary: "Reads how bright the room is from the device's light sensor.",
    call: "new AmbientLightSensor({ frequency: 10 }).start()",
    permission: "ambient-light-sensor",
    reveals: ["Whether you are indoors, outdoors, in bed or in the dark", "Screen glare and approximate time of day", "Past studies recovered browsing history from how light changed on screen"],
    feeds: ["capture.camera"],
    metrics: [{ key: "lux", label: "light", unit: "lux", digits: 0 }],
    live: lightLive, sim: lightSim, Instrument: LightInstrument,
  },
  {
    id: "capture.clipboard", name: "Clipboard", domain: "capture", atlas: ["web.input.clipboard-read"],
    summary: "Reads the text you last copied.",
    call: "navigator.clipboard.readText()",
    permission: "clipboard-read", gesture: true,
    reveals: ["Passwords, codes, addresses or messages you copied from other apps", "What you were doing just before opening the page"],
    feeds: ["capture.screen"],
    metrics: [{ key: "length", label: "chars", digits: 0 }],
    live: clipLive, sim: clipSim, Instrument: ClipInstrument,
  },
];
