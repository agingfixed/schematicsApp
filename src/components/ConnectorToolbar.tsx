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
      </div>
    </div>
  );
};
