'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWallet, useNetwork } from '@meshsdk/react';
import { BlockfrostProvider, MeshTxBuilder } from '@meshsdk/core';

const hrp = (id: number | null | undefined) => (id === 1 ? 'addr' : 'addr_test');
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

export default function SpendSigClient() {
  const { connected, name, wallet } = useWallet() as any;
  const netId = useNetwork();

  const [baseBech, setBaseBech] = useState<string>('');
  const [scriptAddr, setScriptAddr] = useState<string>('');
  const [scriptCbor, setScriptCbor] = useState<string>('');
  const [pubKeyHash, setPubKeyHash] = useState<string>('');

  const [utxos, setUtxos] = useState<any[]>([]);
  const [selected, setSelected] = useState<number>(0);
  const [withdrawAda, setWithdrawAda] = useState('1.0');
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
  const provider = useMemo(
    () => new BlockfrostProvider(process.env.NEXT_PUBLIC_BLOCKFROST_KEY_PREPROD || ''),
    []
  );

  // 1) Recreate script + addresses from wallet
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!connected || !wallet) return;
        const CSL = await import('@emurgo/cardano-serialization-lib-browser');

        // get wallet address (bech32 or bytes/hex)
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
          const bytes = toBytes(raw);
          addr = CSL.Address.from_bytes(bytes);
        }
        const bech = addr.to_bech32(hrp(netId));
        if (cancelled) return; setBaseBech(bech);

        // payment credential (Base | Enterprise | Pointer)
        let cred: any = null;
        const base = CSL.BaseAddress.from_address(addr);
        if (base) cred = base.payment_cred();
        if (!cred) {
          const ent = CSL.EnterpriseAddress.from_address(addr); if (ent) cred = ent.payment_cred();
        }
        if (!cred) {
          const ptr = CSL.PointerAddress.from_address(addr); if (ptr) cred = ptr.payment_cred();
        }
        if (!cred) throw new Error('Unsupported address kind for extracting payment credential');

        const kh = cred.to_keyhash();
        const pkhHex = toHex(kh.to_bytes());
        setPubKeyHash(pkhHex);

        // native script (sig)
        const pub = CSL.ScriptPubkey.new(kh);
        const ns = CSL.NativeScript.new_script_pubkey(pub);
        setScriptCbor(toHex(ns.to_bytes()));

        // script address (enterprise) using newer Credential API
        const networkTag = netId === 1 ? 1 : 0;
        const scrCred = CSL.Credential.from_scripthash(ns.hash());
        const ent = CSL.EnterpriseAddress.new(networkTag, scrCred);
        const scrAddr = ent.to_address().to_bech32(hrp(netId));
        setScriptAddr(scrAddr);
      } catch (e) {
        console.error('[spend] init', e);
      }
    })();
    return () => { cancelled = true; };
  }, [connected, wallet, netId]);

  // 2) Fetch UTxOs at script address
  async function refreshUtxos() {
    setMsg(null);
    setTxHash(null);
    try {
      if (!scriptAddr) return;
      const list = await provider.fetchAddressUTxOs(scriptAddr);
      setUtxos(list);
      setSelected(0);
      if (!list.length) setMsg('No UTxOs at script address yet. Lock some tADA first.');
    } catch (e: any) {
      console.error(e);
      setMsg(e?.message ?? 'Failed to fetch UTxOs. Check Blockfrost key and network.');
    }
  }

  // 3) Spend selected UTxO back to baseBech
  async function spend(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setTxHash(null);

    if (!connected || !wallet) { setMsg('Connect your wallet first.'); return; }
    if (!scriptAddr || !scriptCbor || !pubKeyHash) { setMsg('Script not ready.'); return; }
    if (!utxos.length) { setMsg('No UTxOs to spend.'); return; }

    const ada = Number(withdrawAda);
    if (!Number.isFinite(ada) || ada <= 0) { setMsg('Enter a positive ADA amount.'); return; }

    setBusy(true);
    try {
      const changeHex = await wallet.getChangeAddress();
      const txb = new MeshTxBuilder({ fetcher: provider, verbose: true });
      txb.setNetwork('preprod'); // we're on Preprod

      const u = utxos[selected];
      txb
        .txIn(u.input.txHash, u.input.outputIndex, u.output.amount, u.output.address)
        .txInScript(scriptCbor)           // attach native script
        .requiredSignerHash(pubKeyHash)   // require our key hash
        .txOut(baseBech, [{ unit: 'lovelace', quantity: Math.round(ada * 1_000_000).toString() }])
        .changeAddress(changeHex);

      const unsigned = await txb.complete();
      const signed = await wallet.signTx(unsigned);
      const hash = await wallet.submitTx(signed);
      setTxHash(hash);
      setMsg('✅ Submitted spend tx.');
    } catch (err: any) {
      console.error(err);
      setMsg(err?.message ?? 'Failed to build/sign/submit. Try a smaller amount or ensure the UTxO is large enough.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '2rem auto', padding: '1rem' }}>
      <h2>Spend from Native Script (Signature)</h2>
      <p style={{ opacity: 0.85 }}>
        Network: <b>{netId === 1 ? 'Mainnet' : 'Preprod Testnet'}</b> · Wallet: <b>{connected ? (name ?? 'Wallet') : '—'}</b>
      </p>

      <div style={{ display: 'grid', gap: 10, border: '1px solid #345', borderRadius: 12, padding: 12 }}>
        <div><b>Base address:</b> <code>{baseBech || '—'}</code></div>
        <div><b>Script address:</b> <code>{scriptAddr || '—'}</code></div>
        <div><b>Native script (CBOR hex):</b> <code style={{ wordBreak: 'break-all' }}>{scriptCbor || '—'}</code></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={refreshUtxos} style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid #567', background: '#0a1020', color: '#d6e7ff' }}>
            ↻ Refresh UTxOs
          </button>
          {scriptAddr && (
            <a
              href={`${explorerBase}/address/${scriptAddr}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#7fb3ff', textDecoration: 'underline' }}
            >
              View script address on explorer
            </a>
          )}
        </div>
      </div>

      <div style={{ marginTop: 14, border: '1px solid #345', borderRadius: 12, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>UTxOs at Script Address</h3>
        {!utxos.length ? (
          <p style={{ opacity: 0.8 }}>No UTxOs loaded. Click ↻ Refresh.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {utxos.map((u, i) => (
              <li key={`${u.input.txHash}-${u.input.outputIndex}`} style={{ padding: 10, border: '1px solid #223', borderRadius: 10 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span><b>#{i + 1}</b> · TxIn: {u.input.txHash.slice(0, 8)}… / {u.input.outputIndex}</span>
                  <span>Address: <code>{u.output.address}</code></span>
                  <span>
                    Amount:{' '}
                    <code>
                      {(Number(u.output.amount.find((a: any) => a.unit === 'lovelace')?.quantity ?? '0') / 1_000_000).toFixed(6)} ADA
                    </code>
                  </span>
                  <input type="radio" name="pick" checked={selected === i} onChange={() => setSelected(i)} />
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={spend} style={{ marginTop: 14, display: 'grid', gap: 10 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Amount to withdraw (ADA)</span>
          <input
            value={withdrawAda}
            onChange={(e) => setWithdrawAda(e.target.value)}
            placeholder="0.9"
            inputMode="decimal"
            style={{ padding: '10px 12px', border: '1px solid #567', borderRadius: 10, background: '#0a1020', color: '#d6e7ff' }}
          />
        </label>
        <button
          type="submit"
          disabled={!utxos.length || busy}
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
          {busy ? 'Submitting…' : 'Spend from Script'}
        </button>
      </form>

      {(msg || txHash) && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            border: '1px solid #345',
            borderRadius: 8,
            background: 'rgba(43,111,255,0.06)',
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <span>{msg}</span>
          {txHash && (
            <>
              <code style={{ opacity: 0.8 }}>{txHash.slice(0, 10)}…{txHash.slice(-8)}</code>
              <a
                href={`${explorerBase}/transaction/${txHash}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#7fb3ff', textDecoration: 'underline' }}
              >
                Open on Cardanoscan
              </a>
              <a
                href={`${cexplorerBase}/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#7fb3ff', textDecoration: 'underline' }}
              >
                Open on Cexplorer
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
