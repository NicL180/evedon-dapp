'use client';

import { CardanoWallet } from '@meshsdk/react';
import '../styles/wallet.css';

type Props = {
  label?: string;
  className?: string;
};

export default function WalletConnectButton({ label = 'Connect Wallet', className = '' }: Props) {
  return (
    <div className={`wallet-btn ${className}`}>
      {/* Mesh renders its own <button>; we style it via .wallet-btn :where(button) */}
      <CardanoWallet label={label} persist={true} />
    </div>
  );
}
