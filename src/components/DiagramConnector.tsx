import React, { useEffect, useMemo, useState } from 'react';
import { ConnectorModel, NodeModel } from '../types/scene';
import {
  getConnectorPath,
  getPolylineMidpoint
} from '../utils/connector';

interface DiagramConnectorProps {
  connector: ConnectorModel;
  source?: NodeModel;
  target?: NodeModel;
  selected: boolean;
  onPointerDown: (event: React.PointerEvent<SVGPathElement>) => void;
  onHandlePointerDown: (event: React.PointerEvent<SVGCircleElement>, index: number) => void;
  onUpdateLabel: (value: string) => void;
}

const clampLabel = (value: string) => value.trim();

export const DiagramConnector: React.FC<DiagramConnectorProps> = ({
  connector,
  source,
  target,
  selected,
  onPointerDown,
  onHandlePointerDown,
  onUpdateLabel
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(connector.label ?? '');

  useEffect(() => {
    if (!isEditing) {
      setDraft(connector.label ?? '');
    }
  }, [connector.label, isEditing]);

  const geometry = useMemo(() => {
    if (!source || !target) {
      return null;
    }
    return getConnectorPath(connector, source, target);
  }, [connector, source, target]);

  const pathData = useMemo(() => {
    if (!geometry) {
      return '';
    }
    return geometry.points.reduce((acc, point, index) => {
      if (index === 0) {
        return `M ${point.x} ${point.y}`;
      }
      return `${acc} L ${point.x} ${point.y}`;
    }, '');
  }, [geometry]);

  const midpoint = useMemo(() => {
    if (!geometry) {
      return { x: 0, y: 0 };
    }
    return getPolylineMidpoint(geometry.points);
  }, [geometry]);

  if (!geometry) {
    return null;
  }

  const markerStart = connector.style.arrowStart === 'arrow'
    ? 'url(#arrow-start)'
    : connector.style.arrowStart === 'dot'
    ? 'url(#dot-start)'
    : undefined;
  const markerEnd = connector.style.arrowEnd === 'arrow'
    ? 'url(#arrow-end)'
    : connector.style.arrowEnd === 'dot'
    ? 'url(#dot-end)'
    : undefined;

  const handleLabelInput = (event: React.FormEvent<HTMLDivElement>) => {
    setDraft(event.currentTarget.textContent ?? '');
  };

  const handleLabelBlur = () => {
    setIsEditing(false);
    const next = clampLabel(draft);
    if (next !== (connector.label ?? '')) {
      onUpdateLabel(next);
    }
  };

  const handleLabelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      (event.currentTarget as HTMLDivElement).blur();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setIsEditing(false);
      setDraft(connector.label ?? '');
    }
  };

  return (
    <g
      className={`diagram-connector ${selected ? 'is-selected' : ''}`}
      style={{
        ['--connector-width' as string]: `${connector.style.strokeWidth}`
      } as React.CSSProperties}
    >
      <path
        className="diagram-connector__hit"
        d={pathData}
        strokeWidth={24}
        onPointerDown={onPointerDown}
      />
      <path
        className="diagram-connector__line"
        d={pathData}
        stroke={connector.style.stroke}
        strokeWidth={connector.style.strokeWidth}
        strokeDasharray={connector.style.dashed ? '8 6' : undefined}
        markerEnd={markerEnd}
        markerStart={markerStart}
        onPointerDown={onPointerDown}
      />
      {selected &&
        geometry.waypoints.map((point, index) => (
          <circle
            key={`${connector.id}-handle-${index}`}
            className="diagram-connector__handle"
            cx={point.x}
            cy={point.y}
            r={8}
            onPointerDown={(event) => {
              event.stopPropagation();
              onHandlePointerDown(event, index);
            }}
          />
        ))}
      {(connector.label || isEditing) && (
        <foreignObject
          x={midpoint.x - 80}
          y={midpoint.y - 28}
          width={160}
          height={56}
        >
          <div
            className={`diagram-connector__label ${isEditing ? 'is-editing' : ''}`}
            contentEditable={isEditing}
            suppressContentEditableWarning
            spellCheck={false}
            onInput={handleLabelInput}
            onBlur={handleLabelBlur}
            onKeyDown={handleLabelKeyDown}
            onDoubleClick={(event) => {
              event.stopPropagation();
              setIsEditing(true);
            }}
          >
            {draft || 'Label'}
          </div>
        </foreignObject>
      )}
    </g>
  );
};

