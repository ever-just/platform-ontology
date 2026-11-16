import type { Ctx, InstrumentProps, ScopeDef } from "../core/types";
import { every, unsupported } from "../core/harness";
import { C, DOMAIN_COLOR, Frame, Readout, Waiting, fmt, lastData } from "../ui/kit";
import "./extras-identity-reach.css";

// Extra "surroundings" scopes: Web MIDI, gamepads and Web NFC.

const nav = () => navigator as any;
const COLOR = DOMAIN_COLOR.surroundings;
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteName = (n: number) => NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1);

// ---------- MIDI ----------

type MidiEvt = { note: number; name: string; vel: number; ch: number; at: number };
type MidiRec = { inputs: string[]; outputs: string[]; input_count: number; output_count: number; held: number[]; events: MidiEvt[]; notes_total: number; last_velocity: number; base: number };

function midiState(ctx: Ctx, inputs: string[], outputs: string[]) {
  const held = new Set<number>();
  let events: MidiEvt[] = [];
  let total = 0;
  let lastVel = 0;
  const base = ((Number(ctx.params.octave) || 3) + 1) * 12;
  const emit = () => ctx.emit({ inputs, outputs, input_count: inputs.length, output_count: outputs.length, held: [...held], events, notes_total: total, last_velocity: lastVel, base } satisfies MidiRec);
  const note = (n: number, vel: number, ch: number) => {
    if (vel > 0) {
      held.add(n);
      total++;
      lastVel = vel;
      events = [...events, { note: n, name: noteName(n), vel, ch, at: Date.now() }].slice(-30);
    } else held.delete(n);
    emit();
  };
  return { emit, note, held, setLists: (i: string[], o: string[]) => { inputs = i; outputs = o; } };
}

async function midiLive(ctx: Ctx) {
  if (!nav().requestMIDIAccess) unsupported("Web MIDI");
  const access = await nav().requestMIDIAccess({ sysex: false });
  ctx.granted();
  const names = (m: Map<string, any>) => [...m.values()].map((p: any) => p.name || p.id);
  const st = midiState(ctx, names(access.inputs), names(access.outputs));
  const onMsg = (e: any) => {
    const [status, d1, d2] = e.data as Uint8Array;
    const kind = status & 0xf0;
    const ch = (status & 0x0f) + 1;
    if (kind === 0x90) st.note(d1, d2, ch);
    else if (kind === 0x80) st.note(d1, 0, ch);
  };
  const wire = () => {
    access.inputs.forEach((i: any) => { i.onmidimessage = onMsg; });
    st.setLists(names(access.inputs), names(access.outputs));
    st.emit();
  };
  access.onstatechange = () => { ctx.log("MIDI device list changed"); wire(); };
  wire();
  const beat = every(1500, () => st.emit());
  return () => { beat(); access.onstatechange = null; access.inputs.forEach((i: any) => { i.onmidimessage = null; }); };
}

function midiSim(ctx: Ctx) {
  ctx.granted();
  const st = midiState(ctx, ["Simulated Keystation 49"], ["Simulated Synth Out"]);
  const base = ((Number(ctx.params.octave) || 3) + 1) * 12;
  const scale = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 19, 21];
  const off = every(500, () => {
    const n = base + scale[Math.floor(Math.random() * scale.length)];
    st.note(n, 30 + Math.floor(Math.random() * 97), 1);
    setTimeout(() => st.note(n, 0, 1), 250 + Math.random() * 500);
  });
  return off;
}

const WHITE = [0, 2, 4, 5, 7, 9, 11];
function Piano({ base, held }: { base: number; held: number[] }) {
  const keys = Array.from({ length: 24 }, (_, i) => base + i);
  const whites = keys.filter((n) => WHITE.includes(n % 12));
  const W = 14;
  const wx = (n: number) => whites.indexOf(n) * W;
  return (
    <svg className="eir-piano" viewBox={`0 0 ${whites.length * W} 62`}>
      {whites.map((n) => (
        <g key={n}>
          <rect x={wx(n)} y="0" width={W} height="62" fill={held.includes(n) ? COLOR : C.bg} stroke={C.line} strokeWidth="0.6" />
          {n % 12 === 0 && <text x={wx(n) + W / 2} y="58" textAnchor="middle" fontSize="4.5" fill={held.includes(n) ? C.bg : C.mute}>{noteName(n)}</text>}
        </g>
      ))}
      {keys.filter((n) => !WHITE.includes(n % 12)).map((n) => (
        <rect key={n} x={wx(n - 1) + W * 0.68} y="0" width={W * 0.62} height="38" rx="1" fill={held.includes(n) ? COLOR : C.ink} />
      ))}
    </svg>
  );
}

function MidiInstrument({ session }: InstrumentProps) {
  const d = lastData<MidiRec>(session);
  return (
    <Frame
      visual={d ? (
        <div className="eir-wrap">
          <Piano base={d.base} held={d.held} />
          <div>
            <h4 className="eir-h">Note on log</h4>
            <div className="eir-log">
              {d.events.length === 0 && <div className="eir-log-row"><span>Play a key on your MIDI device.</span></div>}
              {[...d.events].reverse().slice(0, 12).map((e, i) => (
                <div key={e.at + "-" + i} className="eir-log-row eir-mono">
                  <b>{e.name}</b><span>note {e.note}</span><span>ch {e.ch}</span>
                  <div className="eir-vel"><i style={{ width: `${(e.vel / 127) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : <Waiting session={session} what="A two octave piano that lights up as you play, with a velocity log." />}
      side={
        <>
          <Readout rows={[
            { k: "Inputs", v: d?.input_count ?? null, hot: true },
            { k: "Outputs", v: d?.output_count ?? null },
            { k: "Notes played", v: d?.notes_total ?? null },
            { k: "Last velocity", v: d?.last_velocity ?? null, digits: 0 },
          ]} />
          {d && <div className="eir-events">{[...d.inputs, ...d.outputs.map((o) => o + " (out)")].map((n, i) => <span key={i}>{n}</span>)}{!d.inputs.length && !d.outputs.length && <span>No MIDI devices connected</span>}</div>}
        </>
      }
    />
  );
}

// ---------- Gamepad ----------

type PadRec = { connected: number; id: string; lx: number; ly: number; rx: number; ry: number; lt: number; rt: number; buttons: number[]; pressed: number };
const BTN_LABELS = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "Bk", "St", "L3", "R3", "Up", "Dn", "Lf", "Rt", "Hm"];

function padLive(ctx: Ctx) {
  if (!nav().getGamepads) unsupported("Gamepad API");
  ctx.granted();
  let raf = 0;
  let last = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (now - last < 33) return;
    last = now;
    const pad = [...nav().getGamepads()].find((g: any) => g && g.connected);
    if (!pad) return void ctx.emit({ connected: 0, id: "", lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, buttons: [], pressed: 0 } satisfies PadRec);
    const b = pad.buttons.map((x: any) => (x.pressed ? 1 : 0));
    ctx.emit({
      connected: 1, id: pad.id, lx: pad.axes[0] || 0, ly: pad.axes[1] || 0, rx: pad.axes[2] || 0, ry: pad.axes[3] || 0,
      lt: pad.buttons[6]?.value || 0, rt: pad.buttons[7]?.value || 0, buttons: b, pressed: b.reduce((a: number, v: number) => a + v, 0),
    } satisfies PadRec);
  };
  raf = requestAnimationFrame(loop);
  const onConn = (e: any) => ctx.log(`gamepad ${e.type}: ${e.gamepad?.id}`);
  window.addEventListener("gamepadconnected", onConn);
  window.addEventListener("gamepaddisconnected", onConn);
  return () => { cancelAnimationFrame(raf); window.removeEventListener("gamepadconnected", onConn); window.removeEventListener("gamepaddisconnected", onConn); };
}

function padSim(ctx: Ctx) {
  ctx.granted();
  const t0 = performance.now();
  return every(33, () => {
    const t = (performance.now() - t0) / 1000;
    const buttons: number[] = Array.from({ length: 17 }, (_, i) => (Math.floor(t * 2) % 17 === i ? 1 : 0));
    const lt = (Math.sin(t * 1.3) + 1) / 2;
    const rt = (Math.cos(t * 0.9) + 1) / 2;
    buttons[6] = lt > 0.8 ? 1 : 0;
    buttons[7] = rt > 0.8 ? 1 : 0;
    ctx.emit({
      connected: 1, id: "Simulated Standard Gamepad", lx: Math.cos(t * 1.5) * 0.85, ly: Math.sin(t * 1.5) * 0.85, rx: Math.cos(-t * 0.8) * 0.6, ry: Math.sin(-t * 0.8) * 0.6,
      lt, rt, buttons, pressed: buttons.reduce((a, v) => a + v, 0),
    } satisfies PadRec);
  });
}

function Stick({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <svg className="eir-stick" viewBox="-60 -60 120 120">
      <circle r="50" fill="none" stroke={C.line} strokeWidth="1" />
      <circle r="25" fill="none" stroke={C.line2} strokeWidth="1" />
      <line x1="-50" x2="50" stroke={C.line2} /><line y1="-50" y2="50" stroke={C.line2} />
      <circle cx={x * 50} cy={y * 50} r="7" fill={COLOR} />
      <text y="58" textAnchor="middle" fontSize="7" fill={C.mute}>{label} {x.toFixed(2)}, {y.toFixed(2)}</text>
    </svg>
  );
}

function PadInstrument({ session }: InstrumentProps) {
  const d = lastData<PadRec>(session);
  return (
    <Frame
      visual={d && d.connected ? (
        <div className="eir-wrap">
          <div className="eir-pads"><Stick x={d.lx} y={d.ly} label="L" /><Stick x={d.rx} y={d.ry} label="R" /></div>
          {[["LT", d.lt], ["RT", d.rt]].map(([l, v]) => (
            <div key={l as string} className="eir-trig eir-mono"><span>{l}</span><div className="eir-bar"><i style={{ width: `${(v as number) * 100}%` }} /></div><span>{(v as number).toFixed(2)}</span></div>
          ))}
          <div className="eir-btns">
            {BTN_LABELS.map((l, i) => (i === 6 || i === 7 ? null : <div key={l} className={"eir-bt" + (d.buttons[i] ? " on" : "")}>{l}</div>))}
          </div>
        </div>
      ) : d ? <div className="waiting st-granted"><span className="waiting-dot" />No gamepad seen yet. Plug one in and press any button; browsers hide pads until then.</div>
        : <Waiting session={session} what="Two stick circles, button squares and trigger bars for a connected gamepad." />}
      side={<Readout rows={[
        { k: "Connected", v: d ? d.connected === 1 : null, hot: true },
        { k: "Controller", v: d?.id ? d.id.slice(0, 34) : null },
        { k: "Buttons held", v: d?.pressed ?? null, digits: 0 },
        { k: "Left stick", v: d ? `${fmt(d.lx)}, ${fmt(d.ly)}` : null },
        { k: "Right stick", v: d ? `${fmt(d.rx)}, ${fmt(d.ry)}` : null },
      ]} />}
    />
  );
}

// ---------- NFC ----------

type Tag = { serial: string; types: string[]; at: number };
type NfcRec = { tags: Tag[]; count: number; records_total: number; last_serial: string };

function nfcEmit(ctx: Ctx, tags: Tag[]) {
  ctx.emit({ tags: tags.slice(-12), count: tags.length, records_total: tags.reduce((a, t) => a + t.types.length, 0), last_serial: tags.length ? tags[tags.length - 1].serial : "" } satisfies NfcRec);
}

async function nfcLive(ctx: Ctx) {
  const Reader = (window as any).NDEFReader;
  if (!Reader) unsupported("Web NFC (Android Chrome only)");
  const reader = new Reader();
  const ac = new AbortController();
  await reader.scan({ signal: ac.signal });
  ctx.granted();
  ctx.log("NFC scan running: hold a tag near the back of the phone");
  const tags: Tag[] = [];
  reader.onreading = (e: any) => {
    tags.push({ serial: e.serialNumber || "no serial", types: (e.message?.records || []).map((r: any) => r.recordType), at: Date.now() });
    nfcEmit(ctx, tags);
  };
  reader.onreadingerror = () => ctx.log("tag could not be read");
  nfcEmit(ctx, tags);
  return () => ac.abort();
}

function nfcSim(ctx: Ctx) {
  ctx.granted();
  const tags: Tag[] = [];
  const kinds = [["url"], ["text", "text"], ["mime"], ["smart-poster"], ["empty"]];
  let n = 0;
  nfcEmit(ctx, tags);
  const h = setInterval(() => {
    const serial = Array.from({ length: 7 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join(":");
    tags.push({ serial, types: kinds[n++ % kinds.length], at: Date.now() });
    nfcEmit(ctx, tags);
  }, 4000);
  return () => clearInterval(h);
}

function NfcInstrument({ session }: InstrumentProps) {
  const d = lastData<NfcRec>(session);
  return (
    <Frame
      visual={d ? (
        <div className="eir-tags">
          {d.tags.length === 0 && <div className="waiting st-granted"><span className="waiting-dot" />Listening. Tap an NFC tag against the phone.</div>}
          {[...d.tags].reverse().map((t, i) => (
            <div key={t.at + "-" + i} className="eir-tag">
              <b className="eir-mono">{t.serial}</b>
              <div>{t.types.length ? t.types.map((r, j) => <span key={j} className="eir-chip">{r}</span>) : <span className="eir-chip">no records</span>}</div>
              <span className="eir-state">{new Date(t.at).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      ) : <Waiting session={session} what="A list of NFC tags you tap, with serial number and record types." />}
      side={<Readout rows={[{ k: "Tags scanned", v: d?.count ?? null, hot: true }, { k: "Records read", v: d?.records_total ?? null }, { k: "Last serial", v: d?.last_serial || null }]} />}
    />
  );
}

export const extrasScopes: ScopeDef[] = [
  {
    id: "surroundings.midi", name: "MIDI instruments", domain: "surroundings", atlas: ["web.hardware.midi", "web.peripherals.web-midi"],
    summary: "Lists connected MIDI keyboards and controllers and shows every note you play, live.",
    call: "navigator.requestMIDIAccess({ sysex: false })", permission: "midi", gesture: true,
    reveals: ["Which music gear is plugged in", "Exactly what you play and how hard you press"],
    feeds: ["surroundings.media_devices", "fingerprint.profile"],
    metrics: [{ key: "input_count", label: "inputs" }, { key: "notes_total", label: "notes" }, { key: "last_velocity", label: "velocity" }],
    params: [{ key: "octave", label: "Lowest octave shown", type: "number", value: 3, min: 0, max: 6, step: 1 }],
    live: midiLive, sim: midiSim, Instrument: MidiInstrument,
  },
  {
    id: "surroundings.gamepad", name: "Gamepad", domain: "surroundings", atlas: ["web.peripherals.gamepad", "web.device.gamepad-presence"],
    summary: "Reads the sticks, triggers and buttons of a connected game controller about 30 times a second.",
    call: "navigator.getGamepads() in requestAnimationFrame", passive: true,
    reveals: ["That a controller is connected and which model it is", "Every button press and stick movement, which can act like a typing pattern"],
    feeds: ["fingerprint.profile"],
    metrics: [{ key: "connected", label: "connected" }, { key: "pressed", label: "buttons" }, { key: "lx", label: "left x", digits: 2 }],
    live: async (ctx) => padLive(ctx), sim: padSim, Instrument: PadInstrument,
  },
  {
    id: "surroundings.nfc", name: "NFC tags", domain: "surroundings", atlas: ["web.hardware.nfc", "web.peripherals.web-nfc"],
    summary: "Waits for you to tap an NFC tag and reads its serial number and record types.",
    call: "new NDEFReader().scan()", permission: "nfc", gesture: true,
    reveals: ["The unique serial of every tag or card you tap", "What a tag points to (links, text, payloads)"],
    metrics: [{ key: "count", label: "tags" }, { key: "records_total", label: "records" }],
    live: nfcLive, sim: nfcSim, Instrument: NfcInstrument,
  },
];
