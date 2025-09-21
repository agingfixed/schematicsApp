import { FloatingMenuPosition } from '../state/menuStore';

export type FloatingMenuOrientation = 'top' | 'bottom' | 'left' | 'right';

export interface FloatingMenuAnchorRect {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface FloatingMenuSize {
  width: number;
  height: number;
}

export interface FloatingMenuViewport {
  width: number;
  height: number;
}

export interface FloatingMenuPointer {
  x: number;
  y: number;
}

export interface FloatingMenuPlacementOptions {
  gap?: number;
  margin?: number;
  pointerPadding?: number;
}

export interface FloatingMenuPlacementResult {
  position: FloatingMenuPosition;
  orientation: FloatingMenuOrientation;
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const rectWidth = (rect: Rect) => rect.right - rect.left;
const rectHeight = (rect: Rect) => rect.bottom - rect.top;

const clampWithMargin = (value: number, size: number, limit: number, margin: number) => {
  const available = limit - size;
  if (available <= 0) {
    return 0;
  }
  if (available >= margin * 2) {
    return clamp(value, margin, available - margin);
  }
  return clamp(value, 0, available);
};

const toRect = (anchor: FloatingMenuAnchorRect): Rect => {
  const width = anchor.width ?? 0;
  const height = anchor.height ?? 0;
  return {
    left: anchor.x,
    top: anchor.y,
    right: anchor.x + width,
    bottom: anchor.y + height
  };
};

const createRectForOrientation = (
  orientation: FloatingMenuOrientation,
  anchor: Rect,
  size: FloatingMenuSize,
  gap: number
): Rect => {
  const width = size.width;
  const height = size.height;
  const anchorWidth = anchor.right - anchor.left;
  const anchorHeight = anchor.bottom - anchor.top;
  const centerX = anchor.left + anchorWidth / 2;
  const centerY = anchor.top + anchorHeight / 2;

  switch (orientation) {
    case 'top': {
      const left = centerX - width / 2;
      const top = anchor.top - gap - height;
      return { left, top, right: left + width, bottom: top + height };
    }
    case 'bottom': {
      const left = centerX - width / 2;
      const top = anchor.bottom + gap;
      return { left, top, right: left + width, bottom: top + height };
    }
    case 'left': {
      const left = anchor.left - gap - width;
      const top = centerY - height / 2;
      return { left, top, right: left + width, bottom: top + height };
    }
    case 'right':
    default: {
      const left = anchor.right + gap;
      const top = centerY - height / 2;
      return { left, top, right: left + width, bottom: top + height };
    }
  }
};

const shiftRect = (rect: Rect, axis: 'x' | 'y', delta: number): Rect => {
  if (axis === 'x') {
    return {
      left: rect.left + delta,
      right: rect.right + delta,
      top: rect.top,
      bottom: rect.bottom
    };
  }
  return {
    left: rect.left,
    right: rect.right,
    top: rect.top + delta,
    bottom: rect.bottom + delta
  };
};

const rectsOverlap = (a: Rect, b: Rect) =>
  !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);

const pointInRect = (rect: Rect, point: FloatingMenuPointer, padding = 0) =>
  point.x >= rect.left - padding &&
  point.x <= rect.right + padding &&
  point.y >= rect.top - padding &&
  point.y <= rect.bottom + padding;

const adjustForViewport = (
  rect: Rect,
  orientation: FloatingMenuOrientation,
  viewport: FloatingMenuViewport,
  margin: number
): { rect: Rect; fits: boolean } => {
  if (!viewport.width || !viewport.height) {
    return { rect, fits: true };
  }

  const width = rectWidth(rect);
  const height = rectHeight(rect);
  let left = rect.left;
  let top = rect.top;
  let fits = true;

  if (orientation === 'top' || orientation === 'bottom') {
    left = clampWithMargin(left, width, viewport.width, margin);
    const right = left + width;
    const minTop = margin;
    const maxTop = viewport.height - margin - height;
    if (maxTop < minTop) {
      top = clamp(rect.top, 0, viewport.height - height);
      fits = false;
    } else if (rect.top < minTop) {
      top = minTop;
      fits = false;
    } else if (rect.bottom > viewport.height - margin) {
      top = maxTop;
      fits = false;
    } else {
      top = rect.top;
    }
    return {
      rect: { left, top, right, bottom: top + height },
      fits
    };
  }

  top = clampWithMargin(top, height, viewport.height, margin);
  const bottom = top + height;
  const minLeft = margin;
  const maxLeft = viewport.width - margin - width;
  if (maxLeft < minLeft) {
    left = clamp(rect.left, 0, viewport.width - width);
    fits = false;
  } else if (rect.left < minLeft) {
    left = minLeft;
    fits = false;
  } else if (rect.right > viewport.width - margin) {
    left = maxLeft;
    fits = false;
  } else {
    left = rect.left;
  }
  return {
    rect: { left, top, right: left + width, bottom },
    fits
  };
};

const resolveAnchorOverlap = (
  rect: Rect,
  orientation: FloatingMenuOrientation,
  anchor: Rect,
  gap: number,
  viewport: FloatingMenuViewport,
  margin: number
): { rect: Rect; fits: boolean } => {
  if (!rectsOverlap(rect, anchor)) {
    return { rect, fits: true };
  }

  const width = rectWidth(rect);
  const height = rectHeight(rect);
  const anchorCenterX = anchor.left + (anchor.right - anchor.left) / 2;
  const anchorCenterY = anchor.top + (anchor.bottom - anchor.top) / 2;
  const rectCenterX = rect.left + width / 2;
  const rectCenterY = rect.top + height / 2;

  if (orientation === 'top' || orientation === 'bottom') {
    const overlapX = Math.min(rect.right, anchor.right) - Math.max(rect.left, anchor.left);
    if (overlapX <= 0) {
      return { rect, fits: true };
    }
    const direction = rectCenterX >= anchorCenterX ? 1 : -1;
    const shifted = shiftRect(rect, 'x', direction * (overlapX + gap));
    const adjusted = adjustForViewport(shifted, orientation, viewport, margin);
    if (!adjusted.fits) {
      return { rect: adjusted.rect, fits: false };
    }
    if (rectsOverlap(adjusted.rect, anchor)) {
      return { rect: adjusted.rect, fits: false };
    }
    return adjusted;
  }

  const overlapY = Math.min(rect.bottom, anchor.bottom) - Math.max(rect.top, anchor.top);
  if (overlapY <= 0) {
    return { rect, fits: true };
  }
  const direction = rectCenterY >= anchorCenterY ? 1 : -1;
  const shifted = shiftRect(rect, 'y', direction * (overlapY + gap));
  const adjusted = adjustForViewport(shifted, orientation, viewport, margin);
  if (!adjusted.fits) {
    return { rect: adjusted.rect, fits: false };
  }
  if (rectsOverlap(adjusted.rect, anchor)) {
    return { rect: adjusted.rect, fits: false };
  }
  return adjusted;
};

const offsetFromPointer = (
  rect: Rect,
  anchor: Rect,
  pointer: FloatingMenuPointer,
  viewport: FloatingMenuViewport,
  margin: number,
  pointerPadding: number
): { rect: Rect; fits: boolean } => {
  if (!pointInRect(rect, pointer, pointerPadding)) {
    return { rect, fits: true };
  }

  const anchorCenterX = anchor.left + (anchor.right - anchor.left) / 2;
  const anchorCenterY = anchor.top + (anchor.bottom - anchor.top) / 2;
  const vectorX = pointer.x - anchorCenterX;
  const vectorY = pointer.y - anchorCenterY;
  const axis: 'x' | 'y' = Math.abs(vectorY) >= Math.abs(vectorX) ? 'x' : 'y';

  if (axis === 'x') {
    const availableRight = viewport.width - rect.right - margin;
    const availableLeft = rect.left - margin;
    const shiftRight = pointer.x - rect.left + pointerPadding;
    const shiftLeft = rect.right - pointer.x + pointerPadding;

    const canMoveRight = availableRight >= shiftRight;
    const canMoveLeft = availableLeft >= shiftLeft;

    let delta = 0;
    if (canMoveRight && (!canMoveLeft || availableRight >= availableLeft)) {
      delta = shiftRight;
    } else if (canMoveLeft) {
      delta = -shiftLeft;
    } else if (availableRight > availableLeft && availableRight > 0) {
      delta = availableRight;
    } else if (availableLeft > 0) {
      delta = -availableLeft;
    } else {
      return { rect, fits: false };
    }

    const moved = shiftRect(rect, 'x', delta);
    const clampedLeft = clampWithMargin(moved.left, rectWidth(moved), viewport.width, margin);
    const finalRect = shiftRect(moved, 'x', clampedLeft - moved.left);
    if (pointInRect(finalRect, pointer, pointerPadding)) {
      return { rect: finalRect, fits: false };
    }
    return { rect: finalRect, fits: true };
  }

  const availableDown = viewport.height - rect.bottom - margin;
  const availableUp = rect.top - margin;
  const shiftDown = pointer.y - rect.top + pointerPadding;
  const shiftUp = rect.bottom - pointer.y + pointerPadding;

  const canMoveDown = availableDown >= shiftDown;
  const canMoveUp = availableUp >= shiftUp;

  let delta = 0;
  if (canMoveDown && (!canMoveUp || availableDown >= availableUp)) {
    delta = shiftDown;
  } else if (canMoveUp) {
    delta = -shiftUp;
  } else if (availableDown > availableUp && availableDown > 0) {
    delta = availableDown;
  } else if (availableUp > 0) {
    delta = -availableUp;
  } else {
    return { rect, fits: false };
  }

  const moved = shiftRect(rect, 'y', delta);
  const clampedTop = clampWithMargin(moved.top, rectHeight(moved), viewport.height, margin);
  const finalRect = shiftRect(moved, 'y', clampedTop - moved.top);
  if (pointInRect(finalRect, pointer, pointerPadding)) {
    return { rect: finalRect, fits: false };
  }
  return { rect: finalRect, fits: true };
};

const clampRectToViewport = (rect: Rect, viewport: FloatingMenuViewport, margin: number): Rect => {
  const width = rectWidth(rect);
  const height = rectHeight(rect);
  const left = clampWithMargin(rect.left, width, viewport.width, margin);
  const top = clampWithMargin(rect.top, height, viewport.height, margin);
  return { left, top, right: left + width, bottom: top + height };
};

export const computeFloatingMenuPlacement = (
  anchor: FloatingMenuAnchorRect,
  size: FloatingMenuSize,
  viewport: FloatingMenuViewport,
  pointer?: FloatingMenuPointer | null,
  options?: FloatingMenuPlacementOptions
): FloatingMenuPlacementResult => {
  const gap = options?.gap ?? 10;
  const margin = options?.margin ?? 12;
  const pointerPadding = options?.pointerPadding ?? 12;

  const anchorRect = toRect(anchor);
  const orientationOrder: FloatingMenuOrientation[] = ['top', 'bottom', 'left', 'right'];

  let fallbackRect: Rect | null = null;

  for (const orientation of orientationOrder) {
    let rect = createRectForOrientation(orientation, anchorRect, size, gap);
    const viewportAdjusted = adjustForViewport(rect, orientation, viewport, margin);
    rect = viewportAdjusted.rect;
    if (!viewportAdjusted.fits) {
      if (!fallbackRect) {
        fallbackRect = rect;
      }
      continue;
    }

    const anchorAdjusted = resolveAnchorOverlap(rect, orientation, anchorRect, gap, viewport, margin);
    if (!anchorAdjusted.fits) {
      if (!fallbackRect) {
        fallbackRect = anchorAdjusted.rect;
      }
      continue;
    }
    rect = anchorAdjusted.rect;

    if (pointer) {
      const pointerAdjusted = offsetFromPointer(rect, anchorRect, pointer, viewport, margin, pointerPadding);
      if (!pointerAdjusted.fits) {
        if (!fallbackRect) {
          fallbackRect = pointerAdjusted.rect;
        }
        continue;
      }
      rect = pointerAdjusted.rect;

      const viewportRecheck = adjustForViewport(rect, orientation, viewport, margin);
      if (!viewportRecheck.fits) {
        if (!fallbackRect) {
          fallbackRect = viewportRecheck.rect;
        }
        continue;
      }
      rect = viewportRecheck.rect;

      const anchorRecheck = resolveAnchorOverlap(rect, orientation, anchorRect, gap, viewport, margin);
      if (!anchorRecheck.fits) {
        if (!fallbackRect) {
          fallbackRect = anchorRecheck.rect;
        }
        continue;
      }
      rect = anchorRecheck.rect;

      if (pointInRect(rect, pointer, pointerPadding)) {
        if (!fallbackRect) {
          fallbackRect = rect;
        }
        continue;
      }
    }

    return {
      orientation,
      position: { x: rect.left, y: rect.top }
    };
  }

  const baseRect = fallbackRect ?? createRectForOrientation('top', anchorRect, size, gap);
  const clamped = clampRectToViewport(baseRect, viewport, margin);
  return {
    orientation: 'top',
    position: { x: clamped.left, y: clamped.top }
  };
};

