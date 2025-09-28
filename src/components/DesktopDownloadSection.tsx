import React, { useCallback, useRef } from 'react';

const DESKTOP_ARCHIVE_PATH = 'desktop/schematics-studio.zip';

const resolveDesktopAssetHref = (relativePath: string): string => {
  const sanitizedPath = relativePath.replace(/^\/+/, '');
  const baseUrl = import.meta.env.BASE_URL ?? '/';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  if (typeof window === 'undefined') {
    return `${normalizedBase}${sanitizedPath}`;
  }

  const absoluteBase = new URL(normalizedBase, window.location.href);
  return new URL(sanitizedPath, absoluteBase).toString();
};

export const DesktopDownloadSection: React.FC = () => {
  const downloadLinkRef = useRef<HTMLAnchorElement | null>(null);

  const handleDownload = useCallback(() => {
    const anchor = downloadLinkRef.current;
    if (!anchor) {
      return;
    }

    const resolvedHref = resolveDesktopAssetHref(DESKTOP_ARCHIVE_PATH);
    anchor.href = resolvedHref;
    anchor.download = DESKTOP_ARCHIVE_PATH.split('/').pop() ?? 'schematics-studio.zip';
    anchor.rel = 'noopener noreferrer';
    anchor.click();
  }, []);

  return (
    <section className="desktop-download">
      <h2 className="desktop-download__title">Download the desktop app</h2>
      <p className="desktop-download__description">
        Get the latest Schematics Studio desktop build for offline editing.
      </p>
      <button type="button" className="desktop-download__button" onClick={handleDownload}>
        Download for desktop
      </button>
      <a ref={downloadLinkRef} className="desktop-download__link" href="#" hidden aria-hidden="true">
        Schematics Studio desktop download
      </a>
    </section>
  );
};

export default DesktopDownloadSection;
