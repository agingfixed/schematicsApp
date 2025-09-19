export type NodeKind = 'rectangle' | 'rounded-rectangle' | 'ellipse' | 'diamond';

export interface Vec2 {
  x: number;
  y: number;
}

export interface NodeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius?: number;
  shadow?: boolean;
}

export interface NodeModel {
  id: string;
  type: NodeKind;
  position: Vec2;
  size: { width: number; height: number };
  rotation?: number;
  label: string;
  style: NodeStyle;
}

export type ConnectorKind = 'straight' | 'orthogonal';

export interface ConnectorStyle {
  stroke: string;
  strokeWidth: number;
  dashed?: boolean;
  arrowStart?: 'none' | 'arrow' | 'dot';
  arrowEnd?: 'none' | 'arrow' | 'dot';
}

export interface ConnectorModel {
  id: string;
  type: ConnectorKind;
  sourceId: string;
  targetId: string;
  points?: Vec2[];
  label?: string;
  style: ConnectorStyle;
}

export interface SceneContent {
  nodes: NodeModel[];
  connectors: ConnectorModel[];
}

export interface SelectionState {
  nodeIds: string[];
  connectorIds: string[];
}

export type Tool =
  | 'select'
  | 'pan'
  | 'rectangle'
  | 'rounded-rectangle'
  | 'ellipse'
  | 'diamond'
  | 'connector';

export interface CanvasTransform {
  x: number;
  y: number;
  scale: number;
}
