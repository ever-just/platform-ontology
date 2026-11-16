import { source } from '@/lib/source';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/components/mdx';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';

const lookup = (slug?: string[]) => source.getPage(['capabilities', ...(slug ?? [])]);

export default async function Page(props: PageProps<'/docs/capabilities/[[...slug]]'>) {
  const params = await props.params;
  const page = lookup(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={getMDXComponents({ a: createRelativeLink(source, page) })} />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source
    .generateParams()
    .filter((p) => p.slug?.[0] === 'capabilities')
    .map((p) => ({ slug: p.slug!.slice(1) }));
}

export const dynamicParams = false;

export async function generateMetadata(
  props: PageProps<'/docs/capabilities/[[...slug]]'>,
): Promise<Metadata> {
  const params = await props.params;
  const page = lookup(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: { canonical: `${page.url}/`.replace(/\/+$/, '/') },
  };
}
