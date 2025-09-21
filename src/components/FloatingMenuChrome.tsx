import React, { useCallback, useEffect, useRef, useState } from 'react';
import '../styles/floating-menu.css';

interface FloatingMenuChromeProps {
  title: string;
  isFree: boolean;
  isDragging: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void;
  onReset: () => void;
  onKeyboardMove: (dx: number, dy: number, options?: { fine?: boolean }) => void;
}

export const FloatingMenuChrome: React.FC<FloatingMenuChromeProps> = ({
  title,
  isFree,
  isDragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onReset,
  onKeyboardMove
}) => {
  const actionsRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (actionsRef.current && !actionsRef.current.contains(target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    if (actionsRef.current && actionsRef.current.contains(active)) {
      return;
    }
    actionsRef.current?.querySelector('button')?.focus();
  }, [open]);

  useEffect(() => {
    if (!isFree) {
      setOpen(false);
    }
  }, [isFree]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const { key, shiftKey } = event;
      if (key === 'ArrowUp') {
        event.preventDefault();
        onKeyboardMove(0, -1, { fine: shiftKey });
      } else if (key === 'ArrowDown') {
        event.preventDefault();
        onKeyboardMove(0, 1, { fine: shiftKey });
      } else if (key === 'ArrowLeft') {
        event.preventDefault();
        onKeyboardMove(-1, 0, { fine: shiftKey });
      } else if (key === 'ArrowRight') {
        event.preventDefault();
        onKeyboardMove(1, 0, { fine: shiftKey });
      } else if (key === 'Home') {
        event.preventDefault();
        onKeyboardMove(-1, 0, { fine: shiftKey });
      } else if (key === 'End') {
        event.preventDefault();
        onKeyboardMove(1, 0, { fine: shiftKey });
      }
    },
    [onKeyboardMove]
  );

  return (
    <div className="floating-menu__chrome">
      <div
        ref={handleRef}
        className="floating-menu__drag"
        role="button"
        tabIndex={0}
        aria-label={`Drag ${title}`}
        data-dragging={isDragging || undefined}
        data-free={isFree || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={handleKeyDown}
      >
        <span className="floating-menu__grip" aria-hidden />
        <span className="floating-menu__title">{title}</span>
        {isFree && <span className="floating-menu__badge">Free</span>}
      </div>
      <div className="floating-menu__actions" ref={actionsRef}>
        <button
          type="button"
          className="floating-menu__more"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Menu options"
          onClick={() => setOpen((value) => !value)}
        >
          ⋯
        </button>
        {open && (
          <div className="floating-menu__menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onReset();
                setOpen(false);
                handleRef.current?.focus();
              }}
              disabled={!isFree}
            >
              Return to anchor
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
