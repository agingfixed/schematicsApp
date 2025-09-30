import React, { useCallback } from 'react';
import '../styles/floating-menu.css';

interface FloatingMenuChromeProps {
  title: string;
  isFree: boolean;
  isDragging: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void;
  onKeyboardMove: (dx: number, dy: number, options?: { fine?: boolean }) => void;
  onClose?: () => void;
}

export const FloatingMenuChrome: React.FC<FloatingMenuChromeProps> = ({
  title,
  isFree,
  isDragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onKeyboardMove,
  onClose
}) => {
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
      </div>
      {onClose ? (
        <button
          type="button"
          className="floating-menu__close"
          onClick={onClose}
          aria-label={`Close ${title}`}
          title="Close"
        >
          ×
        </button>
      ) : null}
    </div>
  );
};
