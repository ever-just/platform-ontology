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

/** Seven browser logos, each with a status dot and a label. `sup` is one letter per browser. */
export function SupportMatrix({ sup }: { sup: string }) {
  return (
    <div className="po-smx-wrap">
      <div className="po-smx" role="list" aria-label="Browser support">
        {BROWSERS.map((b, i) => {
          const s = SUP_INFO[sup[i]] ?? SUP_INFO.u;
          return (
            <div
              key={b.id}
              role="listitem"
              className={`po-smx-c po-t-${s.tone}`}
              title={`${b.name}: ${s.label}`}
            >
              <span className="po-smx-l">
                <BrowserLogo col={i} size={22} />
                <i className="po-smx-d" />
              </span>
              <span className="po-smx-n">{b.short}</span>
              <span className="po-smx-s">{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
