import { useState, useEffect } from 'react';
import FingerprintJS from '@fingerprintjs/fingerprintjs';

const STORAGE_KEY = 'worldtalk_visitor_id';

// Helper to safely access localStorage
function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function useFingerprint() {
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function getFingerprint() {
      // Check localStorage first for consistency across sessions
      const stored = safeGetItem(STORAGE_KEY);
      if (stored && stored.length >= 10) {
        console.log('[Fingerprint] Using stored ID:', stored.slice(0, 8) + '...');
        setVisitorId(stored);
        setIsLoading(false);
        return;
      }

      try {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        const id = result.visitorId;

        console.log('[Fingerprint] Generated new ID:', id.slice(0, 8) + '...');

        // Store for future sessions
        safeSetItem(STORAGE_KEY, id);
        setVisitorId(id);
      } catch (e) {
        console.error('[Fingerprint] FingerprintJS failed:', e);
        // Fallback: generate a random ID
        const fallbackId = crypto.randomUUID();
        safeSetItem(STORAGE_KEY, fallbackId);
        setVisitorId(fallbackId);
      }

      setIsLoading(false);
    }

    getFingerprint();
  }, []);

  return { visitorId, isLoading };
}
