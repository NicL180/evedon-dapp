import './globals.css';
import type { Metadata } from 'next';
import Script from 'next/script';
import Analytics from './analytics';

export const metadata: Metadata = {
  title: 'Evedon',
  description: 'Evedon dApp',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const GA_ID = 'G-12QDBHNG0T'; // hardcoded fallback
  return (
    <html lang="en">
      <head>
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
        <Analytics />
        {children}
      </body>
    </html>
  );
}