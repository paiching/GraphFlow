import { useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  useNodesState,
  BaseEdge,
  getStraightPath,
  useStore,
} from '@xyflow/react';
import type { Edge, EdgeProps, Node, NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './App.css';

type ConversationRole = 'user' | 'assistant' | 'system';

interface ConversationNode {
  id: string;
  parentId: string | null;
  role: ConversationRole;
  topic: string;
  content: string;
  createdAt: string;
}

interface GraphNodeData extends Record<string, unknown> {
  role: ConversationRole;
  topic: string;
}

type GraphFlowNode = Node<GraphNodeData, 'circle'>;

const initialConversationNodes: ConversationNode[] = [
  {
    id: '1',
    parentId: null,
    role: 'user',
    topic: '知識圖譜搜尋',
    content: '我想做一個像 Obsidian 的知識搜尋系統，融合 AI Search 功能。',
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    parentId: '1',
    role: 'assistant',
    topic: '系統架構',
    content: '可以使用 React Flow 建立即時關係視覺化介面，後端使用 ASP.NET Core Web API。',
    createdAt: new Date().toISOString(),
  },
  {
    id: '3',
    parentId: '2',
    role: 'user',
    topic: '論文方向',
    content: '這個實作要如何寫論文？',
    createdAt: new Date().toISOString(),
  },
];

function CircleNode({ data, selected }: NodeProps<GraphFlowNode>) {
  return (
    <>
      <Handle className="graph-node__handle" type="target" position={Position.Top} />
      <div
        className={[
          'graph-node',
          `graph-node--${data.role}`,
          selected ? 'is-selected' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span className="graph-node__role">{data.role}</span>
        <strong className="graph-node__title">{data.topic}</strong>
      </div>
      <Handle className="graph-node__handle" type="source" position={Position.Bottom} />
    </>
  );
}

const nodeTypes = { circle: CircleNode };

function FloatingEdge({ id, source, target, style }: EdgeProps) {
  const sourceNode = useStore((s) => s.nodeLookup.get(source));
  const targetNode = useStore((s) => s.nodeLookup.get(target));

  if (!sourceNode || !targetNode) return null;

  const sPos = sourceNode.internals.positionAbsolute;
  const tPos = targetNode.internals.positionAbsolute;
  const sW = sourceNode.measured?.width  ?? 148;
  const sH = sourceNode.measured?.height ?? 148;
  const tW = targetNode.measured?.width  ?? 148;
  const tH = targetNode.measured?.height ?? 148;

  const scx = sPos.x + sW / 2;
  const scy = sPos.y + sH / 2;
  const tcx = tPos.x + tW / 2;
  const tcy = tPos.y + tH / 2;

  const dx = tcx - scx;
  const dy = tcy - scy;
  const dist = Math.hypot(dx, dy) || 1;

  const srcR = (sW / 2) * 0.9;
  const tgtR = (tW / 2) * 0.9;

  const [edgePath] = getStraightPath({
    sourceX: scx + (dx / dist) * srcR,
    sourceY: scy + (dy / dist) * srcR,
    targetX: tcx - (dx / dist) * tgtR,
    targetY: tcy - (dy / dist) * tgtR,
  });

  return <BaseEdge id={id} path={edgePath} style={style} />;
}

const edgeTypes = { floating: FloatingEdge };

function toGraphNode(node: ConversationNode, position: { x: number; y: number }): GraphFlowNode {
  return {
    id: node.id,
    type: 'circle',
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
  const angle = -Math.PI / 2 + (slot / ringCapacity) * Math.PI * 2 + ring * 0.12;
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
      })
    ),
    ...branchNodes.map((node, index) => toGraphNode(node, getRadialPosition(index))),
  ];
}

function getBranchPosition(origin: { x: number; y: number }, siblingIndex: number) {
  const siblingCapacity = 6;
  const ring = Math.floor(siblingIndex / siblingCapacity) + 1;
  const slot = siblingIndex % siblingCapacity;
  const angle = -Math.PI / 2 + (slot / siblingCapacity) * Math.PI * 2 + ring * 0.18;
  const radius = 180 + ring * 40;

  return {
    x: origin.x + Math.cos(angle) * radius,
    y: origin.y + Math.sin(angle) * radius,
  };
}

function App() {
  const [conversationNodes, setConversationNodes] = useState<ConversationNode[]>(
    initialConversationNodes
  );
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<GraphFlowNode>(
    createInitialFlowNodes(initialConversationNodes)
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [newBranchTopic, setNewBranchTopic] = useState('新分支');
  const [newBranchContent, setNewBranchContent] = useState('');
  const [editRole, setEditRole] = useState<ConversationRole>('user');
  const [editTopic, setEditTopic] = useState('');
  const [editContent, setEditContent] = useState('');

  const selectedNode = useMemo(
    () => conversationNodes.find((node) => node.id === selectedNodeId) ?? null,
    [conversationNodes, selectedNodeId]
  );

  const selectedFlowNode = useMemo(
    () => flowNodes.find((node) => node.id === selectedNodeId) ?? null,
    [flowNodes, selectedNodeId]
  );

  const flowEdges: Edge[] = useMemo(() => {
    return conversationNodes
      .filter((n) => n.parentId)
      .map((n) => ({
        id:     `edge-${n.parentId}-${n.id}`,
        type:   'floating',
        source: n.parentId as string,
        target: n.id,
        style:  { stroke: 'rgba(100, 116, 139, 0.55)', strokeWidth: 1.5 },
      }));
  }, [conversationNodes]);

  useEffect(() => {
    if (!selectedNode) {
      setEditRole('user');
      setEditTopic('');
      setEditContent('');
      return;
    }

    setEditRole(selectedNode.role);
    setEditTopic(selectedNode.topic);
    setEditContent(selectedNode.content);
  }, [selectedNode]);

  const handleAddBranch = () => {
    if (!selectedNode) {
      alert('請先選擇一個節點');
      return;
    }

    if (!newBranchTopic.trim()) {
      alert('請輸入分支主題');
      return;
    }

    if (!newBranchContent.trim()) {
      alert('請輸入分支內容');
      return;
    }

    const newNode: ConversationNode = {
      id: crypto.randomUUID(),
      parentId: selectedNode.id,
      role: 'user',
      topic: newBranchTopic.trim(),
      content: newBranchContent,
      createdAt: new Date().toISOString(),
    };

    const siblingCount = conversationNodes.filter(
      (node) => node.parentId === selectedNode.id
    ).length;

    const origin = selectedFlowNode?.position ?? { x: 0, y: 0 };

    setConversationNodes((prev) => [...prev, newNode]);
    setFlowNodes((prev) => [...prev, toGraphNode(newNode, getBranchPosition(origin, siblingCount))]);
    setSelectedNodeId(newNode.id);
    setNewBranchTopic('新分支');
    setNewBranchContent('');
  };

  const handleUpdateSelectedNode = () => {
    if (!selectedNode) return;

    if (!editTopic.trim()) {
      alert('Topic 不能為空');
      return;
    }

    if (!editContent.trim()) {
      alert('Content 不能為空');
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
            }
          : node
      )
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
          : node
      )
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

    setConversationNodes((prev) => prev.filter((node) => !idsToDelete.has(node.id)));
    setFlowNodes((prev) => prev.filter((node) => !idsToDelete.has(node.id)));
    setSelectedNodeId(null);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Conversation Graph Prototype</h1>
        <p>線性對話 → 主題節點圖 → 可分支脈絡</p>
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
            onNodeClick={(_event, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
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
          <h2>節點內容</h2>

          {selectedNode ? (
            <>
              <div className="field">
                <label>ID</label>
                <div>{selectedNode.id}</div>
              </div>

              <div className="field">
                <label>Parent ID</label>
                <div>{selectedNode.parentId ?? 'Root'}</div>
              </div>

              <div className="field">
                <label>Role</label>
                <select value={editRole} onChange={(event) => setEditRole(event.target.value as ConversationRole)}>
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
                <label>UTC Timestamp</label>
                <div>{new Date(selectedNode.createdAt).toISOString()}</div>
              </div>

              <button onClick={handleUpdateSelectedNode}>儲存節點修改</button>
              <button onClick={handleDeleteSelectedNode}>刪除此節點（含子節點）</button>

              <hr />

              <h3>從此節點新增分支</h3>

              <input
                type="text"
                value={newBranchTopic}
                onChange={(event) => setNewBranchTopic(event.target.value)}
                placeholder="輸入新的分支主題..."
              />

              <textarea
                value={newBranchContent}
                onChange={(event) => setNewBranchContent(event.target.value)}
                placeholder="輸入新的分支內容..."
              />

              <button onClick={handleAddBranch}>新增分支節點</button>
            </>
          ) : (
            <p>請點選左側任一節點查看內容。</p>
          )}
        </aside>
      </main>

    </div>
  );
}

export default App;