import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ConnectorModel } from '../types/scene';
import '../styles/connector-toolbar.css';

interface ConnectorTextToolbarProps {
  connector: ConnectorModel;
  anchor: { x: number; y: number } | null;
  viewportSize: { width: number; height: number };
  isVisible: boolean;
  onChange: (next: ConnectorModel['labelStyle']) => void;
}

const TOOLBAR_OFFSET = 12;

const DEFAULT_STYLE: Required<ConnectorModel['labelStyle']> = {
  fontSize: 14,
  fontWeight: 600,
  color: '#f8fafc',
  background: 'rgba(15,23,42,0.85)'
};

export const ConnectorTextToolbar: React.FC<ConnectorTextToolbarProps> = ({
  connector,
  anchor,
  viewportSize,
  isVisible,
  onChange
}) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<'top' | 'bottom'>('top');

  const labelStyle = { ...DEFAULT_STYLE, ...connector.labelStyle };

  useLayoutEffect(() => {
    if (!anchor || !isVisible || !toolbarRef.current) {
      return;
    }
    const element = toolbarRef.current;
    const height = element.offsetHeight;
    const topSpace = anchor.y - TOOLBAR_OFFSET - height;
    const bottomSpace = viewportSize.height - (anchor.y + TOOLBAR_OFFSET + height);
    if (placement === 'top' && topSpace < 8 && bottomSpace > topSpace) {
      setPlacement('bottom');
    } else if (placement === 'bottom' && bottomSpace < 8 && topSpace > bottomSpace) {
      setPlacement('top');
    }
  }, [anchor, isVisible, viewportSize.height, placement]);

  const style = useMemo(() => {
    if (!anchor) {
      return { opacity: 0 } as React.CSSProperties;
    }
    if (placement === 'top') {
      return {
        left: anchor.x,
        top: anchor.y - TOOLBAR_OFFSET,
        transform: 'translate(-50%, -100%)'
      } as React.CSSProperties;
    }
    return {
      left: anchor.x,
      top: anchor.y + TOOLBAR_OFFSET,
      transform: 'translate(-50%, 0)'
    } as React.CSSProperties;
  }, [anchor, placement]);

  if (!isVisible || !anchor) {
    return null;
  }

  const handleFontSizeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value)) {
      return;
    }
    const next = Math.max(8, Math.min(200, value));
    onChange({ ...labelStyle, fontSize: next });
  };

  const handleColorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...labelStyle, color: event.target.value });
  };

  const handleBackgroundChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...labelStyle, background: event.target.value });
  };

  const toggleBold = () => {
    const next = labelStyle.fontWeight >= 700 ? 600 : 700;
    onChange({ ...labelStyle, fontWeight: next });
  };

  return (
    <div ref={toolbarRef} className={`connector-toolbar connector-toolbar--${placement}`} style={style}>
      <div className="connector-toolbar__section">
        <label className="connector-toolbar__field">
          <span>Size</span>
          <input
            type="number"
            min={8}
            max={200}
            step={1}
            value={labelStyle.fontSize}
            onChange={handleFontSizeChange}
          />
        </label>
        <button
          type="button"
          className={`connector-toolbar__button${labelStyle.fontWeight >= 700 ? ' is-active' : ''}`}
          onClick={toggleBold}
        >
          Bold
        </button>
        <label className="connector-toolbar__field">
          <span>Text</span>
          <input type="color" value={labelStyle.color} onChange={handleColorChange} />
        </label>
        <label className="connector-toolbar__field">
          <span>Background</span>
          <input type="color" value={labelStyle.background} onChange={handleBackgroundChange} />
        </label>
      </div>
    </div>
  );
};
