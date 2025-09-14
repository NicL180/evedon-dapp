'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export default function Analytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
    if (!GA_ID) return;

    // Build page path + query
    const url =
      pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');

    // Only run when gtag is present in the window
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('config', GA_ID, { page_path: url });
    }
  }, [pathname, searchParams]);

  return null;
}
