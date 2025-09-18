'use client';

import { useEffect, useState } from 'react';

const hex2bytes = (hex: string) =>
  Uint8Array.from((hex.replace(/^0x/, '').match(/.{1,2}/g) || []).map(b => parseInt(b, 16)));

export default function DebugPage() {
  const [keys, setKeys] = useState<string[]>([]);
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const [status, setStatus] = useState<string>('Idle');
  const [netId, setNetId] = useState<number | null>(null);
  const [hexAddr, setHexAddr] = useState<string | null>(null);
  const [bech32, setBech32] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const w = (globalThis as any).cardano;
    setKeys(w ? Object.keys(w) : []);
    (async () => {
      try {
        const en = await w?.lace?.isEnabled?.();
        setIsEnabled(Boolean(en));
      } catch {
        setIsEnabled(null);
      }
    })();
  }, []);

  async function enableLace() {
    setStatus('Requesting permission…');
    setError(null);
    setBech32(null);
    setHexAddr(null);
    try {
      const w = (globalThis as any).cardano;
      if (!w?.lace) throw new Error('Lace not detected on this page');
      const api = await w.lace.enable();
      setStatus('Enabled');

      const id = await api.getNetworkId();
      setNetId(id);

      let hex: string | null = null;
      try { hex = await api.getChangeAddress(); } catch {}
      if (!hex) {
        const used: string[] = await api.getUsedAddresses().catch(() => []);
        if (used?.length) hex = used[0];
      }
      setHexAddr(hex ?? null);

      if (hex) {
        const CSL = await import('@emurgo/cardano-serialization-lib-browser');
        const prefix = id === 1 ? 'addr' : 'addr_test';
        const b = CSL.Address.from_bytes(hex2bytes(hex)).to_bech32(prefix);
        setBech32(b);
      }
      setStatus('Done');
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setStatus('Error');
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: '2rem auto', padding: '1rem' }}>
      <h1>Wallet Debug</h1>

      <div style={{ margin: '1rem 0', padding: 12, border: '1px solid #345', borderRadius: 8 }}>
        <div><b>window.cardano keys:</b> {keys.length ? keys.join(', ') : '(none)'}</div>
        <div><b>Lace isEnabled():</b> {isEnabled === null ? 'n/a' : String(isEnabled)}</div>
      </div>

      <button
        onClick={enableLace}
        style={{
          padding: '10px 14px',
          borderRadius: 10,
          border: '2px solid #2b6fff',
          background: '#0a1020',
          color: '#7fb3ff',
          fontWeight: 800,
          cursor: 'pointer',
        }}
      >
        Enable Lace & Read Address
      </button>

      <div style={{ marginTop: 12, opacity: 0.85 }}>
        <div><b>Status:</b> {status}</div>
        {netId !== null && <div><b>Network ID:</b> {netId} ({netId === 1 ? 'Mainnet' : 'Testnet'})</div>}
        {hexAddr && <div><b>Hex address:</b> <code>{hexAddr.slice(0, 20)}… ({hexAddr.length} chars)</code></div>}
        {bech32 && <div><b>Bech32:</b> <code>{bech32}</code></div>}
        {error && (
          <pre style={{ marginTop: 8, padding: 8, background: '#1b2236', color: '#f99', borderRadius: 6 }}>
            {error}
          </pre>
        )}
      </div>

      <p style={{ marginTop: 16, opacity: 0.7 }}>
        If you click the button and nothing happens, open the Lace popup — the approval prompt may be waiting there.
      </p>
    </main>
  );
}
