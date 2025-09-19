export default function HomePage() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 px-2 lg:px-0">
      {/* LEFT SIDEBAR */}
      <aside className="lg:col-span-3 space-y-4">
        {/* Wallet + Bankroll */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="font-semibold text-slate-200">Main Wallet</h2>
          <div className="mt-2 text-sm text-slate-400">Balance: 100 ADA</div>
          <div className="mt-1 text-sm text-slate-400">Game Bankroll: 10 ADA</div>
          <button className="mt-3 w-full rounded-xl bg-emerald-600/90 px-3 py-2 text-slate-900 font-semibold hover:bg-emerald-500">
            Add fund to Bankroll
          </button>
        </section>

        {/* Passive View */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="font-semibold text-slate-200">Passive View</h2>
          <p className="mt-2 text-sm text-slate-400">
            Based on the game you selected (e.g., your Bingo card).
          </p>
        </section>

        {/* Lotto History */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="font-semibold text-slate-200">Lotto History</h2>
          <div className="mt-2 text-xs text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>31-03-2024</span><span>01-02-03-04-05-06</span>
            </div>
            <div className="flex justify-between">
              <span>20-04-2024</span><span>10-12-25-45-50</span>
            </div>
            <div className="flex justify-between">
              <span>25-05-2024</span><span>05-12-33-35-43-46</span>
            </div>
          </div>
          <button className="mt-3 w-full rounded-xl border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">
            Purchase a ticket
          </button>
        </section>
      </aside>

      {/* CENTER CONTENT */}
      <section className="lg:col-span-6 space-y-4">
        {/* Tabs Row */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <a href="#" className="hover:underline">Discord</a>
            <a href="#" className="hover:underline">Monthly/Daily Specials</a>
            <a href="#" className="hover:underline">Support</a>
          </div>
        </div>

        {/* Game Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {['Game1','Game2','Game3','Game4','Game5','Game6'].map((g) => (
            <button
              key={g}
              className="rounded-2xl bg-slate-800/70 p-6 text-center border border-slate-700 hover:bg-slate-800 shadow"
            >
              <span className="text-lg font-semibold text-emerald-300">{g}</span>
            </button>
          ))}
        </div>

        {/* Block explorer info */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="font-semibold text-slate-200">
            Block explorer information for blockchain
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            (Placeholder) Show relevant explorer details here.
          </p>
        </section>
      </section>

      {/* RIGHT SIDEBAR */}
      <aside className="lg:col-span-3 space-y-4">
        {/* Stake Pool */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-300">Current ADA in Stake Pool for Payout:</div>
          <div className="text-2xl font-extrabold text-emerald-300">8,888 ADA</div>
          <div className="mt-2 text-xs text-slate-400">Next Payout: March 31, 2024</div>
        </section>

        {/* Ranks */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="font-semibold text-slate-200">Total Staking: 101,898 Eve</h2>
          <ol className="mt-2 list-decimal list-inside text-sm text-slate-400 space-y-1">
            <li>Player1 (nic name or wallet)</li>
            <li>Player2: 65,000 Eve</li>
            <li>Player3: 48,500 Eve</li>
            <li>Player4: 40,300 Eve</li>
          </ol>
        </section>

        {/* Staking panel */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="font-semibold text-slate-200">Staking your Eve</h2>
          <p className="mt-2 text-sm text-slate-400">Your current staking info.</p>
        </section>

        {/* Announcements + Chat */}
        <section className="rounded-2xl border border-emerald-700 bg-emerald-950/40 p-4">
          <h2 className="font-semibold text-emerald-300">Announcements & Chat</h2>
          <div className="mt-2 space-y-2 text-sm">
            <div className="rounded-lg bg-slate-900/60 p-2 text-slate-300">
              [Pinned] Welcome to Evedon! Latest updates will appear here.
            </div>
            <div className="rounded-lg bg-slate-900/60 p-2 text-slate-400">
              Chat coming in Day 18 (Firebase).
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}
