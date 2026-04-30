import { useContext, useState } from "react";
import { getStraightPath, useStore } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";
import { NodeSizeContext } from "./NodeSizeContext";
import type { GraphEdgeData } from "./types";

function FloatingEdge({ id, source, target, data }: EdgeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const nodeSize = useContext(NodeSizeContext);
  const sourceNode = useStore((s) => s.nodeLookup.get(source));
  const targetNode = useStore((s) => s.nodeLookup.get(target));

  if (!sourceNode || !targetNode) return null;

  const sPos = sourceNode.internals.positionAbsolute;
  const tPos = targetNode.internals.positionAbsolute;
  const sW = sourceNode.measured?.width ?? nodeSize;
  const sH = sourceNode.measured?.height ?? nodeSize;
  const tW = targetNode.measured?.width ?? nodeSize;
  const tH = targetNode.measured?.height ?? nodeSize;

  const scx = sPos.x + sW / 2;
  const scy = sPos.y + sH / 2;
  const tcx = tPos.x + tW / 2;
  const tcy = tPos.y + tH / 2;

  const dx = tcx - scx;
  const dy = tcy - scy;
  const dist = Math.hypot(dx, dy) || 1;

  const srcR = (sW / 2) * 0.9;
  const tgtR = (tW / 2) * 0.9;

  const startX = scx + (dx / dist) * srcR;
  const startY = scy + (dy / dist) * srcR;
  const endX = tcx - (dx / dist) * tgtR;
  const endY = tcy - (dy / dist) * tgtR;
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;

  const [edgePath] = getStraightPath({
    sourceX: startX,
    sourceY: startY,
    targetX: endX,
    targetY: endY,
  });

  const edgeData = data as GraphEdgeData | undefined;
  const isSelected = edgeData?.isSelected ?? false;
  const isActive = isHovered || isSelected;
  const showArrow = edgeData?.showArrow ?? false;
  const strokeColor = isActive ? "#3b82f6" : "rgba(100, 116, 139, 0.55)";
  const strokeWidth = isActive ? 2.5 : 1.5;
  const label = edgeData?.label;

  return (
    <g
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        style={{ cursor: "pointer" }}
      />
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        markerEnd={showArrow ? `url(#arrow-${id})` : undefined}
        style={{
          transition: "stroke 0.15s, stroke-width 0.15s",
          pointerEvents: "none",
        }}
      />
      {showArrow && (
        <defs>
          <marker
            id={`arrow-${id}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={strokeColor} />
          </marker>
        </defs>
      )}
      {isActive && label && (
        <>
          <rect
            x={midX - label.length * 4 - 8}
            y={midY - 10}
            width={label.length * 8 + 16}
            height={20}
            rx={4}
            fill="rgba(239, 246, 255, 0.95)"
            stroke="#3b82f6"
            strokeWidth={1}
            style={{ pointerEvents: "none" }}
          />
          <text
            x={midX}
            y={midY + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            style={{
              fontSize: "11px",
              fill: "#3b82f6",
              fontWeight: 500,
              pointerEvents: "none",
            }}
          >
            {label}
          </text>
        </>
      )}
    </g>
  );
}

export default FloatingEdge;
