import { source } from '@/lib/source';
import { createSearchAPI } from 'fumadocs-core/search/server';

export const revalidate = false;

/**
 * One small index entry per page. Capability pages are 844 of about 890 pages, so their
 * text is trimmed to the first part (headline, plain sentence, what it can do).
 */
export const { staticGET: GET } = createSearchAPI('simple', {
  language: 'english',
  indexes: () =>
    source.getPages().map((page) => {
      const isCap = page.slugs[0] === 'capabilities' && page.slugs.length === 4;
      const sd = (page.data as { structuredData?: { contents: { content: string }[] } })
        .structuredData;
      const text = (sd?.contents ?? []).map((c) => c.content).join(' ');
      const crumbs = isCap
        ? [
            source.getPage(['capabilities', page.slugs[1]])?.data.title,
            source.getPage(['capabilities', page.slugs[1], page.slugs[2]])?.data.title,
          ].filter((x): x is string => Boolean(x))
        : undefined;
      return {
        title: page.data.title,
        description: page.data.description,
        breadcrumbs: crumbs,
        url: page.url,
        content: text.slice(0, isCap ? 500 : 6000),
      };
    }),
});
