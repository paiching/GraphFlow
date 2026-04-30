import type { Node } from "@xyflow/react";

export type GraphRole = "user" | "assistant" | "system";

export interface GraphNodeData extends Record<string, unknown> {
  role: GraphRole;
  topic: string;
}

export interface GraphEdgeData extends Record<string, unknown> {
  label?: string;
  isSelected?: boolean;
  showArrow?: boolean;
}

export type GraphFlowNode = Node<GraphNodeData, "circle">;
