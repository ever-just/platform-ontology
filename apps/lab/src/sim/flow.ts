import type { Item, Mode, Opt, Plat, Scope } from '../types';
import { statusOf } from '../data';

export const APP_NAME = 'Atlas';
export const SITE = 'platformontology.lol';

export interface CheckInfo { id: string; label: string; text: string; ok: boolean }
export interface PromptInfo {
  style: 'alert' | 'sheet' | 'bubble';
  title: string; body: string; options: Opt[]; subject: string;
}
export interface Plan {
  mode: Mode;
  grant: string;
  checks: CheckInfo[];
  prompt: PromptInfo | null;
  blockedReason: string;
  button: string;
  silentLabel: string;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
function shortName(n: string) {
  return n.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

export function buttonLabel(item: Item): string {
  const n = shortName(item.n);
  const id = item.id;
  if (/location/.test(id) && item.k === 'permission') return 'Share my location';
  if (/\.camera\.camera$|mob\.camera\.camera|camera\.camera/.test(id)) return 'Turn on camera';
  if (/microphone/.test(id) && item.k === 'permission') return 'Turn on microphone';
  if (/notification/.test(id) && item.k === 'permission') return 'Turn on notifications';
  if (/contacts?/.test(id) && item.k === 'permission') return 'Find friends in contacts';
  switch (item.k) {
    case 'permission': return `Allow ${lower(n)}`.slice(0, 40);
    case 'picker': return `Choose ${lower(n)}`.slice(0, 40);
    case 'capability': return `Use ${lower(n)}`.slice(0, 40);
    case 'action': return `Run ${lower(n)}`.slice(0, 40);
    case 'signal': return `Read ${lower(n)}`.slice(0, 40);
    case 'tracking': return `Read ${lower(n)}`.slice(0, 40);
    default: return `Try ${lower(n)}`.slice(0, 40);
  }
}

const NATIVE_TOKENS: { re: RegExp; scope: Scope; allow: boolean; id: string }[] = [
  { re: /allow while using( the)?( app)?|while using( the app)?|allow while visiting/i, scope: 'while', allow: true, id: 'while' },
  { re: /only this time|allow once|allow this time/i, scope: 'once', allow: true, id: 'once' },
  { re: /allow all the time|always allow|always authorization|always/i, scope: 'always', allow: true, id: 'always' },
  { re: /allow full access|allow access to all photos|allow all\b|full access|allow selected or all/i, scope: 'full', allow: true, id: 'full' },
  { re: /limit(ed)? access|select photos( and videos)?|select contacts|add events only/i, scope: 'limited', allow: true, id: 'limited' },
  { re: /don'?t allow|do not allow|ask app not to track|block|deny/i, scope: 'deny', allow: false, id: 'deny' },
  { re: /\ballow\b|\bok\b/i, scope: 'full', allow: true, id: 'allow' },
];

const LABELS: Record<Plat, Record<string, string>> = {
  android: {
    while: 'While using the app', once: 'Only this time', always: 'Allow all the time', full: 'Allow all',
    limited: 'Select photos and videos', deny: "Don't allow", allow: 'Allow',
  },
  ios: {
    while: 'Allow While Using App', once: 'Allow Once', always: 'Always Allow', full: 'Allow Full Access',
    limited: 'Limit Access', deny: "Don't Allow", allow: 'Allow',
  },
  web: {
    while: 'Allow while visiting the site', once: 'Allow this time', always: 'Allow always', full: 'Allow',
    limited: 'Allow selected', deny: "Don't allow", allow: 'Allow',
  },
};

export function parseOptions(ui: string, plat: Plat, permName: string, itemId: string): Opt[] {
  const found: { id: string; pos: number; scope: Scope; allow: boolean }[] = [];
  const used: [number, number][] = [];
  const overlaps = (a: number, b: number) => used.some(([x, y]) => a < y && b > x);
  for (const t of NATIVE_TOKENS) {
    const g = new RegExp(t.re.source, 'ig');
    let m: RegExpExecArray | null;
    while ((m = g.exec(ui))) {
      const a = m.index; const b = a + m[0].length;
      if (overlaps(a, b)) continue;
      used.push([a, b]);
      if (!found.some((f) => f.id === t.id)) found.push({ id: t.id, pos: a, scope: t.scope, allow: t.allow });
    }
  }
  found.sort((a, b) => a.pos - b.pos);
  let ids = found.map((f) => f.id);
  // "Allow" next to a more specific allow is noise
  if (ids.length > 1) ids = ids.filter((i) => i !== 'allow');
  if (!ids.includes('deny')) ids.push('deny');
  if (ids.length === 1) {
    // no allow tokens found: build sensible defaults
    const p = permName.toUpperCase();
    const loc = /LOCATION/.test(p) && !/BACKGROUND/.test(p);
    const cam = /CAMERA|RECORD_AUDIO|MICROPHONE/.test(p) || /camera|microphone|mic\b/.test(itemId);
    if (plat === 'android' && (loc || cam)) ids = ['while', 'once', 'deny'];
    else if (plat === 'web') ids = ['while', 'once', 'deny'];
    else if (plat === 'ios' && loc) ids = ['while', 'once', 'deny'];
    else ids = ['allow', 'deny'];
  }
  // order: allow-ish first, deny last
  const deny = ids.filter((i) => i === 'deny');
  const rest = ids.filter((i) => i !== 'deny').slice(0, 3);
  const meta = (id: string) => NATIVE_TOKENS.find((t) => t.id === id)!;
  return [...rest, ...deny].map((id) => ({ label: LABELS[plat][id], allow: meta(id).allow, scope: meta(id).scope }));
}

function androidTitle(item: Item, p: { pm: string }): { title: string; subject: string } {
  const pm = (p.pm || '').toUpperCase();
  const map: [RegExp, string, string][] = [
    [/CAMERA/, 'take pictures and record video', 'camera'],
    [/RECORD_AUDIO/, 'record audio', 'microphone'],
    [/LOCATION/, "access this device's location", 'location'],
    [/CONTACTS/, 'access your contacts', 'contacts'],
    [/CALENDAR/, 'access your calendar', 'calendar'],
    [/MEDIA|STORAGE/, 'access photos and media on your device', 'media'],
    [/NOTIFICATION/, 'send you notifications', 'notifications'],
    [/BLUETOOTH|NEARBY/, 'find, connect to, and determine the relative position of nearby devices', 'nearby devices'],
    [/ACTIVITY_RECOGNITION/, 'access your physical activity', 'physical activity'],
    [/BODY_SENSORS|HEART/, 'access body sensor data like heart rate while the app is in use', 'body sensors'],
    [/SMS/, 'send and view SMS messages', 'SMS'],
    [/PHONE|CALL/, 'make and manage phone calls', 'phone'],
  ];
  for (const [re, phrase, subject] of map) if (re.test(pm)) return { title: `Allow ${APP_NAME} to ${phrase}?`, subject };
  return { title: `Allow ${APP_NAME} to access ${lower(shortName(item.n))}?`, subject: lower(shortName(item.n)) };
}

function webSubject(item: Item): string {
  const id = item.id;
  const m: [RegExp, string][] = [
    [/geolocation/, 'Know your location'], [/camera\.camera$|camera-ptz/, 'Use your camera'], [/microphone/, 'Use your microphone'],
    [/notification/, 'Show notifications'], [/clipboard/, 'See text and images copied to the clipboard'], [/midi/, 'Use your MIDI devices'],
    [/display-capture/, 'Share your screen'], [/bluetooth/, 'Pair with a Bluetooth device'], [/usb/, 'Connect to a USB device'],
    [/sensor|orientation/, 'Use motion sensors'], [/storage-access/, 'Use cookies and site data'], [/window-management/, 'Manage windows on all your displays'],
  ];
  for (const [re, s] of m) if (re.test(id)) return s;
  return `Use ${lower(shortName(item.n))}`;
}

export function buildPlan(item: Item, plat: Plat): Plan {
  const st = statusOf(item, plat);
  const nat = plat === 'web' ? undefined : item.p[plat];
  const web = plat === 'web' ? item.p.web : undefined;
  const grant = (nat?.g ?? web?.g ?? 'none');
  const permName = nat?.pm ?? web?.pm ?? '';
  const ui = nat?.ui ?? web?.ui ?? '';
  const osName = plat === 'ios' ? 'iOS' : plat === 'android' ? 'Android' : 'This browser';

  let checks: CheckInfo[];
  if (web) {
    checks = [
      { id: 'c1', label: 'Secure context', ok: true, text: web.sc ? 'Needs HTTPS. This page is served over HTTPS, so this passes.' : 'Works on plain HTTP too. Nothing to check.' },
      { id: 'c2', label: 'User gesture', ok: true, text: web.ug ? 'Needs a click, tap or key press first. Your trigger click counts.' : 'No click needed. A page can call this on its own.' },
      { id: 'c3', label: 'Permissions policy', ok: true, text: web.pp ? `The page policy must allow: ${web.pp}.${web.ifr ? ' ' + web.ifr : ''}` : 'No Permissions-Policy feature is tied to this one.' },
      { id: 'c4', label: 'OS switch', ok: st.tone !== 'no', text: st.tone === 'no' ? 'The browser does not offer this API at all.' : item.k === 'permission' || grant === 'prompt' ? 'The device itself must allow it too (for example the system camera or location switch).' : 'No device level switch is involved.' },
    ];
  } else {
    const n = nat!;
    checks = [
      { id: 'c1', label: 'OS version', ok: st.tone !== 'no', text: st.tone === 'no' ? `${osName} does not give apps this. ${n.nt || ''}`.trim() : `Needs ${osName} ${n.v || 'any version'}${n.api ? ` (API ${n.api})` : ''} or newer.` },
      { id: 'c2', label: 'Declared key', ok: true, text: n.pm ? `The app must declare ${n.pm}.` : 'No declaration is needed.' },
      { id: 'c3', label: 'OS switch', ok: true, text: `Protection: ${n.pr || 'none'}.${n.rv ? ' Users can flip it in ' + n.rv + '.' : ''}` },
      { id: 'c4', label: 'Store policy', ok: true, text: n.sp || 'No special store review rule.' },
    ];
  }

  const button = buttonLabel(item);
  let mode: Mode;
  let blockedReason = '';
  if (grant === 'not-exposed' || item.k === 'not-exposed') {
    mode = 'blocked'; blockedReason = item.l.h || 'Apps cannot get this.';
  } else if (st.tone === 'no') {
    mode = 'blocked'; blockedReason = `${plat === 'web' ? 'No browser supports this' : `${osName} does not give apps this`}.`;
  } else if (grant === 'system-only') {
    mode = 'blocked'; blockedReason = 'Only the operating system itself can use this. Apps get no access.';
  } else if (grant === 'prompt') mode = 'prompt';
  else if (grant === 'picker') mode = 'picker';
  else if (grant === 'settings' || grant === 'role' || grant === 'enterprise') mode = 'settings';
  else if (item.k === 'signal' || item.k === 'tracking') mode = 'silent';
  else mode = 'direct';

  let prompt: PromptInfo | null = null;
  if (mode === 'prompt') {
    const sheetLike = /sheet|picker|chooser|screen|banner|button|banner|toggle|passkey|wallet|dialog/i.test(ui) && !/\ballow\b|don'?t allow|\bblock\b/i.test(ui);
    if (plat === 'web') {
      const subject = webSubject(item);
      prompt = {
        style: sheetLike ? 'sheet' : 'bubble', subject,
        title: `${SITE} wants to`, body: subject,
        options: sheetLike ? [{ label: 'Continue', allow: true, scope: 'full' }, { label: 'Cancel', allow: false, scope: 'deny' }] : parseOptions(ui, 'web', permName, item.id),
      };
    } else if (plat === 'android') {
      const { title, subject } = androidTitle(item, { pm: permName });
      prompt = {
        style: sheetLike ? 'sheet' : 'alert', subject, title: sheetLike ? `${APP_NAME} wants to continue` : title,
        body: sheetLike ? (ui || 'Review what is shared.') : '',
        options: sheetLike ? [{ label: 'Continue', allow: true, scope: 'full' }, { label: 'Cancel', allow: false, scope: 'deny' }] : parseOptions(ui, 'android', permName, item.id),
      };
    } else {
      const subject = lower(shortName(item.n));
      const use = item.uc[0] ? ` ${APP_NAME} uses this for ${lower(item.uc[0]).replace(/\.$/, '')}.` : '';
      prompt = {
        style: sheetLike ? 'sheet' : 'alert', subject,
        title: sheetLike ? `${APP_NAME} wants to continue` : `“${APP_NAME}” Would Like to Access ${shortName(item.n)}`,
        body: sheetLike ? (ui || 'Review what is shared.') : `This lets the app work with ${subject}.${use}`.trim(),
        options: sheetLike ? [{ label: 'Continue', allow: true, scope: 'full' }, { label: 'Cancel', allow: false, scope: 'deny' }] : parseOptions(ui, 'ios', permName, item.id),
      };
    }
  }

  return { mode, grant, checks, prompt, blockedReason, button, silentLabel: 'Collected silently' };
}

export const GRANT_LABEL: Record<string, string> = {
  prompt: 'Asks first', picker: 'You pick', settings: 'Set in Settings', none: 'No prompt', gesture: 'Needs a tap or click',
  install: 'Granted at install', enterprise: 'Managed devices only', role: 'Special role', 'system-only': 'System only',
  'not-exposed': 'Blocked', 'origin-trial': 'Origin trial',
};

export interface NodeDetail { title: string; from: string; lines: string[] }
export interface FlowNodeDef { id: string; label: string; sub?: string }

export function nodeDetails(item: Item, plat: Plat, plan: Plan): Record<string, NodeDetail> {
  const nat = plat === 'web' ? undefined : item.p[plat];
  const web = plat === 'web' ? item.p.web : undefined;
  const ps = nat?.ps ?? web?.ps ?? '';
  const rv = nat?.rv ?? web?.rv ?? '';
  const ui = nat?.ui ?? web?.ui ?? '';
  const out: Record<string, NodeDetail> = {};
  out.trigger = { title: 'Trigger', from: 'You press the button on the device screen.', lines: [item.l.a || 'The app asks for it.', web?.api ? `Code: ${web.api.slice(0, 160)}` : nat?.as ? `API: ${nat.as}` : ''].filter(Boolean) };
  out.checks = { title: 'Checks', from: 'Runs right after the trigger, one check at a time.', lines: plan.checks.map((c) => `${c.label}: ${c.text}`) };
  for (const c of plan.checks) out[c.id] = { title: c.label, from: 'Evaluated while the checks run.', lines: [c.text] };
  out.prompt = {
    title: plan.mode === 'prompt' ? 'Prompt' : plan.mode === 'picker' ? 'Picker' : plan.mode === 'settings' ? 'Settings switch' : 'Prompt (skipped)',
    from: 'Appears only if every check passes.',
    lines: plan.mode === 'prompt' ? [ui || 'A system prompt asks first.', plan.prompt ? `Options: ${plan.prompt.options.map((o) => o.label).join(', ')}` : ''].filter(Boolean)
      : plan.mode === 'picker' ? [ui || 'A system sheet lets you choose exactly what to share.']
      : plan.mode === 'settings' ? [`There is no in app prompt. The switch lives in ${rv || 'system Settings'}.`]
      : ['No prompt exists for this one. It goes straight to the data.'],
  };
  out.decision = {
    title: 'Decision', from: 'Happens when you pick an option in the prompt.',
    lines: ['Allow paths deliver data. Deny paths give the app an error instead.', plan.prompt ? `Allow choices: ${plan.prompt.options.filter((o) => o.allow).map((o) => o.label).join(', ')}` : 'Without a prompt, the choice is made for you.'],
  };
  out.allow = { title: 'Allow branch', from: 'Taken when you pick an Allow option.', lines: ['The app is told it may continue.', 'Scope depends on the option, such as only this time or only while the app is open.'] };
  out.data = {
    title: 'Data delivered', from: 'Follows an Allow or a silent grant.',
    lines: [item.d.m || item.l.h, item.d.u ? `Updates: ${item.d.u}` : '', item.d.f.length ? `Fields: ${item.d.f.map((f) => f.n).join(', ')}` : 'No data fields. The effect is the result.'].filter(Boolean),
  };
  out.persist = { title: 'Persistence', from: 'Starts once access is granted.', lines: [ps || 'Lasts for the session unless you change it.'] };
  out.revoke = { title: 'Revocation', from: 'You can pull access back at any time.', lines: [rv || 'Remove it in system or site settings.', 'Use the Revoke button on the device to try it.'] };
  out.deny = { title: 'Deny branch', from: 'Taken when you pick Deny.', lines: ['The app gets no data.', 'It can only learn that access was refused.'] };
  out.sees = {
    title: 'What the app sees', from: 'Follows a Deny.',
    lines: plat === 'web' ? ['The promise rejects with a NotAllowedError (location uses error code 1).', 'The page learns nothing else about you.']
      : plat === 'android' ? ['The grant result is PERMISSION_DENIED.', 'After two denials Android stops showing the prompt.']
      : ['The authorization status becomes denied.', 'iOS shows the prompt only once per permission.'],
  };
  out.recover = {
    title: 'Recovery', from: 'Available after a Deny.',
    lines: [plat === 'web' ? 'The site must ask the user to change it from the padlock menu.' : 'The app can only point you to Settings. Use Open Settings on the device.', rv ? `Path: ${rv}` : ''].filter(Boolean),
  };
  return out;
}
