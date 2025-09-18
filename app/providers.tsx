'use client';

import { ReactNode } from 'react';
import { MeshProvider } from '@meshsdk/react';
import '@meshsdk/react/styles.css'; // <= add this

export default function Providers({ children }: { children: ReactNode }) {
  return <MeshProvider>{children}</MeshProvider>;
}
