import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useOperatingSystem, { OperatingSystem } from '../hooks/useOperatingSystem';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type OsGuide = {
  label: string;
  manualHeading: string;
  steps: string[];
  fallbackMessage: string;
};

type BundleEntry = {
  file: string;
  fileName: string;
  size: number;
  sha256: string;
};

type BundleManifest = {
  generatedAt: string;
  bundles: Record<'mac' | 'windows' | 'linux', BundleEntry>;
};

declare global {
  interface Window {
    __SCHEMATICS_OFFLINE_BUNDLES__?: BundleManifest | null;
  }
  // eslint-disable-next-line no-var
  var __SCHEMATICS_OFFLINE_BUNDLES__: BundleManifest | null | undefined;
}

const BUNDLE_TARGET_BY_OS: Partial<Record<OperatingSystem, keyof BundleManifest['bundles']>> = {
  mac: 'mac',
  windows: 'windows',
  linux: 'linux',
  chromeos: 'linux'
};

const readPreloadedManifest = (): BundleManifest | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const manifest = globalThis.__SCHEMATICS_OFFLINE_BUNDLES__;
  if (!manifest || typeof manifest !== 'object') {
    return null;
  }

  if (!manifest.bundles || typeof manifest.bundles !== 'object') {
    return null;
  }

  return manifest as BundleManifest;
};

const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const resolveBundlePath = (relativePath: string): string => {
  const normalizedRelative = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return normalizedRelative.startsWith('./') ? normalizedRelative : `./${normalizedRelative}`;
  }

  const base = import.meta.env.BASE_URL ?? '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${normalizedRelative}`;
};

const loadBootstrapManifest = async (): Promise<BundleManifest | null> => {
  if (typeof document === 'undefined') {
    return readPreloadedManifest();
  }

  const existing = readPreloadedManifest();
  if (existing) {
    return existing;
  }

  const selector = 'script[data-offline-bundles]';
  const existingScript = document.querySelector<HTMLScriptElement>(selector);
  if (existingScript) {
    if (existingScript.dataset.offlineBundlesLoaded === 'true') {
      return readPreloadedManifest();
    }

    return new Promise((resolve) => {
      const handleLoad = () => {
        existingScript.removeEventListener('load', handleLoad);
        existingScript.removeEventListener('error', handleError);
        existingScript.dataset.offlineBundlesLoaded = 'true';
        resolve(readPreloadedManifest());
      };
      const handleError = () => {
        existingScript.removeEventListener('load', handleLoad);
        existingScript.removeEventListener('error', handleError);
        resolve(null);
      };
      existingScript.addEventListener('load', handleLoad);
      existingScript.addEventListener('error', handleError);
    });
  }

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.async = true;
    script.src = resolveBundlePath('offline-bundles.js');
    script.setAttribute('data-offline-bundles', 'true');

    const cleanup = () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };

    const handleLoad = () => {
      cleanup();
      script.setAttribute('data-offline-bundles-loaded', 'true');
      resolve(readPreloadedManifest());
    };

    const handleError = () => {
      cleanup();
      resolve(null);
    };

    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);
    document.head.appendChild(script);
  });
};

const OS_GUIDES: Record<OperatingSystem, OsGuide> = {
  mac: {
    label: 'macOS',
    manualHeading: 'Install on macOS',
    steps: [
      'Open Schematics Studio in Safari or Chrome on your Mac.',
      'In Safari: choose File → Add to Dock to create an app icon that opens offline.',
      "In Chrome or Edge: look for the install icon in the address bar (or More ⋮ → 'Install app') and confirm the installation.",
      'Launch the installed app from Applications (or Chrome Apps). It will cache your boards for offline work after the first sign-in.'
    ],
    fallbackMessage:
      'If the install button is disabled, use Safari’s “Add to Dock” or Chrome’s install menu to add the app to macOS manually.'
  },
  windows: {
    label: 'Windows',
    manualHeading: 'Install on Windows',
    steps: [
      'Open this app in Microsoft Edge or Chrome.',
      "Select the install icon in the address bar (or More ⋮ → 'Apps' → 'Install this site as an app').",
      'Confirm the prompt. A Start menu entry will be created and the app will run offline after the first sync.'
    ],
    fallbackMessage:
      'Open the app in Edge or Chrome and use the browser install menu if the automatic install button is not available.'
  },
  linux: {
    label: 'Linux',
    manualHeading: 'Install on Linux',
    steps: [
      'Open Schematics Studio in Chrome, Edge, or another Chromium-based browser.',
      "Use the install icon in the address bar (or More ⋮ → 'Install app').",
      'Confirm the installation. The app will appear in your launcher and stays available offline.'
    ],
    fallbackMessage:
      'Use a Chromium-based browser and install the app from the address bar menu when the automatic button is not present.'
  },
  ios: {
    label: 'iOS',
    manualHeading: 'Install on iPhone or iPad',
    steps: [
      'Open this site in Safari on your device.',
      "Tap the Share icon, then choose 'Add to Home Screen'.",
      'Rename the shortcut if you like, then tap Add. Launching the shortcut opens the offline-capable app.'
    ],
    fallbackMessage: 'Use Safari’s Share menu → Add to Home Screen to install on iOS devices.'
  },
  android: {
    label: 'Android',
    manualHeading: 'Install on Android',
    steps: [
      'Open Schematics Studio in Chrome.',
      "Tap the menu (⋮) and choose 'Install app' or 'Add to Home screen'.",
      'Approve the prompt. The installed app caches data the next time you sign in while online.'
    ],
    fallbackMessage: 'Use Chrome’s menu → Install app to add the app to your Android device.'
  },
  chromeos: {
    label: 'ChromeOS',
    manualHeading: 'Install on ChromeOS',
    steps: [
      'Open the app in Chrome.',
      "Select the install icon in the address bar or More ⋮ → 'Install app'.",
      'Confirm the installation. You can launch it from the app shelf even when you are offline.'
    ],
    fallbackMessage: 'Use Chrome’s install option from the address bar to add the app to ChromeOS.'
  },
  unknown: {
    label: 'your device',
    manualHeading: 'Install on your device',
    steps: [
      'Open Schematics Studio in a Chromium-based browser (Chrome, Edge) or Safari.',
      'Look for an install option in the browser address bar or menu (for Safari on macOS use File → Add to Dock).',
      'Confirm the prompt to finish installing the offline-ready app.'
    ],
    fallbackMessage:
      'Open the site in a modern browser such as Chrome, Edge, or Safari and use the browser’s install option to add the app.'
  }
};

const isStandaloneDisplayMode = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  const mediaQuery = window.matchMedia('(display-mode: standalone)');
  const navigatorAny = navigator as Navigator & { standalone?: boolean };
  return mediaQuery.matches || Boolean(navigatorAny?.standalone);
};

export const DesktopDownloadSection: React.FC = () => {
  const operatingSystem = useOperatingSystem();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(isStandaloneDisplayMode());
  const [isActionPending, setIsActionPending] = useState(false);
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const [bundleManifest, setBundleManifest] = useState<BundleManifest | null>(() => readPreloadedManifest());
  const [bundleEntry, setBundleEntry] = useState<BundleEntry | null>(null);
  const [isBundleLoading, setIsBundleLoading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    const handleDisplayModeChange = () => {
      setIsInstalled(isStandaloneDisplayMode());
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', handleAppInstalled);

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    mediaQuery.addEventListener('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', handleAppInstalled);
      mediaQuery.removeEventListener('change', handleDisplayModeChange);
    };
  }, []);

  const guide = useMemo<OsGuide>(() => OS_GUIDES[operatingSystem], [operatingSystem]);

  useEffect(() => {
    setInstallMessage(null);
  }, [operatingSystem, installPrompt]);

  useEffect(() => {
    if (bundleManifest || typeof window === 'undefined') {
      return;
    }

    let isActive = true;

    const loadManifest = async () => {
      setIsBundleLoading(true);
      try {
        const preloaded = await loadBootstrapManifest();
        if (isActive && preloaded) {
          setBundleManifest(preloaded);
          globalThis.__SCHEMATICS_OFFLINE_BUNDLES__ = preloaded;
          return;
        }

        const response = await fetch('downloads/index.json', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Unexpected response: ${response.status}`);
        }
        const data = (await response.json()) as BundleManifest;
        if (isActive) {
          setBundleManifest(data);
          globalThis.__SCHEMATICS_OFFLINE_BUNDLES__ = data;
        }
      } catch (error) {
        console.warn('Unable to load offline bundle manifest', error);
        if (isActive) {
          setBundleManifest(null);
        }
      } finally {
        if (isActive) {
          setIsBundleLoading(false);
        }
      }
    };

    loadManifest();

    return () => {
      isActive = false;
    };
  }, [bundleManifest]);

  useEffect(() => {
    if (!bundleManifest) {
      setBundleEntry(null);
      return;
    }

    const target = BUNDLE_TARGET_BY_OS[operatingSystem];
    if (target && bundleManifest.bundles[target]) {
      setBundleEntry(bundleManifest.bundles[target]);
      return;
    }

    setBundleEntry(null);
  }, [bundleManifest, operatingSystem]);

  const handleInstall = useCallback(async () => {
    if (isActionPending) {
      return;
    }

    setInstallMessage(null);

    if (installPrompt) {
      try {
        setIsActionPending(true);
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setInstallPrompt(null);
        } else {
          setInstallMessage('Installation was cancelled. You can try again or follow the manual steps below.');
        }
      } catch (error) {
        console.error('Install prompt failed', error);
        setInstallMessage('We could not open the install prompt. Use the manual steps below to finish setup.');
      } finally {
        setIsActionPending(false);
      }
      return;
    }

    if (bundleEntry) {
      if (typeof window === 'undefined') {
        setInstallMessage('Desktop downloads are not supported in this environment.');
        return;
      }

      try {
        setIsActionPending(true);
        const link = document.createElement('a');
        link.href = resolveBundlePath(bundleEntry.file);
        link.download = bundleEntry.fileName;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setInstallMessage(
          `Your download of ${bundleEntry.fileName} has started. Unzip it and open index.html to launch Schematics Studio offline.`
        );
      } catch (error) {
        console.error('Download failed', error);
        setInstallMessage('We could not start the download automatically. Use the manual download link below.');
      } finally {
        setIsActionPending(false);
      }
      return;
    }

    if (isBundleLoading) {
      setInstallMessage('We are preparing the desktop bundle. Please try again in a moment.');
      return;
    }

    setInstallMessage('No desktop bundle is available for this device. Follow the manual steps below to finish setup.');
  }, [installPrompt, isActionPending, bundleEntry, isBundleLoading]);

  const actionEnabled = !isInstalled && !isActionPending;
  const isAutoInstall = Boolean(installPrompt);
  const bundleSize = useMemo(() => (bundleEntry ? formatFileSize(bundleEntry.size) : ''), [bundleEntry]);
  const bundleDownloadPath = useMemo(() => (bundleEntry ? resolveBundlePath(bundleEntry.file) : null), [bundleEntry]);

  const hintMessages = useMemo(() => {
    if (installMessage) {
      return installMessage;
    }

    if (isActionPending && isAutoInstall) {
      return 'Waiting for your browser to confirm installation…';
    }

    if (isActionPending && bundleEntry) {
      return 'Preparing your download…';
    }

    if (isAutoInstall) {
      return 'Your browser will show an installation prompt. Accept it to add the app to your device.';
    }

    if (bundleEntry) {
      const sizeSuffix = bundleSize ? ` (${bundleSize})` : '';
      return `Download the packaged desktop app${sizeSuffix} and open index.html after extracting to work offline.`;
    }

    if (isBundleLoading) {
      return 'Preparing the desktop download…';
    }

    return guide.fallbackMessage;
  }, [installMessage, isActionPending, isAutoInstall, guide.fallbackMessage, bundleEntry, bundleSize, isBundleLoading]);

  const hintClassNames = useMemo(() => {
    const classes = ['desktop-download__hint'];
    if (installMessage) {
      classes.push('desktop-download__hint--error');
    }
    if (isActionPending) {
      classes.push('desktop-download__hint--pending');
    }
    return classes.join(' ');
  }, [installMessage, isActionPending]);

  return (
    <section className="desktop-download" aria-labelledby="desktop-download-title">
      <div className="desktop-download__header">
        <h2 id="desktop-download-title" className="desktop-download__title">
          Work offline from your desktop
        </h2>
        <p className="desktop-download__description">
          Install Schematics Studio as a desktop application tailored for {guide.label}. Once installed, the app automatically
          caches your boards for offline editing after you sign in while online.
        </p>
      </div>

      {isInstalled ? (
        <div className="desktop-download__status" role="status">
          <strong>Already installed.</strong> Launch the Schematics Studio app from your application launcher to work offline any
          time.
        </div>
      ) : (
        <div className="desktop-download__actions">
          <button
            type="button"
            className="desktop-download__button"
            onClick={handleInstall}
            disabled={!actionEnabled}
          >
            Install on {guide.label}
          </button>
          <p className={hintClassNames}>{hintMessages}</p>
          {bundleEntry && !isAutoInstall && bundleDownloadPath ? (
            <a className="desktop-download__manual-link" href={bundleDownloadPath} download={bundleEntry.fileName}>
              Download {bundleEntry.fileName}{bundleSize ? ` (${bundleSize})` : ''}
            </a>
          ) : null}
        </div>
      )}

      <div className="desktop-download__instructions" aria-live="polite">
        <h3 className="desktop-download__instructions-title">{guide.manualHeading}</h3>
        <ol className="desktop-download__steps">
          {guide.steps.map((step, index) => (
            <li key={index} className="desktop-download__step">
              {step}
            </li>
          ))}
        </ol>
        {bundleEntry && bundleDownloadPath ? (
          <p className="desktop-download__footnote">
            Prefer manual setup? <a href={bundleDownloadPath} download={bundleEntry.fileName}>Download the offline bundle</a>
            {bundleSize ? ` (${bundleSize})` : ''} and verify it with SHA-256 <code>{bundleEntry.sha256}</code>.
          </p>
        ) : (
          <p className="desktop-download__footnote">
            Need a packaged copy? Run <code>npm run build</code> to generate desktop-ready archives in <code>dist/downloads</code>.
          </p>
        )}
      </div>
    </section>
  );
};

export default DesktopDownloadSection;
