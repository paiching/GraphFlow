import React, { useEffect, useRef, useState } from "react";

type ConversationRole = "筆記" | "對話" | "檔案" | "圖片";
interface ConversationNode {
  id: string;
  parentId: string | null;
  role: ConversationRole;
  topic: string;
  content: string;
  createdAt: string;
}
interface SettingsPageProps {
  projects: Record<string, ConversationNode[]>;
  setProjects: (projects: Record<string, ConversationNode[]>) => void;
  setSelectedProjectId: (id: string) => void;
  onBack: () => void;
  nodeSize: number;
  setNodeSize: (size: number) => void;
  openAIApiKey: string;
  onSaveOpenAIApiKey: (key: string) => void;
}

const LOCAL_KEY = "conversation-projects";

const SettingsPage: React.FC<SettingsPageProps> = ({
  projects,
  setProjects,
  setSelectedProjectId,
  onBack,
  nodeSize,
  setNodeSize,
  openAIApiKey,
  onSaveOpenAIApiKey,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [apiKeyInput, setApiKeyInput] = useState(openAIApiKey);

  useEffect(() => {
    setApiKeyInput(openAIApiKey);
  }, [openAIApiKey]);

  // 匯出 JSON
  const handleExport = () => {
    const data = JSON.stringify(projects, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "conversation-projects.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // 上傳 JSON
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const json = JSON.parse(evt.target?.result as string);
        if (typeof json === "object" && json !== null) {
          setProjects(json);
          localStorage.setItem(LOCAL_KEY, JSON.stringify(json));
          // 自動切到第一個專案
          const keys = Object.keys(json);
          if (keys.length > 0) setSelectedProjectId(keys[0]);
          alert("匯入成功！");
        } else {
          alert("檔案格式錯誤");
        }
      } catch {
        alert("檔案解析失敗");
      }
    };
    reader.readAsText(file);
  };

  const handleSaveApiKey = () => {
    onSaveOpenAIApiKey(apiKeyInput.trim());
    alert("OpenAI API Key 已儲存");
  };

  return (
    <div className="settings-page">
      <div className="settings-card">
        <div className="settings-header">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="12"
              cy="12"
              r="3.5"
              stroke="#0ea5e9"
              strokeWidth="1.8"
            />
            <path
              d="M12 2v2.5M12 19.5V22M22 12h-2.5M4.5 12H2M19.07 4.93l-1.77 1.77M6.7 17.3l-1.77 1.77M19.07 19.07l-1.77-1.77M6.7 6.7L4.93 4.93"
              stroke="#0ea5e9"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          <h2>專案資料設定</h2>
        </div>

        <div className="settings-actions">
          <button className="settings-btn export" onClick={handleExport}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 3v12m0 0l-4-4m4 4l4-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            匯出所有專案 JSON
          </button>

          <input
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            ref={fileInputRef}
            onChange={handleImport}
          />
          <button
            className="settings-btn import"
            onClick={() => fileInputRef.current?.click()}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 21V9m0 0l-4 4m4-4l4 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M4 7V5a2 2 0 012-2h12a2 2 0 012 2v2"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            上傳／匯入 JSON
          </button>
        </div>

        <p className="settings-hint">
          匯入後將覆蓋現有所有專案資料，並自動儲存於 localStorage。
        </p>

        <div className="settings-section">
          <div className="settings-section-title">外觀設定</div>
          <div className="settings-field">
            <label className="settings-field-label">
              節點大小
              <span className="settings-field-value">{nodeSize}px</span>
            </label>
            <input
              type="range"
              min={60}
              max={220}
              step={4}
              value={nodeSize}
              onChange={(e) => setNodeSize(Number(e.target.value))}
              className="settings-slider"
            />
            <div className="settings-slider-labels">
              <span>小</span>
              <span>預設 (148px)</span>
              <span>大</span>
            </div>
          </div>
          <button
            className="settings-btn reset-size"
            onClick={() => setNodeSize(148)}
          >
            重設為預設大小
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">AI 連線設定</div>
          <div className="settings-field">
            <label className="settings-field-label" htmlFor="openai-api-key">
              OpenAI API Key
            </label>
            <input
              id="openai-api-key"
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="sk-..."
              autoComplete="off"
              className="settings-text-input"
            />
          </div>
          <button className="settings-btn export" onClick={handleSaveApiKey}>
            儲存 API Key
          </button>
          <p className="settings-hint">
            Key 只會存到你本機瀏覽器 localStorage，重新整理後仍可使用。
          </p>
        </div>

        <button className="settings-btn back" onClick={onBack}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M19 12H5m0 0l7-7m-7 7l7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          返回主畫面
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
