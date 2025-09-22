import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowShape, ConnectorModel, NodeModel, Vec2 } from '../types/scene';
import { getConnectorPath, getNormalAtRatio, getPointAtRatio, getPolylineMidpoint } from '../utils/connector';

interface DiagramConnectorProps {
  connector: ConnectorModel;
  source?: NodeModel;
  target?: NodeModel;
  selected: boolean;
  labelEditing: boolean;
  commitSignal: number;
  cancelSignal: number;
  onPointerDown: (event: React.PointerEvent<SVGPathElement>) => void;
  onHandlePointerDown: (event: React.PointerEvent<SVGPathElement>, index: number) => void;
  onEndpointPointerDown: (
    event: React.PointerEvent<SVGCircleElement>,
    endpoint: 'start' | 'end'
  ) => void;
  onCommitLabel: (value: string) => void;
  onCancelLabelEdit: () => void;
  onRequestLabelEdit: () => void;
  onLabelPointerDown: (event: React.PointerEvent<SVGCircleElement>) => void;
}

const DEFAULT_LABEL_POSITION = 0.5;
const DEFAULT_LABEL_OFFSET = 18;

const clampLabel = (value: string) => value.trim();

const arrowPathForShape = (shape: ArrowShape, orientation: 'start' | 'end'): string | null => {
  switch (shape) {
    case 'triangle':
      return orientation === 'end'
        ? 'M12 1 L0 6 L12 11 Z'
        : 'M0 1 L12 6 L0 11 Z';
    case 'arrow':
      return orientation === 'end'
        ? 'M0 1 L12 6 L0 11 Z'
        : 'M12 1 L0 6 L12 11 Z';
    case 'line-arrow':
      return orientation === 'end'
        ? 'M0 1 L12 6 L0 11'
        : 'M12 1 L0 6 L12 11';
    case 'diamond':
      return orientation === 'end'
        ? 'M0 6 L6 0 L12 6 L6 12 Z'
        : 'M12 6 L6 0 L0 6 L6 12 Z';
    case 'circle':
      return 'M6 0 A6 6 0 1 1 5.999 0 Z';
    default:
      return null;
  }
};

const markerRefXForShape = (shape: ArrowShape, orientation: 'start' | 'end'): number => {
  if (orientation === 'start') {
    return 0;
  }

  if (shape === 'triangle') {
    return 0;
  }

  return 12;
};

const markerVisualsForShape = (
  shape: ArrowShape,
  fill: 'filled' | 'outlined',
  strokeColor: string
): { fill: string; stroke: string; strokeWidth: number } => {
  if (shape === 'line-arrow') {
    return { fill: 'transparent', stroke: strokeColor, strokeWidth: 1.5 };
  }

  if (shape === 'triangle' || shape === 'arrow') {
    return { fill: strokeColor, stroke: 'none', strokeWidth: 0 };
  }

  if (fill === 'filled') {
    return { fill: strokeColor, stroke: 'none', strokeWidth: 0 };
  }

  return { fill: 'transparent', stroke: strokeColor, strokeWidth: 1.3 };
};

const buildRoundedPath = (points: Vec2[], radius: number) => {
  if (!points.length) {
    return '';
  }
  if (points.length === 1) {
    const point = points[0];
    return `M ${point.x} ${point.y}`;
  }

  const clampRadius = Math.max(0, radius || 0);
  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[index - 1];

    if (index < points.length - 1 && clampRadius > 0.01) {
      const next = points[index + 1];
      const incoming = { x: current.x - previous.x, y: current.y - previous.y };
      const outgoing = { x: next.x - current.x, y: next.y - current.y };
      const incomingLength = Math.hypot(incoming.x, incoming.y);
      const outgoingLength = Math.hypot(outgoing.x, outgoing.y);

      if (incomingLength > 0.01 && outgoingLength > 0.01) {
        const inUnit = { x: incoming.x / incomingLength, y: incoming.y / incomingLength };
        const outUnit = { x: outgoing.x / outgoingLength, y: outgoing.y / outgoingLength };
        const safeRadius = Math.min(clampRadius, incomingLength / 2, outgoingLength / 2);
        const before = {
          x: current.x - inUnit.x * safeRadius,
          y: current.y - inUnit.y * safeRadius
        };
        const after = {
          x: current.x + outUnit.x * safeRadius,
          y: current.y + outUnit.y * safeRadius
        };
        path += ` L ${before.x} ${before.y} Q ${current.x} ${current.y} ${after.x} ${after.y}`;
        continue;
      }
    }

    path += ` L ${current.x} ${current.y}`;
  }

  return path;
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
  selected,
  labelEditing,
  commitSignal,
  cancelSignal,
  onPointerDown,
  onHandlePointerDown,
  onEndpointPointerDown,
  onCommitLabel,
  onCancelLabelEdit,
  onRequestLabelEdit,
  onLabelPointerDown
}) => {
  const [draft, setDraft] = useState(connector.label ?? '');
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);
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
        const selection = window.getSelection();
        if (!selection) {
          return;
        }
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
      });
      hasFocusedRef.current = true;
      return () => cancelAnimationFrame(frame);
    }
    if (element.textContent !== draft) {
      element.textContent = draft;
    }
  }, [labelEditing, draft]);

  const geometry = useMemo(() => getConnectorPath(connector, source, target), [connector, source, target]);

  const cornerRadius = connector.mode === 'elbow' ? connector.style.cornerRadius ?? 12 : 0;

  const pathData = useMemo(() => buildRoundedPath(geometry.points, cornerRadius), [geometry, cornerRadius]);

  const hitPathData = useMemo(() => buildRoundedPath(geometry.points, 0), [geometry]);

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
    }
  }, [selected]);

  const midpoint = useMemo(() => getPolylineMidpoint(geometry.points), [geometry]);

  const labelPosition = connector.labelPosition ?? DEFAULT_LABEL_POSITION;
  const labelOffset = connector.labelOffset ?? DEFAULT_LABEL_OFFSET;

  const labelPlacement = useMemo(() => {
    const { point, segmentIndex } = getPointAtRatio(geometry.points, labelPosition);
    const normal = getNormalAtRatio(geometry.points, segmentIndex);
    const center = {
      x: point.x + normal.x * labelOffset,
      y: point.y + normal.y * labelOffset
    };
    return { anchor: point, center, normal, segmentIndex };
  }, [geometry, labelPosition, labelOffset, midpoint]);

  const arrowStroke = connector.style.stroke;
  const arrowSize = Math.max(0.6, connector.style.arrowSize ?? 1);
  const startMarkerId = useMemo(() => `connector-${connector.id}-start`, [connector.id]);
  const endMarkerId = useMemo(() => `connector-${connector.id}-end`, [connector.id]);

  const startArrowShape = connector.style.startArrow?.shape ?? 'none';
  const endArrowShape = connector.style.endArrow?.shape ?? 'none';
  const startArrowFill =
    startArrowShape === 'line-arrow' ? 'outlined' : connector.style.startArrow?.fill ?? 'filled';
  const endArrowFill =
    endArrowShape === 'line-arrow' ? 'outlined' : connector.style.endArrow?.fill ?? 'filled';
  const startRefX = markerRefXForShape(startArrowShape, 'start');
  const endRefX = markerRefXForShape(endArrowShape, 'end');
  const startVisual = markerVisualsForShape(startArrowShape, startArrowFill, arrowStroke);
  const endVisual = markerVisualsForShape(endArrowShape, endArrowFill, arrowStroke);
  const startLineCap = startArrowShape === 'line-arrow' ? 'round' : 'butt';
  const endLineCap = endArrowShape === 'line-arrow' ? 'round' : 'butt';

  const startMarker = startArrowShape !== 'none' && (
    <marker
      id={startMarkerId}
      viewBox="0 0 12 12"
      markerWidth={12 * arrowSize}
      markerHeight={12 * arrowSize}
      refX={startRefX}
      refY={6}
      orient="auto"
      markerUnits="strokeWidth"
    >
      {startArrowShape === 'circle' ? (
        <circle
          cx={6}
          cy={6}
          r={4}
          fill={startVisual.fill}
          stroke={startVisual.stroke}
          strokeWidth={startVisual.strokeWidth}
        />
      ) : (
        <path
          d={arrowPathForShape(startArrowShape, 'start') ?? ''}
          fill={startVisual.fill}
          stroke={startVisual.stroke}
          strokeWidth={startVisual.strokeWidth}
          strokeLinecap={startLineCap}
          strokeLinejoin="round"
        />
      )}
    </marker>
  );

  const endMarker = endArrowShape !== 'none' && (
    <marker
      id={endMarkerId}
      viewBox="0 0 12 12"
      markerWidth={12 * arrowSize}
      markerHeight={12 * arrowSize}
      refX={endRefX}
      refY={6}
      orient="auto"
      markerUnits="strokeWidth"
    >
      {endArrowShape === 'circle' ? (
        <circle
          cx={6}
          cy={6}
          r={4}
          fill={endVisual.fill}
          stroke={endVisual.stroke}
          strokeWidth={endVisual.strokeWidth}
        />
      ) : (
        <path
          d={arrowPathForShape(endArrowShape, 'end') ?? ''}
          fill={endVisual.fill}
          stroke={endVisual.stroke}
          strokeWidth={endVisual.strokeWidth}
          strokeLinecap={endLineCap}
          strokeLinejoin="round"
        />
      )}
    </marker>
  );

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

  const handleLabelBlur = () => {
    if (!labelEditing) {
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
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const labelFontSize = connector.labelStyle?.fontSize ?? 14;
  const labelFontWeight = connector.labelStyle?.fontWeight ?? 600;
  const labelColor = connector.labelStyle?.color ?? '#f8fafc';
  const labelBackground = connector.labelStyle?.background ?? 'rgba(15,23,42,0.85)';

  const markerStartUrl = startArrowShape !== 'none' ? `url(#${startMarkerId})` : undefined;
  const markerEndUrl = endArrowShape !== 'none' ? `url(#${endMarkerId})` : undefined;

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
    event.stopPropagation();
    onRequestLabelEdit();
  };

  return (
    <g
      className={`diagram-connector ${selected ? 'is-selected' : ''}`}
      style={{
        ['--connector-width' as string]: `${connector.style.strokeWidth}`
      } as React.CSSProperties}
    >
      <defs>
        {startMarker}
        {endMarker}
      </defs>
      <path className="diagram-connector__hit" d={hitPathData} strokeWidth={28} onPointerDown={onPointerDown} />
      {segments.map((segment) => {
        const isHovered = hoveredSegment === segment.index;
        const cursor = segment.axis === 'horizontal' ? 'ns-resize' : 'ew-resize';
        return (
          <path
            key={`${connector.id}-segment-${segment.index}`}
            className={`diagram-connector__segment${isHovered ? ' is-hovered' : ''}`}
            d={`M ${segment.start.x} ${segment.start.y} L ${segment.end.x} ${segment.end.y}`}
            onPointerEnter={() => setHoveredSegment(segment.index)}
            onPointerLeave={() => setHoveredSegment((value) => (value === segment.index ? null : value))}
            onPointerDown={(event) => {
              setHoveredSegment(segment.index);
              onPointerDown(event);
            }}
            style={{ cursor }}
          />
        );
      })}
      <path
        className="diagram-connector__line"
        d={pathData}
        stroke={connector.style.stroke}
        strokeWidth={connector.style.strokeWidth}
        strokeDasharray={connector.style.dashed ? '12 8' : undefined}
        markerStart={markerStartUrl}
        markerEnd={markerEndUrl}
        onPointerDown={onPointerDown}
      />
      {selected && (
        <>
          <circle
            className="diagram-connector__endpoint-hit"
            cx={geometry.start.x}
            cy={geometry.start.y}
            r={12}
            onPointerDown={(event) => onEndpointPointerDown(event, 'start')}
          />
          <circle
            className="diagram-connector__endpoint-hit"
            cx={geometry.end.x}
            cy={geometry.end.y}
            r={12}
            onPointerDown={(event) => onEndpointPointerDown(event, 'end')}
          />
        </>
      )}
      {selected && connector.mode === 'elbow' &&
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
