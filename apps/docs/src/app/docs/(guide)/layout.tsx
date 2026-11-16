import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { guideTree } from '@/lib/trees';

export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    <DocsLayout tree={guideTree()} {...baseOptions()}>
      {children}
    </DocsLayout>
  );
}
