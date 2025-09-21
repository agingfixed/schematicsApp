import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ConnectorModel } from '../types/scene';
import '../styles/connector-toolbar.css';

interface ConnectorToolbarProps {
  connector: ConnectorModel;
  anchor: { x: number; y: number } | null;
  viewportSize: { width: number; height: number };
  isVisible: boolean;
  onStyleChange: (patch: Partial<ConnectorModel['style']>) => void;
  onModeChange: (mode: ConnectorModel['mode']) => void;
  onFlipDirection: () => void;
  onTidyPath: () => void;
}

const TOOLBAR_OFFSET = 14;

const arrowOptions = [
  { value: 'none', label: 'None' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'circle', label: 'Circle' }
] as const;

const fillOptions = [
  { value: 'filled', label: 'Filled' },
  { value: 'outlined', label: 'Outlined' }
] as const;

const modeOptions = [
  { value: 'orthogonal', label: 'Elbow' },
  { value: 'straight', label: 'Straight' },
  { value: 'curved', label: 'Curved' }
] as const;

export const ConnectorToolbar: React.FC<ConnectorToolbarProps> = ({
  connector,
  anchor,
  viewportSize,
  isVisible,
  onStyleChange,
  onModeChange,
  onFlipDirection,
  onTidyPath
}) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<'top' | 'bottom'>('top');

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
  }, [anchor, viewportSize.height, placement, isVisible]);

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

  const handleStrokeWidthChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    if (Number.isFinite(value)) {
      onStyleChange({ strokeWidth: Math.max(0.5, Math.min(20, value)) });
    }
  };

  const handleColorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onStyleChange({ stroke: event.target.value });
  };

  const handleDashToggle = () => {
    onStyleChange({ dashed: !connector.style.dashed });
  };

  const handleArrowChange = (key: 'startArrow' | 'endArrow', shape: ConnectorModel['style']['startArrow']) => {
    onStyleChange({ [key]: shape } as Partial<ConnectorModel['style']>);
  };

  const handleArrowShapeChange = (key: 'startArrow' | 'endArrow') =>
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const shape = event.target.value as ConnectorModel['style']['startArrow']['shape'];
      const current = connector.style[key] ?? { shape: 'none', fill: 'filled' };
      handleArrowChange(key, { ...current, shape });
    };

  const handleArrowFillChange = (key: 'startArrow' | 'endArrow') =>
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const fill = event.target.value as ConnectorModel['style']['startArrow']['fill'];
      const current = connector.style[key] ?? { shape: 'none', fill: 'filled' };
      handleArrowChange(key, { ...current, fill });
    };

  const handleArrowSizeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    if (Number.isFinite(value)) {
      onStyleChange({ arrowSize: Math.max(0.5, Math.min(4, value)) });
    }
  };

  const handleCornerRadiusChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    if (Number.isFinite(value)) {
      onStyleChange({ cornerRadius: Math.max(0, Math.min(80, value)) });
    }
  };

  return (
    <div
      ref={toolbarRef}
      className={`connector-toolbar connector-toolbar--${placement}`}
      style={style}
    >
      <div className="connector-toolbar__section">
        <label className="connector-toolbar__field">
          <span>Stroke</span>
          <input
            type="number"
            min={0.5}
            max={20}
            step={0.5}
            value={connector.style.strokeWidth}
            onChange={handleStrokeWidthChange}
          />
        </label>
        <label className="connector-toolbar__field">
          <span>Color</span>
          <input type="color" value={connector.style.stroke} onChange={handleColorChange} />
        </label>
        <button
          type="button"
          className={`connector-toolbar__button${connector.style.dashed ? ' is-active' : ''}`}
          onClick={handleDashToggle}
        >
          {connector.style.dashed ? 'Dashed' : 'Solid'}
        </button>
      </div>
      <div className="connector-toolbar__section">
        <label className="connector-toolbar__field">
          <span>Start</span>
          <select value={connector.style.startArrow?.shape ?? 'none'} onChange={handleArrowShapeChange('startArrow')}>
            {arrowOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="connector-toolbar__field">
          <span>Fill</span>
          <select value={connector.style.startArrow?.fill ?? 'filled'} onChange={handleArrowFillChange('startArrow')}>
            {fillOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="connector-toolbar__field">
          <span>End</span>
          <select value={connector.style.endArrow?.shape ?? 'none'} onChange={handleArrowShapeChange('endArrow')}>
            {arrowOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="connector-toolbar__field">
          <span>Fill</span>
          <select value={connector.style.endArrow?.fill ?? 'filled'} onChange={handleArrowFillChange('endArrow')}>
            {fillOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="connector-toolbar__section">
        <label className="connector-toolbar__field">
          <span>Arrow size</span>
          <input
            type="range"
            min={0.5}
            max={4}
            step={0.1}
            value={connector.style.arrowSize ?? 1}
            onChange={handleArrowSizeChange}
          />
        </label>
        <label className="connector-toolbar__field">
          <span>Mode</span>
          <select value={connector.mode} onChange={(event) => onModeChange(event.target.value as ConnectorModel['mode'])}>
            {modeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {connector.mode === 'orthogonal' && (
          <label className="connector-toolbar__field">
            <span>Corner</span>
            <input
              type="range"
              min={0}
              max={80}
              step={1}
              value={connector.style.cornerRadius ?? 12}
              onChange={handleCornerRadiusChange}
            />
          </label>
        )}
      </div>
      <div className="connector-toolbar__section connector-toolbar__section--actions">
        <button type="button" className="connector-toolbar__button" onClick={onFlipDirection}>
          Flip
        </button>
        <button type="button" className="connector-toolbar__button" onClick={onTidyPath}>
          Tidy
        </button>
      </div>
    </div>
  );
};
