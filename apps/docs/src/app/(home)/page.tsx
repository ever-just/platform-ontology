import Link from 'next/link';
import { BookOpen, Library, MonitorSmartphone, Layers } from 'lucide-react';
import { siAndroid, siApple, siGithub } from 'simple-icons';
import { githubUrl } from '@/lib/shared';
import { BrowserLogo } from '@/components/support-matrix';

function Mark({ path, hex, size = 18 }: { path: string; hex?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={path} fill={hex ? '#' + hex : 'currentColor'} />
    </svg>
  );
}

const tiles = [
  { href: '/docs/', title: 'Docs', text: 'How each capability works and where it runs.', icon: BookOpen },
  { href: '/console/', title: 'Console', text: 'Run every capability live in this browser.', icon: MonitorSmartphone },
  { href: '/wiki/', title: 'Wiki', text: 'One plain page per capability.', icon: Library },
];

export default function HomePage() {
  return (
    <main className="po-home">
      <section className="po-home-hero">
        <h1>Platform Ontology</h1>
        <p>What apps and websites can reach on your phone and in your browser, side by side.</p>
        <div className="po-home-cta">
          <Link href="/docs/" className="po-btn po-btn-pri">Read the docs</Link>
          <a href={githubUrl} className="po-btn po-btn-ic" aria-label="Source on GitHub" title="Source on GitHub">
            <Mark path={siGithub.path} size={20} />
          </a>
        </div>
      </section>

      <section className="po-home-stats" aria-label="Coverage">
        <div className="po-stat" title="Capabilities in all">
          <Layers className="size-4" aria-hidden="true" />
          <b>844</b>
          <span>in all</span>
        </div>
        <div className="po-stat" title="Native app capabilities, Android and iPhone">
          <span className="po-logos">
            <Mark path={siAndroid.path} hex={siAndroid.hex} />
            <Mark path={siApple.path} />
          </span>
          <b>361</b>
          <span>native</span>
        </div>
        <div className="po-stat po-stat-wide" title="Web capabilities across seven browsers">
          <span className="po-logos">
            {[0, 1, 2, 3, 6].map((c) => <BrowserLogo key={c} col={c} size={18} />)}
          </span>
          <b>483</b>
          <span>web</span>
        </div>
      </section>

      <nav className="po-home-tiles" aria-label="Sections">
        {tiles.map((t) => (
          <Link key={t.title} href={t.href} className="po-tile po-lift">
            <t.icon className="size-5" aria-hidden="true" />
            <b>{t.title}</b>
            <span>{t.text}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
