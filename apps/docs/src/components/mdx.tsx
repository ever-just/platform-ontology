import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import type { MDXComponents } from 'mdx/types';

const STATUS: Record<string, string> = {
  y: 'Supported',
  p: 'Partial',
  f: 'Behind a flag',
  n: 'Not supported',
  r: 'Removed',
};

/** Status chip: y supported, p partial or behind a flag, n not supported, r removed. */
function S({ s, children }: { s: string; children?: React.ReactNode }) {
  const key = STATUS[s] ? s : 'n';
  return <span className={`po-chip po-chip-${key}`}>{children ?? STATUS[key]}</span>;
}

/** Four step reach meter with its plain label. */
function Reach({ level, label }: { level: number; label: string }) {
  return (
    <div className="po-reach" role="img" aria-label={`Reach ${level} of 4: ${label}`}>
      <span className="po-reach-bars" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={n <= level ? 'on' : ''} />
        ))}
      </span>
      <strong>
        Reach {level} of 4
      </strong>
      <span className="po-reach-label">{label}</span>
    </div>
  );
}

/** Row of small labels at the top of a capability page. */
function Chips({ items }: { items: { text: string; kind?: boolean }[] }) {
  return (
    <div className="po-chips">
      {items.map((i) => (
        <span key={i.text} className={`po-chip ${i.kind ? 'po-chip-kind' : 'po-chip-plain'}`}>
          {i.text}
        </span>
      ))}
    </div>
  );
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Tab,
    Tabs,
    Step,
    Steps,
    S,
    Reach,
    Chips,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
