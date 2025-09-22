import { useEffect, useMemo, useRef, useState } from 'react';
import { FloatingMenuPlacement } from '../state/menuStore';
import {
  FloatingMenuAnchorRect,
  FloatingMenuPlacementOptions,
  FloatingMenuPlacementResult,
  FloatingMenuOrientation,
  computeFloatingMenuPlacement
} from '../utils/floatingMenu';

const ANCHOR_EPSILON = 0.5;

const cloneAnchor = (anchor: FloatingMenuAnchorRect | null): FloatingMenuAnchorRect | null => {
  if (!anchor) {
    return null;
  }
  return {
    x: anchor.x,
    y: anchor.y,
    width: anchor.width,
    height: anchor.height
  };
};

const anchorsDiffer = (a: FloatingMenuAnchorRect | null, b: FloatingMenuAnchorRect | null): boolean => {
  if (!a && !b) {
    return false;
  }
  if (!a || !b) {
    return true;
  }
  const widthA = a.width ?? 0;
  const widthB = b.width ?? 0;
  const heightA = a.height ?? 0;
  const heightB = b.height ?? 0;
  return (
    Math.abs(a.x - b.x) > ANCHOR_EPSILON ||
    Math.abs(a.y - b.y) > ANCHOR_EPSILON ||
    Math.abs(widthA - widthB) > ANCHOR_EPSILON ||
    Math.abs(heightA - heightB) > ANCHOR_EPSILON
  );
};

export interface UseFrozenFloatingPlacementOptions {
  anchor: FloatingMenuAnchorRect | null;
  menuState: FloatingMenuPlacement;
  menuSize: { width: number; height: number } | null;
  viewportSize: { width: number; height: number };
  pointerPosition: { x: number; y: number } | null;
  options?: FloatingMenuPlacementOptions;
  isVisible: boolean;
  identity: string;
}

export interface UseFrozenFloatingPlacementResult {
  placement: FloatingMenuPlacementResult | null;
  orientation: FloatingMenuOrientation;
  isFrozen: boolean;
}

export const useFrozenFloatingPlacement = ({
  anchor,
  menuState,
  menuSize,
  viewportSize,
  pointerPosition,
  options,
  isVisible,
  identity
}: UseFrozenFloatingPlacementOptions): UseFrozenFloatingPlacementResult => {
  const [frozenPlacement, setFrozenPlacement] = useState<FloatingMenuPlacementResult | null>(null);
  const previousAnchorRef = useRef<FloatingMenuAnchorRect | null>(null);
  const previousIdentityRef = useRef(identity);
  const lastAnchoredPlacementRef = useRef<FloatingMenuPlacementResult | null>(null);

  const basePlacement = useMemo(() => {
    if (!anchor || menuState.isFree) {
      return null;
    }
    const size = menuSize ?? { width: 0, height: 0 };
    return computeFloatingMenuPlacement(anchor, size, viewportSize, pointerPosition, options);
  }, [anchor, menuState.isFree, menuSize, viewportSize, pointerPosition, options]);

  useEffect(() => {
    if (!isVisible || menuState.isFree) {
      if (frozenPlacement) {
        setFrozenPlacement(null);
      }
      previousAnchorRef.current = cloneAnchor(anchor);
      if (!isVisible) {
        lastAnchoredPlacementRef.current = null;
      }
      return;
    }

    if (previousIdentityRef.current !== identity) {
      previousIdentityRef.current = identity;
      setFrozenPlacement(null);
      previousAnchorRef.current = cloneAnchor(anchor);
      return;
    }

    const previous = previousAnchorRef.current;
    if (
      anchor &&
      previous &&
      anchorsDiffer(previous, anchor) &&
      !frozenPlacement &&
      lastAnchoredPlacementRef.current
    ) {
      setFrozenPlacement(lastAnchoredPlacementRef.current);
    }

    previousAnchorRef.current = cloneAnchor(anchor);
  }, [anchor, identity, isVisible, menuState.isFree, frozenPlacement]);

  useEffect(() => {
    if (basePlacement) {
      lastAnchoredPlacementRef.current = basePlacement;
    }
  }, [basePlacement]);

  useEffect(() => {
    previousIdentityRef.current = identity;
  }, [identity]);

  const placement = frozenPlacement ?? basePlacement;
  const orientation: FloatingMenuOrientation = menuState.isFree
    ? frozenPlacement?.orientation ??
      lastAnchoredPlacementRef.current?.orientation ??
      basePlacement?.orientation ??
      'top'
    : placement?.orientation ?? 'top';

  return {
    placement,
    orientation,
    isFrozen: Boolean(frozenPlacement)
  };
};

