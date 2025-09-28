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
  pointerPosition: { x: number; y: number } | null;
}

const TOOLBAR_OFFSET = 14;

const arrowOptions = [
  { value: 'none', label: 'None' },
  { value: 'arrow', label: 'Arrow' },
  { value: 'triangle-inward', label: 'Triangle (Inward)' },
  { value: 'line-arrow', label: 'Line Arrow' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'circle', label: 'Circle' }
] as const;

const fillOptions = [
  { value: 'filled', label: 'Filled' },
  { value: 'outlined', label: 'Outlined' }
] as const;

const getLockedFillForShape = (
  shape: ConnectorModel['style']['startArrow']['shape']
): ConnectorModel['style']['startArrow']['fill'] | null => {
  if (shape === 'line-arrow') {
    return 'outlined';
  }
  if (shape === 'arrow') {
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
    moveBy: moveMenuBy
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

  if (!isVisible || !anchor) {
    return null;
  }

  const startShape = connector.style.startArrow?.shape ?? 'none';
  const startLockedFill = getLockedFillForShape(startShape);
  const startFillDisabled = startLockedFill !== null;
  const startFillValue = startLockedFill ?? connector.style.startArrow?.fill ?? 'filled';
  const endShape = connector.style.endArrow?.shape ?? 'none';
  const endLockedFill = getLockedFillForShape(endShape);
  const endFillDisabled = endLockedFill !== null;
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

  const handleStartArrowChange = (arrowStyle: ConnectorModel['style']['startArrow']) => {
    onStyleChange({ startArrow: arrowStyle });
  };

  const handleEndArrowChange = (arrowStyle: ConnectorModel['style']['endArrow']) => {
    onStyleChange({ endArrow: arrowStyle });
  };

  const handleStartArrowShapeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const shape = event.target.value as ConnectorModel['style']['startArrow']['shape'];
    const current = connector.style.startArrow ?? { shape: 'none', fill: 'filled' };
    const lockedFill = getLockedFillForShape(shape);
    const nextFill = lockedFill ?? current.fill ?? 'filled';
    handleStartArrowChange({ ...current, shape, fill: nextFill });
  };

  const handleEndArrowShapeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const shape = event.target.value as ConnectorModel['style']['endArrow']['shape'];
    const current = connector.style.endArrow ?? { shape: 'none', fill: 'filled' };
    const lockedFill = getLockedFillForShape(shape);
    const nextFill = lockedFill ?? current.fill ?? 'filled';
    handleEndArrowChange({ ...current, shape, fill: nextFill });
  };

  const handleStartArrowFillChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const currentShape = connector.style.startArrow?.shape;
    if (currentShape && getLockedFillForShape(currentShape)) {
      return;
    }
    const fill = event.target.value as ConnectorModel['style']['startArrow']['fill'];
    const current = connector.style.startArrow ?? { shape: 'none', fill: 'filled' };
    handleStartArrowChange({ ...current, fill });
  };

  const handleEndArrowFillChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const currentShape = connector.style.endArrow?.shape;
    if (currentShape && getLockedFillForShape(currentShape)) {
      return;
    }
    const fill = event.target.value as ConnectorModel['style']['endArrow']['fill'];
    const current = connector.style.endArrow ?? { shape: 'none', fill: 'filled' };
    handleEndArrowChange({ ...current, fill });
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
        onKeyboardMove={moveMenuBy}
      />
      <div className="connector-toolbar__content">
        <section className="connector-toolbar__panel connector-toolbar__panel--stroke">
          <h3 className="connector-toolbar__panel-title">Stroke</h3>
          <div className="connector-toolbar__section">
            <label className="connector-toolbar__field">
              <span>Width</span>
              <input
                type="number"
                min={0.5}
                max={20}
                step={0.5}
                value={connector.style.strokeWidth}
                onChange={handleStrokeWidthChange}
              />
            </label>
            <label className="connector-toolbar__field connector-toolbar__field--color">
              <span>Color</span>
              <input type="color" value={connector.style.stroke} onChange={handleColorChange} />
            </label>
            <button
              type="button"
              className={`connector-toolbar__button connector-toolbar__button--toggle${
                connector.style.dashed ? ' is-active' : ''
              }`}
              onClick={handleDashToggle}
            >
              {connector.style.dashed ? 'Dashed' : 'Solid'}
            </button>
            <label className="connector-toolbar__field connector-toolbar__field--block">
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
          </div>
        </section>
        <section className="connector-toolbar__panel connector-toolbar__panel--arrows">
          <h3 className="connector-toolbar__panel-title">Arrows</h3>
          <div className="connector-toolbar__section connector-toolbar__section--geometry">
            <label className="connector-toolbar__field connector-toolbar__field--block">
              <span>Size</span>
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
              <span>Start Shape</span>
              <select value={startShape} onChange={handleStartArrowShapeChange}>
                {arrowOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="connector-toolbar__field">
              <span>Start Fill</span>
              <select
                value={startFillValue}
                onChange={handleStartArrowFillChange}
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
              <span>End Shape</span>
              <select value={endShape} onChange={handleEndArrowShapeChange}>
                {arrowOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="connector-toolbar__field">
              <span>End Fill</span>
              <select
                value={endFillValue}
                onChange={handleEndArrowFillChange}
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
        </section>
      </div>
    </div>
  );
};
