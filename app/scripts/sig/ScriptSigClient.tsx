'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWallet, useNetwork } from '@meshsdk/react';
import { Transaction } from '@meshsdk/core';

// ------- helpers -------
const hrp = (netId: number | null | undefined) => (netId === 1 ? 'addr' : 'addr_test');
const toHex = (u8: Uint8Array) => Array.from(u8).map(b => b.toString(16).padStart(2, '0')).join('');
function toBytes(v: unknown): Uint8Array {
  if (typeof v === 'string') {
    // if wallet gave bech32, we handle elsewhere
    if (v.startsWith('addr')) throw new Error('BECH32_STRING');
    // hex (optionally 0x-prefixed)
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

export default function ScriptSigClient() {
  const { connected, name, wallet } = useWallet() as any; // CIP-30 via Mesh
  const netId = useNetwork();

  const [bech32, setBech32] = useState<string | null>(null);
  const [keyHashHex, setKeyHashHex] = useState<string | null>(null);
  const [scriptCbor, setScriptCbor] = useState<string | null>(null);
  const [scriptAddr, setScriptAddr] = useState<string | null>(null);
  const [amountAda, setAmountAda] = useState('1.0');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const explorerBase = useMemo(
    () => (netId === 1 ? 'https://cardanoscan.io' : 'https://preprod.cardanoscan.io'),
    [netId]
  );

  // Load base address, derive key hash, build native script, and make a script address
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (!connected || !wallet) return;

        // 1) Get an address (change or first used)
        let raw: any = null;
        try { raw = await wallet.getChangeAddress(); } catch {}
        if (!raw) {
          const used: any[] = await wallet.getUsedAddresses().catch(() => []);
          if (used?.length) raw = used[0];
        }
        if (!raw) return;

        const CSL = await import('@emurgo/cardano-serialization-lib-browser');

        // 2) Parse bech32 or bytes/hex to CSL.Address
        let addr: any;
        if (typeof raw === 'string' && raw.startsWith('addr')) {
          addr = CSL.Address.from_bech32(raw);
        } else {
          const bytes = toBytes(raw);
          addr = CSL.Address.from_bytes(bytes);
        }

        const addrBech = addr.to_bech32(hrp(netId));
        if (cancelled) return;
        setBech32(addrBech);

        // 3) Extract payment credential from Base | Enterprise | Pointer
        let cred: any = null;
        const base = CSL.BaseAddress.from_address(addr);
        if (base) cred = base.payment_cred();
        if (!cred) {
          const ent = CSL.EnterpriseAddress.from_address(addr);
          if (ent) cred = ent.payment_cred();
        }
        if (!cred) {
          const ptr = CSL.PointerAddress.from_address(addr);
          if (ptr) cred = ptr.payment_cred();
        }
        if (!cred) throw new Error('Unsupported address kind for extracting payment credential');

        const kh = cred.to_keyhash();
        if (!kh) throw new Error('Payment credential is not a key hash');
        const khHex = toHex(kh.to_bytes());
        setKeyHashHex(khHex);

        // 4) Build native script requiring that key
        const pub = CSL.ScriptPubkey.new(kh);
        const ns = CSL.NativeScript.new_script_pubkey(pub);
        setScriptCbor(toHex(ns.to_bytes()));

        // 5) Derive script address (Enterprise, fallback Base with your stake cred)
        const networkTag = netId === 1 ? 1 : 0;
        const hash = ns.hash();
        // IMPORTANT: use Credential in newer CSL
        const scrCred = CSL.Credential.from_scripthash(hash);

        let derived: string | null = null;
        try {
          const ent = CSL.EnterpriseAddress.new(networkTag, scrCred);
          derived = ent.to_address().to_bech32(hrp(netId));
        } catch {}

        if (!derived && base) {
          try {
            const scrBase = CSL.BaseAddress.new(networkTag, scrCred, base.stake_cred());
            derived = scrBase.to_address().to_bech32(hrp(netId));
          } catch {}
        }

        if (!derived) throw new Error('Could not derive script address');
        setScriptAddr(derived);
      } catch (e) {
        console.error('[sig-script] init error', e);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [connected, wallet, netId]);

  async function lockFunds(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!connected || !wallet) { setMsg('Connect your wallet first.'); return; }
    if (!scriptAddr) { setMsg('Script address not ready yet.'); return; }

    const ada = Number(amountAda);
    if (!Number.isFinite(ada) || ada <= 0) { setMsg('Enter a positive ADA amount.'); return; }

    setBusy(true);
    try {
      const lovelace = Math.round(ada * 1_000_000).toString();
      const tx = new Transaction({ initiator: wallet });
      tx.sendLovelace(scriptAddr, lovelace);

      const unsigned = await tx.build();
      const signed = await wallet.signTx(unsigned);
      const hash = await wallet.submitTx(signed);
      setMsg(`✅ Submitted lock tx. Hash: ${hash} · ${explorerBase}/transaction/${hash}`);
    } catch (err: any) {
      console.error(err);
      setMsg(err?.message ?? 'Failed to build/sign/submit.');
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

      <div style={{ display: 'grid', gap: '10px', border: '1px solid #345', borderRadius: 12, padding: 12 }}>
        <div><b>Your base address:</b> <code>{bech32 ?? '—'}</code></div>
        <div><b>Payment key hash:</b> <code>{keyHashHex ?? '—'}</code></div>
        <div><b>Native script (CBOR hex):</b> <code style={{ wordBreak: 'break-all' }}>{scriptCbor ?? '—'}</code></div>
        <div><b>Script address:</b> <code>{scriptAddr ?? '—'}</code></div>

        {/* Explorer link should use the BASE address (per your request) */}
        {bech32 && (
          <div>
            <a
              href={`${explorerBase}/address/${bech32}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#7fb3ff', textDecoration: 'underline' }}
            >
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
      </form>

      {msg && (
        <div style={{ marginTop: 12, padding: 10, border: '1px solid #345', borderRadius: 8, background: 'rgba(43,111,255,0.06)' }}>
          {msg}
        </div>
      )}
    </div>
  );
}
