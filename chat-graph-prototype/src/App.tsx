// ─── React 核心 Hooks ────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from "react";
// ─── 設定頁面元件 ──────────────────────────────────────────────────────────────
import SettingsPage from "./SettingsPage";
import CircleNode from "./graph/CircleNode";
import FloatingEdge from "./graph/FloatingEdge";
import GraphSearchBar from "./graph/GraphSearchBar";
import MarkdownEditor from "./components/MarkdownEditor";
import {
  DEFAULT_NODE_SIZE,
  NODE_SIZE_KEY,
  NodeSizeContext,
} from "./graph/NodeSizeContext";
import type { GraphEdgeData, GraphFlowNode } from "./graph/types";
import type { SearchScope } from "./graph/GraphSearchBar";
// ─── ReactFlow 圖形化元件與工具函式 ───────────────────────────────────────────
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  useNodesState,
} from "@xyflow/react";
import type { Edge } from "@xyflow/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "@xyflow/react/dist/style.css";
import "./App.css";

// ─── 型別定義 ────────────────────────────────────────────────────────────────

/** 節點角色：使用者、AI 助理、或系統 */
type ConversationRole = "user" | "assistant" | "system";

interface NodeDialogueEntry {
  id: string;
  sourceMessageId: string;
  title?: string;
  content: string;
  createdAt: string;
}

type DialoguesByNodeId = Record<string, NodeDialogueEntry[]>;
type DialoguesByProjectId = Record<string, DialoguesByNodeId>;

function getDialogueTitle(content: string) {
  const normalized = content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!normalized) return "AI 回覆";

  const heading = normalized.replace(/^#{1,6}\s+/, "");
  return heading.length > 48 ? `${heading.slice(0, 48)}...` : heading;
}

function getDialogueDisplayTitle(dialogue: NodeDialogueEntry) {
  const customTitle = dialogue.title?.trim();
  if (customTitle) return customTitle;
  return getDialogueTitle(dialogue.content);
}

function extractDialoguesByProject(
  projects: Record<string, ConversationNode[]>,
): DialoguesByProjectId {
  return Object.fromEntries(
    Object.entries(projects).map(([projectId, nodes]) => [
      projectId,
      Object.fromEntries(
        nodes
          .filter((node) => (node.dialogues?.length ?? 0) > 0)
          .map((node) => [node.id, node.dialogues ?? []]),
      ),
    ]),
  );
}

function mergeDialoguesIntoProjects(
  projects: Record<string, ConversationNode[]>,
  dialoguesByProject: DialoguesByProjectId,
) {
  return Object.fromEntries(
    Object.entries(projects).map(([projectId, nodes]) => {
      const dialoguesByNode = dialoguesByProject[projectId] ?? {};
      return [
        projectId,
        nodes.map((node) => ({
          ...node,
          dialogues: dialoguesByNode[node.id] ?? node.dialogues ?? [],
        })),
      ];
    }),
  ) as Record<string, ConversationNode[]>;
}

/** 對話節點的資料結構，儲存在 projects 狀態裡 */
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
  dialogues?: NodeDialogueEntry[];
}

// ─── 初始資料 ────────────────────────────────────────────────────────────────
// 程式首次執行時，若 localStorage 內尚無資料，則使用此預設多專案資料
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

const nodeTypes = { circle: CircleNode };
const edgeTypes = { floating: FloatingEdge };

// ─── 位置常數與型別 ───────────────────────────────────────────────────────────
/** 存儲單一專案下所有節點位置的對映（節點 id → {x, y}） */
type PositionByNodeId = Record<string, { x: number; y: number }>;
/** 存儲所有專案的位置資料（專案 id → PositionByNodeId） */
type PositionByProjectId = Record<string, PositionByNodeId>;

interface ProjectSnapshot {
  id: string;
  createdAt: string;
  nodes: ConversationNode[];
  positions: PositionByNodeId;
}

interface AIChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

type SnapshotsByProjectId = Record<string, ProjectSnapshot[]>;

// ─── 工具函數 ────────────────────────────────────────────────────────────────
/** 將 ConversationNode 轉換成 ReactFlow 所需的 Node 格式 */
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

/**
 * 計算節點在同心圓上的預設布局位置。
 * index 越大會印到外圈，每圈容納 8 個節點。
 */
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

/**
 * 將 ConversationNode 陣列轉換為 ReactFlow 初始節點陣列。
 * Root 節點水平排列，其餘節點其用同心圓布局。
 */
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

/**
 * 計算子節點的新增位置，不同兄弟節點会分散到不同角度。
 * origin 為父節點的位置，siblingIndex 為已存在兄弟數量。
 */
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

// ─── localStorage Key 常數 ──────────────────────────────────────────────────────────────
/** 專案資料存放在 localStorage 的 key */
const LOCAL_KEY = "conversation-projects";
/** 節點位置存放在 localStorage 的 key */
const POSITIONS_KEY = "conversation-node-positions";
/** 快照資料存放在 localStorage 的 key */
const SNAPSHOTS_KEY = "conversation-project-snapshots";
/** snapshot 播放間隔（毫秒）設定 key */
const SNAPSHOT_PLAYBACK_INTERVAL_KEY = "snapshot-playback-interval-ms";
/** OpenAI API Key 存放 key */
const OPENAI_API_KEY_STORAGE_KEY = "openai-api-key";
/** Node 對話紀錄獨立存放 key */
const DIALOGUES_KEY = "conversation-node-dialogues";

/**
 * 將已存 localStorage 的位置套用到節點初始位置上。
 * 若某節點尚無儲存紀錄，則保留預設的同心圆/水平位置。
 */
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

// ─── App 主元件 ────────────────────────────────────────────────────────────────
function App() {
  // 是否顯示設定頁面
  const [showSettings, setShowSettings] = useState(false);
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<AIChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatSaveTargetNodeId, setChatSaveTargetNodeId] = useState("");
  const [chatActionNotice, setChatActionNotice] = useState<string | null>(null);
  const [previewDialogue, setPreviewDialogue] =
    useState<NodeDialogueEntry | null>(null);
  const [openAIApiKey, setOpenAIApiKey] = useState(() =>
    localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY) ?? "",
  );

  // 節點大小：從 localStorage 初始化，變更時同步存回 localStorage
  const [nodeSize, setNodeSize] = useState<number>(() => {
    const raw = localStorage.getItem(NODE_SIZE_KEY);
    const n = raw ? parseInt(raw, 10) : DEFAULT_NODE_SIZE;
    return isNaN(n) ? DEFAULT_NODE_SIZE : n;
  });

  // 節點大小變動時，同步對應 localStorage
  useEffect(() => {
    localStorage.setItem(NODE_SIZE_KEY, String(nodeSize));
  }, [nodeSize]);

  useEffect(() => {
    if (openAIApiKey.trim()) {
      localStorage.setItem(OPENAI_API_KEY_STORAGE_KEY, openAIApiKey.trim());
      return;
    }
    localStorage.removeItem(OPENAI_API_KEY_STORAGE_KEY);
  }, [openAIApiKey]);
  // 專案資料：結構為 { [projectId]: ConversationNode[] }，從 localStorage 初始化
  const [projects, setProjects] = useState<Record<string, ConversationNode[]>>(
    () => {
      try {
        const rawProjects = localStorage.getItem(LOCAL_KEY);
        const parsedProjects = rawProjects
          ? (JSON.parse(rawProjects) as Record<string, ConversationNode[]>)
          : initialProjects;

        const rawDialogues = localStorage.getItem(DIALOGUES_KEY);
        if (!rawDialogues) return parsedProjects;

        const parsedDialogues = JSON.parse(rawDialogues) as DialoguesByProjectId;
        if (!parsedDialogues || typeof parsedDialogues !== "object") {
          return parsedProjects;
        }

        return mergeDialoguesIntoProjects(parsedProjects, parsedDialogues);
      } catch {
        // ignore malformed localStorage data
      }
      return initialProjects;
    },
  );

  // 每個專案的節點位置記錄，從 localStorage 初始化
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

  // 目前選中的專案 ID，預設為第一個專案
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    const keys = Object.keys(initialProjects);
    return keys[0];
  });

  const [snapshotsByProject, setSnapshotsByProject] =
    useState<SnapshotsByProjectId>(() => {
      try {
        const raw = localStorage.getItem(SNAPSHOTS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as SnapshotsByProjectId;
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        return {};
      }
    });

  const [snapshotPlaybackMs, setSnapshotPlaybackMs] = useState<number>(() => {
    const raw = localStorage.getItem(SNAPSHOT_PLAYBACK_INTERVAL_KEY);
    const parsed = raw ? Number(raw) : 1200;
    if (!Number.isFinite(parsed)) return 1200;
    return Math.min(10000, Math.max(300, Math.round(parsed)));
  });
  const [isSnapshotPlaying, setIsSnapshotPlaying] = useState(false);
  const [snapshotPlaybackIndex, setSnapshotPlaybackIndex] = useState<
    number | null
  >(null);

  // 目前專案的節點陣列（用 useMemo 避免不必要的重建）
  const conversationNodes = useMemo(
    () => projects[selectedProjectId] || [],
    [projects, selectedProjectId],
  );
  /**
   * 修改當前專案的節點資料，並同步存回 localStorage。
   * 接受 updater 函數以支援函數式更新式。
   */
  const setConversationNodes = useCallback(
    (updater: (prev: ConversationNode[]) => ConversationNode[]) => {
      setProjects((prev) => {
        const updated = {
          ...prev,
          [selectedProjectId]: updater(prev[selectedProjectId] || []),
        };
        localStorage.setItem(LOCAL_KEY, JSON.stringify(updated));
        return updated;
      });
    },
    [selectedProjectId],
  );

  // ReactFlow 節點陣列：含位置資訊，底層由 ReactFlow 管理
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<GraphFlowNode>(
    applySavedPositions(
      conversationNodes,
      positionsByProject[selectedProjectId],
    ),
  );

  // 目前選中的節點 / 邊線 ID
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // 新增分支表單的輸入值
  const [newBranchTopic, setNewBranchTopic] = useState("新分支");
  const [newBranchContent, setNewBranchContent] = useState("");

  // 目前右側面板正在編輯的節點內容
  const [editRole, setEditRole] = useState<ConversationRole>("user");
  const [editTopic, setEditTopic] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editInDegree, setEditInDegree] = useState("");
  const [editOutDegree, setEditOutDegree] = useState("");

  // 目前選中的邊線 ID 與正在編輯的邊線資料
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [editRelationship, setEditRelationship] = useState("");
  const [editEdgeContent, setEditEdgeContent] = useState("");
  const [searchKeywordInput, setSearchKeywordInput] = useState("");
  const [searchScopeInput, setSearchScopeInput] = useState<SearchScope>("all");
  const [appliedSearchKeyword, setAppliedSearchKeyword] = useState("");
  const [appliedSearchScope, setAppliedSearchScope] =
    useState<SearchScope>("all");

  const normalizedSearchKeyword = useMemo(
    () => appliedSearchKeyword.trim().toLowerCase(),
    [appliedSearchKeyword],
  );

  const handleSearch = useCallback(() => {
    setAppliedSearchKeyword(searchKeywordInput);
    setAppliedSearchScope(searchScopeInput);
  }, [searchKeywordInput, searchScopeInput]);

  const searchResult = useMemo(() => {
    if (!normalizedSearchKeyword) {
      return {
        nodeIds: [] as string[],
        edgeIds: [] as string[],
      };
    }

    const shouldSearchNodes =
      appliedSearchScope === "nodes" || appliedSearchScope === "all";
    const shouldSearchEdges =
      appliedSearchScope === "edges" || appliedSearchScope === "all";
    const nodeById = new Map(conversationNodes.map((node) => [node.id, node]));
    const nodeIds: string[] = [];
    const edgeIds: string[] = [];

    if (shouldSearchNodes) {
      for (const node of conversationNodes) {
        const haystack = [node.id, node.role, node.topic, node.content]
          .filter(Boolean)
          .join("\n")
          .toLowerCase();

        if (haystack.includes(normalizedSearchKeyword)) {
          nodeIds.push(node.id);
        }
      }
    }

    if (shouldSearchEdges) {
      for (const node of conversationNodes) {
        if (!node.parentId) continue;
        const sourceNode = nodeById.get(node.parentId);
        const edgeId = `edge-${node.parentId}-${node.id}`;
        const haystack = [
          sourceNode?.topic,
          node.topic,
          node.relationship,
          node.edgeContent,
        ]
          .filter(Boolean)
          .join("\n")
          .toLowerCase();

        if (haystack.includes(normalizedSearchKeyword)) {
          edgeIds.push(edgeId);
        }
      }
    }

    return { nodeIds, edgeIds };
  }, [appliedSearchScope, conversationNodes, normalizedSearchKeyword]);

  const searchNodeIdSet = useMemo(
    () => new Set(searchResult.nodeIds),
    [searchResult.nodeIds],
  );
  const searchEdgeIdSet = useMemo(
    () => new Set(searchResult.edgeIds),
    [searchResult.edgeIds],
  );
  const searchResultCount = searchResult.nodeIds.length + searchResult.edgeIds.length;

  // 目前選中節點的完整資料（來自 conversationNodes）
  const selectedNode = useMemo(
    () => conversationNodes.find((node) => node.id === selectedNodeId) ?? null,
    [conversationNodes, selectedNodeId],
  );

  const selectedNodeDialogues = useMemo(
    () => [...(selectedNode?.dialogues ?? [])].reverse(),
    [selectedNode],
  );

  // 目前選中節點的 ReactFlow 渲染資訊（位置等）
  const selectedFlowNode = useMemo(
    () => flowNodes.find((node) => node.id === selectedNodeId) ?? null,
    [flowNodes, selectedNodeId],
  );

  // 將 conversationNodes 根據 parent-child 關係轉換為 ReactFlow 邊線
  // showArrow 由 source.outdegree > 0 或 target.indegree > 0 決定
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
            isSearchMatch: searchEdgeIdSet.has(edgeId),
            showArrow,
          } as GraphEdgeData,
          style: { stroke: "rgba(100, 116, 139, 0.55)", strokeWidth: 1.5 },
        };
      });
  }, [conversationNodes, searchEdgeIdSet, selectedEdgeId]);

  const displayedFlowNodes = useMemo(
    () =>
      flowNodes.map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
        data: {
          ...node.data,
          isSearchMatch: searchNodeIdSet.has(node.id),
        },
      })),
    [flowNodes, searchNodeIdSet, selectedNodeId],
  );

  // 目前選中邊線的來源 / 目標節點完整資訊
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

  const projectSnapshots = useMemo(
    () => snapshotsByProject[selectedProjectId] || [],
    [snapshotsByProject, selectedProjectId],
  );

  const snapshotPlaybackQueue = useMemo(
    () => [...projectSnapshots].reverse(),
    [projectSnapshots],
  );

  const activePlaybackSnapshotId = useMemo(() => {
    if (!isSnapshotPlaying || snapshotPlaybackIndex === null) return null;
    return snapshotPlaybackQueue[snapshotPlaybackIndex]?.id ?? null;
  }, [isSnapshotPlaying, snapshotPlaybackIndex, snapshotPlaybackQueue]);

  // 切換專案時：清除選取狀態，带入該專案上次儲存的節點位置
  // 用 setTimeout 包裝避免 React 的 cascading setState 警告
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsSnapshotPlaying(false);
      setSnapshotPlaybackIndex(null);
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

  // 節點被拖曳後，將最新位置儲存到 positionsByProject 與 localStorage
  // 使用比較避免位置沒有變化時觸發不必要的重渲染
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

  // 專案資料變動時同步存回 localStorage（備賳：直接操作已在 setConversationNodes 裡完成）
  useEffect(() => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    const dialogues = extractDialoguesByProject(projects);
    localStorage.setItem(DIALOGUES_KEY, JSON.stringify(dialogues));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshotsByProject));
  }, [snapshotsByProject]);

  useEffect(() => {
    localStorage.setItem(
      SNAPSHOT_PLAYBACK_INTERVAL_KEY,
      String(snapshotPlaybackMs),
    );
  }, [snapshotPlaybackMs]);

  // 節點選取變動時，將節點現有資料填充到右側面板表單
  // 用 setTimeout 避免 cascading setState
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
    if (selectedNodeId) {
      setChatSaveTargetNodeId(selectedNodeId);
      setPreviewDialogue(null);
      return;
    }

    const hasCurrentTarget = conversationNodes.some(
      (node) => node.id === chatSaveTargetNodeId,
    );

    if ((!chatSaveTargetNodeId || !hasCurrentTarget) && conversationNodes.length > 0) {
      setChatSaveTargetNodeId(conversationNodes[0].id);
    }

    if (conversationNodes.length === 0 && chatSaveTargetNodeId) {
      setChatSaveTargetNodeId("");
    }
  }, [selectedNodeId, chatSaveTargetNodeId, conversationNodes]);

  // 邊線選取變動時，將關係標籤 / 關係內容填充到右側面板表單
  useEffect(() => {
    setTimeout(() => {
      setEditRelationship(selectedEdgeData?.target.relationship ?? "");
      setEditEdgeContent(selectedEdgeData?.target.edgeContent ?? "");
    }, 0);
  }, [selectedEdgeData]);

  // ─── 事件處理函數 ────────────────────────────────────────────────────────────
  const appendChildNode = useCallback(
    (parentNode: ConversationNode, topic: string, content: string) => {
      const newNode: ConversationNode = {
        id: crypto.randomUUID(),
        parentId: parentNode.id,
        role: "user",
        topic: topic.trim(),
        content,
        createdAt: new Date().toISOString(),
      };

      const siblingCount = conversationNodes.filter(
        (node) => node.parentId === parentNode.id,
      ).length;

      const origin = selectedFlowNode?.position ?? { x: 0, y: 0 };

      setConversationNodes((prev) => [...prev, newNode]);
      setFlowNodes((prev) => [
        ...prev,
        toGraphNode(newNode, getBranchPosition(origin, siblingCount)),
      ]);
      setSelectedNodeId(newNode.id);
    },
    [conversationNodes, selectedFlowNode, setConversationNodes, setFlowNodes],
  );

  const deleteNodeTree = useCallback(
    (rootNodeId: string) => {
      const idsToDelete = new Set<string>();
      const stack = [rootNodeId];

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
      setSelectedEdgeId(null);
    },
    [conversationNodes, setConversationNodes, setFlowNodes],
  );

  const handleCreateSnapshot = useCallback(() => {
    const currentPositions = positionsByProject[selectedProjectId] || {};
    const snapshot: ProjectSnapshot = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      nodes: conversationNodes.map((node) => ({ ...node })),
      positions: Object.fromEntries(
        Object.entries(currentPositions).map(([id, pos]) => [id, { ...pos }]),
      ),
    };

    setSnapshotsByProject((prev) => {
      const existing = prev[selectedProjectId] || [];
      const next = [snapshot, ...existing].slice(0, 50);
      return {
        ...prev,
        [selectedProjectId]: next,
      };
    });
  }, [conversationNodes, positionsByProject, selectedProjectId]);

  const applySnapshot = useCallback(
    (snapshot: ProjectSnapshot) => {
      const restoredNodes = snapshot.nodes.map((node) => ({ ...node }));
      const restoredPositions = Object.fromEntries(
        Object.entries(snapshot.positions).map(([id, pos]) => [id, { ...pos }]),
      );

      setConversationNodes(() => restoredNodes);
      setFlowNodes(applySavedPositions(restoredNodes, restoredPositions));
      setPositionsByProject((prev) => ({
        ...prev,
        [selectedProjectId]: restoredPositions,
      }));
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    },
    [selectedProjectId, setConversationNodes, setFlowNodes],
  );

  const handleRestoreSnapshot = useCallback(
    (snapshotId: string) => {
      const snapshot = projectSnapshots.find((item) => item.id === snapshotId);
      if (!snapshot) return;

      setIsSnapshotPlaying(false);
      setSnapshotPlaybackIndex(null);
      applySnapshot(snapshot);
    },
    [projectSnapshots, applySnapshot],
  );

  const handleToggleSnapshotPlayback = useCallback(() => {
    if (isSnapshotPlaying) {
      setIsSnapshotPlaying(false);
      setSnapshotPlaybackIndex(null);
      return;
    }

    if (snapshotPlaybackQueue.length === 0) return;

    setIsSnapshotPlaying(true);
    setSnapshotPlaybackIndex(0);
  }, [isSnapshotPlaying, snapshotPlaybackQueue.length]);

  useEffect(() => {
    if (!isSnapshotPlaying) return;
    if (snapshotPlaybackQueue.length === 0) {
      setIsSnapshotPlaying(false);
      setSnapshotPlaybackIndex(null);
      return;
    }

    const index = snapshotPlaybackIndex ?? 0;
    const currentSnapshot = snapshotPlaybackQueue[index];
    if (!currentSnapshot) {
      setIsSnapshotPlaying(false);
      setSnapshotPlaybackIndex(null);
      return;
    }

    applySnapshot(currentSnapshot);

    if (index >= snapshotPlaybackQueue.length - 1) {
      setIsSnapshotPlaying(false);
      setSnapshotPlaybackIndex(null);
      return;
    }

    const timer = window.setTimeout(() => {
      setSnapshotPlaybackIndex((prev) => (prev === null ? 1 : prev + 1));
    }, snapshotPlaybackMs);

    return () => window.clearTimeout(timer);
  }, [
    isSnapshotPlaying,
    snapshotPlaybackIndex,
    snapshotPlaybackMs,
    snapshotPlaybackQueue,
    applySnapshot,
  ]);

  // 選到節點時，按 Tab 可快速新增子節點
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (!selectedNode || showSettings) return;

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName ?? "";
      const isTypingField =
        target?.isContentEditable ||
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        tagName === "BUTTON";

      if (isTypingField) return;

      const isCreateKey = event.key === "Tab";
      const isDeleteKey = event.key === "Delete" || event.key === "Backspace";
      if (!isCreateKey && !isDeleteKey) return;

      event.preventDefault();

      if (isDeleteKey) {
        deleteNodeTree(selectedNode.id);
        return;
      }

      const siblingCount =
        conversationNodes.filter((node) => node.parentId === selectedNode.id)
          .length + 1;
      appendChildNode(
        selectedNode,
        `新分支 ${siblingCount}`,
        "（Tab 快速新增）",
      );
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    conversationNodes,
    selectedNode,
    showSettings,
    appendChildNode,
    deleteNodeTree,
  ]);

  /** 新增子節點，並將其排列在父節點附近的同心圆位置 */
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
    appendChildNode(selectedNode, newBranchTopic, newBranchContent);
    setNewBranchTopic("新分支");
    setNewBranchContent("");
  };

  /** 儲存選中邊線的關係標籤、關係內容，並更新最後修改時間 */
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

  /** 儲存節點修改（Role / Topic / Content / InDegree / OutDegree），包含驗證檢查 */
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

  /** 刪除選中節點以及所有子孙節點（深度優先遍歷） */
  const handleDeleteSelectedNode = () => {
    if (!selectedNode) return;
    deleteNodeTree(selectedNode.id);
  };

  const handleSaveOpenAIApiKey = useCallback((key: string) => {
    setOpenAIApiKey(key);
  }, []);

  const handleSendChat = useCallback(async () => {
    const trimmedInput = chatInput.trim();
    if (!trimmedInput || isChatLoading) return;

    if (!openAIApiKey.trim()) {
      setChatError("尚未設定 OpenAI API Key，請先到設定頁新增。");
      setShowSettings(true);
      return;
    }

    const userMessage: AIChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedInput,
    };

    const messagesForApi = [...chatMessages, userMessage].map((message) => ({
      role: message.role,
      content: message.content,
    }));

    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput("");
    setIsChatLoading(true);
    setChatError(null);

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAIApiKey.trim()}`,
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: messagesForApi,
        }),
      });

      const payload = (await response.json()) as {
        output_text?: string;
        output?: Array<{
          content?: Array<{ type?: string; text?: string }>;
        }>;
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "OpenAI 請求失敗");
      }

      const outputFromChunks = (payload.output ?? [])
        .flatMap((item) => item.content ?? [])
        .filter((item) => item.type === "output_text" && item.text)
        .map((item) => item.text ?? "")
        .join("\n")
        .trim();

      const assistantText =
        payload.output_text?.trim() || outputFromChunks || "目前沒有回覆內容。";

      const assistantMessage: AIChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: assistantText,
      };

      setChatMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "發生未知錯誤，請稍後再試";
      setChatError(message);
    } finally {
      setIsChatLoading(false);
    }
  }, [chatInput, chatMessages, isChatLoading, openAIApiKey]);

  const handleCopyAssistantMessage = useCallback(async (content: string) => {
    const text = content.trim();
    if (!text) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }

      setChatActionNotice("已複製 AI 回覆內容");
    } catch {
      setChatActionNotice("複製失敗，請稍後再試");
    }
  }, []);

  const handleSaveAssistantMessageToNode = useCallback(
    (message: AIChatMessage) => {
      if (message.role !== "assistant") return;

      const targetNode = conversationNodes.find(
        (node) => node.id === chatSaveTargetNodeId,
      );

      if (!targetNode) {
        setChatActionNotice("請先選擇要儲存的 Node");
        return;
      }

      const savedAt = new Date().toISOString();
      const newDialogue: NodeDialogueEntry = {
        id: crypto.randomUUID(),
        sourceMessageId: message.id,
        title: getDialogueTitle(message.content.trim()),
        content: message.content.trim(),
        createdAt: savedAt,
      };

      setConversationNodes((prev) =>
        prev.map((node) =>
          node.id === targetNode.id
            ? {
                ...node,
                dialogues: [...(node.dialogues ?? []), newDialogue],
              }
            : node,
        ),
      );

      setSelectedNodeId(targetNode.id);
      setSelectedEdgeId(null);
      setChatActionNotice(`已存到對話：${targetNode.topic}`);
    },
    [chatSaveTargetNodeId, conversationNodes, setConversationNodes],
  );

  const handleRenameDialogueTitle = useCallback(
    (dialogueId: string, currentTitle: string) => {
      if (!selectedNode) return;

      const nextTitle = window.prompt("請輸入新標題", currentTitle);
      if (nextTitle === null) return;

      const trimmedTitle = nextTitle.trim();
      if (!trimmedTitle) {
        alert("標題不可為空");
        return;
      }

      setConversationNodes((prev) =>
        prev.map((node) =>
          node.id === selectedNode.id
            ? {
                ...node,
                dialogues: (node.dialogues ?? []).map((dialogue) =>
                  dialogue.id === dialogueId
                    ? {
                        ...dialogue,
                        title: trimmedTitle,
                      }
                    : dialogue,
                ),
              }
            : node,
        ),
      );

      setPreviewDialogue((prev) =>
        prev && prev.id === dialogueId
          ? {
              ...prev,
              title: trimmedTitle,
            }
          : prev,
      );
    },
    [selectedNode, setConversationNodes],
  );

  const handleExportNodeDialogues = useCallback(() => {
    if (!selectedNode) return;

    const dialogues = selectedNode.dialogues ?? [];
    if (dialogues.length === 0) {
      alert("目前沒有可匯出的對話紀錄");
      return;
    }

    const payload = {
      projectId: selectedProjectId,
      nodeId: selectedNode.id,
      nodeTopic: selectedNode.topic,
      exportedAt: new Date().toISOString(),
      dialogues,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `node-dialogues-${selectedNode.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [selectedNode, selectedProjectId]);

  // ─── 渲染 ────────────────────────────────────────────────────────────────
  // NodeSizeContext.Provider 將 nodeSize 屬數往下傳給 CircleNode 與 FloatingEdge
  return (
    <NodeSizeContext.Provider value={nodeSize}>
      <div className="app-container">
        {/* 如果暫示設定頁面就渲染 SettingsPage，否則顯示主井幕 */}
        {showSettings ? (
          <SettingsPage
            projects={projects}
            setProjects={setProjects}
            setSelectedProjectId={setSelectedProjectId}
            onBack={() => setShowSettings(false)}
            nodeSize={nodeSize}
            setNodeSize={setNodeSize}
            openAIApiKey={openAIApiKey}
            onSaveOpenAIApiKey={handleSaveOpenAIApiKey}
          />
        ) : (
          <>
            <header className="app-header">
              <h1>Conversation Graph Prototype</h1>
              <p>線性對話 → 主題節點圖 → 可分支脈絡</p>
              <div className="project-switcher">
                <GraphSearchBar
                  query={searchKeywordInput}
                  scope={searchScopeInput}
                  resultCount={searchResultCount}
                  onQueryChange={setSearchKeywordInput}
                  onScopeChange={setSearchScopeInput}
                  onSearch={handleSearch}
                />
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
                  className="ai-chat-toggle-btn"
                  title="AI 對話"
                  onClick={() => setIsAiChatOpen((prev) => !prev)}
                  aria-label="AI 對話"
                >
                  {isAiChatOpen ? "關閉 AI" : "AI 對話"}
                </button>
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
              {/* 左側：ReactFlow 圖譜畫布 */}
              <section className="graph-panel">
                <ReactFlow<GraphFlowNode, Edge>
                  nodes={displayedFlowNodes}
                  edges={flowEdges}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  onNodesChange={onNodesChange}
                  fitView
                  fitViewOptions={{ padding: 0.24 }}
                  minZoom={0.2}
                  maxZoom={1.6}
                  onNodeClick={(_event, node) => {
                    // 點擊節點：選中節點、取消邊線選取
                    setSelectedNodeId(node.id);
                    setSelectedEdgeId(null);
                  }}
                  onEdgeClick={(_event, edge) => {
                    // 點擊邊線：選中邊線、取消節點選取
                    setSelectedEdgeId(edge.id);
                    setSelectedNodeId(null);
                  }}
                  onPaneClick={() => {
                    // 點擊空白區：取消所有選取
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
                      <MarkdownEditor
                        value={editEdgeContent}
                        onChange={setEditEdgeContent}
                        placeholder="輸入這條關係的詳細說明..."
                        height={160}
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
                      <MarkdownEditor
                        value={editContent}
                        onChange={setEditContent}
                        placeholder="輸入內容..."
                        height={200}
                      />
                    </div>

                    <section className="node-dialogue-panel">
                      <div className="node-dialogue-panel__header">
                        <div className="node-dialogue-panel__title-wrap">
                          <h3>對話紀錄</h3>
                          <button
                            type="button"
                            className="node-dialogue-export-btn"
                            onClick={handleExportNodeDialogues}
                            disabled={selectedNodeDialogues.length === 0}
                          >
                            匯出對話
                          </button>
                        </div>
                        <span className="node-dialogue-panel__count">
                          {selectedNodeDialogues.length} 則
                        </span>
                      </div>

                      {selectedNodeDialogues.length === 0 ? (
                        <p className="node-dialogue-empty">
                          尚無對話，請在 AI 視窗按「存到 Node」。
                        </p>
                      ) : (
                        <ol className="snapshot-timeline">
                          {selectedNodeDialogues.map((dialogue) => (
                            <li key={dialogue.id} className="snapshot-item">
                              <div className="snapshot-item__dot node-dialogue-item__dot" />
                              <div className="snapshot-item__content node-dialogue-item__content">
                                <div className="snapshot-item__meta">
                                  <span className="snapshot-item__time">
                                    {new Date(dialogue.createdAt).toLocaleString()}
                                  </span>
                                  <div className="node-dialogue-item__actions">
                                    <button
                                      type="button"
                                      className="node-dialogue-item__rename"
                                      onClick={() =>
                                        handleRenameDialogueTitle(
                                          dialogue.id,
                                          getDialogueDisplayTitle(dialogue),
                                        )
                                      }
                                    >
                                      改名
                                    </button>
                                    <button
                                      type="button"
                                      className="node-dialogue-item__toggle"
                                      onClick={() => setPreviewDialogue(dialogue)}
                                    >
                                      檢視
                                    </button>
                                  </div>
                                </div>
                                <div className="node-dialogue-item__title">
                                  {getDialogueDisplayTitle(dialogue)}
                                </div>
                              </div>
                            </li>
                          ))}
                        </ol>
                      )}
                    </section>

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
                      <MarkdownEditor
                        value={newBranchContent}
                        onChange={setNewBranchContent}
                        placeholder="輸入新的分支內容..."
                        height={160}
                      />
                    </div>

                    <button onClick={handleAddBranch}>新增分支節點</button>
                  </>
                ) : (
                  <p>請點選左側任一節點或邊查看內容。</p>
                )}

                <hr />

                <section className="snapshot-panel">
                  <div className="snapshot-panel__header">
                    <h3>Snapshot Timeline</h3>
                    <div className="snapshot-panel__actions">
                      <button
                        className="snapshot-btn"
                        type="button"
                        onClick={handleCreateSnapshot}
                      >
                        建立 Snapshot
                      </button>
                      <button
                        className="snapshot-btn snapshot-btn--play"
                        type="button"
                        onClick={handleToggleSnapshotPlayback}
                        disabled={projectSnapshots.length === 0}
                      >
                        {isSnapshotPlaying ? "停止播放" : "播放 Snapshot"}
                      </button>
                    </div>
                  </div>

                  <div className="snapshot-interval">
                    <label htmlFor="snapshot-interval-input">
                      播放間隔（ms）
                    </label>
                    <input
                      id="snapshot-interval-input"
                      type="number"
                      min={300}
                      max={10000}
                      step={100}
                      value={snapshotPlaybackMs}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        if (!Number.isFinite(next)) return;
                        const clamped = Math.min(10000, Math.max(300, next));
                        setSnapshotPlaybackMs(Math.round(clamped));
                      }}
                    />
                  </div>

                  {projectSnapshots.length === 0 ? (
                    <p className="snapshot-empty">
                      尚無 snapshot，先建立第一個版本。
                    </p>
                  ) : (
                    <ol className="snapshot-timeline">
                      {projectSnapshots.map((snapshot) => (
                        <li
                          key={snapshot.id}
                          className={`snapshot-item ${
                            activePlaybackSnapshotId === snapshot.id
                              ? "is-playing"
                              : ""
                          }`}
                        >
                          <div className="snapshot-item__dot" />
                          <div className="snapshot-item__content">
                            <div className="snapshot-item__meta">
                              <span className="snapshot-item__time">
                                {new Date(snapshot.createdAt).toLocaleString()}
                              </span>
                              <span className="snapshot-item__count">
                                {snapshot.nodes.length} nodes
                              </span>
                            </div>
                            <button
                              className="snapshot-item__restore"
                              type="button"
                              onClick={() => handleRestoreSnapshot(snapshot.id)}
                            >
                              還原到這版
                            </button>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              </aside>
            </main>

            {isAiChatOpen && (
              <section className="ai-chat-drawer" aria-label="AI 聊天視窗">
                <div className="ai-chat-drawer__header">
                  <h3>OpenAI 對話</h3>
                  <button
                    type="button"
                    className="ai-chat-close-btn"
                    onClick={() => setIsAiChatOpen(false)}
                  >
                    關閉
                  </button>
                </div>

                <div className="ai-chat-save-target">
                  <label htmlFor="chat-save-target-select">儲存到 Node</label>
                  <select
                    id="chat-save-target-select"
                    value={chatSaveTargetNodeId}
                    onChange={(event) =>
                      setChatSaveTargetNodeId(event.target.value)
                    }
                  >
                    {conversationNodes.map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.topic}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="ai-chat-messages">
                  {chatMessages.length === 0 ? (
                    <p className="ai-chat-empty">
                      開始輸入訊息，這裡會顯示你和 AI 的對話。
                    </p>
                  ) : (
                    chatMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`ai-chat-message ai-chat-message--${message.role}`}
                      >
                        <div className="ai-chat-message__role">
                          {message.role === "user" ? "你" : "AI"}
                        </div>

                        {message.role === "assistant" ? (
                          <>
                            <div className="ai-chat-message__content ai-chat-message__content--markdown">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {message.content}
                              </ReactMarkdown>
                            </div>
                            <div className="ai-chat-message__actions">
                              <button
                                type="button"
                                className="ai-chat-message__action-btn"
                                onClick={() =>
                                  void handleCopyAssistantMessage(message.content)
                                }
                              >
                                複製
                              </button>
                              <button
                                type="button"
                                className="ai-chat-message__action-btn"
                                onClick={() =>
                                  handleSaveAssistantMessageToNode(message)
                                }
                                disabled={!conversationNodes.length}
                              >
                                存到 Node
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="ai-chat-message__content">
                            {message.content}
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  {isChatLoading && (
                    <p className="ai-chat-loading">AI 回覆中...</p>
                  )}
                </div>

                {chatError && <p className="ai-chat-error">{chatError}</p>}

                <div className="ai-chat-input-wrap">
                  <textarea
                    className="ai-chat-input"
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void handleSendChat();
                      }
                    }}
                    placeholder="輸入訊息，按 Enter 送出（Shift+Enter 換行）"
                  />
                  <button
                    type="button"
                    className="ai-chat-send-btn"
                    onClick={() => void handleSendChat()}
                    disabled={isChatLoading || !chatInput.trim()}
                  >
                    送出
                  </button>
                </div>

                <p className="ai-chat-status">
                  {openAIApiKey.trim()
                    ? "已連線：使用本機儲存的 OpenAI API Key"
                    : "尚未設定 API Key，請到設定頁新增"}
                </p>
                {chatActionNotice && (
                  <p className="ai-chat-status ai-chat-status--notice">
                    {chatActionNotice}
                  </p>
                )}
              </section>
            )}

            {previewDialogue && (
              <div
                className="dialogue-preview-modal"
                role="dialog"
                aria-modal="true"
                aria-label="對話內容檢視"
              >
                <button
                  type="button"
                  className="dialogue-preview-backdrop"
                  onClick={() => setPreviewDialogue(null)}
                  aria-label="關閉"
                />
                <div className="dialogue-preview-content">
                  <div className="dialogue-preview-header">
                    <div>
                      <h3>{getDialogueDisplayTitle(previewDialogue)}</h3>
                      <p>
                        {new Date(previewDialogue.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="dialogue-preview-close"
                      onClick={() => setPreviewDialogue(null)}
                    >
                      關閉
                    </button>
                  </div>
                  <div className="node-dialogue-item__text">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {previewDialogue.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </NodeSizeContext.Provider>
  );
}

export default App;
