'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWallet, useNetwork, useLovelace } from '@meshsdk/react';
import { Transaction } from '@meshsdk/core';

// ---------- helpers ----------
function adaToLovelace(ada: string) {
  const n = Number(ada);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1_000_000).toString(); // 1 ADA = 1,000,000 lovelace
}
function networkName(id: number | null | undefined) {
  if (id === 1) return 'Mainnet';
  if (id === 0) return 'Testnet';
  return 'Unknown';
}
// Accept hex string OR Uint8Array OR number[] (some CIP-30 impls)
function toBytes(v: unknown): Uint8Array {
  if (typeof v === 'string') {
    const clean = v.startsWith('0x') ? v.slice(2) : v;
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  if (v instanceof Uint8Array) return v;
  if (Array.isArray(v)) return Uint8Array.from(v as number[]);
  if (v && typeof v === 'object' && typeof (v as any).hex === 'string') {
    return toBytes((v as any).hex);
  }
  throw new Error('Unsupported UTxO byte format');
}

export default function SendClient() {
  const { connected, name, wallet } = useWallet() as any; // wallet is Mesh BrowserWallet wrapper
  const netId = useNetwork();
  const hookLovelace = useLovelace(); // fallback display if live calc isn't ready yet

  // Live balance (from UTxOs) + refresh state
  const [liveLovelace, setLiveLovelace] = useState<bigint | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Form/UI state
  const [to, setTo] = useState('');
  const [ada, setAda] = useState('');
  const [allowSubmit, setAllowSubmit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [signedCbor, setSignedCbor] = useState<string | null>(null);

  const explorerBase = netId === 1 ? 'https://cardanoscan.io' : 'https://preprod.cardanoscan.io';
  const placeholder = useMemo(
    () => (netId === 1 ? 'addr1... (Mainnet address)' : 'addr_test1... (Testnet address)'),
    [netId]
  );

  // Human-readable balances
  const hookAdaText = useMemo(() => {
    if (hookLovelace == null) return null;
    const n = typeof hookLovelace === 'string' ? Number(hookLovelace) : hookLovelace;
    return Number.isFinite(n) ? (n / 1_000_000).toFixed(6) : null;
  }, [hookLovelace]);

  const liveAdaText = useMemo(() => {
    if (liveLovelace == null) return null;
    return (Number(liveLovelace) / 1_000_000).toFixed(6);
  }, [liveLovelace]);

  const displayAdaText = liveAdaText ?? hookAdaText;

  // ---------- LIVE BALANCE: supports CIP-30 (hex/bytes) and Mesh (objects) ----------
  async function computeLiveBalanceFromUtxos(apiOrWallet: any): Promise<bigint> {
    const utxos: any[] = await apiOrWallet.getUtxos();
    if (!utxos?.length) return 0n;

    // Path A: CIP-30 style (hex/bytes array)
    const first = utxos[0];
    if (
      typeof first === 'string' ||
      first instanceof Uint8Array ||
      Array.isArray(first) ||
      (first && typeof first === 'object' && typeof (first as any).hex === 'string')
    ) {
      const CSL = await import('@emurgo/cardano-serialization-lib-browser');
      let sum = 0n;
      for (const raw of utxos) {
        const bytes = toBytes(raw);
        const utxo = CSL.TransactionUnspentOutput.from_bytes(bytes);
        const coin = BigInt(utxo.output().amount().coin().to_str());
        sum += coin;
      }
      return sum;
    }

    // Path B: Mesh BrowserWallet style (objects with output.amount[])
    let sum = 0n;
    for (const u of utxos) {
      const amounts = u?.output?.amount as { unit: string; quantity: string }[] | undefined;
      const q = BigInt(amounts?.find((a) => a.unit === 'lovelace')?.quantity ?? '0');
      sum += q;
    }
    return sum;
  }

  async function refreshBalance() {
    if (!connected || !wallet) return;
    setRefreshing(true);
    try {
      const sum = await computeLiveBalanceFromUtxos(wallet);
      setLiveLovelace(sum);
    } catch (e) {
      console.error('[balance] refresh error', e);
    } finally {
      setRefreshing(false);
    }
  }

  // Initial + on wallet (dis)connect
  useEffect(() => {
    if (connected && wallet) refreshBalance();
    else setLiveLovelace(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, wallet]);

  // Clear messages on form changes
  useEffect(() => {
    setMessage(null);
    setTxHash(null);
    setSignedCbor(null);
  }, [to, ada, allowSubmit, connected]);

  // ---------- SEND ----------
  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setTxHash(null);
    setSignedCbor(null);

    if (!connected) return setMessage('Please connect a wallet (top-right) first.');
    if (!wallet) return setMessage('Wallet API unavailable. Try reconnecting your wallet.');
    if (!to || !ada) return setMessage('Enter a recipient address and an ADA amount.');

    const lovelaceOut = adaToLovelace(ada);
    if (!lovelaceOut) return setMessage('Amount must be a positive number.');

    // Quick address/network hint
    const isTestAddr = to.startsWith('addr_test');
    if (netId === 1 && isTestAddr) return setMessage('Recipient looks Testnet but wallet is on Mainnet.');
    if (netId === 0 && !isTestAddr) return setMessage('Recipient looks Mainnet but wallet is on Testnet.');

    // Pre-check with headroom (~0.3 ADA for fees)
    const have = Number(displayAdaText ?? '0');
    const want = Number(ada);
    if (Number.isFinite(have) && Number.isFinite(want) && want + 0.3 > have) {
      return setMessage(
        `Amount + fees likely exceeds your wallet balance (${have.toFixed(6)} ADA). ` +
          `Try a smaller amount or refresh/fund again.`
      );
    }

    setBusy(true);
    try {
      const tx = new Transaction({ initiator: wallet });
      tx.sendLovelace(to, lovelaceOut);

      const unsigned = await tx.build();
      const signed = await wallet.signTx(unsigned);
      setSignedCbor(signed);

      if (!allowSubmit) {
        setMessage(
          `Built & signed successfully in SAFE mode. (Not submitted). Toggle "I understand" to enable submit.`
        );
        await refreshBalance(); // show it hasn't changed in safe mode
        return;
      }

      const hash = await wallet.submitTx(signed);
      setTxHash(hash);
      setMessage('✅ Submitted successfully.');

      // Refresh balance now and after a short delay to catch new UTxOs
      await refreshBalance();
      setTimeout(refreshBalance, 5_000);
      setTimeout(refreshBalance, 15_000);
    } catch (err: any) {
      console.error(err);
      setMessage(
        err?.message ??
          'Failed to build/sign/submit. Check the address, amount, and that your wallet has enough ADA.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: '2rem auto', padding: '1rem' }}>
      <div
        style={{
          border: '1px solid rgba(43,111,255,0.30)',
          background: 'rgba(43,111,255,0.06)',
          borderRadius: 14,
          padding: '1.25rem',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Send ADA</h2>

        {/* Live balance row */}
        <p
          style={{
            marginTop: 0,
            opacity: 0.9,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          Network: <b>{networkName(netId)}</b> · Wallet:{' '}
          <b>{connected ? name ?? 'Wallet' : '—'}</b>
          {displayAdaText != null && (
            <>
              {' '}
              · Balance: <b>{displayAdaText} ADA</b>
            </>
          )}
          <button
            onClick={refreshBalance}
            disabled={!connected || refreshing}
            style={{
              marginLeft: 'auto',
              padding: '6px 10px',
              borderRadius: 10,
              border: '1px solid rgba(127,179,255,0.35)',
              background: '#0a1020',
              color: '#7fb3ff',
              cursor: refreshing ? 'wait' : 'pointer',
            }}
            title="Refresh balance from UTxOs"
          >
            {refreshing ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </p>

        <form onSubmit={handleSend} style={{ display: 'grid', gap: '0.75rem' }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Recipient address</span>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value.trim())}
              placeholder={placeholder}
              spellCheck={false}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid rgba(127,179,255,0.35)',
                background: '#0a1020',
                color: '#d6e7ff',
                fontFamily: 'monospace',
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span>Amount (ADA)</span>
            <input
              value={ada}
              onChange={(e) => setAda(e.target.value)}
              placeholder="e.g., 1.0"
              inputMode="decimal"
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid rgba(127,179,255,0.35)',
                background: '#0a1020',
                color: '#d6e7ff',
                fontFamily: 'monospace',
              }}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={allowSubmit}
              onChange={(e) => setAllowSubmit(e.target.checked)}
            />
            <span>
              I understand this will <b>broadcast</b> on {networkName(netId)} (remove safe mode).
            </span>
          </label>

          <button
            type="submit"
            disabled={busy}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '2px solid #2b6fff',
              background: busy ? '#132039' : '#0a1020',
              color: '#7fb3ff',
              fontWeight: 800,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {allowSubmit ? (busy ? 'Submitting…' : 'Submit (real send)') : busy ? 'Building…' : 'Build (safe)'}
          </button>
        </form>

        {message && (
          <div
            style={{
              marginTop: '1rem',
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid rgba(127,179,255,0.35)',
              background: 'rgba(43,111,255,0.06)',
              color: '#cfe5ff',
              whiteSpace: 'pre-wrap',
            }}
          >
            {message}
          </div>
        )}

        {txHash && (
          <p style={{ marginTop: '0.75rem' }}>
            <b>Tx Hash:</b> {txHash}
            {' · '}
            <a
              href={`${explorerBase}/transaction/${txHash}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#7fb3ff', textDecoration: 'underline' }}
            >
              View on Cardanoscan
            </a>
          </p>
        )}

        {signedCbor && !allowSubmit && (
          <details style={{ marginTop: '0.75rem' }}>
            <summary>View signed CBOR (safe mode)</summary>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                overflowX: 'auto',
                padding: '8px',
                background: '#07101f',
                borderRadius: 8,
                border: '1px solid rgba(127,179,255,0.25)',
                color: '#cfe5ff',
              }}
            >
              {signedCbor}
            </pre>
          </details>
        )}
      </div>

      <p style={{ opacity: 0.75, marginTop: '0.75rem' }}>
        Tip: Start with <b>1.0 ADA</b> to leave room for fees/min-UTxO. Use the ↻ button if the balance looks stale.
      </p>
    </div>
  );
}
