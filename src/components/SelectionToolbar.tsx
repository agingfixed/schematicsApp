import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { NodeModel, NodeKind, TextAlign } from '../types/scene';
import { useCommands } from '../state/commands';
import { useSceneStore } from '../state/sceneStore';
import { ColorPicker } from './ColorPicker';
import { FloatingMenuChrome } from './FloatingMenuChrome';
import { useFloatingMenuDrag } from '../hooks/useFloatingMenuDrag';
import { clamp01, parseHexColor, rgbaToCss, rgbToHex, RGBColor } from '../utils/color';
import '../styles/selection-toolbar.css';

const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 200;
const STROKE_MIN = 0;
const STROKE_MAX = 20;
const TOOLBAR_GAP = 12;

const shapeOptions: Array<{ value: NodeKind; label: string }> = [
  { value: 'rectangle', label: 'Rect' },
  { value: 'rounded-rectangle', label: 'Round' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'diamond', label: 'Diamond' }
];

const alignOptions: Array<{ value: TextAlign; label: string; icon: string }> = [
  { value: 'left', label: 'Align left', icon: 'L' },
  { value: 'center', label: 'Align center', icon: 'C' },
  { value: 'right', label: 'Align right', icon: 'R' }
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const ensureProtocol = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

const isValidHttpUrl = (value: string) => {
  if (!value) {
    return true;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (error) {
    return false;
  }
};

export interface SelectionToolbarProps {
  node: NodeModel;
  nodeIds: string[];
  anchor: { x: number; y: number; width: number; height: number } | null;
  viewportSize: { width: number; height: number };
  isVisible: boolean;
  focusLinkSignal: number;
}

export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({
  node,
  nodeIds,
  anchor,
  viewportSize,
  isVisible,
  focusLinkSignal
}) => {
  const commands = useCommands();
  const beginTransaction = useSceneStore((state) => state.beginTransaction);
  const endTransaction = useSceneStore((state) => state.endTransaction);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const fillButtonRef = useRef<HTMLButtonElement>(null);
  const fillPopoverRef = useRef<HTMLDivElement>(null);
  const linkButtonRef = useRef<HTMLButtonElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const linkPopoverRef = useRef<HTMLDivElement>(null);
  const previousFocusSignalRef = useRef(focusLinkSignal);
  const fillInteractionRef = useRef(false);

  const [placement, setPlacement] = useState<'top' | 'bottom'>('top');
  const [fontSizeValue, setFontSizeValue] = useState(node.fontSize.toString());
  const [strokeWidthValue, setStrokeWidthValue] = useState(node.stroke.width.toString());
  const [fillOpen, setFillOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState(node.link?.url ?? '');
  const [linkError, setLinkError] = useState<string | null>(null);

  const {
    menuState,
    isDragging,
    handlePointerDown: handleDragPointerDown,
    handlePointerMove: handleDragPointerMove,
    handlePointerUp: handleDragPointerUp,
    handlePointerCancel: handleDragPointerCancel,
    moveBy: moveMenuBy,
    resetToAnchor
  } = useFloatingMenuDrag({
    menuType: 'selection-toolbar',
    menuRef: toolbarRef,
    viewportSize,
    isVisible: isVisible && Boolean(anchor)
  });

  const hasText = node.text.trim().length > 0;
  const isBold = node.fontWeight >= 700;
  const fillColor = useMemo<RGBColor>(() => {
    const parsed = parseHexColor(node.fill);
    if (parsed) {
      return { r: parsed.r, g: parsed.g, b: parsed.b };
    }
    return { r: 31, g: 41, b: 55 };
  }, [node.fill]);
  const fillOpacity = useMemo(() => clamp01(node.fillOpacity ?? 1), [node.fillOpacity]);
  const fillPreview = useMemo(() => rgbaToCss(fillColor, fillOpacity), [fillColor, fillOpacity]);
  const fillTitle = useMemo(
    () => `Fill color (${Math.round(fillOpacity * 100)}% opacity)`,
    [fillOpacity]
  );

  const startFillInteraction = useCallback(() => {
    if (!fillInteractionRef.current) {
      beginTransaction();
      fillInteractionRef.current = true;
    }
  }, [beginTransaction]);

  const finishFillInteraction = useCallback(() => {
    if (fillInteractionRef.current) {
      endTransaction();
      fillInteractionRef.current = false;
    }
  }, [endTransaction]);

  const handleFillChange = useCallback(
    (nextColor: RGBColor, alpha: number, options?: { commit?: boolean }) => {
      startFillInteraction();
      const hex = rgbToHex(nextColor);
      const opacity = clamp01(alpha);
      commands.applyStyles(nodeIds, { fill: hex, fillOpacity: opacity });
      if (options?.commit) {
        finishFillInteraction();
      }
    },
    [commands, nodeIds, startFillInteraction, finishFillInteraction]
  );

  useEffect(() => {
    setFontSizeValue(node.fontSize.toString());
  }, [node.fontSize]);

  useEffect(() => {
    setStrokeWidthValue(node.stroke.width.toString());
  }, [node.stroke.width]);

  useEffect(() => {
    setFillOpen(false);
  }, [node.id]);

  useEffect(() => () => finishFillInteraction(), [finishFillInteraction]);

  useEffect(() => {
    if (!fillOpen) {
      finishFillInteraction();
    }
  }, [fillOpen, finishFillInteraction]);

  useEffect(() => {
    if (linkOpen) {
      setLinkDraft(node.link?.url ?? '');
      setLinkError(null);
    }
  }, [linkOpen, node.link?.url]);

  useEffect(() => {
    if (!isVisible) {
      setFillOpen(false);
      setLinkOpen(false);
      setLinkError(null);
      finishFillInteraction();
    }
  }, [isVisible, finishFillInteraction]);

  useEffect(() => {
    if (focusLinkSignal !== previousFocusSignalRef.current) {
      previousFocusSignalRef.current = focusLinkSignal;
      if (isVisible) {
        setLinkOpen(true);
      }
    }
  }, [focusLinkSignal, isVisible]);

  useEffect(() => {
    if (!linkOpen) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      linkInputRef.current?.focus();
      linkInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [linkOpen]);

  useEffect(() => {
    if (!linkOpen) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        linkPopoverRef.current &&
        !linkPopoverRef.current.contains(target) &&
        linkButtonRef.current &&
        !linkButtonRef.current.contains(target)
      ) {
        setLinkOpen(false);
        setLinkError(null);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [linkOpen]);

  useEffect(() => {
    if (!fillOpen) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        fillPopoverRef.current &&
        fillPopoverRef.current.contains(target)
      ) {
        return;
      }
      if (fillButtonRef.current && fillButtonRef.current.contains(target)) {
        return;
      }
      setFillOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [fillOpen]);

  useEffect(() => {
    if (menuState.isFree) {
      return;
    }
    setPlacement('top');
  }, [anchor?.x, anchor?.y, anchor?.width, anchor?.height, menuState.isFree]);

  useLayoutEffect(() => {
    if (!anchor || !isVisible || !toolbarRef.current || menuState.isFree) {
      return;
    }
    const element = toolbarRef.current;
    const height = element.offsetHeight;
    const topSpace = anchor.y - TOOLBAR_GAP - height;
    const bottomPosition = anchor.y + anchor.height + TOOLBAR_GAP;
    const bottomSpace = viewportSize.height - (bottomPosition + height);

    if (placement === 'top' && topSpace < 8 && bottomSpace > topSpace) {
      setPlacement('bottom');
    } else if (placement === 'bottom' && bottomSpace < 8 && topSpace > bottomSpace) {
      setPlacement('top');
    }
  }, [anchor, viewportSize.height, placement, isVisible]);

  const style = useMemo(() => {
    if (!anchor) {
      return {} as React.CSSProperties;
    }
    if (menuState.isFree && menuState.position) {
      return {
        left: menuState.position.x,
        top: menuState.position.y,
        transform: 'translate(0, 0)'
      } as React.CSSProperties;
    }
    const left = anchor.x + anchor.width / 2;
    if (placement === 'top') {
      return {
        left,
        top: anchor.y - TOOLBAR_GAP,
        transform: 'translate(-50%, -100%)'
      } as React.CSSProperties;
    }
    return {
      left,
      top: anchor.y + anchor.height + TOOLBAR_GAP,
      transform: 'translate(-50%, 0)'
    } as React.CSSProperties;
  }, [anchor, placement, menuState.isFree, menuState.position]);

  if (!isVisible || !anchor) {
    return null;
  }

  const handleToggleBold = () => {
    commands.applyStyles(nodeIds, { fontWeight: isBold ? 600 : 700 });
  };

  const handleAlign = (value: TextAlign) => {
    commands.applyStyles(nodeIds, { textAlign: value });
  };

  const commitFontSize = (value: number) => {
    const next = clamp(value, FONT_SIZE_MIN, FONT_SIZE_MAX);
    setFontSizeValue(next.toString());
    commands.applyStyles(nodeIds, { fontSize: next });
  };

  const commitStrokeWidth = (value: number) => {
    const next = clamp(value, STROKE_MIN, STROKE_MAX);
    setStrokeWidthValue(next.toString());
    commands.applyStyles(nodeIds, { strokeWidth: next });
  };

  const handleFontSizeBlur = () => {
    const parsed = Number(fontSizeValue);
    if (Number.isFinite(parsed)) {
      commitFontSize(parsed);
    } else {
      setFontSizeValue(node.fontSize.toString());
    }
  };

  const handleFontSizeKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleFontSizeBlur();
    }
  };

  const handleStrokeWidthBlur = () => {
    const parsed = Number(strokeWidthValue);
    if (Number.isFinite(parsed)) {
      commitStrokeWidth(parsed);
    } else {
      setStrokeWidthValue(node.stroke.width.toString());
    }
  };

  const handleStrokeWidthKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleStrokeWidthBlur();
    }
  };

  const adjustFontSize = (delta: number) => {
    commitFontSize(node.fontSize + delta);
  };

  const adjustStrokeWidth = (delta: number) => {
    commitStrokeWidth(node.stroke.width + delta);
  };

  const handleShapeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    commands.setShape(nodeIds, event.target.value as NodeKind);
  };

  const handleStrokeColorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    commands.applyStyles(nodeIds, { strokeColor: event.target.value });
  };

  const handleLinkApply = () => {
    const normalized = ensureProtocol(linkDraft);
    if (!normalized) {
      commands.setLink(node.id, null);
      setLinkOpen(false);
      setLinkError(null);
      return;
    }

    if (!isValidHttpUrl(normalized)) {
      setLinkError('Enter a valid http(s) URL');
      return;
    }

    commands.setLink(node.id, normalized);
    setLinkError(null);
    setLinkOpen(false);
  };

  const handleLinkRemove = () => {
    commands.setLink(node.id, null);
    setLinkDraft('');
    setLinkError(null);
    setLinkOpen(false);
  };

  const handleLinkKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleLinkApply();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setLinkOpen(false);
      setLinkError(null);
    }
  };

  const handleLinkBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    const nextTarget = event.relatedTarget as HTMLElement | null;
    if (nextTarget && linkPopoverRef.current?.contains(nextTarget)) {
      return;
    }
    handleLinkApply();
  };

  const handleOpenLink = () => {
    if (!node.link?.url) {
      return;
    }
    window.open(node.link.url, '_blank', 'noopener');
  };

  const textDisabled = !hasText;
  const strokeWidthDisabled = !node.stroke.color;

  return (
    <div
      ref={toolbarRef}
      className="selection-toolbar floating-menu"
      style={style}
      data-placement={placement}
      data-free={menuState.isFree || undefined}
      data-dragging={isDragging || undefined}
    >
      <FloatingMenuChrome
        title="Selection"
        isFree={menuState.isFree}
        isDragging={isDragging}
        onPointerDown={handleDragPointerDown}
        onPointerMove={handleDragPointerMove}
        onPointerUp={handleDragPointerUp}
        onPointerCancel={handleDragPointerCancel}
        onReset={resetToAnchor}
        onKeyboardMove={moveMenuBy}
      />
      <div className="selection-toolbar__content">
        <div className="selection-toolbar__group">
          <button
            type="button"
            className={`selection-toolbar__button ${isBold ? 'is-active' : ''}`}
            onClick={handleToggleBold}
            disabled={textDisabled}
          title="Bold (Cmd/Ctrl+B)"
        >
          <span className="selection-toolbar__icon">B</span>
        </button>
        <div className="selection-toolbar__segmented" role="group" aria-label="Text alignment">
          {alignOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`selection-toolbar__button ${
                node.textAlign === option.value ? 'is-active' : ''
              }`}
              onClick={() => handleAlign(option.value)}
              disabled={textDisabled}
              title={`${option.label} (Cmd/Ctrl+Shift+${option.icon})`}
            >
              <span className="selection-toolbar__icon" aria-hidden>
                {option.icon}
              </span>
            </button>
          ))}
        </div>
        <div className="selection-toolbar__size-control">
          <button
            type="button"
            onClick={() => adjustFontSize(-1)}
            disabled={textDisabled}
            className="selection-toolbar__button"
            title="Decrease size (Cmd/Ctrl+-)"
          >
            −
          </button>
          <input
            type="number"
            className="selection-toolbar__input"
            value={fontSizeValue}
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            onChange={(event) => setFontSizeValue(event.target.value)}
            onBlur={handleFontSizeBlur}
            onKeyDown={handleFontSizeKeyDown}
            disabled={textDisabled}
            aria-label="Font size"
          />
          <button
            type="button"
            onClick={() => adjustFontSize(1)}
            disabled={textDisabled}
            className="selection-toolbar__button"
            title="Increase size (Cmd/Ctrl+=)"
          >
            +
          </button>
        </div>
        </div>
        <div className="selection-toolbar__group">
          <div className="selection-toolbar__swatch" title={fillTitle}>
            <span className="selection-toolbar__swatch-indicator">Fill</span>
            <button
            type="button"
            ref={fillButtonRef}
            className={`selection-toolbar__color-button ${fillOpen ? 'is-active' : ''}`}
            onClick={() => {
              setFillOpen((prev) => !prev);
              setLinkOpen(false);
            }}
            aria-haspopup="dialog"
            aria-expanded={fillOpen}
            aria-label="Edit fill color"
          >
            <span
              className="selection-toolbar__color-preview"
              style={{ ['--selection-fill-preview' as const]: fillPreview }}
            />
          </button>
          {fillOpen && (
            <div className="selection-toolbar__color-popover" ref={fillPopoverRef}>
              <ColorPicker color={fillColor} alpha={fillOpacity} onChange={handleFillChange} />
            </div>
          )}
        </div>
        <label className="selection-toolbar__swatch" title="Stroke color">
          <span className="selection-toolbar__swatch-indicator">Stroke</span>
          <input type="color" value={node.stroke.color} onChange={handleStrokeColorChange} />
        </label>
        <div className="selection-toolbar__size-control">
          <button
            type="button"
            onClick={() => adjustStrokeWidth(-1)}
            disabled={strokeWidthDisabled}
            className="selection-toolbar__button"
            title="Thinner stroke"
          >
            −
          </button>
          <input
            type="number"
            className="selection-toolbar__input"
            value={strokeWidthValue}
            min={STROKE_MIN}
            max={STROKE_MAX}
            onChange={(event) => setStrokeWidthValue(event.target.value)}
            onBlur={handleStrokeWidthBlur}
            onKeyDown={handleStrokeWidthKeyDown}
            disabled={strokeWidthDisabled}
            aria-label="Stroke width"
          />
          <button
            type="button"
            onClick={() => adjustStrokeWidth(1)}
            disabled={strokeWidthDisabled}
            className="selection-toolbar__button"
            title="Thicker stroke"
          >
            +
          </button>
        </div>
        </div>
        <div className="selection-toolbar__group">
          <label className="selection-toolbar__shape" title="Change shape">
            <span>Shape</span>
            <select value={node.shape} onChange={handleShapeChange}>
              {shapeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="selection-toolbar__group selection-toolbar__group--link">
          <button
            type="button"
            ref={linkButtonRef}
            className={`selection-toolbar__button ${linkOpen ? 'is-active' : ''}`}
            onClick={() => setLinkOpen((prev) => !prev)}
            title="Link (Cmd/Ctrl+K)"
          >
            🔗
          </button>
          {node.link?.url && (
            <button
              type="button"
              className="selection-toolbar__button"
              onClick={handleOpenLink}
              title="Open link"
            >
              Open
            </button>
          )}
        </div>
      </div>
      {linkOpen && (
        <div className="selection-toolbar__link-popover" ref={linkPopoverRef}>
          <input
            ref={linkInputRef}
            type="url"
            value={linkDraft}
            placeholder="https://example.com"
            onChange={(event) => setLinkDraft(event.target.value)}
            onKeyDown={handleLinkKeyDown}
            onBlur={handleLinkBlur}
          />
          <div className="selection-toolbar__link-actions">
            <button type="button" onClick={handleLinkApply}>
              Apply
            </button>
            <button type="button" onClick={handleLinkRemove} disabled={!node.link?.url && !linkDraft.trim()}>
              Remove
            </button>
          </div>
          {linkError && <div className="selection-toolbar__link-error">{linkError}</div>}
        </div>
      )}
    </div>
  );
};
