type SearchScope = "nodes" | "edges" | "all";

interface GraphSearchBarProps {
  query: string;
  scope: SearchScope;
  resultCount: number;
  onQueryChange: (value: string) => void;
  onScopeChange: (scope: SearchScope) => void;
  onSearch: () => void;
}

function GraphSearchBar({
  query,
  scope,
  resultCount,
  onQueryChange,
  onScopeChange,
  onSearch,
}: GraphSearchBarProps) {
  return (
    <div className="graph-search" role="search">
      <input
        type="text"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSearch();
        }}
        className="graph-search__input"
        placeholder="搜尋關鍵字（topic、content、relationship...）"
        aria-label="搜尋圖譜"
      />
      <select
        value={scope}
        onChange={(event) => onScopeChange(event.target.value as SearchScope)}
        className="graph-search__scope"
        aria-label="搜尋範圍"
      >
        <option value="nodes">節點</option>
        <option value="edges">邊緣</option>
        <option value="all">全部</option>
      </select>
      <button type="button" className="graph-search__button" onClick={onSearch}>
        搜尋
      </button>
      <span className="graph-search__count">命中 {resultCount}</span>
    </div>
  );
}

export type { SearchScope };
export default GraphSearchBar;
