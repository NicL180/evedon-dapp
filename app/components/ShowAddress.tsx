'use client';

import { useState } from 'react';

export default function ShowAddress({ address }: { address: string }) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="inline-flex items-center gap-2 rounded-lg border border-emerald-700/40 px-3 py-1 text-sm hover:bg-slate-800"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-emerald-300" fill="currentColor">
          <path d="M12 5C7 5 2.73 8.11 1 12c1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z"/>
        </svg>
        <span className="text-slate-200">{show ? 'Hide address' : 'Show address'}</span>
      </button>

      <div className={show ? 'mt-3 opacity-30 transition' : 'mt-3 transition'}>
        <div className="text-xs text-slate-300">Current ADA in Stake Pool for Payout:</div>
        <div className="text-2xl font-extrabold text-emerald-300">8,888 ADA</div>
        <div className="mt-2 text-xs text-slate-400">Next Payout: March 31, 2024</div>
      </div>

      {show && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-slate-950/80 backdrop-blur-sm ring-1 ring-emerald-700/40 p-4">
          <div className="w-full rounded-xl bg-slate-900/70 p-3 text-xs text-slate-100 break-all">
            {address}
          </div>
        </div>
      )}
    </div>
  );
}
