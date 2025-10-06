import React, { useMemo } from 'react';
import { DrawSettings, selectDrawSettings, useDrawStore } from '../state/drawStore';
import { selectTool, useSceneStore } from '../state/sceneStore';
import '../styles/draw-menu.css';

declare global {
  interface Window {
    EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
  }
}

type PenOption = {
  id: DrawSettings['style'];
  label: string;
  icon: string;
  description: string;
};

const PEN_STYLES: PenOption[] = [
  { id: 'pen', label: 'Pen', icon: '✏️', description: 'Smooth ink lines' },
  { id: 'marker', label: 'Marker', icon: '🖊️', description: 'Bold marker strokes' },
  { id: 'highlighter', label: 'Highlighter', icon: '🖍️', description: 'Translucent highlight' }
];

const SIZE_OPTIONS = [2, 4, 6, 10, 16];

const COLOR_OPTIONS = [
  '#f8fafc',
  '#e2e8f0',
  '#0f172a',
  '#ef4444',
  '#f97316',
  '#facc15',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#a855f7'
];

const DropperIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="draw-menu__dropper-icon" aria-hidden>
    <path
      d="M7.5 3.5 6 5l4.2 4.2-6.1 6.1c-.6.6-.9 1.4-.9 2.2v1.3c0 .7.6 1.2 1.2 1.2H6.7c.8 0 1.6-.3 2.2-.9l6.1-6.1L19.2 18l1.5-1.5-3.6-3.6 1.4-1.4c1.1-1.1 1.1-2.9 0-4l-3.6-3.6c-1.1-1.1-2.9-1.1-4 0l-1.4 1.4Z"
      fill="currentColor"
    />
  </svg>
);

export const DrawMenu: React.FC = () => {
  const settings = useDrawStore(selectDrawSettings);
  const setStyle = useDrawStore((state) => state.setStyle);
  const setSize = useDrawStore((state) => state.setSize);
  const setColor = useDrawStore((state) => state.setColor);
  const setMode = useDrawStore((state) => state.setMode);
  const tool = useSceneStore(selectTool);
  const setTool = useSceneStore((state) => state.setTool);

  const isEraserMode = settings.mode === 'erase';
  const sizeLabel = isEraserMode ? 'Eraser size' : 'Line weight';

  const eyeDropperSupported = useMemo(
    () => typeof window !== 'undefined' && Boolean(window.EyeDropper),
    []
  );

  const handleToolToggle = () => {
    setTool(tool === 'draw' ? 'select' : 'draw');
  };

  const handleStyleChange = (style: typeof settings.style) => {
    setMode('draw');
    setStyle(style);
    setTool('draw');
  };

  const handleSizeChange = (size: number) => {
    setSize(size);
    if (!isEraserMode) {
      setTool('draw');
    }
  };

  const handleColorChange = (value: string) => {
    setMode('draw');
    setColor(value);
    setTool('draw');
  };

  const handleModeChange = (mode: DrawSettings['mode']) => {
    setMode(mode);
    if (tool !== 'draw') {
      setTool('draw');
    }
  };

  const handleDropperClick = async () => {
    if (!eyeDropperSupported || !window.EyeDropper) {
      return;
    }
    try {
      const eyeDropper = new window.EyeDropper();
      const { sRGBHex } = await eyeDropper.open();
      setMode('draw');
      setColor(sRGBHex);
      setTool('draw');
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') {
        return;
      }
      console.error('EyeDropper failed', error);
    }
  };

  return (
    <aside className="draw-menu" aria-label="Draw settings">
      <button
        type="button"
        className={`draw-menu__tool ${tool === 'draw' ? 'is-active' : ''}`}
        onClick={handleToolToggle}
        aria-pressed={tool === 'draw'}
      >
        <span className="draw-menu__tool-icon" aria-hidden>
          🖌️
        </span>
        <span className="draw-menu__tool-text">
          <span className="draw-menu__tool-title">Draw</span>
          <span className="draw-menu__tool-subtitle">Freehand sketch on top</span>
        </span>
      </button>

      <div className="draw-menu__section">
        <span className="draw-menu__label">Mode</span>
        <div className="draw-menu__modes">
          <button
            type="button"
            className={`draw-menu__mode-button ${isEraserMode ? '' : 'is-active'}`}
            onClick={() => handleModeChange('draw')}
            aria-pressed={!isEraserMode}
          >
            <span className="draw-menu__mode-icon" aria-hidden>
              🖌️
            </span>
            <span className="draw-menu__mode-text">Draw</span>
          </button>
          <button
            type="button"
            className={`draw-menu__mode-button ${isEraserMode ? 'is-active' : ''}`}
            onClick={() => handleModeChange('erase')}
            aria-pressed={isEraserMode}
          >
            <span className="draw-menu__mode-icon" aria-hidden>
              🧽
            </span>
            <span className="draw-menu__mode-text">Erase</span>
          </button>
        </div>
      </div>

      {!isEraserMode && (
        <div className="draw-menu__section">
          <span className="draw-menu__label">Pen style</span>
          <div className="draw-menu__chips">
            {PEN_STYLES.map((style) => (
              <button
                key={style.id}
                type="button"
                className={`draw-menu__chip ${settings.style === style.id ? 'is-active' : ''}`}
                onClick={() => handleStyleChange(style.id)}
                aria-pressed={settings.style === style.id}
              >
                <span className="draw-menu__chip-icon" aria-hidden>
                  {style.icon}
                </span>
                <span className="draw-menu__chip-text">
                  <span className="draw-menu__chip-label">{style.label}</span>
                  <span className="draw-menu__chip-description">{style.description}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="draw-menu__section">
        <span className="draw-menu__label">{sizeLabel}</span>
        <div className="draw-menu__sizes">
          {SIZE_OPTIONS.map((size) => (
            <button
              key={size}
              type="button"
              className={`draw-menu__size ${settings.size === size ? 'is-active' : ''}`}
              onClick={() => handleSizeChange(size)}
              aria-pressed={settings.size === size}
              style={isEraserMode ? undefined : { color: settings.color }}
            >
              <span
                className="draw-menu__size-dot"
                style={{ width: size, height: size }}
                aria-hidden
              />
              <span className="sr-only">
                {isEraserMode ? `Erase with ${size}px brush` : `Draw with ${size}px line`}
              </span>
            </button>
          ))}
        </div>
      </div>

      {!isEraserMode && (
        <div className="draw-menu__section">
          <span className="draw-menu__label">Color</span>
          <div className="draw-menu__current">
            <span className="draw-menu__current-swatch" style={{ backgroundColor: settings.color }} />
            <span className="draw-menu__current-value">{settings.color.toUpperCase()}</span>
          </div>
          <div className="draw-menu__colors">
            {COLOR_OPTIONS.map((color) => (
              <button
                key={color}
                type="button"
                className={`draw-menu__color ${settings.color.toLowerCase() === color.toLowerCase() ? 'is-active' : ''}`}
                style={{ backgroundColor: color }}
                aria-label={`Use ${color} ink`}
                onClick={() => handleColorChange(color)}
              />
            ))}
            <button
              type="button"
              className="draw-menu__color draw-menu__color--dropper"
              onClick={handleDropperClick}
              disabled={!eyeDropperSupported}
              aria-label={
                eyeDropperSupported ? 'Pick color from screen' : 'Eye dropper not supported'
              }
              title={
                eyeDropperSupported
                  ? 'Pick color from screen'
                  : 'Eye dropper not supported in this browser'
              }
            >
              <DropperIcon />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};

export default DrawMenu;
