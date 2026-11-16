import { siAndroid, siApple, siFirefoxbrowser, siGooglechrome, siSafari } from 'simple-icons';

/** Same seven columns, in the same order, as taxonomy.platforms.web.browsers and the console. */
const BROWSERS = [
  { id: 'chrome', name: 'Chrome', short: 'Chrome' },
  { id: 'edge', name: 'Edge', short: 'Edge' },
  { id: 'firefox', name: 'Firefox', short: 'Firefox' },
  { id: 'safari', name: 'Safari', short: 'Safari' },
  { id: 'ios_safari', name: 'Safari on iPhone', short: 'iPhone' },
  { id: 'chrome_android', name: 'Chrome on Android', short: 'Android' },
  { id: 'samsung', name: 'Samsung Internet', short: 'Samsung' },
] as const;

const SUP_INFO: Record<string, { tone: string; label: string }> = {
  y: { tone: 'ok', label: 'works' },
  p: { tone: 'warn', label: 'works in part' },
  f: { tone: 'warn', label: 'behind a setting' },
  n: { tone: 'err', label: 'not offered' },
  u: { tone: 'mute', label: 'unknown' },
};

/** Small status glyph: check, partial (dash) or cross. Color lives only here. */
function Glyph({ tone }: { tone: string }) {
  return (
    <svg className="po-smx-g" viewBox="0 0 16 16" width={14} height={14} aria-hidden="true">
      <circle cx="8" cy="8" r="8" fill="currentColor" />
      {tone === 'ok' && (
        <path d="M4.6 8.4l2.2 2.2 4.6-4.8" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {tone === 'warn' && <path d="M4.8 8h6.4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />}
      {tone === 'err' && (
        <path d="M5.4 5.4l5.2 5.2M10.6 5.4l-5.2 5.2" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      )}
      {tone === 'mute' && <path d="M6.2 6.4a1.9 1.9 0 113 1.5c-.7.5-1.2.8-1.2 1.6M8 11.4v.1" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />}
    </svg>
  );
}

function Brand({ path, hex, size }: { path: string; hex: string; size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={path} fill={'#' + hex} />
    </svg>
  );
}

function Edge({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#0C59A4" />
      <path
        d="M4.2 13.6C4.4 8.4 8 5 12.4 5c4 0 6.9 2.6 6.9 6 0 2.1-1.6 3.4-3.6 3.4-1.5 0-2.4-.6-2.4-1.3 0-.4.4-.7.4-1.6 0-1.6-1.4-2.7-3.4-2.7-3 0-5.1 2.4-5.1 5.6 0 3.9 3.3 7 7.6 7 2 0 3.8-.6 5.2-1.6-1.5 2.2-4.2 3.6-7.3 3.6-4.2 0-7.6-3-7.5-6.8z"
        fill="#3BC8E8"
      />
    </svg>
  );
}

function Samsung({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#7651F0" />
      <circle cx="12" cy="12" r="4.6" fill="#fff" />
      <ellipse
        cx="12"
        cy="12"
        rx="9"
        ry="2.6"
        fill="none"
        stroke="#fff"
        strokeWidth="1.4"
        transform="rotate(-24 12 12)"
      />
    </svg>
  );
}

/** Logo for a support column. Mobile columns carry a small platform badge. */
export function BrowserLogo({ col, size = 20 }: { col: number | string; size?: number }) {
  const c = Number(col);
  const main =
    c === 0 || c === 5 ? <Brand path={siGooglechrome.path} hex={siGooglechrome.hex} size={size} />
    : c === 1 ? <Edge size={size} />
    : c === 2 ? <Brand path={siFirefoxbrowser.path} hex={siFirefoxbrowser.hex} size={size} />
    : c === 3 || c === 4 ? <Brand path={siSafari.path} hex={siSafari.hex} size={size} />
    : <Samsung size={size} />;
  const badge = c === 4 ? siApple : c === 5 ? siAndroid : null;
  return (
    <span className="po-blogo" style={{ width: size, height: size }}>
      {main}
      {badge && (
        <span className="po-blogo-b">
          <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} aria-hidden="true">
            <path d={badge.path} fill={c === 4 ? 'currentColor' : '#' + badge.hex} />
          </svg>
        </span>
      )}
    </span>
  );
}

/**
 * Seven equal tiles: logo, a small status glyph and the first version when known.
 * `sup` is one letter per browser; `vers` is the first version per browser ('' when unknown).
 */
export function SupportMatrix({ sup, vers = [] }: { sup: string; vers?: string[] }) {
  return (
    <ul className="po-smx" aria-label="Browser support">
      {BROWSERS.map((b, i) => {
        const s = SUP_INFO[sup[i]] ?? SUP_INFO.u;
        const v = (vers[i] ?? '').trim();
        const text = `${b.name}: ${s.label}${v ? `, since ${v}` : ''}`;
        return (
          <li key={b.id} className={`po-smx-c po-t-${s.tone}`} title={text} aria-label={text}>
            <span className="po-smx-l">
              <BrowserLogo col={i} size={26} />
              <Glyph tone={s.tone} />
            </span>
            <span className="po-smx-v" aria-hidden="true">{v || '\u00a0'}</span>
          </li>
        );
      })}
    </ul>
  );
}
