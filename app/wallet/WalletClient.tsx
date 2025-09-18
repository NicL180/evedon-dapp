'use client';

import { useMemo } from 'react';
import {
  useWallet,
  useAddress,
  useLovelace,
  useNetwork,
} from '@meshsdk/react';

function formatAda(lovelace: string | number | null | undefined) {
  if (lovelace == null) return null;
  const n = typeof lovelace === 'string' ? Number(lovelace) : lovelace;
  if (!Number.isFinite(n)) return null;
  return (n / 1_000_000).toFixed(6); // 6 dp ADA
}

function networkName(id: number | null | undefined) {
  if (id === 1) return 'Mainnet';
  if (id === 0) return 'Testnet';
  return String(id ?? '—');
}

export default function WalletClient() {
  const { connected, name } = useWallet();
  const address = useAddress();     // base receiving address of account #0
  const lovelace = useLovelace();   // current balance in lovelace
  const netId = useNetwork();

  const ada = useMemo(() => formatAda(lovelace), [lovelace]);

  return (
    <div style={{ maxWidth: 840, margin: '2rem auto', padding: '1rem' }}>
      <section
        style={{
          border: '1px solid rgba(43,111,255,0.30)',
          background: 'rgba(43,111,255,0.06)',
          borderRadius: 14,
          padding: '1.25rem',
        }}
      >
        <h2 style={{ margin: 0, marginBottom: '0.75rem' }}>Wallet Status</h2>

        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <div><b>Connected?</b> {connected ? 'Yes' : 'No'}</div>
          <div><b>Wallet:</b> {connected ? (name ?? 'Unknown') : '—'}</div>
          <div><b>Network:</b> {networkName(netId)}</div>

          <div style={{ display: 'grid', gap: 6 }}>
            <b>Base Address</b>
            {connected ? (
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  background: 'rgba(43,111,255,0.08)',
                  border: '1px solid rgba(43,111,255,0.30)',
                  padding: '8px 10px',
                  borderRadius: 8,
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                }}
              >
                <span style={{ flex: 1 }}>{address ?? '—'}</span>
                <button
                  onClick={() => address && navigator.clipboard.writeText(address)}
                  style={{
                    border: '1px solid rgba(127,179,255,0.35)',
                    background: 'transparent',
                    color: '#cfe5ff',
                    borderRadius: 8,
                    padding: '6px 8px',
                    cursor: 'pointer',
                  }}
                  title="Copy address"
                >
                  Copy
                </button>
              </div>
            ) : (
              <span style={{ opacity: 0.7 }}>
                Connect your wallet (top-right) to view the address.
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <b>Balance</b>
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'baseline',
                fontFamily: 'monospace',
              }}
            >
              <span style={{ fontSize: '1.15rem' }}>
                {ada != null ? `${ada} ADA` : '—'}
              </span>
              {lovelace != null && (
                <small style={{ opacity: 0.7 }}>({String(lovelace)} lovelace)</small>
              )}
            </div>
          </div>
        </div>

        {!connected && (
          <p style={{ marginTop: '0.75rem', opacity: 0.8 }}>
            Tip: Click the <i>Connect Wallet</i> button in the top-right to link Lace/Nami,
            then return to this page.
          </p>
        )}
      </section>
    </div>
  );
}
