'use client';

import { MeshProvider } from '@meshsdk/react';

/**
 * Global providers for the entire app.
 * We keep it minimal: MeshProvider only (no react-query needed).
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  return <MeshProvider>{children}</MeshProvider>;
}
