export const resolveStaticAssetHref = (relativePath: string): string => {
  const sanitizedPath = relativePath.replace(/^\/+/, '');
  const baseUrl = import.meta.env.BASE_URL ?? '/';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  if (typeof window === 'undefined') {
    return `${normalizedBase}${sanitizedPath}`;
  }

  const absoluteBase = new URL(normalizedBase, window.location.href);
  return new URL(sanitizedPath, absoluteBase).toString();
};
