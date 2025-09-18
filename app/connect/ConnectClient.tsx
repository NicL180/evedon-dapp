'use client';

import { useWallet } from '@meshsdk/react';
import WalletConnectButton from '../components/WalletConnectButton';

export default function ConnectClient() {
  const { connected, name } = useWallet();
  return (
    <div style={{ maxWidth: 720, margin: '2rem auto', padding: '1rem' }}>
      <WalletConnectButton />
      <div style={{ marginTop: '1.25rem', padding: '1rem', border: '1px solid #eee', borderRadius: 12 }}>
        <p><b>Connected?</b> {connected ? 'Yes' : 'No'}</p>
        {connected ? <p><b>Wallet:</b> {name ?? 'Unknown'}</p> : (
          <p style={{opacity:0.8}}>Click <i>Connect Wallet</i> above, then approve in your wallet.</p>
        )}
      </div>
    </div>
  );
}
