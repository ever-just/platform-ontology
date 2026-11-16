import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { BrandTitle } from '@/components/brand';
import { githubUrl } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <BrandTitle />,
      url: '/',
    },
    githubUrl,
    links: [
      { text: 'Docs', url: '/docs/', active: 'nested-url' },
      { text: 'Console', url: '/console/', external: false },
      { text: 'Wiki', url: '/wiki/', external: false },
    ],
  };
}
