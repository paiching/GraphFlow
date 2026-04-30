import { useContext } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { DEFAULT_NODE_SIZE, NodeSizeContext } from "./NodeSizeContext";
import type { GraphFlowNode } from "./types";

function CircleNode({ data, selected }: NodeProps<GraphFlowNode>) {
  const nodeSize = useContext(NodeSizeContext);
  const scale = nodeSize / DEFAULT_NODE_SIZE;

  return (
    <>
      <Handle
        className="graph-node__handle"
        type="target"
        position={Position.Top}
      />
      <div
        className={[
          "graph-node",
          `graph-node--${data.role}`,
          data.isSearchMatch ? "is-search-match" : "",
          selected ? "is-selected" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          width: nodeSize,
          height: nodeSize,
          padding: Math.round(20 * scale),
        }}
      >
        <span
          className="graph-node__role"
          style={{ fontSize: Math.round(11 * scale) }}
        >
          {data.role}
        </span>
        <strong
          className="graph-node__title"
          style={{ fontSize: Math.round(16 * scale) }}
        >
          {data.topic}
        </strong>
      </div>
      <Handle
        className="graph-node__handle"
        type="source"
        position={Position.Bottom}
      />
    </>
  );
}

export default CircleNode;
