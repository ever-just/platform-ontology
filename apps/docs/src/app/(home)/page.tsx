import Link from 'next/link';
import { BookOpen, FlaskConical, Globe, Library, Smartphone, Layers } from 'lucide-react';
import { githubUrl } from '@/lib/shared';

const stats = [
  { n: '844', label: 'capabilities', icon: Layers },
  { n: '361', label: 'native app ones, Android and iPhone side by side', icon: Smartphone },
  { n: '483', label: 'web ones across 7 browsers', icon: Globe },
  { n: '24', label: 'groups, from location to ads', icon: Library },
];

const cards = [
  {
    href: '/docs/',
    title: 'Docs',
    text: 'Read how every capability works, what it can and cannot do, and where it runs.',
    icon: BookOpen,
    external: false,
  },
  {
    href: '/lab/',
    title: 'Simulator',
    text: 'Try a capability on a pretend phone or browser and see what a site really gets.',
    icon: FlaskConical,
    external: false,
  },
  {
    href: '/wiki/',
    title: 'Wiki',
    text: 'Browse the whole map in plain language, one page per capability.',
    icon: Library,
    external: false,
  },
];

export default function HomePage() {
  return (
    <main className="flex flex-col flex-1">
      <section className="mx-auto w-full max-w-5xl px-6 pt-20 pb-12 text-center">
        <p className="inline-block rounded-full border px-3 py-1 text-xs font-medium text-fd-muted-foreground">
          Open source. Code MIT, data CC BY 4.0.
        </p>
        <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-6xl">
          Platform<span className="po-dot">.</span>Ontology
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-fd-muted-foreground">
          A plain language map of what apps and websites can do on your phone and in your browser.
          Every capability, who gets it, what it can and cannot reach, and how it differs between
          Android, iPhone and the web.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/docs/"
            className="rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-semibold text-fd-primary-foreground hover:opacity-90"
          >
            Read the docs
          </Link>
          <a
            href="/lab/"
            className="rounded-lg border px-5 py-2.5 text-sm font-semibold hover:bg-fd-accent"
          >
            Open the simulator
          </a>
          <a
            href="/wiki/"
            className="rounded-lg border px-5 py-2.5 text-sm font-semibold hover:bg-fd-accent"
          >
            Browse the wiki
          </a>
          <a
            href={githubUrl}
            className="rounded-lg border px-5 py-2.5 text-sm font-semibold hover:bg-fd-accent"
          >
            GitHub
          </a>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-4 px-6 pb-12 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.n} className="rounded-xl border bg-fd-card p-5">
            <s.icon className="size-5 text-fd-primary" />
            <div className="mt-3 text-3xl font-bold tracking-tight">{s.n}</div>
            <div className="mt-1 text-sm text-fd-muted-foreground">{s.label}</div>
          </div>
        ))}
      </section>

      <section className="mx-auto grid w-full max-w-5xl gap-4 px-6 pb-24 md:grid-cols-3">
        {cards.map((c) => (
          <a
            key={c.title}
            href={c.href}
            className="group rounded-xl border p-6 transition-colors hover:border-fd-primary hover:bg-fd-accent"
          >
            <c.icon className="size-6 text-fd-primary" />
            <h2 className="mt-4 text-lg font-semibold">{c.title}</h2>
            <p className="mt-2 text-sm text-fd-muted-foreground">{c.text}</p>
          </a>
        ))}
      </section>
    </main>
  );
}
