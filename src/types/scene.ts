export type NodeShape = 'rectangle' | 'circle' | 'ellipse' | 'triangle' | 'diamond';
export interface NodeImageData {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
}

export type NodeKind = NodeShape | 'text' | 'link' | 'image';

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
  shape: NodeKind;
  position: Vec2;
  size: { width: number; height: number };
  rotation?: number;
  text: string;
  textAlign: TextAlign;
  fontSize: number;
  fontWeight: NodeFontWeight;
  textColor: string;
  fill: string;
  fillOpacity: number;
  stroke: NodeStroke;
  cornerRadius?: number;
  link?: NodeLink;
  shadow?: boolean;
  image?: NodeImageData;
}

export type CardinalConnectorPort = 'top' | 'right' | 'bottom' | 'left';

export interface AttachedConnectorEndpoint {
  nodeId: string;
  port: CardinalConnectorPort;
}

export interface FloatingConnectorEndpoint {
  position: Vec2;
}

export type ConnectorEndpoint = AttachedConnectorEndpoint | FloatingConnectorEndpoint;

export const isAttachedConnectorEndpoint = (
  endpoint: ConnectorEndpoint
): endpoint is AttachedConnectorEndpoint => 'nodeId' in endpoint;

export const isFloatingConnectorEndpoint = (
  endpoint: ConnectorEndpoint
): endpoint is FloatingConnectorEndpoint => 'position' in endpoint;

export type ArrowShape =
  | 'none'
  | 'triangle'
  | 'triangle-inward'
  | 'diamond'
  | 'circle'
  | 'arrow'
  | 'line-arrow';
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
  stopArrow?: ConnectorArrowStyle;
  arrowSize?: number;
  cornerRadius?: number;
}

export interface ConnectorModel {
  id: string;
  source: ConnectorEndpoint;
  target: ConnectorEndpoint;
  points?: Vec2[];
  label?: string;
  labelPosition?: number;
  labelOffset?: number;
  labelAngle?: number;
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
  | 'circle'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'connector'
  | 'text'
  | 'link'
  | 'image';

export interface CanvasTransform {
  x: number;
  y: number;
  scale: number;
}
