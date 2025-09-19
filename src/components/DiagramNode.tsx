import React, { useEffect, useState } from 'react';
import { NodeModel, Tool } from '../types/scene';

interface DiagramNodeProps {
  node: NodeModel;
  selected: boolean;
  hovered: boolean;
  tool: Tool;
  onPointerDown: (event: React.PointerEvent<SVGGElement>) => void;
  onPointerUp: (event: React.PointerEvent<SVGGElement>) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onLabelChange: (value: string) => void;
}

const clampLabel = (value: string) => (value.trim().length ? value : 'Untitled');

const renderShape = (
  node: NodeModel,
  {
    fill,
    stroke,
    strokeWidth,
    className
  }: { fill: string; stroke: string; strokeWidth: number; className?: string }
) => {
  const { width, height } = node.size;
  const cornerRadius = node.style.cornerRadius ?? 24;
  const common = {
    fill,
    stroke,
    strokeWidth,
    className,
    vectorEffect: 'non-scaling-stroke' as const
  };

  switch (node.type) {
    case 'rectangle':
      return <rect width={width} height={height} rx={8} {...common} />;
    case 'rounded-rectangle':
      return <rect width={width} height={height} rx={cornerRadius} {...common} />;
    case 'ellipse':
      return (
        <ellipse cx={width / 2} cy={height / 2} rx={width / 2} ry={height / 2} {...common} />
      );
    case 'diamond':
      return (
        <polygon
          points={`${width / 2},0 ${width},${height / 2} ${width / 2},${height} 0,${height / 2}`}
          {...common}
        />
      );
    default:
      return <rect width={width} height={height} rx={8} {...common} />;
  }
};

export const DiagramNode: React.FC<DiagramNodeProps> = ({
  node,
  selected,
  hovered,
  tool,
  onPointerDown,
  onPointerUp,
  onPointerEnter,
  onPointerLeave,
  onLabelChange
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(node.label);

  useEffect(() => {
    if (!isEditing) {
      setDraft(node.label);
    }
  }, [node.label, isEditing]);

  const handleDoubleClick = (event: React.MouseEvent<SVGGElement>) => {
    event.stopPropagation();
    setIsEditing(true);
  };

  const handleLabelBlur = () => {
    const nextValue = clampLabel(draft);
    setIsEditing(false);
    if (nextValue !== node.label) {
      onLabelChange(nextValue);
    }
  };

  const handleLabelInput = (event: React.FormEvent<HTMLDivElement>) => {
    setDraft(event.currentTarget.textContent ?? '');
  };

  const handleLabelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      (event.currentTarget as HTMLDivElement).blur();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setIsEditing(false);
      setDraft(node.label);
    }
  };

  const shapeElement = renderShape(node, {
    fill: node.style.fill,
    stroke: node.style.stroke,
    strokeWidth: node.style.strokeWidth,
    className: 'diagram-node__shape'
  });

  const outlineStroke = selected ? '#60a5fa' : hovered ? 'rgba(148, 163, 184, 0.4)' : 'transparent';
  const outlineElement = renderShape(node, {
    fill: 'transparent',
    stroke: outlineStroke,
    strokeWidth: outlineStroke === 'transparent' ? 0 : selected ? 3 : 2,
    className: 'diagram-node__outline'
  });

  const cursor = tool === 'connector' ? 'crosshair' : 'move';

  return (
    <g
      className={`diagram-node ${selected ? 'is-selected' : ''} ${hovered ? 'is-hovered' : ''}`}
      transform={`translate(${node.position.x} ${node.position.y})`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onDoubleClick={handleDoubleClick}
      style={{ cursor }}
    >
      <g className="diagram-node__shadow" opacity={selected ? 0.45 : 0.25}>
        <rect
          x={-12}
          y={-12}
          width={node.size.width + 24}
          height={node.size.height + 24}
          rx={24}
          fill="rgba(15, 23, 42, 0.35)"
        />
      </g>
      {shapeElement}
      {outlineElement}
      <foreignObject x={12} y={12} width={Math.max(24, node.size.width - 24)} height={Math.max(24, node.size.height - 24)}>
        <div
          className={`diagram-node__label ${isEditing ? 'is-editing' : ''}`}
          contentEditable={isEditing}
          suppressContentEditableWarning
          spellCheck={false}
          onInput={handleLabelInput}
          onBlur={handleLabelBlur}
          onKeyDown={handleLabelKeyDown}
        >
          {draft}
        </div>
      </foreignObject>
    </g>
  );
};
