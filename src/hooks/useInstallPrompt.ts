import { useCallback, useEffect, useMemo, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const isStandaloneDisplay = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const isIOSStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone;
  return Boolean(isStandalone || isIOSStandalone);
};

export const useInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(isStandaloneDisplay());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const { matchMedia, addEventListener } = window;
    if (typeof addEventListener !== 'function') {
      return undefined;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    const mediaQuery = typeof matchMedia === 'function' ? matchMedia('(display-mode: standalone)') : undefined;
    const handleDisplayModeChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setInstalled(true);
      }
    };

    let removeLegacyListener: (() => void) | undefined;

    if (mediaQuery) {
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', handleDisplayModeChange);
      } else if (typeof mediaQuery.addListener === 'function') {
        const legacyListener = (event: MediaQueryListEvent) => handleDisplayModeChange(event);
        mediaQuery.addListener(legacyListener);
        removeLegacyListener = () => mediaQuery.removeListener(legacyListener);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      if (mediaQuery) {
        if (typeof mediaQuery.removeEventListener === 'function') {
          mediaQuery.removeEventListener('change', handleDisplayModeChange);
        } else if (removeLegacyListener) {
          removeLegacyListener();
        }
      }
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) {
      return false;
    }

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (outcome === 'accepted') {
        setInstalled(true);
        return true;
      }
    } catch (error) {
      console.warn('PWA installation prompt failed', error);
    }

    return false;
  }, [deferredPrompt]);

  const canInstall = useMemo(() => Boolean(deferredPrompt) && !installed, [deferredPrompt, installed]);

  return {
    canInstall,
    promptInstall,
    isInstalled: installed
  };
};

export type UseInstallPrompt = ReturnType<typeof useInstallPrompt>;
