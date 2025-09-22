import React, { useMemo, useRef } from 'react';
import { ConnectorModel } from '../types/scene';
import { FloatingMenuChrome } from './FloatingMenuChrome';
import { useFloatingMenuDrag } from '../hooks/useFloatingMenuDrag';
import { computeFloatingMenuPlacement } from '../utils/floatingMenu';
import { useFrozenFloatingPlacement } from '../hooks/useFrozenFloatingPlacement';
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
  pointerPosition: { x: number; y: number } | null;
}

const TOOLBAR_OFFSET = 14;

const arrowOptions = [
  { value: 'none', label: 'None' },
  { value: 'triangle', label: 'Triangle (Inward)' },
  { value: 'arrow', label: 'Arrow' },
  { value: 'line-arrow', label: 'Line Arrow' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'circle', label: 'Circle' }
] as const;

const fillOptions = [
  { value: 'filled', label: 'Filled' },
  { value: 'outlined', label: 'Outlined' }
] as const;

const modeOptions = [
  { value: 'elbow', label: 'Elbow' },
  { value: 'straight', label: 'Straight' }
] as const;

const getLockedFillForShape = (
  shape: ConnectorModel['style']['startArrow']['shape']
): ConnectorModel['style']['startArrow']['fill'] | null => {
  if (shape === 'line-arrow') {
    return 'outlined';
  }
  if (shape === 'triangle' || shape === 'arrow') {
    return 'filled';
  }
  return null;
};

export const ConnectorToolbar: React.FC<ConnectorToolbarProps> = ({
  connector,
  anchor,
  viewportSize,
  isVisible,
  onStyleChange,
  onModeChange,
  onFlipDirection,
  onTidyPath,
  pointerPosition
}) => {
  const toolbarRef = useRef<HTMLDivElement>(null);

  const {
    menuState,
    isDragging,
    menuSize,
    handlePointerDown: handleDragPointerDown,
    handlePointerMove: handleDragPointerMove,
    handlePointerUp: handleDragPointerUp,
    handlePointerCancel: handleDragPointerCancel,
    moveBy: moveMenuBy,
    resetToAnchor
  } = useFloatingMenuDrag({
    menuType: 'connector-toolbar',
    menuRef: toolbarRef,
    viewportSize,
    isVisible: isVisible && Boolean(anchor)
  });

  const placementOptions = useMemo(() => ({ gap: TOOLBAR_OFFSET }), []);

  const { placement: anchoredPlacement, orientation } = useFrozenFloatingPlacement({
    anchor: anchor ? { x: anchor.x, y: anchor.y, width: 0, height: 0 } : null,
    menuState,
    menuSize,
    viewportSize,
    pointerPosition,
    options: placementOptions,
    isVisible: isVisible && Boolean(anchor),
    identity: connector.id
  });

  const style = useMemo(() => {
    if (!anchor) {
      return { opacity: 0 } as React.CSSProperties;
    }
    if (menuState.isFree && menuState.position) {
      return {
        left: 0,
        top: 0,
        transform: `translate3d(${menuState.position.x}px, ${menuState.position.y}px, 0)`
      } as React.CSSProperties;
    }
    const placementResult =
      anchoredPlacement ??
      computeFloatingMenuPlacement(
        { x: anchor.x, y: anchor.y, width: 0, height: 0 },
        menuSize ?? { width: 0, height: 0 },
        viewportSize,
        pointerPosition,
        placementOptions
      );

    return {
      left: 0,
      top: 0,
      transform: `translate3d(${placementResult.position.x}px, ${placementResult.position.y}px, 0)`
    } as React.CSSProperties;
  }, [
    anchor,
    anchoredPlacement,
    menuState.isFree,
    menuState.position,
    menuSize,
    viewportSize,
    pointerPosition,
    placementOptions
  ]);

  // Connectors avoid nodes by default; only an explicit `false` opts into
  // overlapping other shapes. Straight connectors ignore avoidance so that
  // their geometry remains a single segment.
  const isStraight = connector.mode === 'straight';
  const avoidNodesEnabled = !isStraight && connector.style.avoidNodes !== false;

  if (!isVisible || !anchor) {
    return null;
  }

  const startShape = connector.style.startArrow?.shape ?? 'none';
  const endShape = connector.style.endArrow?.shape ?? 'none';
  const startLockedFill = getLockedFillForShape(startShape);
  const endLockedFill = getLockedFillForShape(endShape);
  const startFillDisabled = startLockedFill !== null;
  const endFillDisabled = endLockedFill !== null;
  const startFillValue = startLockedFill ?? connector.style.startArrow?.fill ?? 'filled';
  const endFillValue = endLockedFill ?? connector.style.endArrow?.fill ?? 'filled';

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

  const handleAvoidNodesToggle = () => {
    if (isStraight) {
      return;
    }
    onStyleChange({ avoidNodes: !avoidNodesEnabled });
  };

  const handleArrowChange = (key: 'startArrow' | 'endArrow', shape: ConnectorModel['style']['startArrow']) => {
    onStyleChange({ [key]: shape } as Partial<ConnectorModel['style']>);
  };

  const handleArrowShapeChange = (key: 'startArrow' | 'endArrow') =>
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const shape = event.target.value as ConnectorModel['style']['startArrow']['shape'];
      const current = connector.style[key] ?? { shape: 'none', fill: 'filled' };
      const lockedFill = getLockedFillForShape(shape);
      const nextFill = lockedFill ?? current.fill ?? 'filled';
      handleArrowChange(key, { ...current, shape, fill: nextFill });
    };

  const handleArrowFillChange = (key: 'startArrow' | 'endArrow') =>
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const currentShape = connector.style[key]?.shape;
      if (currentShape && getLockedFillForShape(currentShape)) {
        return;
      }
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
      className={`connector-toolbar floating-menu connector-toolbar--${orientation}`}
      style={style}
      data-free={menuState.isFree || undefined}
      data-dragging={isDragging || undefined}
    >
      <FloatingMenuChrome
        title="Connector"
        isFree={menuState.isFree}
        isDragging={isDragging}
        onPointerDown={handleDragPointerDown}
        onPointerMove={handleDragPointerMove}
        onPointerUp={handleDragPointerUp}
        onPointerCancel={handleDragPointerCancel}
        onReset={resetToAnchor}
        onKeyboardMove={moveMenuBy}
      />
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
          <select value={startShape} onChange={handleArrowShapeChange('startArrow')}>
            {arrowOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="connector-toolbar__field">
          <span>Fill</span>
          <select
            value={startFillValue}
            onChange={handleArrowFillChange('startArrow')}
            disabled={startFillDisabled}
          >
            {fillOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="connector-toolbar__field">
          <span>End</span>
          <select value={endShape} onChange={handleArrowShapeChange('endArrow')}>
            {arrowOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="connector-toolbar__field">
          <span>Fill</span>
          <select
            value={endFillValue}
            onChange={handleArrowFillChange('endArrow')}
            disabled={endFillDisabled}
          >
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
        {connector.mode === 'elbow' && (
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
        <button
          type="button"
          className={`connector-toolbar__button${avoidNodesEnabled ? '' : ' is-active'}`}
          onClick={handleAvoidNodesToggle}
          aria-pressed={!avoidNodesEnabled}
          disabled={isStraight}
          title={
            isStraight ? 'Straight connectors always allow lines to pass behind nodes.' : undefined
          }
        >
          {/*
            The label reflects the current avoidance mode so users can tell at
            a glance whether connectors will hug nodes (Avoid On) or are
            allowed to pass beneath them (Avoid Off).
          */}
          {avoidNodesEnabled ? 'Avoid On' : 'Avoid Off'}
        </button>
        <button type="button" className="connector-toolbar__button" onClick={onTidyPath}>
          Tidy
        </button>
      </div>
    </div>
  );
};
