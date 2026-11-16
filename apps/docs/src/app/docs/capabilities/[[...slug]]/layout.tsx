import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { capabilitiesTree } from '@/lib/trees';

export default async function Layout(props: LayoutProps<'/docs/capabilities/[[...slug]]'>) {
  const { slug } = await props.params;
  return (
    <DocsLayout tree={capabilitiesTree(slug)} {...baseOptions()}>
      {props.children}
    </DocsLayout>
  );
}
