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
  } = useSocketStore();

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

  const filteredCanvases = allData.canvases.filter(
    (canvas) => canvas.pageId === selectedPageId
  );

  return (
    <div className="panel">
      <h2>3. Canvases</h2>
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
        {filteredCanvases
          .sort((a, b) => a.order - b.order)
          .map((canvas) => (
            <div
              key={canvas._id}
              className={`list-item ${
                selectedCanvasId === canvas._id ? "selected" : ""
              }`}
              onClick={() => selectCanvas(canvas._id)}
            >
              {canvas.name}
            </div>
          ))}
      </div>
    </div>
  );
};
