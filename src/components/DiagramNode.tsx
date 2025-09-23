import React from 'react';
import { CardinalConnectorPort, NodeModel, Tool } from '../types/scene';

interface DiagramNodeProps {
  node: NodeModel;
  selected: boolean;
  hovered: boolean;
  tool: Tool;
  editing: boolean;
  onPointerDown: (event: React.PointerEvent<SVGGElement>) => void;
  onPointerUp: (event: React.PointerEvent<SVGGElement>) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onDoubleClick: (event: React.MouseEvent<SVGGElement>) => void;
}

const renderShape = (
  node: NodeModel,
  {
    fill,
    fillOpacity,
    stroke,
    strokeWidth,
    className
  }: {
    fill: string;
    fillOpacity?: number;
    stroke: string;
    strokeWidth: number;
    className?: string;
  }
) => {
  const { width, height } = node.size;
  const common = {
    fill,
    fillOpacity,
    stroke,
    strokeWidth,
    className,
    vectorEffect: 'non-scaling-stroke' as const
  };

  switch (node.shape) {
    case 'rectangle':
      return <rect width={width} height={height} rx={8} {...common} />;
    case 'circle': {
      const radius = Math.min(width, height) / 2;
      return <circle cx={width / 2} cy={height / 2} r={radius} {...common} />;
    }
    case 'ellipse':
      return (
        <ellipse cx={width / 2} cy={height / 2} rx={width / 2} ry={height / 2} {...common} />
      );
    case 'triangle':
      return (
        <polygon
          points={`${width / 2},0 ${width},${height} 0,${height}`}
          {...common}
        />
      );
    case 'diamond':
      return (
        <polygon
          points={`${width / 2},0 ${width},${height / 2} ${width / 2},${height} 0,${height / 2}`}
          {...common}
        />
      );
    case 'text':
      return <rect width={width} height={height} rx={8} {...common} />;
    default:
      return <rect width={width} height={height} rx={8} {...common} />;
  }
};

export const DiagramNode: React.FC<DiagramNodeProps> = ({
  node,
  selected,
  hovered,
  tool,
  editing,
  onPointerDown,
  onPointerUp,
  onPointerEnter,
  onPointerLeave,
  onDoubleClick
}) => {
  const shapeElement = renderShape(node, {
    fill: node.fill,
    fillOpacity: node.fillOpacity,
    stroke: node.stroke.color,
    strokeWidth: node.stroke.width,
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

  const connectorHandleOffset = 18;
  const connectorHandles: Array<{ key: CardinalConnectorPort; x: number; y: number }> = [
    { key: 'top', x: node.size.width / 2, y: -connectorHandleOffset },
    { key: 'right', x: node.size.width + connectorHandleOffset, y: node.size.height / 2 },
    { key: 'bottom', x: node.size.width / 2, y: node.size.height + connectorHandleOffset },
    { key: 'left', x: -connectorHandleOffset, y: node.size.height / 2 }
  ];
  const connectorHandleRadius = 9;

  const labelClassName = `diagram-node__label ${editing ? 'is-editing' : ''}`;
  const labelStyle: React.CSSProperties = {
    textAlign: node.textAlign,
    fontSize: node.fontSize,
    fontWeight: node.fontWeight,
    color: node.textColor
  };
  const nodeClassName = `diagram-node ${selected ? 'is-selected' : ''} ${
    hovered ? 'is-hovered' : ''
  } ${node.shape === 'text' ? 'diagram-node--text' : ''}`;
  const showShadow = node.shape !== 'text';

  const handleLabelPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('a')) {
      event.stopPropagation();
    }
  };

  return (
    <g
      className={nodeClassName.trim()}
      transform={`translate(${node.position.x} ${node.position.y})`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onDoubleClick={onDoubleClick}
      style={{ cursor }}
    >
      {showShadow && (
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
      )}
      {shapeElement}
      {outlineElement}
      {tool === 'connector' && (
        <g className="diagram-node__connector-handles">
          {connectorHandles.map((handle) => (
            <circle
              key={handle.key}
              className="diagram-node__connector-handle"
              cx={handle.x}
              cy={handle.y}
              r={connectorHandleRadius}
              data-port={handle.key}
            />
          ))}
        </g>
      )}
      <foreignObject
        x={12}
        y={8}
        width={Math.max(24, node.size.width - 24)}
        height={Math.max(24, node.size.height - 20)}
      >
        <div
          className={labelClassName}
          style={labelStyle}
          onPointerDown={handleLabelPointerDown}
          dangerouslySetInnerHTML={{ __html: node.text }}
        />
      </foreignObject>
    </g>
  );
};
