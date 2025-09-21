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
  Uint8Array.from((hex.replace(/^0x/, '').match(/.{1,2}/g) || []).map((b) => parseInt(b, 16)));

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
function normalizeWalletName(name?: string | null) {
  if (!name) return null;
  const low = name.toLowerCase();
  if (low === 'lace') return 'Lace';
  if (low === 'nami') return 'Nami';
  if (low === 'eternl') return 'Eternl';
  if (low === 'flint') return 'Flint';
  if (low === 'gerowallet') return 'GeroWallet';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export default function WalletMenu() {
  const { connected, name, connect, disconnect } = useWallet();
  const hookAddress = useAddress();
  const netId = useNetwork();
  const lovelace = useLovelace();
  const ada = useMemo(() => formatAda(lovelace), [lovelace]);

  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState<Candidate[]>([]);
  const [showAddress, setShowAddress] = useState(false);
  const [fallbackAddr, setFallbackAddr] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Scan for injected wallets
  useEffect(() => {
    const scan = () => {
      const w = (globalThis as any).cardano || {};
      setInstalled(CANDIDATES.filter((c) => !!w[c.id]));
    };
    scan();
    const t1 = setTimeout(scan, 300);
    const t2 = setTimeout(scan, 1000);
    const t3 = setTimeout(scan, 2000);
    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
    };
  }, []);

  // Auto-reconnect if authorized
  useEffect(() => {
    const w = (globalThis as any).cardano || {};
    (async () => {
      try {
        for (const id of CANDIDATES.map((c) => c.id)) {
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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setShowAddress(false); } };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); };
  }, []);

  // Fallback address via CSL
  useEffect(() => {
    let cancelled = false;
    async function deriveAddress() {
      setFallbackAddr(null);
      if (!connected || hookAddress) return;

      const w = (globalThis as any).cardano || {};
      let providerId: string | null = null;
      for (const id of CANDIDATES.map((c) => c.id)) {
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
  const displayName = normalizeWalletName(name ?? undefined);

  const buttonLabel = useMemo(() => {
    if (!connected) return 'Connect Wallet';
    return displayName ? `Connected: ${displayName}` : 'Connected';
  }, [connected, displayName]);

  // Toggle a global class while overlay is visible (optional page dimming hooks)
  useEffect(() => {
    const cls = 'addr-overlay-active';
    if (showAddress) document.documentElement.classList.add(cls);
    else document.documentElement.classList.remove(cls);
    return () => document.documentElement.classList.remove(cls);
  }, [showAddress]);

  return (
    <div className="wallet-bar" ref={menuRef}>
      {/* Connected button */}
      <button
        type="button"
        className="wallet-menu__button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {buttonLabel}
        <span className="wallet-menu__chevron" aria-hidden>▾</span>
      </button>

      {/* Eye toggle INLINE */}
      {connected && (
        <>
          <button
            className={`wallet-menu__eye ${showAddress ? 'eye-open' : 'eye-closed'}`}
            onClick={() => setShowAddress((v) => !v)}
            aria-pressed={showAddress}
            title={showAddress ? 'close wallet address' : 'see wallet address'}
            aria-label={showAddress ? 'close wallet address' : 'see wallet address'}
          >
            {showAddress ? (
              <svg viewBox="0 0 24 24" width="18" height="18" className="eye-svg" aria-hidden>
                <path d="M12 5C7 5 2.73 8.11 1 12c1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" fill="currentColor" />
              </svg>
            ) : (
              <span aria-hidden>🙈</span>
            )}
            <span className="tooltip" role="tooltip">
              {showAddress ? 'close wallet address' : 'see wallet address'}
            </span>
          </button>

          {/* Address overlay (drops under the group) */}
          {showAddress && (
            <div className="addr-overlay" role="dialog" aria-live="polite">
              <div className="addr-text">{displayAddress ?? '—'}</div>
              <button
                className="wallet-menu__copy"
                onClick={() => displayAddress && navigator.clipboard.writeText(displayAddress)}
                title="Copy address"
                aria-label="Copy address"
              >
                📋
              </button>
            </div>
          )}
        </>
      )}

      {/* Dropdown */}
      {open && (
        <div className="wallet-menu__dropdown" role="menu">
          {!connected ? (
            <>
              {installed.length ? installed.map((w) => (
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
              )) : (
                <div className="wallet-menu__empty">
                  No wallets detected. Install Lace and refresh.{' '}
                  <a href="https://lace.io" target="_blank" rel="noreferrer">Get Lace</a>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="wallet-menu__status">Connected: {displayName ?? 'Wallet'}</div>
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
              {installed.length ? installed.map((w) => (
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

      <style jsx>{`
        .wallet-bar {
          display: inline-flex;       /* sit in a single row */
          align-items: center;
          gap: 8px;
          position: relative;         /* anchor overlay & dropdown */
        }

        .wallet-menu__button {
          background: #000;
          color: #00f0ff;
          font-weight: 700;
          padding: 0.55rem 0.9rem;
          border: 2px solid #00f0ff;
          border-radius: 8px;
          text-shadow: 0 0 6px #00f0ff, 0 0 12px #00f0ff;
          white-space: nowrap;        /* never wrap "Connected: Lace" */
        }
        .wallet-menu__chevron { margin-left: 6px; opacity: 0.8; }

        .wallet-menu__eye {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px; height: 32px;
          border-radius: 999px;
          border: 1px solid rgba(0, 240, 255, 0.2);
          background: #0c1220;
          color: #d2c8b5;
          cursor: pointer;
        }
        .wallet-menu__eye .tooltip {
          position: absolute;
          top: -8px; left: 50%;
          transform: translate(-50%, -2px);
          white-space: nowrap;
          pointer-events: none;
          background: rgba(12, 18, 32, 0.92);
          border: 1px solid rgba(102, 227, 196, 0.35);
          color: #cfeee4;
          font-size: 11px;
          padding: 3px 6px;
          border-radius: 6px;
          opacity: 0;
          transition: opacity 120ms ease, transform 120ms ease;
        }
        .wallet-menu__eye:hover .tooltip { opacity: 1; transform: translate(-50%, -6px); }
        .eye-open { color: #9af0c9; border-color: rgba(102,227,196,.45); box-shadow: 0 0 0 1px rgba(102,227,196,.12) inset; }

        /* Address overlay aligned under the group (right edge) */
        .addr-overlay {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          z-index: 2000;
          max-width: min(520px, 70vw);
          padding: 10px 40px 10px 12px;
          border-radius: 12px;
          background: rgba(6, 12, 22, 0.90);
          backdrop-filter: blur(6px) saturate(110%);
          -webkit-backdrop-filter: blur(6px) saturate(110%);
          border: 1px solid rgba(102, 227, 196, 0.35);
          box-shadow: 0 10px 28px rgba(0,0,0,0.45);
        }
        .addr-text { color: #e9f7f2; font-size: 12px; line-height: 1.35; word-break: break-all; }
        .wallet-menu__copy {
          position: absolute; right: 8px; top: 6px;
          font-size: 14px; background: transparent; border: 0; cursor: pointer; color: #cfeee4; opacity: 0.9;
        }
        .wallet-menu__copy:hover { opacity: 1; }

        .wallet-menu__dropdown {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          min-width: 240px;
          background: #0c1220;
          border: 1px solid rgba(0, 240, 255, 0.2);
          border-radius: 12px;
          box-shadow: 0 14px 36px rgba(0,0,0,0.5);
          padding: 10px;
          z-index: 1999;
        }
        .wallet-menu__item { width: 100%; text-align: left; padding: 8px 10px; margin: 2px 0; border-radius: 8px; background: #121a2b; border: 1px solid rgba(0,240,255,.15); color: #e6f0ff; }
        .wallet-menu__item:hover { background: #162033; }
        .wallet-menu__empty { font-size: 13px; color: #b7c3d1; }
        .wallet-menu__status { font-weight: 700; margin-bottom: 6px; }
        .wallet-menu__sep { height: 1px; background: rgba(0,240,255,.2); margin: 8px 0; }
        .wallet-menu__subhead { font-size: 12px; opacity: .7; margin-bottom: 4px; }
      `}</style>
    </div>
  );
}
