import WalletClient from './WalletClient';

export default function WalletPage() {
  return (
    <main style={{ padding: '1rem' }}>
      <h1 style={{ textAlign: 'center', margin: '1rem 0 0.5rem' }}>
        Wallet Address & ADA Balance
      </h1>
      <WalletClient />
    </main>
  );
}
