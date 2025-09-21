import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  FloatingMenuPlacement,
  FloatingMenuPosition,
  FloatingMenuType,
  DEFAULT_MENU_PLACEMENT,
  useFloatingMenuStore
} from '../state/menuStore';

const CLAMP_MARGIN = 12;
const DRAG_THRESHOLD = 3;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type DragState = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  containerLeft: number;
  containerTop: number;
  originLeft: number;
  originTop: number;
  hasMoved: boolean;
  lastLeft: number;
  lastTop: number;
};

export interface UseFloatingMenuDragOptions {
  menuType: FloatingMenuType;
  menuRef: React.RefObject<HTMLDivElement>;
  viewportSize: { width: number; height: number };
  isVisible: boolean;
}

export interface UseFloatingMenuDragResult {
  menuState: FloatingMenuPlacement;
  isDragging: boolean;
  menuSize: { width: number; height: number } | null;
  handlePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  handlePointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  handlePointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  handlePointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void;
  moveBy: (dx: number, dy: number, options?: { fine?: boolean }) => void;
  resetToAnchor: () => void;
}

export const useFloatingMenuDrag = ({
  menuType,
  menuRef,
  viewportSize,
  isVisible
}: UseFloatingMenuDragOptions): UseFloatingMenuDragResult => {
  const menuState = useFloatingMenuStore(
    useCallback((state) => state.menus[menuType] ?? DEFAULT_MENU_PLACEMENT, [menuType])
  );
  const setMenuFreePosition = useFloatingMenuStore((state) => state.setMenuFreePosition);
  const resetMenu = useFloatingMenuStore((state) => state.resetMenu);

  const dragStateRef = useRef<DragState | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingPositionRef = useRef<FloatingMenuPosition | null>(null);
  const [menuSize, setMenuSize] = useState<{ width: number; height: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const releaseActiveDrag = useCallback(() => {
    const state = dragStateRef.current;
    if (!state) {
      return;
    }
    const element = menuRef.current;
    if (element && element.hasPointerCapture(state.pointerId)) {
      element.releasePointerCapture(state.pointerId);
    }
    dragStateRef.current = null;
  }, [menuRef]);

  const clearPendingPosition = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingPositionRef.current = null;
  }, []);

  const flushPendingPosition = useCallback(() => {
    if (pendingPositionRef.current) {
      setMenuFreePosition(menuType, pendingPositionRef.current);
    }
    clearPendingPosition();
  }, [clearPendingPosition, menuType, setMenuFreePosition]);

  const schedulePositionUpdate = useCallback(
    (position: FloatingMenuPosition, options?: { immediate?: boolean }) => {
      if (options?.immediate) {
        pendingPositionRef.current = position;
        flushPendingPosition();
        return;
      }
      pendingPositionRef.current = position;
      if (frameRef.current !== null) {
        return;
      }
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        if (pendingPositionRef.current) {
          setMenuFreePosition(menuType, pendingPositionRef.current);
          pendingPositionRef.current = null;
        }
      });
    },
    [flushPendingPosition, menuType, setMenuFreePosition]
  );

  useLayoutEffect(() => {
    if (!isVisible) {
      setMenuSize(null);
      return;
    }

    const element = menuRef.current;
    if (!element) {
      return;
    }

    const measure = () => {
      const rect = element.getBoundingClientRect();
      setMenuSize({ width: rect.width, height: rect.height });
    };

    measure();

    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => measure());
      observer.observe(element);
      return () => observer.disconnect();
    }

    return undefined;
  }, [menuRef, isVisible]);

  useEffect(() => {
    if (!isVisible) {
      releaseActiveDrag();
      setIsDragging(false);
      clearPendingPosition();
      resetMenu(menuType);
    }
  }, [clearPendingPosition, isVisible, menuType, releaseActiveDrag, resetMenu]);

  useEffect(() => {
    return () => {
      releaseActiveDrag();
      clearPendingPosition();
      resetMenu(menuType);
    };
  }, [clearPendingPosition, menuType, releaseActiveDrag, resetMenu]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      const element = menuRef.current;
      if (!element) {
        return;
      }

      const container = (element.offsetParent as HTMLElement | null) ?? element.parentElement;
      const rect = element.getBoundingClientRect();
      const containerRect = container?.getBoundingClientRect() ?? rect;

      dragStateRef.current = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        width: rect.width,
        height: rect.height,
        containerLeft: containerRect.left,
        containerTop: containerRect.top,
        originLeft: rect.left - containerRect.left,
        originTop: rect.top - containerRect.top,
        hasMoved: false,
        lastLeft: rect.left - containerRect.left,
        lastTop: rect.top - containerRect.top
      };

      setMenuSize({ width: rect.width, height: rect.height });
      element.setPointerCapture(event.pointerId);
      setIsDragging(true);
      event.preventDefault();
      event.stopPropagation();
    },
    [menuRef]
  );

  const updatePositionFromEvent = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, options?: { immediate?: boolean }) => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== event.pointerId) {
        return false;
      }
      if (!viewportSize.width || !viewportSize.height) {
        return false;
      }

      const relativeX = event.clientX - state.containerLeft;
      const relativeY = event.clientY - state.containerTop;
      const rawLeft = relativeX - state.offsetX;
      const rawTop = relativeY - state.offsetY;
      const maxLeft = Math.max(CLAMP_MARGIN, viewportSize.width - state.width - CLAMP_MARGIN);
      const maxTop = Math.max(CLAMP_MARGIN, viewportSize.height - state.height - CLAMP_MARGIN);
      const nextLeft = clamp(rawLeft, CLAMP_MARGIN, maxLeft);
      const nextTop = clamp(rawTop, CLAMP_MARGIN, maxTop);

      if (!state.hasMoved) {
        const delta = Math.hypot(nextLeft - state.originLeft, nextTop - state.originTop);
        if (delta <= DRAG_THRESHOLD) {
          return false;
        }
        state.hasMoved = true;
      }

      state.lastLeft = nextLeft;
      state.lastTop = nextTop;
      schedulePositionUpdate({ x: nextLeft, y: nextTop }, options);
      return true;
    },
    [schedulePositionUpdate, viewportSize.height, viewportSize.width]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      updatePositionFromEvent(event);
    },
    [updatePositionFromEvent]
  );

  const releasePointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== event.pointerId) {
        return;
      }
      releaseActiveDrag();
      setIsDragging(false);
      clearPendingPosition();
      event.preventDefault();
      event.stopPropagation();
    },
    [clearPendingPosition, releaseActiveDrag]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      updatePositionFromEvent(event, { immediate: true });
      releasePointer(event);
    },
    [releasePointer, updatePositionFromEvent]
  );

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      releasePointer(event);
    },
    [releasePointer]
  );

  const clampPositionToViewport = useCallback(() => {
    if (!isVisible) {
      return;
    }
    if (!menuState.isFree || !menuState.position || !menuSize) {
      return;
    }
    if (!viewportSize.width || !viewportSize.height) {
      return;
    }

    const maxLeft = Math.max(CLAMP_MARGIN, viewportSize.width - menuSize.width - CLAMP_MARGIN);
    const maxTop = Math.max(CLAMP_MARGIN, viewportSize.height - menuSize.height - CLAMP_MARGIN);
    const clampedX = clamp(menuState.position.x, CLAMP_MARGIN, maxLeft);
    const clampedY = clamp(menuState.position.y, CLAMP_MARGIN, maxTop);
    if (clampedX !== menuState.position.x || clampedY !== menuState.position.y) {
      setMenuFreePosition(menuType, { x: clampedX, y: clampedY });
    }
  }, [
    isVisible,
    menuSize,
    menuState.isFree,
    menuState.position,
    menuType,
    setMenuFreePosition,
    viewportSize.height,
    viewportSize.width
  ]);

  useEffect(() => {
    clampPositionToViewport();
  }, [clampPositionToViewport]);

  const moveBy = useCallback(
    (dx: number, dy: number, options?: { fine?: boolean }) => {
      if (!menuRef.current || (!dx && !dy)) {
        return;
      }

      const element = menuRef.current;
      const rect = element.getBoundingClientRect();
      const container = (element.offsetParent as HTMLElement | null) ?? element.parentElement;
      const containerRect = container?.getBoundingClientRect() ?? rect;
      const width = menuSize?.width ?? rect.width;
      const height = menuSize?.height ?? rect.height;
      const baseLeft =
        menuState.isFree && menuState.position
          ? menuState.position.x
          : rect.left - containerRect.left;
      const baseTop =
        menuState.isFree && menuState.position
          ? menuState.position.y
          : rect.top - containerRect.top;

      const step = options?.fine ? 1 : 10;
      const nextLeft = clamp(
        baseLeft + dx * step,
        CLAMP_MARGIN,
        Math.max(CLAMP_MARGIN, viewportSize.width - width - CLAMP_MARGIN)
      );
      const nextTop = clamp(
        baseTop + dy * step,
        CLAMP_MARGIN,
        Math.max(CLAMP_MARGIN, viewportSize.height - height - CLAMP_MARGIN)
      );

      schedulePositionUpdate({ x: nextLeft, y: nextTop }, { immediate: true });
    },
    [
      menuRef,
      menuSize,
      menuState.isFree,
      menuState.position,
      menuType,
      schedulePositionUpdate,
      viewportSize.height,
      viewportSize.width
    ]
  );

  const resetToAnchor = useCallback(() => {
    clearPendingPosition();
    resetMenu(menuType);
  }, [clearPendingPosition, resetMenu, menuType]);

  return {
    menuState,
    isDragging,
    menuSize,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    moveBy,
    resetToAnchor
  };
};
