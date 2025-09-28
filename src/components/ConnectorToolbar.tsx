import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConnectorEndpointShape, ConnectorModel } from '../types/scene';
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
const CAP_SIZE_MIN = 6;
const CAP_SIZE_MAX = 52;
const DEFAULT_CAP_SIZE = 14;
const CAP_OPTIONS: Array<{ value: ConnectorEndpointShape; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'arrow', label: 'Arrow' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'open-arrow', label: 'Arrow (outline)' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'circle', label: 'Circle' }
];

const clampCapSize = (value: number) => Math.max(CAP_SIZE_MIN, Math.min(CAP_SIZE_MAX, value));

export const ConnectorToolbar: React.FC<ConnectorToolbarProps> = ({
  connector,
  anchor,
  viewportSize,
  isVisible,
  onStyleChange,
  pointerPosition
}) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [activeEndpoint, setActiveEndpoint] = useState<'start' | 'end' | null>(null);

  const startCap = useMemo(() => {
    const cap = connector.style.startCap;
    return {
      shape: cap?.shape ?? 'none',
      size: clampCapSize(typeof cap?.size === 'number' ? cap.size : DEFAULT_CAP_SIZE)
    };
  }, [connector.style.startCap]);

  const endCap = useMemo(() => {
    const cap = connector.style.endCap;
    return {
      shape: cap?.shape ?? 'none',
      size: clampCapSize(typeof cap?.size === 'number' ? cap.size : DEFAULT_CAP_SIZE)
    };
  }, [connector.style.endCap]);

  useEffect(() => {
    if (!isVisible || !anchor) {
      setActiveEndpoint(null);
    }
  }, [isVisible, anchor]);

  useEffect(() => {
    const body = document.body;
    if (!body) {
      return () => undefined;
    }
    if (activeEndpoint) {
      body.dataset.connectorCapFocus = activeEndpoint;
    } else {
      delete body.dataset.connectorCapFocus;
    }
    return () => {
      delete body.dataset.connectorCapFocus;
    };
  }, [activeEndpoint]);

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

  const updateCap = useCallback(
    (endpoint: 'start' | 'end', cap: { shape: ConnectorEndpointShape; size: number }) => {
      if (endpoint === 'start') {
        onStyleChange({ startCap: { ...cap } });
      } else {
        onStyleChange({ endCap: { ...cap } });
      }
    },
    [onStyleChange]
  );

  const handleCapShapeChange = useCallback(
    (endpoint: 'start' | 'end') => (event: React.ChangeEvent<HTMLSelectElement>) => {
      const shape = event.target.value as ConnectorEndpointShape;
      const current = endpoint === 'start' ? startCap : endCap;
      updateCap(endpoint, { ...current, shape });
      setActiveEndpoint(endpoint);
    },
    [endCap, startCap, updateCap]
  );

  const handleCapSizeChange = useCallback(
    (endpoint: 'start' | 'end') => (event: React.ChangeEvent<HTMLInputElement>) => {
      const size = clampCapSize(Number(event.target.value));
      const current = endpoint === 'start' ? startCap : endCap;
      updateCap(endpoint, { ...current, size });
      setActiveEndpoint(endpoint);
    },
    [endCap, startCap, updateCap]
  );

  const handleCapGroupBlur = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      const nextFocus = event.relatedTarget as HTMLElement | null;
      if (!event.currentTarget.contains(nextFocus)) {
        setActiveEndpoint(null);
      }
    },
    [setActiveEndpoint]
  );

  const handleCapGroupMouseLeave = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const activeElement = document.activeElement as HTMLElement | null;
      if (!activeElement || !event.currentTarget.contains(activeElement)) {
        setActiveEndpoint(null);
      }
    },
    [setActiveEndpoint]
  );

  const handleCapGroupFocus = useCallback(
    (endpoint: 'start' | 'end') => () => {
      setActiveEndpoint(endpoint);
    },
    [setActiveEndpoint]
  );

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
        <section className="connector-toolbar__panel connector-toolbar__panel--caps">
          <h3 className="connector-toolbar__panel-title">End caps</h3>
          <div className="connector-toolbar__caps">
            <div
              className="connector-toolbar__cap-group"
              data-endpoint="start"
              data-active={activeEndpoint === 'start' || undefined}
              onFocusCapture={handleCapGroupFocus('start')}
              onBlurCapture={handleCapGroupBlur}
              onMouseEnter={handleCapGroupFocus('start')}
              onMouseLeave={handleCapGroupMouseLeave}
            >
              <div className="connector-toolbar__cap-heading">
                <span className="connector-toolbar__cap-icon connector-toolbar__cap-icon--start" aria-hidden="true">
                  ●▶
                </span>
                <div className="connector-toolbar__cap-text">
                  <span>Start</span>
                  <small>Source side</small>
                </div>
              </div>
              <label className="connector-toolbar__field connector-toolbar__field--block">
                <span>Shape</span>
                <select value={startCap.shape} onChange={handleCapShapeChange('start')}>
                  {CAP_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="connector-toolbar__field connector-toolbar__field--block connector-toolbar__field--slider">
                <span>
                  Size
                  <strong>{startCap.size}px</strong>
                </span>
                <input
                  type="range"
                  min={CAP_SIZE_MIN}
                  max={CAP_SIZE_MAX}
                  step={1}
                  value={startCap.size}
                  onChange={handleCapSizeChange('start')}
                />
              </label>
            </div>
            <div
              className="connector-toolbar__cap-group"
              data-endpoint="end"
              data-active={activeEndpoint === 'end' || undefined}
              onFocusCapture={handleCapGroupFocus('end')}
              onBlurCapture={handleCapGroupBlur}
              onMouseEnter={handleCapGroupFocus('end')}
              onMouseLeave={handleCapGroupMouseLeave}
            >
              <div className="connector-toolbar__cap-heading">
                <span className="connector-toolbar__cap-icon connector-toolbar__cap-icon--end" aria-hidden="true">
                  ▶●
                </span>
                <div className="connector-toolbar__cap-text">
                  <span>End</span>
                  <small>Target side</small>
                </div>
              </div>
              <label className="connector-toolbar__field connector-toolbar__field--block">
                <span>Shape</span>
                <select value={endCap.shape} onChange={handleCapShapeChange('end')}>
                  {CAP_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="connector-toolbar__field connector-toolbar__field--block connector-toolbar__field--slider">
                <span>
                  Size
                  <strong>{endCap.size}px</strong>
                </span>
                <input
                  type="range"
                  min={CAP_SIZE_MIN}
                  max={CAP_SIZE_MAX}
                  step={1}
                  value={endCap.size}
                  onChange={handleCapSizeChange('end')}
                />
              </label>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
