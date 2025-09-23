export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export interface RGBAColor extends RGBColor {
  a?: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeHexComponent = (value: number) => {
  const clamped = clamp(Math.round(value), 0, 255);
  return clamped.toString(16).padStart(2, '0');
};

export const rgbToHex = ({ r, g, b }: RGBColor): string => {
  return `#${normalizeHexComponent(r)}${normalizeHexComponent(g)}${normalizeHexComponent(b)}`;
};

export const rgbaToCss = ({ r, g, b }: RGBColor, alpha = 1): string => {
  const normalizedAlpha = clamp(alpha, 0, 1);
  return `rgba(${Math.round(clamp(r, 0, 255))}, ${Math.round(clamp(g, 0, 255))}, ${Math.round(
    clamp(b, 0, 255)
  )}, ${Number(normalizedAlpha.toFixed(3))})`;
};

export const parseHexColor = (value: string): RGBAColor | null => {
  if (!value) {
    return null;
  }
  const hex = value.trim().replace(/^#/, '');
  if (hex.length === 3 || hex.length === 4) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : undefined;
    return { r, g, b, a };
  }
  if (hex.length === 6 || hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : undefined;
    return { r, g, b, a };
  }
  return null;
};

export const normalizeHexInput = (value: string): string | null => {
  if (!value) {
    return null;
  }
  const sanitized = value.trim().replace(/^#/, '');
  if (sanitized.length === 3 || sanitized.length === 4) {
    const expanded = sanitized
      .split('')
      .map((char) => char + char)
      .join('');
    return `#${expanded.slice(0, 6)}`;
  }
  if (sanitized.length === 6 || sanitized.length === 8) {
    return `#${sanitized.slice(0, 6)}`;
  }
  return null;
};

export const clamp01 = (value: number) => clamp(value, 0, 1);

export const cssColorToHex = (value: string): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.startsWith('#')) {
    return normalizeHexInput(trimmed);
  }
  const match = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (match) {
    const [, r, g, b] = match;
    return rgbToHex({ r: Number(r), g: Number(g), b: Number(b) });
  }
  return null;
};
