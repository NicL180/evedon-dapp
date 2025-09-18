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
  const hookAddress = useAddress(); // may be null with wallet privacy
  const netId = useNetwork();
  const lovelace = useLovelace();
  const ada = useMemo(() => formatAda(lovelace), [lovelace]);

  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState<Candidate[]>([]);
  const [showAddress, setShowAddress] = useState(false);
  const [fallbackAddr, setFallbackAddr] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Scan for injected wallets (immediately + delayed polls for late injection)
  useEffect(() => {
    const scan = () => {
      const w = (globalThis as any).cardano || {};
      setInstalled(CANDIDATES.filter(c => !!w[c.id]));
    };
    scan();
    const t1 = setTimeout(scan, 300);
    const t2 = setTimeout(scan, 1000);
    const t3 = setTimeout(scan, 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  // Auto-reconnect if a wallet is already authorized (reduces "no wallets detected" confusion)
  useEffect(() => {
    const w = (globalThis as any).cardano || {};
    (async () => {
      try {
        for (const id of CANDIDATES.map(c => c.id)) {
          if (await w[id]?.isEnabled?.()) {
            await connect(id as any);
            break;
          }
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close dropdown on outside click / ESC
  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); };
  }, []);

  // Robust address fallback using CSL (if wallet privacy hides it from Mesh hook)
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
      if (!providerId || !w[providerId]) return;

      try {
        const api = await w[providerId].enable();
        let hex: string | null = null;
        try { hex = await api.getChangeAddress(); } catch {}
        if (!hex) {
          const used: string[] = await api.getUsedAddresses().catch(() => []);
          if (used?.length) hex = used[0];
        }
        if (!hex) return;

        const CSL = await import('@emurgo/cardano-serialization-lib-browser');
        const bytes = hex2bytes(hex);
        const prefix = (await api.getNetworkId().catch(() => netId)) === 1 ? 'addr' : 'addr_test';
        const bech = CSL.Address.from_bytes(bytes).to_bech32(prefix);
        if (!cancelled) setFallbackAddr(bech);
      } catch {}
    }
    deriveAddress();
    return () => { cancelled = true; };
  }, [connected, hookAddress, netId]);

  const displayAddress = hookAddress ?? fallbackAddr ?? null;

  const buttonLabel = useMemo(() => {
    if (!connected) return 'Connect Wallet';
    return name ? `Connected: ${name}` : 'Connected';
  }, [connected, name]);

  return (
    <div className="wallet-menu" ref={menuRef}>
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
          {!connected ? (
            <>
              {installed.length ? (
                installed.map(w => (
                  <button
                    key={w.id}
                    role="menuitem"
                    className="wallet-menu__item"
                    onClick={async () => {
                      try { await connect(w.id as any); setOpen(false); } catch (e) { console.error('Connect error', e); }
                    }}
                  >
                    {w.label}
                  </button>
                ))
              ) : (
                // Hide this entire "no wallets" section once connected; only show when not connected
                <div className="wallet-menu__empty">
                  No wallets detected. Install Lace and refresh.
                  {' '}<a href="https://lace.io" target="_blank" rel="noreferrer">Get Lace</a>
                </div>
              )}
            </>
          ) : (
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
              {installed.length ? installed.map(w => (
                <button
                  key={w.id}
                  role="menuitem"
                  className="wallet-menu__item"
                  onClick={async () => {
                    try { await connect(w.id as any); setOpen(false); setShowAddress(false); } catch (e) { console.error('Switch error', e); }
                  }}
                >
                  {w.label}
                </button>
              )) : <div className="wallet-menu__empty">No other wallets detected</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
