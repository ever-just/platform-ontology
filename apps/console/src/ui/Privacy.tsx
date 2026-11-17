import { useEffect, useRef } from "react";
import { CircleCheck, CircleX, Clock, Cookie, MessageSquare, ShieldCheck, X } from "lucide-react";

// The privacy notice for stored readings. Opened from the footer, the Inspector or #privacy.

export const openPrivacy = () => window.dispatchEvent(new Event("po:privacy"));

export function PrivacyLink({ children = "Privacy" }: { children?: React.ReactNode }) {
  return <a data-control="privacy.link" href="#privacy" className="priv-link" onClick={(e) => { e.preventDefault(); openPrivacy(); }}>{children}</a>;
}

const STORED = [
  "Device and browser details: brand, version, engine, operating system, screen and similar settings",
  "Sensor readings such as motion, light, battery and network speed",
  "Which capabilities you ran and whether the browser allowed or refused them",
  "Location rounded to about a kilometre, and the country",
  "For photos and recordings: only the type, size and length",
];
const NEVER = [
  "Your IP address",
  "Clipboard text",
  "The words picked up by speech to text",
  "Contact details",
  "Which keys you pressed (only timing)",
  "Images, video or audio",
];

export function PrivacyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog data-control="privacy.dialog" ref={ref} className="priv" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-labelledby="priv-t">
      <div className="priv-in">
        <header>
          <ShieldCheck size={18} />
          <h2 id="priv-t">Privacy notice</h2>
          <button data-control="privacy.close" className="btn ghost sm" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </header>
        <p>This console stores the readings it takes so we can study what browsers expose to websites. Personal content is removed on our server before anything is saved.</p>
        <div className="priv-cols">
          <section>
            <h3><CircleCheck size={14} className="ok" />What is stored</h3>
            <ul>{STORED.map((s) => <li key={s}>{s}</li>)}</ul>
          </section>
          <section>
            <h3><CircleX size={14} className="err" />What is never stored</h3>
            <ul>{NEVER.map((s) => <li key={s}>{s}</li>)}</ul>
          </section>
        </div>
        <div className="priv-facts">
          <span><Clock size={13} />Kept for 90 days, then deleted.</span>
          <span><Cookie size={13} />No accounts and no cookies. Each tab gets a random visit number that ends when the tab closes.</span>
          <span><MessageSquare size={13} />Questions or a deletion request: <a href="https://github.com/ever-just/platform-ontology/issues" target="_blank" rel="noreferrer">open an issue on the project</a>.</span>
        </div>
      </div>
    </dialog>
  );
}
