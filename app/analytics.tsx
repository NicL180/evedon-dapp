'use client';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

export default function Analytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const GA_ID = process.env.NEXT_PUBLIC_GA_ID || 'G-12QDBHNG0T';
    if (typeof window === 'undefined' || !GA_ID) return;

    const q = searchParams?.toString();
    const url = q ? `${pathname}?${q}` : pathname;

    if (typeof window.gtag === 'function') {
      window.gtag('config', GA_ID, { page_path: url } as Record<string, unknown>);
    }
  }, [pathname, searchParams]);

  return null;
}