import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectorEndpointCap, ConnectorModel, NodeModel, Vec2, cloneConnectorEndpointStyles } from '../types/scene';
import {
  ConnectorPath,
  buildRoundedConnectorPath,
  getConnectorPath,
  getNormalAtRatio,
  getPointAtRatio
} from '../utils/connector';
import { CaretPoint, placeCaretAtPoint } from '../utils/text';

interface DiagramConnectorProps {
  connector: ConnectorModel;
  source?: NodeModel;
  target?: NodeModel;
  nodes: NodeModel[];
  selected: boolean;
  labelEditing: boolean;
  labelEditEntryPoint?: CaretPoint | null;
  commitSignal: number;
  cancelSignal: number;
  onPointerDown: (event: React.PointerEvent<SVGElement>) => void;
  onHandlePointerDown: (event: React.PointerEvent<SVGPathElement>, index: number) => void;
  onEndpointPointerDown: (
    event: React.PointerEvent<SVGCircleElement>,
    endpoint: 'start' | 'end'
  ) => void;
  onCommitLabel: (value: string) => void;
  onCancelLabelEdit: () => void;
  onRequestLabelEdit: (point?: CaretPoint) => void;
  onLabelPointerDown: (event: React.PointerEvent<Element>) => void;
  shouldIgnoreLabelBlur?: () => boolean;
  previewPoints?: Vec2[] | null;
  renderEndpoints?: boolean;
}

const DEFAULT_LABEL_POSITION = 0.5;
const DEFAULT_LABEL_DISTANCE = 18;
const MAX_LABEL_DISTANCE = 60;
const ENDPOINT_HANDLE_OFFSET = 14;
const ENDPOINT_HANDLE_EPSILON = 1e-6;
const ENDPOINT_VISUAL_RADIUS = 6.5;
const ENDPOINT_HIT_RADIUS = 20;
const CAP_DIRECTION_EPSILON = 1e-6;

const normalizeVector = (vector: Vec2): Vec2 => {
  const length = Math.hypot(vector.x, vector.y);
  if (!Number.isFinite(length) || length < CAP_DIRECTION_EPSILON) {
    return { x: 1, y: 0 };
  }
  return { x: vector.x / length, y: vector.y / length };
};

const addVectors = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });

const scaleVector = (vector: Vec2, scale: number): Vec2 => ({
  x: vector.x * scale,
  y: vector.y * scale
});

const perpendicularVector = (vector: Vec2): Vec2 => ({ x: -vector.y, y: vector.x });

const pointsToAttribute = (points: Vec2[]) => points.map((point) => `${point.x},${point.y}`).join(' ');

const buildEndpointOrientation = (points: Vec2[], which: 'start' | 'end') => {
  const anchorIndex = which === 'start' ? 0 : Math.max(points.length - 1, 0);
  const neighborIndex = which === 'start' ? 1 : Math.max(points.length - 2, 0);
  const anchor = points[anchorIndex] ?? { x: 0, y: 0 };
  const neighbor = points[neighborIndex];
  if (!neighbor || points.length < 2) {
    const fallback = which === 'start' ? { x: 1, y: 0 } : { x: -1, y: 0 };
    return { anchor, forward: normalizeVector(fallback) };
  }
  const direction = { x: neighbor.x - anchor.x, y: neighbor.y - anchor.y };
  return { anchor, forward: normalizeVector(direction) };
};

interface EndpointCapRenderArgs {
  key: string;
  anchor: Vec2;
  forward: Vec2;
  cap: ConnectorEndpointCap;
  color: string;
  endpoint: 'start' | 'end';
  strokeWidth: number;
}

const createEndpointCapElement = ({
  key,
  anchor,
  forward,
  cap,
  color,
  endpoint,
  strokeWidth
}: EndpointCapRenderArgs): React.ReactElement => {
  const size = Math.max(2, cap.size || 0);
  const inward = normalizeVector(forward);
  const outward = { x: -inward.x, y: -inward.y };
  const perpendicular = normalizeVector(perpendicularVector(inward));
  const baseWidth = size * 0.9;
  const baseHalfWidth = baseWidth / 2;

  if (cap.shape === 'none') {
    return <React.Fragment key={key} />;
  }

  if (cap.shape === 'circle') {
    return (
      <circle
        key={key}
        className={`diagram-connector__cap diagram-connector__cap--${endpoint} diagram-connector__cap--circle`}
        cx={anchor.x}
        cy={anchor.y}
        r={size / 2}
        fill={color}
        stroke="none"
        pointerEvents="none"
      />
    );
  }

  if (cap.shape === 'diamond') {
    const tipOut = addVectors(anchor, scaleVector(outward, size / 2));
    const tipIn = addVectors(anchor, scaleVector(inward, size / 2));
    const sideA = addVectors(anchor, scaleVector(perpendicular, size / 2));
    const sideB = addVectors(anchor, scaleVector(perpendicular, -size / 2));
    return (
      <polygon
        key={key}
        className={`diagram-connector__cap diagram-connector__cap--${endpoint} diagram-connector__cap--diamond`}
        points={pointsToAttribute([tipOut, sideA, tipIn, sideB])}
        fill={color}
        stroke="none"
        pointerEvents="none"
      />
    );
  }

  if (cap.shape === 'triangle') {
    const baseLeft = addVectors(anchor, scaleVector(perpendicular, baseHalfWidth));
    const baseRight = addVectors(anchor, scaleVector(perpendicular, -baseHalfWidth));
    const tip = addVectors(anchor, scaleVector(inward, size));
    return (
      <polygon
        key={key}
        className={`diagram-connector__cap diagram-connector__cap--${endpoint} diagram-connector__cap--triangle`}
        points={pointsToAttribute([baseLeft, baseRight, tip])}
        fill={color}
        stroke="none"
        pointerEvents="none"
      />
    );
  }

  const baseCenter = addVectors(anchor, scaleVector(inward, size));
  const baseLeft = addVectors(baseCenter, scaleVector(perpendicular, baseHalfWidth));
  const baseRight = addVectors(baseCenter, scaleVector(perpendicular, -baseHalfWidth));
  const tip = anchor;

  if (cap.shape === 'hollow-arrow') {
    const outlineWidth = Math.max(1, Math.min(size / 2.5, strokeWidth + 1));
    const path = `M ${tip.x} ${tip.y} L ${baseLeft.x} ${baseLeft.y} L ${baseRight.x} ${baseRight.y} Z`;
    return (
      <path
        key={key}
        className={`diagram-connector__cap diagram-connector__cap--${endpoint} diagram-connector__cap--hollow`}
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={outlineWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="none"
      />
    );
  }

  return (
    <polygon
      key={key}
      className={`diagram-connector__cap diagram-connector__cap--${endpoint} diagram-connector__cap--arrow`}
      points={pointsToAttribute([tip, baseLeft, baseRight])}
      fill={color}
      stroke="none"
      pointerEvents="none"
    />
  );
};

const clampLabel = (value: string) => value.trim();

const clampLabelOffset = (value: number) =>
  Math.max(-MAX_LABEL_DISTANCE, Math.min(MAX_LABEL_DISTANCE, value));

const clampLabelRadius = (value: number) =>
  Math.max(0, Math.min(MAX_LABEL_DISTANCE, Math.abs(value)));

const computeEndpointHandleCenter = (points: Vec2[], which: 'start' | 'end'): Vec2 => {
  const anchorIndex = which === 'start' ? 0 : points.length - 1;
  const neighborIndex = which === 'start' ? 1 : points.length - 2;
  const anchor = points[anchorIndex];
  const neighbor = points[neighborIndex];

  if (!anchor) {
    return { x: 0, y: 0 };
  }

  if (!neighbor) {
    return { x: anchor.x, y: anchor.y };
  }

  const delta = { x: neighbor.x - anchor.x, y: neighbor.y - anchor.y };
  const length = Math.hypot(delta.x, delta.y);

  if (length <= ENDPOINT_HANDLE_EPSILON) {
    return { x: anchor.x, y: anchor.y };
  }

  const scale = ENDPOINT_HANDLE_OFFSET / length;

  return {
    x: anchor.x + delta.x * scale,
    y: anchor.y + delta.y * scale
  };
};

const useConnectorGeometry = (
  connector: ConnectorModel,
  source: NodeModel | undefined,
  target: NodeModel | undefined,
  nodes: NodeModel[],
  previewPoints: Vec2[] | null | undefined
) => {
  const previewGeometry = useMemo<ConnectorPath | null>(() => {
    if (!previewPoints || previewPoints.length < 2) {
      return null;
    }
    const start = { ...previewPoints[0] };
    const end = { ...previewPoints[previewPoints.length - 1] };
    const waypoints = previewPoints
      .slice(1, previewPoints.length - 1)
      .map((point) => ({ ...point }));
    return {
      start,
      end,
      waypoints,
      points: previewPoints.map((point) => ({ ...point }))
    };
  }, [previewPoints]);

  return useMemo(
    () => previewGeometry ?? getConnectorPath(connector, source, target, nodes),
    [previewGeometry, connector, source, target, nodes]
  );
};

const elbowHandlePath = (previous: Vec2, current: Vec2, next: Vec2) => {
  const handleLength = 12;
  const inDir = {
    x: previous.x < current.x ? -1 : previous.x > current.x ? 1 : 0,
    y: previous.y < current.y ? -1 : previous.y > current.y ? 1 : 0
  };
  const outDir = {
    x: next.x < current.x ? -1 : next.x > current.x ? 1 : 0,
    y: next.y < current.y ? -1 : next.y > current.y ? 1 : 0
  };

  const first = {
    x: current.x + inDir.x * handleLength,
    y: current.y + inDir.y * handleLength
  };
  const second = {
    x: current.x + outDir.x * handleLength,
    y: current.y + outDir.y * handleLength
  };

  return `M ${first.x} ${first.y} L ${current.x} ${current.y} L ${second.x} ${second.y}`;
};

export const DiagramConnector: React.FC<DiagramConnectorProps> = ({
  connector,
  source,
  target,
  nodes,
  selected,
  labelEditing,
  labelEditEntryPoint,
  commitSignal,
  cancelSignal,
  onPointerDown,
  onHandlePointerDown,
  onEndpointPointerDown,
  onCommitLabel,
  onCancelLabelEdit,
  onRequestLabelEdit,
  onLabelPointerDown,
  shouldIgnoreLabelBlur,
  previewPoints,
  renderEndpoints = true
}) => {
  const [draft, setDraft] = useState(connector.label ?? '');
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);
  const [hoveredEndpoint, setHoveredEndpoint] = useState<'start' | 'end' | null>(null);
  const labelRef = useRef<HTMLDivElement | null>(null);
  const isComposingRef = useRef(false);
  const previousCommitRef = useRef(commitSignal);
  const previousCancelRef = useRef(cancelSignal);

  const hasFocusedRef = useRef(false);

  useEffect(() => {
    if (!labelEditing) {
      setDraft(connector.label ?? '');
      hasFocusedRef.current = false;
    }
  }, [connector.label, labelEditing]);

  useEffect(() => {
    if (!labelEditing) {
      return;
    }
    const element = labelRef.current;
    if (!element) {
      return;
    }
    if (!hasFocusedRef.current) {
      element.textContent = draft;
      const frame = requestAnimationFrame(() => {
        element.focus({ preventScroll: true });
        if (labelEditEntryPoint) {
          placeCaretAtPoint(element, labelEditEntryPoint);
        } else {
          const selection = window.getSelection();
          if (!selection) {
            return;
          }
          const range = document.createRange();
          range.selectNodeContents(element);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      });
      hasFocusedRef.current = true;
      return () => cancelAnimationFrame(frame);
    }
    if (element.textContent !== draft) {
      element.textContent = draft;
    }
  }, [labelEditing, draft, labelEditEntryPoint]);

  const geometry = useConnectorGeometry(connector, source, target, nodes, previewPoints);

  const startHandleCenter = useMemo(
    () => computeEndpointHandleCenter(geometry.points, 'start'),
    [geometry]
  );

  const endHandleCenter = useMemo(
    () => computeEndpointHandleCenter(geometry.points, 'end'),
    [geometry]
  );

  const cornerRadius = connector.style.cornerRadius ?? 12;

  const pathData = useMemo(
    () => buildRoundedConnectorPath(geometry.points, cornerRadius),
    [geometry, cornerRadius]
  );

  const hitPathData = useMemo(() => buildRoundedConnectorPath(geometry.points, 0), [geometry]);

  const segments = useMemo(() => {
    const list: Array<{ start: Vec2; end: Vec2; axis: 'horizontal' | 'vertical'; index: number }> = [];
    for (let index = 0; index < geometry.points.length - 1; index += 1) {
      const start = geometry.points[index];
      const end = geometry.points[index + 1];
      const axis = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y) ? 'horizontal' : 'vertical';
      list.push({ start, end, axis, index });
    }
    return list;
  }, [geometry]);

  useEffect(() => {
    if (!selected) {
      setHoveredSegment(null);
      setHoveredEndpoint(null);
    }
  }, [selected]);

  const labelPosition = connector.labelPosition ?? DEFAULT_LABEL_POSITION;
  const rawLabelOffset = connector.labelOffset ?? DEFAULT_LABEL_DISTANCE;
  const labelRadius = clampLabelRadius(rawLabelOffset);
  const labelOffset = clampLabelOffset(rawLabelOffset);
  const hasCustomAngle = typeof connector.labelAngle === 'number';
  const labelAngle = hasCustomAngle ? connector.labelAngle ?? 0 : undefined;

  const labelPlacement = useMemo(() => {
    const { point, segmentIndex } = getPointAtRatio(geometry.points, labelPosition);
    if (hasCustomAngle && typeof labelAngle === 'number') {
      const center = {
        x: point.x + Math.cos(labelAngle) * labelRadius,
        y: point.y + Math.sin(labelAngle) * labelRadius
      };
      const delta = { x: center.x - point.x, y: center.y - point.y };
      const length = Math.hypot(delta.x, delta.y);
      const normal =
        length > 1e-6 ? { x: delta.x / length, y: delta.y / length } : getNormalAtRatio(geometry.points, segmentIndex);
      return { anchor: point, center, normal, segmentIndex };
    }
    const normal = getNormalAtRatio(geometry.points, segmentIndex);
    const center = {
      x: point.x + normal.x * labelOffset,
      y: point.y + normal.y * labelOffset
    };
    return { anchor: point, center, normal, segmentIndex };
  }, [geometry, labelPosition, labelRadius, labelOffset, labelAngle, hasCustomAngle]);

  const endpointColor = connector.style.stroke;
  const endpointStyles = useMemo(
    () => cloneConnectorEndpointStyles(connector.endpointStyles),
    [connector.endpointStyles]
  );
  const startOrientation = buildEndpointOrientation(geometry.points, 'start');
  const endOrientation = buildEndpointOrientation(geometry.points, 'end');
  const startCapElement = createEndpointCapElement({
    key: `${connector.id}-start-cap`,
    anchor: startOrientation.anchor,
    forward: startOrientation.forward,
    cap: endpointStyles.start,
    color: endpointColor,
    endpoint: 'start',
    strokeWidth: connector.style.strokeWidth
  });
  const endCapElement = createEndpointCapElement({
    key: `${connector.id}-end-cap`,
    anchor: endOrientation.anchor,
    forward: endOrientation.forward,
    cap: endpointStyles.end,
    color: endpointColor,
    endpoint: 'end',
    strokeWidth: connector.style.strokeWidth
  });

  const handleLabelInput = (event: React.FormEvent<HTMLDivElement>) => {
    setDraft(event.currentTarget.textContent ?? '');
  };

  const handleLabelCompositionStart = () => {
    isComposingRef.current = true;
  };

  const handleLabelCompositionEnd = (event: React.CompositionEvent<HTMLDivElement>) => {
    isComposingRef.current = false;
    setDraft(event.currentTarget.textContent ?? '');
  };

  const commitDraft = () => {
    const element = labelRef.current;
    const content = element?.textContent ?? draft;
    const next = clampLabel(content);
    if (next !== (connector.label ?? '')) {
      onCommitLabel(next);
    } else {
      onCancelLabelEdit();
    }
  };

  useEffect(() => {
    if (!labelEditing) {
      previousCommitRef.current = commitSignal;
      return;
    }
    if (commitSignal !== previousCommitRef.current) {
      previousCommitRef.current = commitSignal;
      commitDraft();
    }
  }, [commitSignal, labelEditing]);

  useEffect(() => {
    if (!labelEditing) {
      previousCancelRef.current = cancelSignal;
      return;
    }
    if (cancelSignal !== previousCancelRef.current) {
      previousCancelRef.current = cancelSignal;
      setDraft(connector.label ?? '');
      onCancelLabelEdit();
    }
  }, [cancelSignal, connector.label, labelEditing, onCancelLabelEdit]);

  const handleLabelBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!labelEditing) {
      return;
    }
    if (shouldIgnoreLabelBlur?.()) {
      event.stopPropagation();
      return;
    }
    commitDraft();
  };

  const handleLabelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === 'Enter' && !event.shiftKey) {
      if (isComposingRef.current) {
        return;
      }
      event.preventDefault();
      commitDraft();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(connector.label ?? '');
      onCancelLabelEdit();
    }
  };

  const handleLabelPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!text) {
      return;
    }
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.setEndAfter(node);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      document.execCommand('insertText', false, text);
    }
    const element = labelRef.current;
    setDraft(element?.textContent ?? '');
  };

  const handleLabelPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (labelEditing) {
      event.stopPropagation();
      return;
    }
    event.stopPropagation();
    onLabelPointerDown(event);
  };

  const labelFontSize = connector.labelStyle?.fontSize ?? 14;
  const labelFontWeight = connector.labelStyle?.fontWeight ?? 600;
  const labelColor = connector.labelStyle?.color ?? '#f8fafc';
  const labelBackground = connector.labelStyle?.background ?? 'rgba(15,23,42,0.85)';

  const trimmedLabel = connector.label?.trim() ?? '';
  const hasLabel = Boolean(trimmedLabel) || labelEditing;
  const isLabelEmpty = labelEditing ? draft.trim().length === 0 : trimmedLabel.length === 0;
  const displayLabel = trimmedLabel.length ? connector.label ?? '' : 'Label';
  const labelClassName = [
    'diagram-connector__label',
    labelEditing ? 'is-editing' : '',
    isLabelEmpty ? 'is-empty' : ''
  ]
    .filter(Boolean)
    .join(' ');

  const handleLabelDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    onRequestLabelEdit({ x: event.clientX, y: event.clientY });
  };

  const startHovered = hoveredEndpoint === 'start';
  const endHovered = hoveredEndpoint === 'end';

  return (
    <g
      className={`diagram-connector ${selected ? 'is-selected' : ''}`}
      style={{
        ['--connector-width' as string]: `${connector.style.strokeWidth}`
      } as React.CSSProperties}
    >
      <path className="diagram-connector__hit" d={hitPathData} strokeWidth={28} onPointerDown={onPointerDown} />
      {segments.map((segment) => {
        const isHovered = hoveredSegment === segment.index;
        const cursor = segment.axis === 'horizontal' ? 'ns-resize' : 'ew-resize';
        const length = Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y);
        const showHandle =
          selected && length >= 6 && Number.isFinite(length);
        const centerX = (segment.start.x + segment.end.x) / 2;
        const centerY = (segment.start.y + segment.end.y) / 2;
        return (
          <React.Fragment key={`${connector.id}-segment-${segment.index}`}>
            <path
              className={`diagram-connector__segment${isHovered ? ' is-hovered' : ''}`}
              d={`M ${segment.start.x} ${segment.start.y} L ${segment.end.x} ${segment.end.y}`}
              onPointerEnter={() => setHoveredSegment(segment.index)}
              onPointerLeave={() =>
                setHoveredSegment((value) => (value === segment.index ? null : value))
              }
              onPointerDown={(event) => {
                setHoveredSegment(segment.index);
                onPointerDown(event);
              }}
              style={{ cursor }}
            />
            {showHandle && (
              <circle
                className={`diagram-connector__segment-handle${isHovered ? ' is-hovered' : ''}`}
                cx={centerX}
                cy={centerY}
                r={7}
                onPointerEnter={() => setHoveredSegment(segment.index)}
                onPointerLeave={() =>
                  setHoveredSegment((value) => (value === segment.index ? null : value))
                }
                onPointerDown={(event) => {
                  event.stopPropagation();
                  setHoveredSegment(segment.index);
                  onPointerDown(event);
                }}
                style={{ cursor }}
              />
            )}
          </React.Fragment>
        );
      })}
      <path
        className="diagram-connector__line"
        d={pathData}
        stroke={connector.style.stroke}
        strokeWidth={connector.style.strokeWidth}
        strokeDasharray={connector.style.dashed ? '12 8' : undefined}
        onPointerDown={onPointerDown}
      />
      <g className="diagram-connector__endpoint-caps" pointerEvents="none">
        {startCapElement}
        {endCapElement}
      </g>
      {selected && renderEndpoints && (
        <>
          <g
            className={`diagram-connector__endpoint-group${startHovered ? ' is-hovered' : ''}`}
            style={{ color: endpointColor }}
          >
            <circle
              className={`diagram-connector__endpoint-visual${startHovered ? ' is-hovered' : ''}`}
              cx={startHandleCenter.x}
              cy={startHandleCenter.y}
              r={ENDPOINT_VISUAL_RADIUS}
            />
            <circle
              className={`diagram-connector__endpoint-hit${startHovered ? ' is-hovered' : ''}`}
              cx={startHandleCenter.x}
              cy={startHandleCenter.y}
              r={ENDPOINT_HIT_RADIUS}
              onPointerEnter={() => setHoveredEndpoint('start')}
              onPointerLeave={() =>
                setHoveredEndpoint((value) => (value === 'start' ? null : value))
              }
              onPointerDown={(event) => {
                setHoveredEndpoint('start');
                onEndpointPointerDown(event, 'start');
              }}
            />
          </g>
          <g
            className={`diagram-connector__endpoint-group${endHovered ? ' is-hovered' : ''}`}
            style={{ color: endpointColor }}
          >
            <circle
              className={`diagram-connector__endpoint-visual${endHovered ? ' is-hovered' : ''}`}
              cx={endHandleCenter.x}
              cy={endHandleCenter.y}
              r={ENDPOINT_VISUAL_RADIUS}
            />
            <circle
              className={`diagram-connector__endpoint-hit${endHovered ? ' is-hovered' : ''}`}
              cx={endHandleCenter.x}
              cy={endHandleCenter.y}
              r={ENDPOINT_HIT_RADIUS}
              onPointerEnter={() => setHoveredEndpoint('end')}
              onPointerLeave={() => setHoveredEndpoint((value) => (value === 'end' ? null : value))}
              onPointerDown={(event) => {
                setHoveredEndpoint('end');
                onEndpointPointerDown(event, 'end');
              }}
            />
          </g>
        </>
      )}
      {selected &&
        geometry.points.slice(1, geometry.points.length - 1).map((point, index) => {
          const previous = geometry.points[index];
          const next = geometry.points[index + 2];
          if (!previous || !next) {
            return null;
          }
          return (
            <path
              key={`${connector.id}-handle-${index}`}
              className="diagram-connector__handle"
              d={elbowHandlePath(previous, point, next)}
              onPointerDown={(event) => {
                event.stopPropagation();
                onHandlePointerDown(event, index);
              }}
            />
          );
        })}
      {hasLabel && (
        <>
          {selected && (
            <>
              <line
                className="diagram-connector__label-leader"
                x1={labelPlacement.anchor.x}
                y1={labelPlacement.anchor.y}
                x2={labelPlacement.center.x}
                y2={labelPlacement.center.y}
              />
              <circle
                className="diagram-connector__label-handle"
                cx={labelPlacement.anchor.x}
                cy={labelPlacement.anchor.y}
                r={8}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onLabelPointerDown(event);
                }}
              />
            </>
          )}
          <foreignObject x={labelPlacement.center.x - 80} y={labelPlacement.center.y - 28} width={160} height={56}>
            <div
              ref={labelRef}
              className={labelClassName}
              data-placeholder="Label"
              contentEditable={labelEditing}
              suppressContentEditableWarning
              spellCheck={false}
              translate="no"
              style={{
                fontSize: labelFontSize,
                fontWeight: labelFontWeight,
                color: labelColor,
                background: labelBackground
              }}
              onPointerDown={handleLabelPointerDown}
              onInput={handleLabelInput}
              onBlur={handleLabelBlur}
              onKeyDown={handleLabelKeyDown}
              onCompositionStart={handleLabelCompositionStart}
              onCompositionEnd={handleLabelCompositionEnd}
              onPaste={handleLabelPaste}
              onDoubleClick={handleLabelDoubleClick}
            >
              {!labelEditing ? displayLabel : undefined}
            </div>
          </foreignObject>
        </>
      )}
    </g>
  );
};

interface DiagramConnectorEndpointsProps {
  connector: ConnectorModel;
  source?: NodeModel;
  target?: NodeModel;
  nodes: NodeModel[];
  onEndpointPointerDown: (
    event: React.PointerEvent<SVGCircleElement>,
    endpoint: 'start' | 'end'
  ) => void;
  previewPoints?: Vec2[] | null;
}

export const DiagramConnectorEndpoints: React.FC<DiagramConnectorEndpointsProps> = ({
  connector,
  source,
  target,
  nodes,
  onEndpointPointerDown,
  previewPoints
}) => {
  const [hoveredEndpoint, setHoveredEndpoint] = useState<'start' | 'end' | null>(null);

  const geometry = useConnectorGeometry(connector, source, target, nodes, previewPoints);

  const startHandleCenter = useMemo(
    () => computeEndpointHandleCenter(geometry.points, 'start'),
    [geometry]
  );

  const endHandleCenter = useMemo(
    () => computeEndpointHandleCenter(geometry.points, 'end'),
    [geometry]
  );

  useEffect(() => {
    setHoveredEndpoint(null);
  }, [connector.id, geometry]);

  const startHovered = hoveredEndpoint === 'start';
  const endHovered = hoveredEndpoint === 'end';
  const endpointColor = connector.style.stroke;

  return (
    <>
      <g
        className={`diagram-connector__endpoint-group${startHovered ? ' is-hovered' : ''}`}
        style={{ color: endpointColor }}
      >
        <circle
          className={`diagram-connector__endpoint-visual${startHovered ? ' is-hovered' : ''}`}
          cx={startHandleCenter.x}
          cy={startHandleCenter.y}
          r={ENDPOINT_VISUAL_RADIUS}
        />
        <circle
          className={`diagram-connector__endpoint-hit${startHovered ? ' is-hovered' : ''}`}
          cx={startHandleCenter.x}
          cy={startHandleCenter.y}
          r={ENDPOINT_HIT_RADIUS}
          onPointerEnter={() => setHoveredEndpoint('start')}
          onPointerLeave={() => setHoveredEndpoint((value) => (value === 'start' ? null : value))}
          onPointerDown={(event) => {
            setHoveredEndpoint('start');
            onEndpointPointerDown(event, 'start');
          }}
        />
      </g>
      <g
        className={`diagram-connector__endpoint-group${endHovered ? ' is-hovered' : ''}`}
        style={{ color: endpointColor }}
      >
        <circle
          className={`diagram-connector__endpoint-visual${endHovered ? ' is-hovered' : ''}`}
          cx={endHandleCenter.x}
          cy={endHandleCenter.y}
          r={ENDPOINT_VISUAL_RADIUS}
        />
        <circle
          className={`diagram-connector__endpoint-hit${endHovered ? ' is-hovered' : ''}`}
          cx={endHandleCenter.x}
          cy={endHandleCenter.y}
          r={ENDPOINT_HIT_RADIUS}
          onPointerEnter={() => setHoveredEndpoint('end')}
          onPointerLeave={() => setHoveredEndpoint((value) => (value === 'end' ? null : value))}
          onPointerDown={(event) => {
            setHoveredEndpoint('end');
            onEndpointPointerDown(event, 'end');
          }}
        />
      </g>
    </>
  );
};
