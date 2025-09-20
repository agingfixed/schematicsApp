import React, { useEffect, useMemo, useState } from 'react';
import { clamp01, normalizeHexInput, parseHexColor, rgbToHex, rgbaToCss, RGBColor } from '../utils/color';

const PRESET_COLORS = [
  '#0ea5e9',
  '#22d3ee',
  '#34d399',
  '#fbbf24',
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#a855f7',
  '#94a3b8',
  '#1f2937'
];

const clampByte = (value: number) => Math.min(255, Math.max(0, Math.round(value)));

interface ColorPickerProps {
  color: RGBColor;
  alpha: number;
  onChange: (color: RGBColor, alpha: number, options?: { commit?: boolean }) => void;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ color, alpha, onChange }) => {
  const [internalColor, setInternalColor] = useState<RGBColor>(color);
  const [alphaValue, setAlphaValue] = useState(clamp01(alpha));
  const [hexValue, setHexValue] = useState(rgbToHex(color));

  useEffect(() => {
    setInternalColor(color);
    setAlphaValue(clamp01(alpha));
    setHexValue(rgbToHex(color));
  }, [color, alpha]);

  const alphaPercent = Math.round(alphaValue * 100);

  const alphaGradient = useMemo(() => {
    return `linear-gradient(90deg, ${rgbaToCss(internalColor, 0)} 0%, ${rgbaToCss(
      internalColor,
      1
    )} 100%)`;
  }, [internalColor]);

  const handleChannelInput = (channel: keyof RGBColor) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = clampByte(Number(event.target.value));
    const nextColor = { ...internalColor, [channel]: nextValue };
    setInternalColor(nextColor);
    setHexValue(rgbToHex(nextColor));
    onChange(nextColor, alphaValue);
  };

  const handleChannelPointerDown = (event: React.PointerEvent<HTMLInputElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleChannelPointerUp = (event: React.PointerEvent<HTMLInputElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onChange(internalColor, alphaValue, { commit: true });
  };

  const handleAlphaInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = clamp01(Number(event.target.value) / 100);
    setAlphaValue(next);
    onChange(internalColor, next);
  };

  const handleAlphaPointerDown = (event: React.PointerEvent<HTMLInputElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleAlphaPointerUp = (event: React.PointerEvent<HTMLInputElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onChange(internalColor, alphaValue, { commit: true });
  };

  const handleHexBlur = () => {
    const normalized = normalizeHexInput(hexValue);
    if (!normalized) {
      setHexValue(rgbToHex(internalColor));
      return;
    }
    const parsed = parseHexColor(normalized);
    if (!parsed) {
      setHexValue(rgbToHex(internalColor));
      return;
    }
    const nextColor: RGBColor = { r: parsed.r, g: parsed.g, b: parsed.b };
    setInternalColor(nextColor);
    setHexValue(rgbToHex(nextColor));
    onChange(nextColor, alphaValue, { commit: true });
  };

  const handleHexKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleHexBlur();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setHexValue(rgbToHex(internalColor));
    }
  };

  const handlePresetClick = (preset: string) => {
    const parsed = parseHexColor(preset);
    if (!parsed) {
      return;
    }
    const nextColor: RGBColor = { r: parsed.r, g: parsed.g, b: parsed.b };
    setInternalColor(nextColor);
    setHexValue(rgbToHex(nextColor));
    onChange(nextColor, alphaValue, { commit: true });
  };

  const handleTransparentClick = () => {
    setAlphaValue(0);
    onChange(internalColor, 0, { commit: true });
  };

  return (
    <div className="color-picker">
      <div className="color-picker__preview">
        <div
          className="color-picker__preview-swatch"
          style={{ ['--color-picker-preview' as const]: rgbaToCss(internalColor, alphaValue) }}
        />
        <div className="color-picker__preview-meta">
          <span>{rgbaToCss(internalColor, alphaValue)}</span>
        </div>
      </div>
      <label className="color-picker__hex">
        <span>HEX</span>
        <input
          type="text"
          value={hexValue}
          onChange={(event) => setHexValue(event.target.value)}
          onBlur={handleHexBlur}
          onKeyDown={handleHexKeyDown}
        />
      </label>
      <div className="color-picker__sliders">
        {(['r', 'g', 'b'] as Array<keyof RGBColor>).map((channel) => (
          <div key={channel} className="color-picker__channel">
            <span className="color-picker__channel-label">{channel.toUpperCase()}</span>
            <input
              type="range"
              min={0}
              max={255}
              value={internalColor[channel]}
              onChange={handleChannelInput(channel)}
              onPointerDown={handleChannelPointerDown}
              onPointerUp={handleChannelPointerUp}
            />
            <span className="color-picker__value">{internalColor[channel]}</span>
          </div>
        ))}
        <div className="color-picker__channel color-picker__channel--alpha">
          <span className="color-picker__channel-label">Alpha</span>
          <input
            type="range"
            min={0}
            max={100}
            value={alphaPercent}
            onChange={handleAlphaInput}
            onPointerDown={handleAlphaPointerDown}
            onPointerUp={handleAlphaPointerUp}
            style={{ backgroundImage: alphaGradient }}
          />
          <span className="color-picker__value">{alphaPercent}%</span>
        </div>
      </div>
      <div className="color-picker__presets">
        {PRESET_COLORS.map((preset) => (
          <button
            key={preset}
            type="button"
            className="color-picker__preset"
            style={{ ['--color-picker-swatch' as const]: preset }}
            onClick={() => handlePresetClick(preset)}
            aria-label={`Use ${preset}`}
          />
        ))}
        <button
          type="button"
          className="color-picker__preset color-picker__preset--transparent"
          onClick={handleTransparentClick}
          aria-label="Set transparent"
        >
          0%
        </button>
      </div>
    </div>
  );
};
