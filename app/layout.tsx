import './globals.css';
import type { Metadata } from 'next';
import Script from 'next/script';
import Analytics from './analytics';
import { Suspense } from 'react';
import Providers from './providers';
import WalletMenu from './components/WalletMenu';



export const metadata: Metadata = {
  title: 'Evedon',
  description: 'Evedon dApp',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const GA_ID = 'G-12QDBHNG0T';

  return (
    <html lang="en">
      <head>
        {/* ✅ Google Analytics */}
        <Script
          async
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}', { page_path: window.location.pathname });
          `}
        </Script>
      </head>
      <body>
        <Providers>
          {/* Title bar */}
          <header
            style={{
              textAlign: 'center',
              padding: '1rem 0',
              background: 'linear-gradient(90deg, #0a0f1c, #111a2f)',
              borderBottom: '1px solid rgba(0, 240, 255, 0.2)',
            }}
          >
            <h1
              style={{
                fontSize: '2.5rem',
                fontWeight: 800,
                margin: 0,
                fontFamily: '"Orbitron", sans-serif',
                letterSpacing: '2px',
                color: '#00f0ff',
                textShadow: '0 0 10px #00f0ff, 0 0 20px #00f0ff',
              }}
            >
              Welcome to Evedon Games
            </h1>
          </header>

          {/* 🔵 Neon Connect Wallet menu (fixed top-right) */}
          <WalletMenu />

          <Suspense fallback={null}>
            <Analytics />
          </Suspense>

          {children}
        </Providers>
      </body>
    </html>
  );
}
