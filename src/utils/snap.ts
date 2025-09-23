import { NodeModel, Vec2 } from '../types/scene';
import { Bounds } from './scene';

export interface RectInfo {
  id: string;
  bounds: Bounds;
  center: Vec2;
  size: { width: number; height: number };
}

export const getNodeRectInfo = (node: NodeModel): RectInfo => {
  const bounds: Bounds = {
    minX: node.position.x,
    minY: node.position.y,
    maxX: node.position.x + node.size.width,
    maxY: node.position.y + node.size.height
  };

  return {
    id: node.id,
    bounds,
    center: {
      x: bounds.minX + (bounds.maxX - bounds.minX) / 2,
      y: bounds.minY + (bounds.maxY - bounds.minY) / 2
    },
    size: { width: node.size.width, height: node.size.height }
  };
};

export const translateBounds = (bounds: Bounds, delta: Vec2): Bounds => ({
  minX: bounds.minX + delta.x,
  minY: bounds.minY + delta.y,
  maxX: bounds.maxX + delta.x,
  maxY: bounds.maxY + delta.y
});

type EdgeKey = 'left' | 'right' | 'centerX' | 'top' | 'bottom' | 'centerY';

export interface SnapMatchLock {
  axis: 'x' | 'y';
  edge: EdgeKey;
  neighborEdge: EdgeKey;
  type: 'center' | 'edge';
  target: number;
  neighborId: string | null;
}

export interface SnapMatch extends SnapMatchLock {
  delta: number;
  line: { start: Vec2; end: Vec2 };
}

export interface ActiveSnapMatches {
  vertical?: SnapMatchLock;
  horizontal?: SnapMatchLock;
}

export interface SmartGuideParams {
  movingRect: Bounds;
  otherRects: RectInfo[];
  tolerance: number;
  activeMatches?: ActiveSnapMatches;
  centerOnly?: boolean;
}

export interface SmartGuideResult {
  matches: {
    vertical?: SnapMatch;
    horizontal?: SnapMatch;
  };
  guides: SnapMatch[];
}

export interface DistanceBadge {
  id: string;
  axis: 'x' | 'y';
  position: Vec2;
  value: number;
  direction: 'positive' | 'negative';
  equal?: boolean;
}

export interface SmartSelectionHandle {
  id: string;
  axis: 'x' | 'y';
  position: Vec2;
  beforeId: string;
  affectedIds: string[];
  gap: number;
  rawGap: number;
}

export interface SmartSelectionResult {
  axis: 'x' | 'y';
  handles: SmartSelectionHandle[];
  isUniform: boolean;
}

const EPSILON = 0.0001;
const MAX_SNAP_NEIGHBORS = 3;

const widthOf = (bounds: Bounds) => bounds.maxX - bounds.minX;
const heightOf = (bounds: Bounds) => bounds.maxY - bounds.minY;
const centerXOf = (bounds: Bounds) => bounds.minX + (bounds.maxX - bounds.minX) / 2;
const centerYOf = (bounds: Bounds) => bounds.minY + (bounds.maxY - bounds.minY) / 2;

const getEdgeValue = (bounds: Bounds, edge: EdgeKey): number => {
  switch (edge) {
    case 'left':
      return bounds.minX;
    case 'right':
      return bounds.maxX;
    case 'centerX':
      return centerXOf(bounds);
    case 'top':
      return bounds.minY;
    case 'bottom':
      return bounds.maxY;
    case 'centerY':
      return centerYOf(bounds);
    default:
      return 0;
  }
};

const computeGuideLine = (
  axis: 'x' | 'y',
  target: number,
  moving: Bounds,
  neighbor?: Bounds
): { start: Vec2; end: Vec2 } => {
  const reference = neighbor ?? moving;
  if (axis === 'x') {
    const startY = Math.min(moving.minY, reference.minY);
    const endY = Math.max(moving.maxY, reference.maxY);
    return {
      start: { x: target, y: startY },
      end: { x: target, y: endY }
    };
  }
  const startX = Math.min(moving.minX, reference.minX);
  const endX = Math.max(moving.maxX, reference.maxX);
  return {
    start: { x: startX, y: target },
    end: { x: endX, y: target }
  };
};

const maintainLock = (
  axis: 'x' | 'y',
  movingRect: Bounds,
  otherRects: RectInfo[],
  tolerance: number,
  lock?: SnapMatchLock,
  centerOnly?: boolean
): SnapMatch | undefined => {
  if (!lock) {
    return undefined;
  }
  if (centerOnly && lock.type !== 'center') {
    return undefined;
  }
  const neighbor = lock.neighborId
    ? otherRects.find((item) => item.id === lock.neighborId)
    : undefined;
  if (lock.neighborId && !neighbor) {
    return undefined;
  }
  const delta = lock.target - getEdgeValue(movingRect, lock.edge);
  if (Math.abs(delta) > tolerance + EPSILON) {
    return undefined;
  }
  const line = computeGuideLine(axis, lock.target, movingRect, neighbor?.bounds);
  return { ...lock, delta, line };
};

const buildCandidate = (
  axis: 'x' | 'y',
  moving: Bounds,
  neighbor: RectInfo,
  edge: EdgeKey,
  neighborEdge: EdgeKey,
  type: 'center' | 'edge'
): SnapMatch => {
  const target = getEdgeValue(neighbor.bounds, neighborEdge);
  const movingValue = getEdgeValue(moving, edge);
  const delta = target - movingValue;
  const line = computeGuideLine(axis, target, moving, neighbor.bounds);
  return {
    axis,
    edge,
    neighborEdge,
    type,
    target,
    neighborId: neighbor.id,
    delta,
    line
  };
};

const createVerticalCandidates = (moving: Bounds, neighbor: RectInfo): SnapMatch[] => {
  return [
    buildCandidate('x', moving, neighbor, 'left', 'left', 'edge'),
    buildCandidate('x', moving, neighbor, 'right', 'right', 'edge'),
    buildCandidate('x', moving, neighbor, 'left', 'right', 'edge'),
    buildCandidate('x', moving, neighbor, 'right', 'left', 'edge'),
    buildCandidate('x', moving, neighbor, 'centerX', 'centerX', 'center')
  ];
};

const createHorizontalCandidates = (moving: Bounds, neighbor: RectInfo): SnapMatch[] => {
  return [
    buildCandidate('y', moving, neighbor, 'top', 'top', 'edge'),
    buildCandidate('y', moving, neighbor, 'bottom', 'bottom', 'edge'),
    buildCandidate('y', moving, neighbor, 'top', 'bottom', 'edge'),
    buildCandidate('y', moving, neighbor, 'bottom', 'top', 'edge'),
    buildCandidate('y', moving, neighbor, 'centerY', 'centerY', 'center')
  ];
};

const resolveAxis = (
  axis: 'x' | 'y',
  movingRect: Bounds,
  otherRects: RectInfo[],
  tolerance: number,
  activeLock?: SnapMatchLock,
  centerOnly?: boolean
): SnapMatch | undefined => {
  const sticky = maintainLock(axis, movingRect, otherRects, tolerance, activeLock, centerOnly);
  if (sticky) {
    return sticky;
  }

  const movingCenterX = centerXOf(movingRect);
  const movingCenterY = centerYOf(movingRect);
  const prioritized = [...otherRects].sort((a, b) => {
    const distanceA = Math.hypot(a.center.x - movingCenterX, a.center.y - movingCenterY);
    const distanceB = Math.hypot(b.center.x - movingCenterX, b.center.y - movingCenterY);
    return distanceA - distanceB;
  });

  let best: SnapMatch | undefined;
  let bestRank = Number.POSITIVE_INFINITY;
  let bestAbsDelta = Number.POSITIVE_INFINITY;

  const considerNeighbors = (neighbors: RectInfo[], baseRank: number) => {
    neighbors.forEach((neighbor, index) => {
      const rank = baseRank + index;
      const candidates =
        axis === 'x'
          ? createVerticalCandidates(movingRect, neighbor)
          : createHorizontalCandidates(movingRect, neighbor);

      candidates.forEach((candidate) => {
        if (centerOnly && candidate.type !== 'center') {
          return;
        }
        const absDelta = Math.abs(candidate.delta);
        if (absDelta > tolerance + EPSILON) {
          return;
        }

        if (!best) {
          best = candidate;
          bestRank = rank;
          bestAbsDelta = absDelta;
          return;
        }

        if (rank < bestRank) {
          best = candidate;
          bestRank = rank;
          bestAbsDelta = absDelta;
          return;
        }

        if (rank === bestRank) {
          if (absDelta + EPSILON < bestAbsDelta) {
            best = candidate;
            bestAbsDelta = absDelta;
            return;
          }
          if (Math.abs(absDelta - bestAbsDelta) <= EPSILON) {
            if (candidate.type === 'center' && best.type !== 'center') {
              best = candidate;
              bestAbsDelta = absDelta;
              return;
            }
            if (candidate.type === best.type && absDelta < bestAbsDelta) {
              best = candidate;
              bestAbsDelta = absDelta;
            }
          }
        }
      });
    });
  };

  const primaryNeighbors = prioritized.slice(0, MAX_SNAP_NEIGHBORS);
  considerNeighbors(primaryNeighbors, 0);

  if (!best && prioritized.length > MAX_SNAP_NEIGHBORS) {
    considerNeighbors(prioritized.slice(MAX_SNAP_NEIGHBORS), MAX_SNAP_NEIGHBORS);
  }

  return best;
};

export const computeSmartGuides = ({
  movingRect,
  otherRects,
  tolerance,
  activeMatches,
  centerOnly
}: SmartGuideParams): SmartGuideResult => {
  const vertical = resolveAxis(
    'x',
    movingRect,
    otherRects,
    tolerance,
    activeMatches?.vertical,
    centerOnly
  );
  const horizontal = resolveAxis(
    'y',
    movingRect,
    otherRects,
    tolerance,
    activeMatches?.horizontal,
    centerOnly
  );

  const guides: SnapMatch[] = [];
  if (vertical) {
    guides.push(vertical);
  }
  if (horizontal) {
    guides.push(horizontal);
  }

  return {
    matches: {
      vertical: vertical ?? undefined,
      horizontal: horizontal ?? undefined
    },
    guides
  };
};

const overlapAlong = (a: Bounds, b: Bounds, axis: 'x' | 'y') =>
  axis === 'x'
    ? Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)
    : Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);

const alignedOnAxis = (a: Bounds, b: Bounds, axis: 'x' | 'y') => {
  const overlap = overlapAlong(a, b, axis);
  if (overlap >= -4) {
    return true;
  }
  if (axis === 'x') {
    const combined = widthOf(a) / 2 + widthOf(b) / 2 + 8;
    return Math.abs(centerXOf(a) - centerXOf(b)) <= combined;
  }
  const combined = heightOf(a) / 2 + heightOf(b) / 2 + 8;
  return Math.abs(centerYOf(a) - centerYOf(b)) <= combined;
};

const midpointBetween = (a: Bounds, b: Bounds, axis: 'x' | 'y') => {
  const overlap = overlapAlong(a, b, axis === 'x' ? 'y' : 'x');
  if (overlap > 0) {
    const start = Math.max(
      axis === 'x' ? a.minY : a.minX,
      axis === 'x' ? b.minY : b.minX
    );
    return axis === 'x' ? start + overlap / 2 : start + overlap / 2;
  }
  return axis === 'x'
    ? (centerYOf(a) + centerYOf(b)) / 2
    : (centerXOf(a) + centerXOf(b)) / 2;
};

interface GapCandidate {
  rect: RectInfo;
  gap: number;
  position: Vec2;
  direction: 'positive' | 'negative';
}

const findHorizontalGap = (
  movingRect: Bounds,
  otherRects: RectInfo[],
  direction: 'left' | 'right'
): GapCandidate | undefined => {
  let best: GapCandidate | undefined;
  otherRects.forEach((candidate) => {
    if (!alignedOnAxis(movingRect, candidate.bounds, 'y')) {
      return;
    }
    if (direction === 'left') {
      if (candidate.bounds.maxX > movingRect.minX) {
        return;
      }
      const gap = movingRect.minX - candidate.bounds.maxX;
      if (gap < 0) {
        return;
      }
      if (!best || gap < best.gap) {
        const y = midpointBetween(movingRect, candidate.bounds, 'x');
        best = {
          rect: candidate,
          gap,
          position: { x: movingRect.minX - gap / 2, y },
          direction: 'negative'
        };
      }
    } else {
      if (candidate.bounds.minX < movingRect.maxX) {
        return;
      }
      const gap = candidate.bounds.minX - movingRect.maxX;
      if (gap < 0) {
        return;
      }
      if (!best || gap < best.gap) {
        const y = midpointBetween(movingRect, candidate.bounds, 'x');
        best = {
          rect: candidate,
          gap,
          position: { x: movingRect.maxX + gap / 2, y },
          direction: 'positive'
        };
      }
    }
  });
  return best;
};

const findVerticalGap = (
  movingRect: Bounds,
  otherRects: RectInfo[],
  direction: 'top' | 'bottom'
): GapCandidate | undefined => {
  let best: GapCandidate | undefined;
  otherRects.forEach((candidate) => {
    if (!alignedOnAxis(movingRect, candidate.bounds, 'x')) {
      return;
    }
    if (direction === 'top') {
      if (candidate.bounds.maxY > movingRect.minY) {
        return;
      }
      const gap = movingRect.minY - candidate.bounds.maxY;
      if (gap < 0) {
        return;
      }
      if (!best || gap < best.gap) {
        const x = midpointBetween(movingRect, candidate.bounds, 'y');
        best = {
          rect: candidate,
          gap,
          position: { x, y: movingRect.minY - gap / 2 },
          direction: 'negative'
        };
      }
    } else {
      if (candidate.bounds.minY < movingRect.maxY) {
        return;
      }
      const gap = candidate.bounds.minY - movingRect.maxY;
      if (gap < 0) {
        return;
      }
      if (!best || gap < best.gap) {
        const x = midpointBetween(movingRect, candidate.bounds, 'y');
        best = {
          rect: candidate,
          gap,
          position: { x, y: movingRect.maxY + gap / 2 },
          direction: 'positive'
        };
      }
    }
  });
  return best;
};

export const computeDistanceBadges = (
  movingRect: Bounds,
  otherRects: RectInfo[],
  equalTolerance = 1
): DistanceBadge[] => {
  const badges: DistanceBadge[] = [];

  const left = findHorizontalGap(movingRect, otherRects, 'left');
  const right = findHorizontalGap(movingRect, otherRects, 'right');
  const top = findVerticalGap(movingRect, otherRects, 'top');
  const bottom = findVerticalGap(movingRect, otherRects, 'bottom');

  if (left) {
    badges.push({
      id: `x-left-${left.rect.id}`,
      axis: 'x',
      position: left.position,
      value: left.gap,
      direction: left.direction
    });
  }
  if (right) {
    badges.push({
      id: `x-right-${right.rect.id}`,
      axis: 'x',
      position: right.position,
      value: right.gap,
      direction: right.direction
    });
  }
  if (top) {
    badges.push({
      id: `y-top-${top.rect.id}`,
      axis: 'y',
      position: top.position,
      value: top.gap,
      direction: top.direction
    });
  }
  if (bottom) {
    badges.push({
      id: `y-bottom-${bottom.rect.id}`,
      axis: 'y',
      position: bottom.position,
      value: bottom.gap,
      direction: bottom.direction
    });
  }

  if (left && right && Math.abs(left.gap - right.gap) <= equalTolerance) {
    badges
      .filter((badge) => badge.axis === 'x')
      .forEach((badge) => {
        badge.equal = true;
      });
  }
  if (top && bottom && Math.abs(top.gap - bottom.gap) <= equalTolerance) {
    badges
      .filter((badge) => badge.axis === 'y')
      .forEach((badge) => {
        badge.equal = true;
      });
  }

  return badges;
};

export const detectSmartSelection = (
  rects: RectInfo[],
  alignmentTolerance = 8,
  spacingTolerance = 2
): SmartSelectionResult | null => {
  if (rects.length < 3) {
    return null;
  }

  const centersX = rects.map((info) => info.center.x);
  const centersY = rects.map((info) => info.center.y);
  const rangeX = Math.max(...centersX) - Math.min(...centersX);
  const rangeY = Math.max(...centersY) - Math.min(...centersY);

  const alignedHorizontally = rangeY <= alignmentTolerance;
  const alignedVertically = rangeX <= alignmentTolerance;

  let axis: 'x' | 'y' | null = null;
  if (alignedHorizontally && !alignedVertically) {
    axis = 'x';
  } else if (!alignedHorizontally && alignedVertically) {
    axis = 'y';
  } else if (alignedHorizontally && alignedVertically) {
    axis = rangeX >= rangeY ? 'x' : 'y';
  } else {
    return null;
  }

  const sorted = [...rects].sort((a, b) =>
    axis === 'x' ? a.bounds.minX - b.bounds.minX : a.bounds.minY - b.bounds.minY
  );

  const handles: SmartSelectionHandle[] = [];
  const rawGaps: number[] = [];

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    const rawGap =
      axis === 'x'
        ? next.bounds.minX - current.bounds.maxX
        : next.bounds.minY - current.bounds.maxY;
    rawGaps.push(rawGap);

    const position =
      axis === 'x'
        ? {
            x: current.bounds.maxX + rawGap / 2,
            y: (current.center.y + next.center.y) / 2
          }
        : {
            x: (current.center.x + next.center.x) / 2,
            y: current.bounds.maxY + rawGap / 2
          };

    handles.push({
      id: `${axis}-${current.id}-${next.id}`,
      axis,
      position,
      beforeId: current.id,
      affectedIds: sorted.slice(index + 1).map((item) => item.id),
      gap: Math.max(0, rawGap),
      rawGap
    });
  }

  if (!handles.length) {
    return null;
  }

  const avgGap = rawGaps.reduce((sum, value) => sum + value, 0) / rawGaps.length;
  const isUniform = rawGaps.every(
    (value) => Math.abs(value - avgGap) <= spacingTolerance + EPSILON
  );

  return {
    axis,
    handles,
    isUniform
  };
};

