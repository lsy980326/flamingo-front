import { useState } from "react";
import { useSocketStore } from "../store/useSocketStore";

export const PagesPanel = () => {
  const [pageName, setPageName] = useState("");
  const {
    isConnected,
    allData,
    projectId,
    selectedPageId,
    selectPage,
    createPage,
    getPages,
    getCanvasesForPage,
  } = useSocketStore();

  // 계층구조 데이터 사용
  const pages = getPages();

  const handleCreatePage = () => {
    if (!pageName) return alert("페이지 이름을 입력해주세요.");
    createPage(pageName);
    setPageName("");
  };

  const handlePageSelect = (pageId: string) => {
    const pageCanvases = getCanvasesForPage(pageId);
    const pageName = pages.find((p) => p.id === pageId)?.name;

    console.log(`📄 [Page Selected] "${pageName}":`, {
      id: pageId,
      name: pageName,
      canvases: pageCanvases.map((c) => ({
        id: c.id,
        name: c.name,
        size: `${c.width}×${c.height}`,
        layers:
          c.layers?.map((l) => ({
            id: l.id,
            name: l.name,
            type: l.type,
            order: l.order,
            visible: l.visible,
            locked: l.locked,
            opacity: l.opacity,
            blend_mode: l.blend_mode,
            layer_data: {
              brushStrokes: l.layer_data?.brushStrokes || [],
              textObjects: l.layer_data?.textObjects || [],
              totalPoints:
                l.layer_data?.brushStrokes?.reduce(
                  (sum, stroke) => sum + (stroke.points?.length || 0),
                  0
                ) || 0,
              contentBounds: l.layer_data?.contentBounds || {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
              },
            },
          })) || [],
      })),
    });
    selectPage(pageId);
  };

  return (
    <div className="panel">
      <h2>2. Pages</h2>

      {/* 디버깅 정보 표시 */}
      <div style={{ fontSize: "12px", color: "#666", margin: "5px 0" }}>
        Total Pages: {pages.length}
        <br />
        Selected: {selectedPageId || "None"}
        <br />
        {pages.length === 0 && isConnected && projectId && (
          <span style={{ color: "orange" }}>
            ⚠️ 페이지가 없습니다. 새 페이지를 생성하세요.
          </span>
        )}
      </div>
      {isConnected && projectId && (
        <div>
          <input
            type="text"
            value={pageName}
            onChange={(e) => setPageName(e.target.value)}
            placeholder="New Page Name"
          />
          <button onClick={handleCreatePage}>Create Page</button>
        </div>
      )}
      <div className="list-container">
        {pages
          .sort((a, b) => a.order - b.order)
          .map((page) => (
            <div
              key={page.id}
              className={`list-item ${
                selectedPageId === page.id ? "selected" : ""
              }`}
              onClick={() => handlePageSelect(page.id)}
            >
              {page.name}
            </div>
          ))}
      </div>
    </div>
  );
};
