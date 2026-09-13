import type { ReactNode } from 'react';
import { docsMetadata } from '../../docs-meta';

export const metadata = docsMetadata('en', 'changelog');

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
