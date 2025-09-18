'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useWallet, useAddress, useNetwork, useLovelace } from '@meshsdk/react';
import '../styles/wallet.css';

type Candidate = { id: string; label: string };
const CANDIDATES: Candidate[] = [
  { id: 'lace', label: 'Lace' },
  { id: 'nami', label: 'Nami' },
  { id: 'eternl', label: 'Eternl' },
  { id: 'flint', label: 'Flint' },
  { id: 'gerowallet', label: 'GeroWallet' },
];

const hex2bytes = (hex: string) =>
  Uint8Array.from((hex.replace(/^0x/, '').match(/.{1,2}/g) || []).map(b => parseInt(b, 16)));

function formatAda(v: string | number | null | undefined) {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return null;
  return (n / 1_000_000).toFixed(6);
}
function networkName(id: number | null | undefined) {
  if (id === 1) return 'Mainnet';
  if (id === 0) return 'Testnet';
  return String(id ?? '—');
}

export default function WalletMenu() {
  const { connected, name, connect, disconnect } = useWallet();
  const hookAddress = useAddress();          // may be null with wallet privacy
  const netId = useNetwork();
  const lovelace = useLovelace();
  const ada = useMemo(() => formatAda(lovelace), [lovelace]);

  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState<Candidate[]>([]);
  const [showAddress, setShowAddress] = useState(false);
  const [fallbackAddr, setFallbackAddr] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Discover installed wallets
  useEffect(() => {
    const w = (globalThis as any).cardano || {};
    setInstalled(CANDIDATES.filter(c => !!w[c.id]));
  }, []);

  // Close dropdown on outside click / ESC
  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); };
  }, []);

  // Robust address fallback using CSL (no 90-char limit)
  useEffect(() => {
    let cancelled = false;

    async function deriveAddress() {
      setFallbackAddr(null);
      if (!connected || hookAddress) return;

      const w = (globalThis as any).cardano || {};
      // find an enabled provider
      let providerId: string | null = null;
      for (const id of CANDIDATES.map(c => c.id)) {
        try { if (await w[id]?.isEnabled?.()) { providerId = id; break; } } catch {}
      }
      // fallback to Mesh wallet name if needed
      if (!providerId && name) {
        const guess = String(name).toLowerCase();
        if (w[guess]) providerId = guess;
      }
      if (!providerId || !w[providerId]) return;

      try {
        const api = await w[providerId].enable();
        // get change or first used address (hex)
        let hex: string | null = null;
        try { hex = await api.getChangeAddress(); } catch {}
        if (!hex) {
          const used: string[] = await api.getUsedAddresses().catch(() => []);
          if (used?.length) hex = used[0];
        }
        if (!hex) { console.debug('[addr] wallet returned no change/used'); return; }

        // dynamic import (bundled by Next; loads WASM correctly)
        const CSL = await import('@emurgo/cardano-serialization-lib-browser');
        const bytes = hex2bytes(hex);
        const prefix = (await api.getNetworkId().catch(() => netId)) === 1 ? 'addr' : 'addr_test';
        const bech = CSL.Address.from_bytes(bytes).to_bech32(prefix);

        if (!cancelled) {
          console.debug('[addr] fallback bech32 via CSL:', bech);
          setFallbackAddr(bech);
        }
      } catch (e) {
        console.error('[addr] CSL fallback error', e);
      }
    }

    deriveAddress();
    return () => { cancelled = true; };
  }, [connected, hookAddress, netId, name]);

  const displayAddress = hookAddress ?? fallbackAddr ?? null;

  const buttonLabel = useMemo(() => {
    if (!connected) return 'Connect Wallet';
    return name ? `Connected: ${name}` : 'Connected';
  }, [connected, name]);

  return (
    <div className="wallet-menu" ref={menuRef}>
      {/* Connect / switch */}
      <button
        type="button"
        className="wallet-menu__button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {buttonLabel}
        <span className="wallet-menu__chevron" aria-hidden>▾</span>
      </button>

      {/* Address toggle + copy */}
      {connected && (
        <div className="wallet-menu__address">
          <button
            className="wallet-menu__eye"
            onClick={() => setShowAddress(v => !v)}
            title={showAddress ? 'Hide address' : 'Show address'}
            aria-label={showAddress ? 'Hide wallet address' : 'Show wallet address'}
          >
            {showAddress ? '👁️' : '🙈'}
          </button>

          {showAddress && (
            <>
              <span className="wallet-menu__addr-text">{displayAddress ?? '—'}</span>
              <button
                className="wallet-menu__copy"
                onClick={() => displayAddress && navigator.clipboard.writeText(displayAddress)}
                title="Copy address"
                aria-label="Copy address"
              >
                📋
              </button>
            </>
          )}
        </div>
      )}

      {/* Compact stats */}
      {connected && (
        <div className="wallet-menu__stats">
          <div className="wallet-menu__stat"><span>Network:</span> {networkName(netId)}</div>
          <div className="wallet-menu__stat"><span>Balance:</span> {ada != null ? `${ada} ADA` : '—'}</div>
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div className="wallet-menu__dropdown" role="menu">
          {!connected && (
            <>
              {installed.length ? installed.map(w => (
                <button
                  key={w.id}
                  role="menuitem"
                  className="wallet-menu__item"
                  onClick={async () => {
                    try { await connect(w.id); setOpen(false); } catch (e) { console.error('Connect error', e); }
                  }}
                >
                  {w.label}
                </button>
              )) : <div className="wallet-menu__empty">No wallets detected</div>}
            </>
          )}

          {connected && (
            <>
              <div className="wallet-menu__status">Connected: {name ?? 'Wallet'}</div>
              <button
                role="menuitem"
                className="wallet-menu__item"
                onClick={async () => {
                  try { await disconnect(); setOpen(false); setShowAddress(false); } catch (e) { console.error('Disconnect error', e); }
                }}
              >
                Disconnect
              </button>
              <div className="wallet-menu__sep" />
              <div className="wallet-menu__subhead">Switch wallet</div>
              {installed.map(w => (
                <button
                  key={w.id}
                  role="menuitem"
                  className="wallet-menu__item"
                  onClick={async () => {
                    try { await connect(w.id); setOpen(false); setShowAddress(false); } catch (e) { console.error('Switch error', e); }
                  }}
                >
                  {w.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
