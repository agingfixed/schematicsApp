import { useEffect, useState } from 'react';

export type OperatingSystem =
  | 'mac'
  | 'windows'
  | 'linux'
  | 'ios'
  | 'android'
  | 'chromeos'
  | 'unknown';

const detectOperatingSystem = (): OperatingSystem => {
  if (typeof navigator === 'undefined') {
    return 'unknown';
  }

  const { userAgent, platform } = navigator;
  const normalized = userAgent.toLowerCase();
  const platformLower = (platform ?? '').toLowerCase();

  if (/iphone|ipad|ipod/.test(normalized)) {
    return 'ios';
  }

  if (/android/.test(normalized)) {
    return 'android';
  }

  if (/macintosh|macintel|macppc|mac68k/.test(platformLower) || /mac os x/.test(normalized)) {
    return 'mac';
  }

  if (/win32|win64|windows|wince/.test(platformLower) || /windows/.test(normalized)) {
    return 'windows';
  }

  if (/cros/.test(normalized)) {
    return 'chromeos';
  }

  if (/linux/.test(platformLower) || /linux/.test(normalized)) {
    return 'linux';
  }

  return 'unknown';
};

export const useOperatingSystem = (): OperatingSystem => {
  const [operatingSystem, setOperatingSystem] = useState<OperatingSystem>(() => detectOperatingSystem());

  useEffect(() => {
    setOperatingSystem(detectOperatingSystem());
  }, []);

  return operatingSystem;
};

export default useOperatingSystem;
