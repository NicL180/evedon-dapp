'use client';

import { MeshProvider } from '@meshsdk/react';

export default function Providers({ children }: { children: React.ReactNode }) {
  // MeshProvider gives us the wallet context for useWallet/useAddress/etc.
  // No extra config required; network comes from the user’s wallet (Lace).
  return <MeshProvider>{children}</MeshProvider>;
}
