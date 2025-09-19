'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWallet, useNetwork } from '@meshsdk/react';
import { BlockfrostProvider, MeshTxBuilder } from '@meshsdk/core';

// ---------- helpers ----------
const hrp = (netId: number | null | undefined) => (netId === 1 ? 'addr' : 'addr_test');
const toHex = (u8: Uint8Array) => Array.from(u8).map(b => b.toString(16).padStart(2, '0')).join('');
function toBytes(v: unknown): Uint8Array {
  if (typeof v === 'string') {
    if (v.startsWith('addr')) throw new Error('BECH32_STRING');
    const clean = v.startsWith('0x') ? v.slice(2) : v;
    if (!/^[0-9a-fA-F]+$/.test(clean)) throw new Error('Not hex');
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  if (v instanceof Uint8Array) return v;
  if (Array.isArray(v)) return Uint8Array.from(v as number[]);
  if (v && typeof v === 'object' && typeof (v as any).hex === 'string') return toBytes((v as any).hex);
  throw new Error('Unsupported address data');
}
const niceErr = (e: any) =>
  e?.info?.error?.message || e?.info?.message || e?.message || 'Failed to build/sign/submit.';

// ---------- component ----------
export default function ScriptSigClient() {
  const { connected, name, wallet } = useWallet() as any; // CIP-30
  const netId = useNetwork();

  const [baseBech, setBaseBech] = useState<string | null>(null);
  const [keyHashHex, setKeyHashHex] = useState<string | null>(null);
  const [scriptCbor, setScriptCbor] = useState<string | null>(null);
  const [scriptAddr, setScriptAddr] = useState<string | null>(null);

  const [availableAda, setAvailableAda] = useState<number | null>(null);
  const [safeMaxAda, setSafeMaxAda] = useState<number | null>(null);

  const [amountAda, setAmountAda] = useState('1.0'); // recommend >= 1.0 ADA
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const explorerBase = useMemo(
    () => (netId === 1 ? 'https://cardanoscan.io' : 'https://preprod.cardanoscan.io'),
    [netId]
  );
  const cexplorerBase = useMemo(
    () => (netId === 1 ? 'https://cexplorer.io' : 'https://preprod.cexplorer.io'),
    [netId]
  );

  // Use Blockfrost for UTxOs (avoid wallet privacy limits)
  const provider = useMemo(
    () => new BlockfrostProvider(process.env.NEXT_PUBLIC_BLOCKFROST_KEY_PREPROD || ''),
    []
  );

  // 1) Derive base address, key hash, native script, and script address
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!connected || !wallet) return;
        const CSL = await import('@emurgo/cardano-serialization-lib-browser');

        // read a wallet address (bech32 or bytes/hex)
        let raw: any = null;
        try { raw = await wallet.getChangeAddress(); } catch {}
        if (!raw) {
          const used: any[] = await wallet.getUsedAddresses().catch(() => []);
          if (used?.length) raw = used[0];
        }
        if (!raw) return;

        let addr: any;
        if (typeof raw === 'string' && raw.startsWith('addr')) {
          addr = CSL.Address.from_bech32(raw);
        } else {
          addr = CSL.Address.from_bytes(toBytes(raw));
        }

        const bech = addr.to_bech32(hrp(netId));
        if (cancelled) return;
        setBaseBech(bech);

        // payment credential from Base | Enterprise | Pointer
        let cred: any = null;
        const base = CSL.BaseAddress.from_address(addr);
        if (base) cred = base.payment_cred();
        if (!cred) { const ent = CSL.EnterpriseAddress.from_address(addr); if (ent) cred = ent.payment_cred(); }
        if (!cred) { const ptr = CSL.PointerAddress.from_address(addr); if (ptr) cred = ptr.payment_cred(); }
        if (!cred) throw new Error('Unsupported address kind');

        const kh = cred.to_keyhash();
        const pkhHex = toHex(kh.to_bytes());
        setKeyHashHex(pkhHex);

        // native script (signature)
        const pub = CSL.ScriptPubkey.new(kh);
        const ns  = CSL.NativeScript.new_script_pubkey(pub);
        setScriptCbor(toHex(ns.to_bytes()));

        // script address (enterprise via Credential API)
        const networkTag = netId === 1 ? 1 : 0;
        const scrCred = CSL.Credential.from_scripthash(ns.hash());
        const entAddr = CSL.EnterpriseAddress.new(networkTag, scrCred).to_address();
        setScriptAddr(entAddr.to_bech32(hrp(netId)));
      } catch (e) {
        console.error('[sig] init', e);
      }
    })();
    return () => { cancelled = true; };
  }, [connected, wallet, netId]);

  // 2) Fetch wallet balance (via Blockfrost) and compute SAFE MAX
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!baseBech) return;
        const utxos = await provider.fetchAddressUTxOs(baseBech);
        const sum = utxos.reduce((acc: number, u: any) => {
          const q = Number(u.output.amount.find((a: any) => a.unit === 'lovelace')?.quantity ?? '0');
          return acc + q;
        }, 0);
        const ada = sum / 1_000_000;
        if (cancelled) return;
        setAvailableAda(ada);

        // SAFE MAX: leave 0.8 ADA or 10% buffer for fees/change/min-UTxO
        const buffer = Math.max(0.8, ada * 0.10);
        setSafeMaxAda(Number(Math.max(0, ada - buffer).toFixed(6)));
      } catch (e) {
        console.error('[sig] balance', e);
      }
    })();
    return () => { cancelled = true; };
  }, [baseBech, provider]);

  // 3) Build & submit using EXPLICIT UTxOs from Blockfrost (not the wallet)
  async function lockFunds(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setTxHash(null);

    if (!connected || !wallet) { setMsg('Connect your wallet first.'); return; }
    if (!scriptAddr || !baseBech) { setMsg('Addresses not ready yet.'); return; }

    const amt = Number(amountAda);
    if (!Number.isFinite(amt) || amt <= 0) { setMsg('Enter a positive ADA amount.'); return; }
    if (amt < 1.0) { setMsg('Use ≥ 1.0 ADA to satisfy min-UTxO at the script address.'); return; }
    if (safeMaxAda !== null && amt > safeMaxAda) {
      setMsg(`Amount too high. Safe max ~${safeMaxAda.toFixed(6)} ADA. Try the “Use max” button.`);
      return;
    }

    setBusy(true);
    try {
      const changeHex = await wallet.getChangeAddress();
      const want = Math.round(amt * 1_000_000);

      // Fetch UTxOs and pick enough to cover output + fee buffer (~1.5 ADA)
      const utxos = await provider.fetchAddressUTxOs(baseBech);
      const sorted = [...utxos].sort((a, b) =>
        Number(b.output.amount.find((x: any) => x.unit === 'lovelace')?.quantity ?? '0') -
        Number(a.output.amount.find((x: any) => x.unit === 'lovelace')?.quantity ?? '0')
      );

      const need = want + 1_500_000; // 1.5 ADA fee/change buffer
      let picked: any[] = [];
      let total = 0;
      for (const u of sorted) {
        const q = Number(u.output.amount.find((x: any) => x.unit === 'lovelace')?.quantity ?? '0');
        picked.push(u);
        total += q;
        if (total >= need) break;
      }
      if (total < need) {
        throw new Error('Not enough ADA in selected UTxOs. Try a smaller amount.');
      }

      // Build with explicit inputs
      const txb = new MeshTxBuilder({ fetcher: provider, verbose: true });
      txb.setNetwork('preprod');

      // add picked inputs
      for (const u of picked) {
        txb.txIn(u.input.txHash, u.input.outputIndex, u.output.amount, u.output.address);
      }

      // output to script + change back to wallet
      txb
        .txOut(String(scriptAddr), [{ unit: 'lovelace', quantity: String(want) }])
        .changeAddress(changeHex);

      const unsigned = await txb.complete();         // no wallet selection needed now
      const signed   = await wallet.signTx(unsigned);
      const hash     = await wallet.submitTx(signed);

      setTxHash(hash);
      setMsg('✅ Submitted lock tx.');

      // refresh displayed balance (after brief indexing delay)
      setTimeout(async () => {
        try {
          const list = await provider.fetchAddressUTxOs(baseBech);
          const sum = list.reduce((acc: number, u: any) => {
            const q = Number(u.output.amount.find((a: any) => a.unit === 'lovelace')?.quantity ?? '0');
            return acc + q;
          }, 0);
          const ada = sum / 1_000_000;
          setAvailableAda(ada);
          const buffer = Math.max(0.8, ada * 0.10);
          setSafeMaxAda(Number(Math.max(0, ada - buffer).toFixed(6)));
        } catch {}
      }, 1500);
    } catch (err: any) {
      console.error('[lock] error', err);
      setMsg(niceErr(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 860, margin: '2rem auto', padding: '1rem' }}>
      <h2>Native Script (Signature) — Lock tADA</h2>
      <p style={{ opacity: 0.85 }}>
        Network: <b>{netId === 1 ? 'Mainnet' : 'Preprod Testnet'}</b> · Wallet: <b>{connected ? (name ?? 'Wallet') : '—'}</b>
      </p>

      <div style={{ display: 'grid', gap: 10, border: '1px solid #345', borderRadius: 12, padding: 12 }}>
        <div><b>Your base address:</b> <code>{baseBech ?? '—'}</code></div>
        <div><b>Payment key hash:</b> <code>{keyHashHex ?? '—'}</code></div>
        <div><b>Native script (CBOR hex):</b> <code style={{ wordBreak: 'break-all' }}>{scriptCbor ?? '—'}</code></div>
        <div><b>Script address:</b> <code>{scriptAddr ?? '—'}</code></div>
        {baseBech && (
          <div>
            <a href={`${explorerBase}/address/${baseBech}`} target="_blank" rel="noreferrer" style={{ color: '#7fb3ff', textDecoration: 'underline' }}>
              View base address on explorer
            </a>
          </div>
        )}
      </div>

      <form onSubmit={lockFunds} style={{ marginTop: 14, display: 'grid', gap: 10 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Amount to lock (ADA)</span>
          <input
            value={amountAda}
            onChange={(e) => setAmountAda(e.target.value)}
            placeholder="1.0"
            inputMode="decimal"
            style={{ padding: '10px 12px', border: '1px solid #567', borderRadius: 10, background: '#0a1020', color: '#d6e7ff' }}
          />
        </label>

        <div style={{ fontSize: 13, opacity: 0.85 }}>
          {availableAda === null ? 'Available: —' : `Available: ${availableAda.toFixed(6)} ADA`}
          {safeMaxAda !== null && <> · Safe max: <b>{safeMaxAda.toFixed(6)} ADA</b></>}
          <span> · Tip: use ≥ 1.0 ADA for the script output.</span>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => safeMaxAda !== null && setAmountAda(safeMaxAda.toFixed(6))}
            style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid #567', background: '#0a1020', color: '#d6e7ff' }}
          >
            Use max
          </button>

          <button
            type="submit"
            disabled={!scriptAddr || busy}
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
            {busy ? 'Submitting…' : 'Lock ADA to Script'}
          </button>
        </div>
      </form>

      {(msg || txHash) && (
        <div
          style={{
            marginTop: '1rem',
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid rgba(127,179,255,0.35)',
            background: 'rgba(43,111,255,0.06)',
            color: '#cfe5ff',
            whiteSpace: 'pre-wrap',
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <span>{msg}</span>
          {txHash && (
            <>
              <code style={{ opacity: 0.8 }}>{txHash.slice(0, 10)}…{txHash.slice(-8)}</code>
              <a href={`${explorerBase}/transaction/${txHash}`} target="_blank" rel="noreferrer" style={{ color: '#7fb3ff', textDecoration: 'underline' }}>
                Open on Cardanoscan
              </a>
              <a href={`${cexplorerBase}/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ color: '#7fb3ff', textDecoration: 'underline' }}>
                Open on Cexplorer
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
