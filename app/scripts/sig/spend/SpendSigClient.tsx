'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWallet, useNetwork } from '@meshsdk/react';
import { BlockfrostProvider, MeshTxBuilder } from '@meshsdk/core';

const hrp = (id: number | null | undefined) => (id === 1 ? 'addr' : 'addr_test');
const hex2bytes = (hex: string) =>
  Uint8Array.from((hex.replace(/^0x/, '').match(/.{1,2}/g) || []).map(b => parseInt(b, 16)));
const toHex = (u8: Uint8Array) => Array.from(u8).map(b => b.toString(16).padStart(2, '0')).join('');
const lovelaceOf = (u: any) =>
  Number(u.output.amount.find((a: any) => a.unit === 'lovelace')?.quantity ?? '0');

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
  const [max50Ada, setMax50Ada] = useState<number | null>(null);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const explorerBase = useMemo(
    () => (netId === 1 ? 'https://cardanoscan.io' : 'https://preprod.cardanoscan.io'),
    [netId]
  );
  const provider = useMemo(
    () => new BlockfrostProvider(process.env.NEXT_PUBLIC_BLOCKFROST_KEY_PREPROD || ''),
    []
  );

  // 1) Recreate native script & addresses from wallet (single-sig)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!connected || !wallet) return;
        const CSL = await import('@emurgo/cardano-serialization-lib-browser');

        // source a wallet address, normalize to bech32
        let raw: any = null;
        try { raw = await wallet.getChangeAddress(); } catch {}
        if (!raw) {
          const used: any[] = await wallet.getUsedAddresses().catch(() => []);
          if (used?.length) raw = used[0];
        }
        if (!raw) return;

        const addr =
          typeof raw === 'string' && raw.startsWith('addr')
            ? CSL.Address.from_bech32(raw)
            : CSL.Address.from_bytes(hex2bytes(raw));

        const bech = addr.to_bech32(hrp(netId));
        if (cancelled) return;
        setBaseBech(bech);

        // payment credential → key hash
        let cred: any = null;
        const base = CSL.BaseAddress.from_address(addr); if (base) cred = base.payment_cred();
        if (!cred) { const ent = CSL.EnterpriseAddress.from_address(addr); if (ent) cred = ent.payment_cred(); }
        if (!cred) { const ptr = CSL.PointerAddress.from_address(addr); if (ptr) cred = ptr.payment_cred(); }
        const kh = cred.to_keyhash();
        const pkhHex = toHex(kh.to_bytes());
        setPubKeyHash(pkhHex);

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
        console.error('[spend] init', e);
      }
    })();
    return () => { cancelled = true; };
  }, [connected, wallet, netId]);

  // 2) Fetch UTxOs at script address
  async function refreshUtxos() {
    setMsg(null); setTxHash(null);
    try {
      if (!scriptAddr) return;
      const list = await provider.fetchAddressUTxOs(scriptAddr);
      setUtxos(list);
      setSelected(0);

      if (list.length) {
        const ada = lovelaceOf(list[0]) / 1_000_000;
        // 50% cap minus small buffer for fees/change rounding
        setMax50Ada(Math.max(0, ada * 0.5 - 0.4));
      } else {
        setMax50Ada(null);
        setMsg('No UTxOs at script address yet. Lock some tADA first.');
      }
    } catch (e: any) {
      console.error(e);
      setMsg(e?.message ?? 'Failed to fetch UTxOs. Check Blockfrost key and network.');
    }
  }

  // 3) Spend selected UTxO → baseBech (attach script to the *correct* input + partial sign)
  async function spend(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setTxHash(null);

    if (!connected || !wallet) { setMsg('Connect your wallet first.'); return; }
    if (!scriptAddr || !scriptCbor || !pubKeyHash) { setMsg('Script not ready.'); return; }
    if (!utxos.length) { setMsg('No UTxOs to spend.'); return; }

    const ada = Number(withdrawAda);
    if (!Number.isFinite(ada) || ada <= 0) { setMsg('Enter a positive ADA amount.'); return; }

    const u = utxos[selected];
    const utxoAda = lovelaceOf(u) / 1_000_000;
    const cap = Math.max(0, utxoAda * 0.5 - 0.4); // 50% - buffer
    if (ada > cap) {
      setMsg(`50% limit active. Max you can withdraw from this UTxO is ~${cap.toFixed(6)} ADA.`);
      return;
    }

    setBusy(true);
    try {
      const changeHex = await wallet.getChangeAddress();
      const want = Math.round(ada * 1_000_000);
      const buffer = 1_500_000; // ~1.5 ADA buffer for fees/change

      // Start with the *script* UTxO as the first input and immediately attach the script.
      const txb = new MeshTxBuilder({ fetcher: provider, verbose: true });
      txb.setNetwork('preprod');

      txb
        .txIn(u.input.txHash, u.input.outputIndex, u.output.amount, u.output.address) // script input
        .txInScript(scriptCbor)                         // attach to the last txIn (the script input)
        .requiredSignerHash(pubKeyHash);               // our wallet must sign (required signer)

      // If we need extra funds for fees/min-change, add base address UTxOs explicitly.
      let pickedTotal = lovelaceOf(u);
      if (pickedTotal < want + buffer) {
        if (!baseBech) throw new Error('Base address not ready.');
        const baseUtxos = await provider.fetchAddressUTxOs(baseBech);
        baseUtxos.sort((a: any, b: any) => lovelaceOf(b) - lovelaceOf(a)); // largest-first
        for (const bu of baseUtxos) {
          txb.txIn(bu.input.txHash, bu.input.outputIndex, bu.output.amount, bu.output.address);
          pickedTotal += lovelaceOf(bu);
          if (pickedTotal >= want + buffer) break;
        }
        if (pickedTotal < want + buffer) {
          throw new Error('Not enough ADA in wallet inputs to cover output + fees/change. Lower the amount.');
        }
      }

      txb
        .txOut(baseBech, [{ unit: 'lovelace', quantity: String(want) }])
        .changeAddress(changeHex);

      // IMPORTANT: do NOT pass { wallet } here (avoids structuredClone DataCloneError)
      const unsigned = await txb.complete();

      // IMPORTANT: partial sign = true for txs with script witnesses (Lace is happier)
      const signed   = await wallet.signTx(unsigned, true);
      const hash     = await wallet.submitTx(signed);

      setTxHash(hash);
      setMsg('✅ Submitted spend tx.');

      setTimeout(() => refreshUtxos(), 1500);
    } catch (err: any) {
      console.error('[spend] error', err);
      const text =
        err?.info?.error?.message ||
        err?.info?.message ||
        err?.message ||
        String(err);
      setMsg(text);
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
          <button onClick={refreshUtxos} style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid #567', background: '#0a1020', color: '#d6e7ff' }}>↻ Refresh UTxOs</button>
          {scriptAddr && (
            <a href={`${explorerBase}/address/${scriptAddr}`} target="_blank" rel="noreferrer" style={{ color: '#7fb3ff', textDecoration: 'underline' }}>
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
            {utxos.map((u, i) => {
              const ada = lovelaceOf(u) / 1_000_000;
              return (
                <li key={`${u.input.txHash}-${u.input.outputIndex}`} style={{ padding: 10, border: '1px solid #223', borderRadius: 10 }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span><b>#{i + 1}</b> · TxIn: {u.input.txHash.slice(0, 8)}… / {u.input.outputIndex}</span>
                    <span>Amount: <code>{ada.toFixed(6)} ADA</code></span>
                    <input
                      type="radio"
                      name="pick"
                      checked={selected === i}
                      onChange={() => {
                        setSelected(i);
                        setMax50Ada(Math.max(0, ada * 0.5 - 0.4)); // update 50% cap
                      }}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form onSubmit={spend} style={{ marginTop: 14, display: 'grid', gap: 10 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Amount to withdraw (ADA)</span>
          <input
            value={withdrawAda}
            onChange={(e) => setWithdrawAda(e.target.value)}
            placeholder="e.g., 0.8"
            inputMode="decimal"
            style={{ padding: '10px 12px', border: '1px solid #567', borderRadius: 10, background: '#0a1020', color: '#d6e7ff' }}
          />
        </label>

        <div style={{ fontSize: 13, opacity: 0.85 }}>
          {max50Ada === null
            ? '50% max: —'
            : <>50% max for this UTxO (with buffer): <b>{max50Ada.toFixed(6)} ADA</b></>}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => max50Ada !== null && setWithdrawAda(max50Ada.toFixed(6))}
            disabled={max50Ada === null}
            style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid #567', background: '#0a1020', color: '#d6e7ff' }}
          >
            Use 50% max
          </button>

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
        </div>
      </form>

      {(msg || txHash) && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            border: '1px solid #345',
            borderRadius: 8,
            background: 'rgba(43,111,255,0.06)',
          }}
        >
          {msg}{' '}
          {txHash && (
            <>
              ·{' '}
              <a
                href={`${explorerBase}/transaction/${txHash}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#7fb3ff' }}
              >
                Open on Cardanoscan
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
