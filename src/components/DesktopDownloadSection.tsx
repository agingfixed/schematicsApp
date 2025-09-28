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

const OS_GUIDES: Record<OperatingSystem, OsGuide> = {
  mac: {
    label: 'macOS',
    manualHeading: 'Install on macOS',
    steps: [
      'Open Schematics Studio in Safari or Chrome on your Mac.',
      "In Safari: choose File → Add to Dock to create an app icon that opens offline.",
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
    fallbackMessage: 'Use Chrome’s menu → Install app to add it to your Android device.'
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
      "Look for an install option in the browser address bar or menu (for Safari on macOS use File → Add to Dock).",
      'Confirm the prompt to finish installing the offline-ready app.'
    ],
    fallbackMessage:
      'Open the site in a modern browser such as Chrome, Edge, or Safari and use the browser’s install option to add the app.'
  }
};

const PACKAGE_FILENAMES: Partial<Record<OperatingSystem, string>> = {
  mac: 'schematics-studio-mac.tar.gz',
  windows: 'schematics-studio-windows.zip',
  linux: 'schematics-studio-linux.zip',
  chromeos: 'schematics-studio-desktop.zip',
  unknown: 'schematics-studio-desktop.zip'
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
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [packageAvailable, setPackageAvailable] = useState(false);
  const [isCheckingPackage, setIsCheckingPackage] = useState(false);

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
  const packageFilename = useMemo(() => {
    if (operatingSystem === 'ios' || operatingSystem === 'android') {
      return null;
    }
    return PACKAGE_FILENAMES[operatingSystem] ?? PACKAGE_FILENAMES.unknown ?? null;
  }, [operatingSystem]);

  useEffect(() => {
    setDownloadError(null);
  }, [operatingSystem, installPrompt]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!packageFilename) {
      setPackageAvailable(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setPackageAvailable(false);

    const checkAvailability = async () => {
      setIsCheckingPackage(true);
      try {
        const response = await fetch(`/downloads/${packageFilename}`, {
          method: 'HEAD',
          cache: 'no-store',
          signal: controller.signal
        });
        if (!cancelled) {
          setPackageAvailable(response.ok);
        }
      } catch (error) {
        if (!cancelled) {
          setPackageAvailable(false);
        }
      } finally {
        if (!cancelled) {
          setIsCheckingPackage(false);
        }
      }
    };

    checkAvailability();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [packageFilename]);

  const handleInstall = useCallback(async () => {
    if (isActionPending) {
      return;
    }

    setDownloadError(null);

    if (installPrompt) {
      try {
        setIsActionPending(true);
        await installPrompt.prompt();
        await installPrompt.userChoice;
        setInstallPrompt(null);
      } finally {
        setIsActionPending(false);
      }
      return;
    }

    if (!packageFilename || !packageAvailable) {
      setDownloadError('Automatic installation is not available in this browser. Follow the steps below to finish setup.');
      return;
    }

    try {
      setIsActionPending(true);
      const downloadUrl = `/downloads/${packageFilename}`;
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = packageFilename;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (error) {
      console.error('Offline package download failed', error);
      setDownloadError('We could not start the download. Use the manual steps below to install the app.');
    } finally {
      setIsActionPending(false);
    }
  }, [installPrompt, packageFilename, packageAvailable, isActionPending]);

  const actionEnabled = !isInstalled && !isActionPending && (Boolean(installPrompt) || packageAvailable);
  const isAutoInstall = Boolean(installPrompt);

  const hintMessages = useMemo(() => {
    if (downloadError) {
      return downloadError;
    }

    if (isActionPending && isAutoInstall) {
      return 'Waiting for your browser to confirm installation…';
    }

    if (isActionPending) {
      return 'Preparing your offline download package…';
    }

    if (isAutoInstall) {
      return 'Your browser will show an installation prompt. Accept it to add the app to your device.';
    }

    if (packageFilename && packageAvailable) {
      return 'We will download a ready-to-run offline bundle tailored for your desktop.';
    }

    if (isCheckingPackage) {
      return 'Checking for the latest offline bundle…';
    }

    return guide.fallbackMessage;
  }, [downloadError, isActionPending, isAutoInstall, packageFilename, packageAvailable, isCheckingPackage, guide.fallbackMessage]);

  const hintClassNames = useMemo(() => {
    const classes = ['desktop-download__hint'];
    if (downloadError) {
      classes.push('desktop-download__hint--error');
    }
    if (isActionPending) {
      classes.push('desktop-download__hint--pending');
    }
    return classes.join(' ');
  }, [downloadError, isActionPending]);

  return (
    <section className="desktop-download" aria-labelledby="desktop-download-title">
      <div className="desktop-download__header">
        <h2 id="desktop-download-title" className="desktop-download__title">
          Work offline from your desktop
        </h2>
        <p className="desktop-download__description">
          Install Schematics Studio as a desktop application tailored for {guide.label}. Once installed, the app
          automatically caches your boards for offline editing after you sign in while online.
        </p>
      </div>

      {isInstalled ? (
        <div className="desktop-download__status" role="status">
          <strong>Already installed.</strong> Launch the Schematics Studio app from your application launcher to work
          offline any time.
        </div>
      ) : (
        <div className="desktop-download__actions">
          <button
            type="button"
            className="desktop-download__button"
            onClick={handleInstall}
            disabled={!actionEnabled}
          >
            {isAutoInstall ? 'Install on ' : 'Download for '}
            {guide.label}
          </button>
          <p className={hintClassNames}>{hintMessages}</p>
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
        <p className="desktop-download__footnote">
          Need a packaged bundle instead? Run <code>npm run build</code> and grab the latest archives from
          <code>dist/downloads/</code> for direct sharing.
        </p>
      </div>
    </section>
  );
};

export default DesktopDownloadSection;
