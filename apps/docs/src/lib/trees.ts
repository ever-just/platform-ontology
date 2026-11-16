import type * as PageTree from 'fumadocs-core/page-tree';
import { source } from '@/lib/source';

/**
 * Sidebar trees. The full tree has about 890 nodes; embedding it in every static page
 * would add hundreds of KB to each of them. So each section gets a small tree.
 */

const CAP = '/docs/capabilities/';

/** Guide pages only, with one link to the capabilities section. */
export function guideTree(): PageTree.Root {
  const tree = source.getPageTree();
  return {
    ...tree,
    children: tree.children.map((n) =>
      n.type === 'folder' && n.index?.url?.startsWith(CAP.slice(0, -1))
        ? ({ type: 'page', name: 'Capabilities', url: CAP } satisfies PageTree.Item)
        : n,
    ),
  };
}

const pageOf = (url: string) => source.getPages().find((p) => p.url === url);

/** Capabilities section: all spaces and groups as links, only the open group lists its pages. */
export function capabilitiesTree(slug: string[] = []): PageTree.Root {
  const [space, group] = slug;
  const pages = source.getPages().filter((p) => p.slugs[0] === 'capabilities');
  const spaces = ['mobile', 'web'];
  const children: PageTree.Node[] = [
    { type: 'page', name: 'Back to the guide', url: '/docs/' },
    { type: 'separator', name: 'Capabilities' },
    { type: 'page', name: 'All capabilities', url: CAP },
  ];
  for (const s of spaces) {
    const sp = pages.find((p) => p.slugs.length === 2 && p.slugs[1] === s);
    if (!sp) continue;
    const groupPages = pages.filter((p) => p.slugs.length === 3 && p.slugs[1] === s);
    const folder: PageTree.Folder = {
      type: 'folder',
      name: sp.data.title,
      index: { type: 'page', name: sp.data.title, url: sp.url },
      defaultOpen: s === space,
      children: groupPages
        .sort((a, b) => a.slugs[2].localeCompare(b.slugs[2]))
        .map((g): PageTree.Node => {
          if (s !== space || g.slugs[2] !== group) {
            return { type: 'page', name: g.data.title, url: g.url };
          }
          const items = pages
            .filter((p) => p.slugs.length === 4 && p.slugs[1] === s && p.slugs[2] === group)
            .sort((a, b) => String(a.data.title).localeCompare(String(b.data.title)))
            .map((p): PageTree.Item => ({ type: 'page', name: p.data.title, url: p.url }));
          return {
            type: 'folder',
            name: g.data.title,
            index: { type: 'page', name: g.data.title, url: g.url },
            defaultOpen: true,
            children: items,
          };
        }),
    };
    children.push(folder);
  }
  return { name: 'Capabilities', children };
}

export { pageOf };
