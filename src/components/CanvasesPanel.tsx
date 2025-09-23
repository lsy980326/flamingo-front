import { useState } from "react";
import { useSocketStore } from "../store/useSocketStore";

export const CanvasesPanel = () => {
  const [canvasName, setCanvasName] = useState("");
  const {
    isConnected,
    allData,
    selectedPageId,
    selectedCanvasId,
    selectCanvas,
    createCanvas,
    getCanvasesForPage,
    getLayersForCanvas,
  } = useSocketStore();

  // 계층구조 데이터 사용
  const canvases = selectedPageId ? getCanvasesForPage(selectedPageId) : [];

  const handleCanvasSelect = (canvasId: string) => {
    selectCanvas(canvasId);
  };

  const handleCreateCanvas = () => {
    if (!canvasName) return alert("캔버스 이름을 입력해주세요.");
    createCanvas({
      name: canvasName,
      width: 800,
      height: 1200,
      unit: "px",
    });
    setCanvasName("");
  };

  return (
    <div className="panel">
      <h2>3. Canvases</h2>

      {/* 디버깅 정보 표시 */}
      <div style={{ fontSize: "12px", color: "#666", margin: "5px 0" }}>
        Selected Page: {selectedPageId || "None"}
        <br />
        Page Canvases: {canvases.length}
        <br />
        {selectedPageId && canvases.length === 0 && (
          <span style={{ color: "orange" }}>
            ⚠️ 이 페이지에 캔버스가 없습니다. 새 캔버스를 생성하세요.
          </span>
        )}
        {!selectedPageId && (
          <span style={{ color: "red" }}>❌ 먼저 페이지를 선택하세요.</span>
        )}
      </div>
      {isConnected && selectedPageId && (
        <div>
          <input
            type="text"
            value={canvasName}
            onChange={(e) => setCanvasName(e.target.value)}
            placeholder="New Canvas Name"
          />
          <button onClick={handleCreateCanvas}>Create Canvas</button>
        </div>
      )}
      <div className="list-container">
        {canvases
          .sort((a, b) => a.order - b.order)
          .map((canvas) => (
            <div
              key={canvas.id}
              className={`list-item ${
                selectedCanvasId === canvas.id ? "selected" : ""
              }`}
              onClick={() => handleCanvasSelect(canvas.id)}
            >
              {canvas.name}
            </div>
          ))}
      </div>
    </div>
  );
};
