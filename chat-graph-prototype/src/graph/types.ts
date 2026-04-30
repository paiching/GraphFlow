import type { Node } from "@xyflow/react";

export type GraphRole = "筆記" | "對話" | "檔案" | "圖片";

export interface GraphNodeData extends Record<string, unknown> {
  role: GraphRole;
  topic: string;
  isSearchMatch?: boolean;
}

export interface GraphEdgeData extends Record<string, unknown> {
  label?: string;
  isSelected?: boolean;
  isSearchMatch?: boolean;
  showArrow?: boolean;
}

export type GraphFlowNode = Node<GraphNodeData, "circle">;
