'use client';

import Link from 'next/link';
import WalletConnectButton from './WalletConnectButton';
import '../styles/wallet.css';

export default function Navbar() {
  return (
    <header className="app-nav">
      <div className="app-nav__inner">
        <div className="app-brand">
          <Link href="/" className="app-brand__link">Evedon</Link>
        </div>

        <nav className="app-nav__links" aria-label="Main">
          <Link href="/wallet">Wallet</Link>
          <Link href="/about">About</Link>
        </nav>

        {/* Top-right neon connect button */}
        <WalletConnectButton />
      </div>
    </header>
  );
}
