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
  fillOpacity: number;
  stroke: NodeStroke;
  cornerRadius?: number;
  link?: NodeLink;
  shadow?: boolean;
}

export type ConnectorMode = 'orthogonal' | 'straight';

export type ConnectorPort = 'top' | 'right' | 'bottom' | 'left' | 'center';

export type ArrowShape = 'none' | 'triangle' | 'diamond' | 'circle';
export type ArrowFill = 'filled' | 'outlined';

export interface ConnectorArrowStyle {
  shape: ArrowShape;
  fill: ArrowFill;
}

export interface ConnectorLabelStyle {
  fontSize: number;
  fontWeight: NodeFontWeight;
  color: string;
  background: string;
}

export interface ConnectorStyle {
  stroke: string;
  strokeWidth: number;
  dashed?: boolean;
  startArrow?: ConnectorArrowStyle;
  endArrow?: ConnectorArrowStyle;
  arrowSize?: number;
  cornerRadius?: number;
}

export interface ConnectorModel {
  id: string;
  mode: ConnectorMode;
  sourceId: string;
  targetId: string;
  sourcePort?: ConnectorPort;
  targetPort?: ConnectorPort;
  points?: Vec2[];
  label?: string;
  labelPosition?: number;
  labelOffset?: number;
  style: ConnectorStyle;
  labelStyle?: ConnectorLabelStyle;
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
