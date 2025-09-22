import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { ConnectorModel } from '../types/scene';
import { FloatingMenuChrome } from './FloatingMenuChrome';
import { useFloatingMenuDrag } from '../hooks/useFloatingMenuDrag';
import { computeFloatingMenuPlacement } from '../utils/floatingMenu';
import { useFrozenFloatingPlacement } from '../hooks/useFrozenFloatingPlacement';
import '../styles/connector-toolbar.css';

interface ConnectorTextToolbarProps {
  connector: ConnectorModel;
  anchor: { x: number; y: number } | null;
  viewportSize: { width: number; height: number };
  isVisible: boolean;
  onChange: (next: ConnectorModel['labelStyle']) => void;
  pointerPosition: { x: number; y: number } | null;
  onPointerInteractionChange?: (active: boolean) => void;
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
  onChange,
  pointerPosition,
  onPointerInteractionChange
}) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const pointerInteractionCleanupRef = useRef<(() => void) | null>(null);

  const labelStyle = { ...DEFAULT_STYLE, ...connector.labelStyle };

  const handleToolbarPointerDownCapture = useCallback(() => {
    if (!onPointerInteractionChange) {
      return;
    }
    onPointerInteractionChange(true);
    if (pointerInteractionCleanupRef.current) {
      pointerInteractionCleanupRef.current();
      pointerInteractionCleanupRef.current = null;
    }
    const handlePointerUp = () => {
      onPointerInteractionChange(false);
      document.removeEventListener('pointerup', handlePointerUp, true);
      document.removeEventListener('pointercancel', handlePointerUp, true);
      pointerInteractionCleanupRef.current = null;
    };
    document.addEventListener('pointerup', handlePointerUp, true);
    document.addEventListener('pointercancel', handlePointerUp, true);
    pointerInteractionCleanupRef.current = () => {
      document.removeEventListener('pointerup', handlePointerUp, true);
      document.removeEventListener('pointercancel', handlePointerUp, true);
    };
  }, [onPointerInteractionChange]);

  useEffect(() => () => {
    if (pointerInteractionCleanupRef.current) {
      pointerInteractionCleanupRef.current();
      pointerInteractionCleanupRef.current = null;
    }
    onPointerInteractionChange?.(false);
  }, [onPointerInteractionChange]);

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
    menuType: 'connector-label-toolbar',
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
    <div
      ref={toolbarRef}
      className={`connector-toolbar floating-menu connector-toolbar--${orientation}`}
      style={style}
      data-free={menuState.isFree || undefined}
      data-dragging={isDragging || undefined}
      onPointerDownCapture={handleToolbarPointerDownCapture}
    >
      <FloatingMenuChrome
        title="Connector label"
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
