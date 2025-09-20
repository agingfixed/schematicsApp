export type NodeShape = 'rectangle' | 'rounded-rectangle' | 'ellipse' | 'diamond';
export type NodeKind = NodeShape;

export interface Vec2 {
  x: number;
  y: number;
}

export type TextAlign = 'left' | 'center' | 'right';

export type NodeFontWeight = 400 | 600 | 700;

export interface NodeStroke {
  color: string;
  width: number;
}

export interface NodeLink {
  url: string;
}

export interface NodeModel {
  id: string;
  shape: NodeShape;
  position: Vec2;
  size: { width: number; height: number };
  rotation?: number;
  text: string;
  textAlign: TextAlign;
  fontSize: number;
  fontWeight: NodeFontWeight;
  fill: string;
  stroke: NodeStroke;
  cornerRadius?: number;
  link?: NodeLink;
  shadow?: boolean;
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
