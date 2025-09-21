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
      return orientation === 'end' ? 'M0 0 L12 6 L0 12 Z' : 'M12 0 L0 6 L12 12 Z';
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

const buildCurvedPath = (points: Vec2[]) => {
  if (!points.length) {
    return '';
  }
  if (points.length === 1) {
    const point = points[0];
    return `M ${point.x} ${point.y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = index === 0 ? points[index] : points[index - 1];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = index + 2 < points.length ? points[index + 2] : points[index + 1];

    const c1 = {
      x: p1.x + (p2.x - p0.x) / 6,
      y: p1.y + (p2.y - p0.y) / 6
    };
    const c2 = {
      x: p2.x - (p3.x - p1.x) / 6,
      y: p2.y - (p3.y - p1.y) / 6
    };

    path += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`;
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
  const labelRef = useRef<HTMLDivElement | null>(null);
  const previousCommitRef = useRef(commitSignal);
  const previousCancelRef = useRef(cancelSignal);

  useEffect(() => {
    if (!labelEditing) {
      setDraft(connector.label ?? '');
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
    element.innerText = connector.label ?? '';
    const frame = requestAnimationFrame(() => {
      element.focus({ preventScroll: true });
      document.getSelection()?.selectAllChildren(element);
    });
    return () => cancelAnimationFrame(frame);
  }, [labelEditing, connector.label]);

  const geometry = useMemo(() => {
    if (!source || !target) {
      return null;
    }
    return getConnectorPath(connector, source, target);
  }, [connector, source, target]);

  const cornerRadius = connector.mode === 'orthogonal' ? connector.style.cornerRadius ?? 12 : 0;

  const anchors = useMemo(() => {
    if (!geometry) {
      return [] as Vec2[];
    }
    return [geometry.start, ...geometry.waypoints, geometry.end];
  }, [geometry]);

  const pathData = useMemo(() => {
    if (!geometry) {
      return '';
    }
    if (connector.mode === 'curved') {
      return buildCurvedPath(anchors);
    }
    return buildRoundedPath(geometry.points, cornerRadius);
  }, [geometry, cornerRadius, connector.mode, anchors]);

  const hitPathData = useMemo(() => {
    if (!geometry) {
      return '';
    }
    if (connector.mode === 'curved') {
      return buildCurvedPath(anchors);
    }
    return buildRoundedPath(geometry.points, 0);
  }, [geometry, connector.mode, anchors]);

  const midpoint = useMemo(() => {
    if (!geometry) {
      return { x: 0, y: 0 };
    }
    return getPolylineMidpoint(geometry.points);
  }, [geometry]);

  const labelPosition = connector.labelPosition ?? DEFAULT_LABEL_POSITION;
  const labelOffset = connector.labelOffset ?? DEFAULT_LABEL_OFFSET;

  const labelPlacement = useMemo(() => {
    if (!geometry) {
      return {
        anchor: midpoint,
        center: midpoint,
        normal: { x: 0, y: -1 },
        segmentIndex: 0
      };
    }
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

  const startMarker = startArrowShape !== 'none' && (
    <marker
      id={startMarkerId}
      viewBox="0 0 12 12"
      markerWidth={12 * arrowSize}
      markerHeight={12 * arrowSize}
      refX={0}
      refY={6}
      orient="auto"
      markerUnits="strokeWidth"
    >
      {connector.style.startArrow?.shape === 'circle' ? (
        <circle
          cx={6}
          cy={6}
          r={4}
          fill={connector.style.startArrow?.fill === 'filled' ? arrowStroke : 'transparent'}
          stroke={connector.style.startArrow?.fill === 'outlined' ? arrowStroke : 'none'}
          strokeWidth={connector.style.startArrow?.fill === 'outlined' ? 1.3 : 0}
        />
      ) : (
        <path
          d={arrowPathForShape(startArrowShape, 'start') ?? ''}
          fill={connector.style.startArrow?.fill === 'filled' ? arrowStroke : 'transparent'}
          stroke={connector.style.startArrow?.fill === 'outlined' ? arrowStroke : 'none'}
          strokeWidth={connector.style.startArrow?.fill === 'outlined' ? 1.3 : 0}
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
      refX={12}
      refY={6}
      orient="auto"
      markerUnits="strokeWidth"
    >
      {connector.style.endArrow?.shape === 'circle' ? (
        <circle
          cx={6}
          cy={6}
          r={4}
          fill={connector.style.endArrow?.fill === 'filled' ? arrowStroke : 'transparent'}
          stroke={connector.style.endArrow?.fill === 'outlined' ? arrowStroke : 'none'}
          strokeWidth={connector.style.endArrow?.fill === 'outlined' ? 1.3 : 0}
        />
      ) : (
        <path
          d={arrowPathForShape(endArrowShape, 'end') ?? ''}
          fill={connector.style.endArrow?.fill === 'filled' ? arrowStroke : 'transparent'}
          stroke={connector.style.endArrow?.fill === 'outlined' ? arrowStroke : 'none'}
          strokeWidth={connector.style.endArrow?.fill === 'outlined' ? 1.3 : 0}
          strokeLinejoin="round"
        />
      )}
    </marker>
  );

  if (!geometry) {
    return null;
  }

  const handleLabelInput = (event: React.FormEvent<HTMLDivElement>) => {
    setDraft(event.currentTarget.textContent ?? '');
  };

  const commitDraft = () => {
    const next = clampLabel(draft);
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
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      commitDraft();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(connector.label ?? '');
      onCancelLabelEdit();
    }
  };

  const labelFontSize = connector.labelStyle?.fontSize ?? 14;
  const labelFontWeight = connector.labelStyle?.fontWeight ?? 600;
  const labelColor = connector.labelStyle?.color ?? '#f8fafc';
  const labelBackground = connector.labelStyle?.background ?? 'rgba(15,23,42,0.85)';

  const markerStartUrl = startArrowShape !== 'none' ? `url(#${startMarkerId})` : undefined;
  const markerEndUrl = endArrowShape !== 'none' ? `url(#${endMarkerId})` : undefined;

  const hasLabel = Boolean(connector.label) || labelEditing;

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
            className="diagram-connector__endpoint diagram-connector__endpoint--start"
            cx={geometry.start.x}
            cy={geometry.start.y}
            r={8}
            onPointerDown={(event) => onEndpointPointerDown(event, 'start')}
          />
          <circle
            className="diagram-connector__endpoint diagram-connector__endpoint--end"
            cx={geometry.end.x}
            cy={geometry.end.y}
            r={8}
            onPointerDown={(event) => onEndpointPointerDown(event, 'end')}
          />
        </>
      )}
      {selected && connector.mode === 'orthogonal' &&
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
              className={`diagram-connector__label ${labelEditing ? 'is-editing' : ''}`}
              contentEditable={labelEditing}
              suppressContentEditableWarning
              spellCheck={false}
              style={{
                fontSize: labelFontSize,
                fontWeight: labelFontWeight,
                color: labelColor,
                background: labelBackground
              }}
              onInput={handleLabelInput}
              onBlur={handleLabelBlur}
              onKeyDown={handleLabelKeyDown}
              onDoubleClick={handleLabelDoubleClick}
            >
              {draft || 'Label'}
            </div>
          </foreignObject>
        </>
      )}
    </g>
  );
};
