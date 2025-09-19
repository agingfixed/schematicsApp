import React, { useEffect, useMemo, useState } from 'react';
import { ConnectorModel, NodeModel } from '../types/scene';

interface DiagramConnectorProps {
  connector: ConnectorModel;
  source?: NodeModel;
  target?: NodeModel;
  selected: boolean;
  onPointerDown: (event: React.PointerEvent<SVGPathElement>) => void;
  onUpdateLabel: (value: string) => void;
}

const clampLabel = (value: string) => value.trim();

const getNodeCenter = (node: NodeModel) => ({
  x: node.position.x + node.size.width / 2,
  y: node.position.y + node.size.height / 2
});

export const DiagramConnector: React.FC<DiagramConnectorProps> = ({
  connector,
  source,
  target,
  selected,
  onPointerDown,
  onUpdateLabel
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(connector.label ?? '');

  useEffect(() => {
    if (!isEditing) {
      setDraft(connector.label ?? '');
    }
  }, [connector.label, isEditing]);

  if (!source || !target) {
    return null;
  }

  const start = getNodeCenter(source);
  const end = getNodeCenter(target);

  const pathData = useMemo(() => {
    if (connector.type === 'orthogonal' && connector.points?.length) {
      const points = [start, ...connector.points, end];
      return points.reduce((acc, point, index) => {
        if (index === 0) {
          return `M ${point.x} ${point.y}`;
        }
        return `${acc} L ${point.x} ${point.y}`;
      }, '');
    }
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  }, [connector, start, end]);

  const midpoint = useMemo(() => {
    if (connector.type === 'orthogonal' && connector.points?.length) {
      const points = [start, ...connector.points, end];
      const midIndex = Math.floor(points.length / 2);
      return points[midIndex];
    }
    return {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2
    };
  }, [connector, start, end]);

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
    <g className={`diagram-connector ${selected ? 'is-selected' : ''}`}>
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

