import { useState, useEffect } from 'react';
import FingerprintJS from '@fingerprintjs/fingerprintjs';

const STORAGE_KEY = 'worldtalk_visitor_id';

export function useFingerprint() {
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function getFingerprint() {
      // Check localStorage first for consistency across sessions
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setVisitorId(stored);
        setIsLoading(false);
        return;
      }

      try {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        const id = result.visitorId;

        // Store for future sessions
        localStorage.setItem(STORAGE_KEY, id);
        setVisitorId(id);
      } catch (e) {
        // Fallback: generate a random ID
        const fallbackId = crypto.randomUUID();
        localStorage.setItem(STORAGE_KEY, fallbackId);
        setVisitorId(fallbackId);
      }

      setIsLoading(false);
    }

    getFingerprint();
  }, []);

  return { visitorId, isLoading };
}
