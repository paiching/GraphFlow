import { useEffect, useMemo, useState, createContext, useContext } from "react";
import SettingsPage from "./SettingsPage";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  useNodesState,
  getStraightPath,
  useStore,
} from "@xyflow/react";
import type { Edge, EdgeProps, Node, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./App.css";

type ConversationRole = "user" | "assistant" | "system";

interface ConversationNode {
  id: string;
  parentId: string | null;
  role: ConversationRole;
  topic: string;
  content: string;
  createdAt: string;
  indegree?: number;
  outdegree?: number;
  relationship?: string;
  edgeContent?: string;
  edgeUpdatedAt?: string;
}

interface GraphNodeData extends Record<string, unknown> {
  role: ConversationRole;
  topic: string;
}

interface GraphEdgeData extends Record<string, unknown> {
  label?: string;
  isSelected?: boolean;
  showArrow?: boolean;
}

type GraphFlowNode = Node<GraphNodeData, "circle">;

const NODE_SIZE_KEY = "graph-node-size";
const DEFAULT_NODE_SIZE = 148;
const NodeSizeContext = createContext(DEFAULT_NODE_SIZE);

// 多專案資料結構
const initialProjects: Record<string, ConversationNode[]> = {
  projectA: [
    {
      id: "1",
      parentId: null,
      role: "user",
      topic: "圖譜搜尋",
      content: "知識搜尋系統，融合 AI Search 功能。",
      createdAt: new Date().toISOString(),
    },
    {
      id: "2",
      parentId: "1",
      role: "assistant",
      topic: "專案架構",
      content:
        "可以使用 React Flow 建立即時關係視覺化介面，後端使用 ASP.NET Core Web API。",
      createdAt: new Date().toISOString(),
    },
    {
      id: "3",
      parentId: "2",
      role: "user",
      topic: "前端",
      content: "前端部分要如何實作？",
      createdAt: new Date().toISOString(),
    },
  ],
  projectB: [
    {
      id: "a1",
      parentId: null,
      role: "user",
      topic: "AI 專案",
      content: "這是另一個專案的根節點。",
      createdAt: new Date().toISOString(),
    },
    {
      id: "a2",
      parentId: "a1",
      role: "assistant",
      topic: "AI 模型",
      content: "請選擇適合的 AI 模型架構。",
      createdAt: new Date().toISOString(),
    },
  ],
};

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

const nodeTypes = { circle: CircleNode };

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
      {/* invisible wide path for easier hover/click detection */}
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

const edgeTypes = { floating: FloatingEdge };

type PositionByNodeId = Record<string, { x: number; y: number }>;
type PositionByProjectId = Record<string, PositionByNodeId>;

function toGraphNode(
  node: ConversationNode,
  position: { x: number; y: number },
): GraphFlowNode {
  return {
    id: node.id,
    type: "circle",
    position,
    data: {
      role: node.role,
      topic: node.topic,
    },
    draggable: true,
  };
}

function getRadialPosition(index: number) {
  const ringCapacity = 8;
  const ring = Math.floor(index / ringCapacity) + 1;
  const slot = index % ringCapacity;
  const angle =
    -Math.PI / 2 + (slot / ringCapacity) * Math.PI * 2 + ring * 0.12;
  const radius = 230 * ring;

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function createInitialFlowNodes(nodes: ConversationNode[]) {
  const rootNodes = nodes.filter((node) => node.parentId === null);
  const branchNodes = nodes.filter((node) => node.parentId !== null);

  return [
    ...rootNodes.map((node, index) =>
      toGraphNode(node, {
        x: index * 180,
        y: 0,
      }),
    ),
    ...branchNodes.map((node, index) =>
      toGraphNode(node, getRadialPosition(index)),
    ),
  ];
}

function getBranchPosition(
  origin: { x: number; y: number },
  siblingIndex: number,
) {
  const siblingCapacity = 6;
  const ring = Math.floor(siblingIndex / siblingCapacity) + 1;
  const slot = siblingIndex % siblingCapacity;
  const angle =
    -Math.PI / 2 + (slot / siblingCapacity) * Math.PI * 2 + ring * 0.18;
  const radius = 180 + ring * 40;

  return {
    x: origin.x + Math.cos(angle) * radius,
    y: origin.y + Math.sin(angle) * radius,
  };
}

const LOCAL_KEY = "conversation-projects";
const POSITIONS_KEY = "conversation-node-positions";

function applySavedPositions(
  nodes: ConversationNode[],
  saved?: PositionByNodeId,
) {
  const initial = createInitialFlowNodes(nodes);
  if (!saved) return initial;

  return initial.map((node) => {
    const pos = saved[node.id];
    return pos ? { ...node, position: pos } : node;
  });
}

function App() {
  // 多專案狀態

  // 設定頁面顯示狀態
  const [showSettings, setShowSettings] = useState(false);
  // Node 大小設定
  const [nodeSize, setNodeSize] = useState<number>(() => {
    const raw = localStorage.getItem(NODE_SIZE_KEY);
    const n = raw ? parseInt(raw, 10) : DEFAULT_NODE_SIZE;
    return isNaN(n) ? DEFAULT_NODE_SIZE : n;
  });

  useEffect(() => {
    localStorage.setItem(NODE_SIZE_KEY, String(nodeSize));
  }, [nodeSize]);
  // 專案資料狀態
  const [projects, setProjects] = useState<Record<string, ConversationNode[]>>(
    () => {
      try {
        const raw = localStorage.getItem(LOCAL_KEY);
        if (raw) return JSON.parse(raw);
      } catch {
        // ignore malformed localStorage data
      }
      return initialProjects;
    },
  );
  const [positionsByProject, setPositionsByProject] =
    useState<PositionByProjectId>(() => {
      try {
        const raw = localStorage.getItem(POSITIONS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as PositionByProjectId;
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        return {};
      }
    });
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    const keys = Object.keys(initialProjects);
    return keys[0];
  });

  // 依據選擇的專案切換節點
  // 用 useMemo 包裝，避免每次 render 都新建 array，並修正 useEffect 依賴
  const conversationNodes = useMemo(
    () => projects[selectedProjectId] || [],
    [projects, selectedProjectId],
  );
  const setConversationNodes = (
    updater: (prev: ConversationNode[]) => ConversationNode[],
  ) => {
    setProjects((prev) => {
      const updated = {
        ...prev,
        [selectedProjectId]: updater(prev[selectedProjectId] || []),
      };
      localStorage.setItem(LOCAL_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<GraphFlowNode>(
    applySavedPositions(
      conversationNodes,
      positionsByProject[selectedProjectId],
    ),
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [newBranchTopic, setNewBranchTopic] = useState("新分支");
  const [newBranchContent, setNewBranchContent] = useState("");
  const [editRole, setEditRole] = useState<ConversationRole>("user");
  const [editTopic, setEditTopic] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editInDegree, setEditInDegree] = useState("");
  const [editOutDegree, setEditOutDegree] = useState("");
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [editRelationship, setEditRelationship] = useState("");
  const [editEdgeContent, setEditEdgeContent] = useState("");

  const selectedNode = useMemo(
    () => conversationNodes.find((node) => node.id === selectedNodeId) ?? null,
    [conversationNodes, selectedNodeId],
  );

  const selectedFlowNode = useMemo(
    () => flowNodes.find((node) => node.id === selectedNodeId) ?? null,
    [flowNodes, selectedNodeId],
  );

  const flowEdges: Edge[] = useMemo(() => {
    const nodeById = new Map(conversationNodes.map((node) => [node.id, node]));
    return conversationNodes
      .filter((n) => n.parentId)
      .map((n) => {
        const edgeId = `edge-${n.parentId}-${n.id}`;
        const sourceNode = nodeById.get(n.parentId as string);
        const showArrow =
          (sourceNode?.outdegree ?? 0) > 0 || (n.indegree ?? 0) > 0;
        return {
          id: edgeId,
          type: "floating",
          source: n.parentId as string,
          target: n.id,
          data: {
            label: n.relationship ?? "",
            isSelected: edgeId === selectedEdgeId,
            showArrow,
          } as GraphEdgeData,
          style: { stroke: "rgba(100, 116, 139, 0.55)", strokeWidth: 1.5 },
        };
      });
  }, [conversationNodes, selectedEdgeId]);

  const selectedEdgeData = useMemo(() => {
    if (!selectedEdgeId) return null;
    const targetNode = conversationNodes.find(
      (n) => n.parentId && `edge-${n.parentId}-${n.id}` === selectedEdgeId,
    );
    if (!targetNode) return null;
    const sourceNode = conversationNodes.find(
      (n) => n.id === targetNode.parentId,
    );
    if (!sourceNode) return null;
    return { id: selectedEdgeId, source: sourceNode, target: targetNode };
  }, [selectedEdgeId, conversationNodes]);

  // 切換專案時，載入該專案上次位置
  useEffect(() => {
    const timer = setTimeout(() => {
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setFlowNodes(
        applySavedPositions(
          conversationNodes,
          positionsByProject[selectedProjectId],
        ),
      );
    }, 0);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  // 任何拖曳造成的座標變更，都記錄到目前專案
  useEffect(() => {
    const timer = setTimeout(() => {
      setPositionsByProject((prev) => {
        const nextProjectPositions: PositionByNodeId = {};
        for (const node of flowNodes) {
          nextProjectPositions[node.id] = node.position;
        }

        const prevProjectPositions = prev[selectedProjectId] || {};
        const isSame =
          Object.keys(prevProjectPositions).length ===
            Object.keys(nextProjectPositions).length &&
          Object.entries(nextProjectPositions).every(([id, pos]) => {
            const prevPos = prevProjectPositions[id];
            return prevPos && prevPos.x === pos.x && prevPos.y === pos.y;
          });

        if (isSame) return prev;

        const updated = {
          ...prev,
          [selectedProjectId]: nextProjectPositions,
        };
        localStorage.setItem(POSITIONS_KEY, JSON.stringify(updated));
        return updated;
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [flowNodes, selectedProjectId]);

  // 專案資料變動時自動存 localStorage
  useEffect(() => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!selectedNode) {
        setEditRole("user");
        setEditTopic("");
        setEditContent("");
        setEditInDegree("");
        setEditOutDegree("");
        return;
      }

      setEditRole(selectedNode.role);
      setEditTopic(selectedNode.topic);
      setEditContent(selectedNode.content);
      setEditInDegree(
        selectedNode.indegree !== undefined
          ? String(selectedNode.indegree)
          : "",
      );
      setEditOutDegree(
        selectedNode.outdegree !== undefined
          ? String(selectedNode.outdegree)
          : "",
      );
    }, 0);

    return () => clearTimeout(timer);
  }, [selectedNode]);

  useEffect(() => {
    setTimeout(() => {
      setEditRelationship(selectedEdgeData?.target.relationship ?? "");
      setEditEdgeContent(selectedEdgeData?.target.edgeContent ?? "");
    }, 0);
  }, [selectedEdgeData]);

  const handleAddBranch = () => {
    if (!selectedNode) {
      alert("請先選擇一個節點");
      return;
    }

    if (!newBranchTopic.trim()) {
      alert("請輸入分支主題");
      return;
    }

    if (!newBranchContent.trim()) {
      alert("請輸入分支內容");
      return;
    }

    const newNode: ConversationNode = {
      id: crypto.randomUUID(),
      parentId: selectedNode.id,
      role: "user",
      topic: newBranchTopic.trim(),
      content: newBranchContent,
      createdAt: new Date().toISOString(),
    };

    const siblingCount = conversationNodes.filter(
      (node) => node.parentId === selectedNode.id,
    ).length;

    const origin = selectedFlowNode?.position ?? { x: 0, y: 0 };

    setConversationNodes((prev) => [...prev, newNode]);
    setFlowNodes((prev) => [
      ...prev,
      toGraphNode(newNode, getBranchPosition(origin, siblingCount)),
    ]);
    setSelectedNodeId(newNode.id);
    setNewBranchTopic("新分支");
    setNewBranchContent("");
  };

  const handleUpdateRelationship = () => {
    if (!selectedEdgeData) return;
    setConversationNodes((prev) =>
      prev.map((n) =>
        n.id === selectedEdgeData.target.id
          ? {
              ...n,
              relationship: editRelationship.trim(),
              edgeContent: editEdgeContent.trim(),
              edgeUpdatedAt: new Date().toISOString(),
            }
          : n,
      ),
    );
  };

  const handleUpdateSelectedNode = () => {
    if (!selectedNode) return;

    if (!editTopic.trim()) {
      alert("Topic 不能為空");
      return;
    }

    if (!editContent.trim()) {
      alert("Content 不能為空");
      return;
    }

    const parsedInDegree =
      editInDegree.trim() === "" ? undefined : Number(editInDegree);
    const parsedOutDegree =
      editOutDegree.trim() === "" ? undefined : Number(editOutDegree);

    if (
      parsedInDegree !== undefined &&
      (!Number.isInteger(parsedInDegree) || parsedInDegree < 0)
    ) {
      alert("InDegree 需為大於等於 0 的整數");
      return;
    }

    if (
      parsedOutDegree !== undefined &&
      (!Number.isInteger(parsedOutDegree) || parsedOutDegree < 0)
    ) {
      alert("OutDegree 需為大於等於 0 的整數");
      return;
    }

    setConversationNodes((prev) =>
      prev.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,
              role: editRole,
              topic: editTopic.trim(),
              content: editContent,
              indegree: parsedInDegree,
              outdegree: parsedOutDegree,
            }
          : node,
      ),
    );

    setFlowNodes((prev) =>
      prev.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,
              data: {
                ...node.data,
                role: editRole,
                topic: editTopic.trim(),
              },
            }
          : node,
      ),
    );
  };

  const handleDeleteSelectedNode = () => {
    if (!selectedNode) return;

    const idsToDelete = new Set<string>();
    const stack = [selectedNode.id];

    while (stack.length > 0) {
      const currentId = stack.pop();
      if (!currentId || idsToDelete.has(currentId)) continue;

      idsToDelete.add(currentId);

      for (const node of conversationNodes) {
        if (node.parentId === currentId) stack.push(node.id);
      }
    }

    setConversationNodes((prev) =>
      prev.filter((node) => !idsToDelete.has(node.id)),
    );
    setFlowNodes((prev) => prev.filter((node) => !idsToDelete.has(node.id)));
    setSelectedNodeId(null);
  };

  return (
    <NodeSizeContext.Provider value={nodeSize}>
      <div className="app-container">
        {showSettings ? (
          <SettingsPage
            projects={projects}
            setProjects={setProjects}
            setSelectedProjectId={setSelectedProjectId}
            onBack={() => setShowSettings(false)}
            nodeSize={nodeSize}
            setNodeSize={setNodeSize}
          />
        ) : (
          <>
            <header className="app-header">
              <h1>Conversation Graph Prototype</h1>
              <p>線性對話 → 主題節點圖 → 可分支脈絡</p>
              <div className="project-switcher">
                <label htmlFor="project-select">切換專案：</label>
                <select
                  id="project-select"
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                >
                  {Object.keys(projects).map((pid) => (
                    <option key={pid} value={pid}>
                      {pid}
                    </option>
                  ))}
                </select>
                <button
                  className="settings-gear-btn"
                  title="設定"
                  onClick={() => setShowSettings(true)}
                  aria-label="設定"
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <circle
                      cx="10"
                      cy="10"
                      r="3.2"
                      stroke="#0ea5e9"
                      strokeWidth="1.5"
                      fill="#fff"
                    />
                    <path
                      d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.07 15.07l-1.42-1.42M6.35 6.35L4.93 4.93M15.07 4.93l-1.42 1.42M6.35 13.65l-1.42 1.42"
                      stroke="#0ea5e9"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            </header>

            <main className="app-main">
              <section className="graph-panel">
                <ReactFlow<GraphFlowNode, Edge>
                  nodes={flowNodes}
                  edges={flowEdges}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  onNodesChange={onNodesChange}
                  fitView
                  fitViewOptions={{ padding: 0.24 }}
                  minZoom={0.2}
                  maxZoom={1.6}
                  onNodeClick={(_event, node) => {
                    setSelectedNodeId(node.id);
                    setSelectedEdgeId(null);
                  }}
                  onEdgeClick={(_event, edge) => {
                    setSelectedEdgeId(edge.id);
                    setSelectedNodeId(null);
                  }}
                  onPaneClick={() => {
                    setSelectedNodeId(null);
                    setSelectedEdgeId(null);
                  }}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background
                    variant={BackgroundVariant.Dots}
                    gap={28}
                    size={1.2}
                    color="rgba(148, 163, 184, 0.35)"
                  />
                  <Controls />
                </ReactFlow>
              </section>

              <aside className="detail-panel">
                <h2>{selectedEdgeData ? "關係內容" : "節點內容"}</h2>

                {selectedEdgeData ? (
                  <>
                    <div className="field">
                      <label>從</label>
                      <div>{selectedEdgeData.source.topic}</div>
                    </div>

                    <div className="field">
                      <label>到</label>
                      <div>{selectedEdgeData.target.topic}</div>
                    </div>

                    <div className="field">
                      <label>關係標籤</label>
                      <input
                        type="text"
                        value={editRelationship}
                        onChange={(e) => setEditRelationship(e.target.value)}
                        placeholder="輸入關係描述（例：延伸、反駁、補充）..."
                      />
                    </div>

                    <div className="field">
                      <label>關係內容</label>
                      <textarea
                        value={editEdgeContent}
                        onChange={(e) => setEditEdgeContent(e.target.value)}
                        placeholder="輸入這條關係的詳細說明..."
                      />
                    </div>

                    {selectedEdgeData.target.edgeUpdatedAt && (
                      <div className="field">
                        <label>最後更新</label>
                        <div style={{ fontSize: "0.78rem", color: "#64748b" }}>
                          {new Date(
                            selectedEdgeData.target.edgeUpdatedAt,
                          ).toLocaleString()}
                        </div>
                      </div>
                    )}

                    <button onClick={handleUpdateRelationship}>儲存關係</button>
                  </>
                ) : selectedNode ? (
                  <>
                    <div className="field">
                      <label>ID</label>
                      <div>{selectedNode.id}</div>
                    </div>

                    <div className="field">
                      <label>Parent ID</label>
                      <div>{selectedNode.parentId ?? "Root"}</div>
                    </div>

                    <div className="field">
                      <label>Role</label>
                      <select
                        value={editRole}
                        onChange={(event) =>
                          setEditRole(event.target.value as ConversationRole)
                        }
                      >
                        <option value="user">user</option>
                        <option value="assistant">assistant</option>
                        <option value="system">system</option>
                      </select>
                    </div>

                    <div className="field">
                      <label>Topic</label>
                      <input
                        type="text"
                        value={editTopic}
                        onChange={(event) => setEditTopic(event.target.value)}
                        placeholder="輸入主題..."
                      />
                    </div>

                    <div className="field">
                      <label>Content</label>
                      <textarea
                        value={editContent}
                        onChange={(event) => setEditContent(event.target.value)}
                        placeholder="輸入內容..."
                      />
                    </div>

                    <div className="field">
                      <label>InDegree（可設定）</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={editInDegree}
                        onChange={(event) =>
                          setEditInDegree(event.target.value)
                        }
                        placeholder="例如 2"
                      />
                    </div>

                    <div className="field">
                      <label>OutDegree（可設定）</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={editOutDegree}
                        onChange={(event) =>
                          setEditOutDegree(event.target.value)
                        }
                        placeholder="例如 3"
                      />
                    </div>

                    <div className="field">
                      <label>目前連線統計</label>
                      <div>
                        indegree: {selectedNode.parentId ? 1 : 0}
                        {" | "}
                        outdegree:{" "}
                        {
                          conversationNodes.filter(
                            (n) => n.parentId === selectedNode.id,
                          ).length
                        }
                      </div>
                    </div>

                    <div className="field">
                      <label>UTC Timestamp</label>
                      <div>
                        {new Date(selectedNode.createdAt).toISOString()}
                      </div>
                    </div>

                    <button onClick={handleUpdateSelectedNode}>
                      儲存節點修改
                    </button>
                    <button onClick={handleDeleteSelectedNode}>
                      刪除此節點（含子節點）
                    </button>

                    <hr />

                    <h3>從此節點新增分支</h3>

                    <div className="field">
                      <label>分支主題</label>
                      <input
                        type="text"
                        value={newBranchTopic}
                        onChange={(event) =>
                          setNewBranchTopic(event.target.value)
                        }
                        placeholder="輸入新的分支主題..."
                      />
                    </div>

                    <div className="field">
                      <label>分支內容</label>
                      <textarea
                        value={newBranchContent}
                        onChange={(event) =>
                          setNewBranchContent(event.target.value)
                        }
                        placeholder="輸入新的分支內容..."
                      />
                    </div>

                    <button onClick={handleAddBranch}>新增分支節點</button>
                  </>
                ) : (
                  <p>請點選左側任一節點或邊查看內容。</p>
                )}
              </aside>
            </main>
          </>
        )}
      </div>
    </NodeSizeContext.Provider>
  );
}

export default App;
