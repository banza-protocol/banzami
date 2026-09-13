import type { ReactNode } from 'react';
import { docsMetadata } from '../../docs-meta';

export const metadata = docsMetadata('en', 'get-started');

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
