interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  height?: number;
}

function MarkdownEditor({
  value,
  onChange,
  placeholder = "輸入 Markdown 內容...",
  height = 200,
}: MarkdownEditorProps) {
  const handleInsertMarkdown = (before: string, after = "") => {
    const textarea = document.querySelector(
      "textarea[data-markdown-editor]",
    ) as HTMLTextAreaElement | null;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.substring(start, end);
    const newValue =
      value.substring(0, start) +
      before +
      selected +
      after +
      value.substring(end);

    onChange(newValue);
    setTimeout(() => {
      textarea.focus();
      const newStart = start + before.length;
      textarea.setSelectionRange(newStart, newStart + selected.length);
    }, 0);
  };

  return (
    <div className="markdown-editor">
      <div className="markdown-editor__toolbar">
        <button
          type="button"
          onClick={() => handleInsertMarkdown("**", "**")}
          title="粗體"
          className="markdown-editor__btn"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          onClick={() => handleInsertMarkdown("*", "*")}
          title="斜體"
          className="markdown-editor__btn"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          onClick={() => handleInsertMarkdown("# ")}
          title="標題 H1"
          className="markdown-editor__btn"
        >
          H1
        </button>
        <button
          type="button"
          onClick={() => handleInsertMarkdown("- ")}
          title="列表"
          className="markdown-editor__btn"
        >
          •
        </button>
        <button
          type="button"
          onClick={() => handleInsertMarkdown("```\n", "\n```")}
          title="代碼塊"
          className="markdown-editor__btn"
        >
          &lt;/&gt;
        </button>
        <button
          type="button"
          onClick={() => handleInsertMarkdown("[", "](url)")}
          title="連結"
          className="markdown-editor__btn"
        >
          🔗
        </button>
      </div>
      <textarea
        data-markdown-editor
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="markdown-editor__textarea"
        style={{
          minHeight: `${height}px`,
        }}
      />
      <div className="markdown-editor__hint">
        支援 Markdown 語法 | 使用上方按鈕快速插入格式
      </div>
    </div>
  );
}

export default MarkdownEditor;
