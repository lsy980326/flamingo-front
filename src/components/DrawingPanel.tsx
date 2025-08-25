import React, { useEffect } from "react";
import { useYjsStore } from "../store/useYjsStore";
import { useSocketStore } from "../store/useSocketStore";
import { useUserStore } from "../store/useUserStore"; // 사용자 이름 가져오기
import { CollaboratorCursors } from "./CollaboratorCursors"; // 커서 렌더링 컴포넌트
import { PixiCanvas } from "./PixiCanvas";

export const DrawingPanel = () => {
  // ✨ 캔버스 ID와 활성 레이어 ID를 가져옴
  const { selectedCanvasId, selectedLayerId } = useSocketStore();
  const {
    connectToCanvas,
    disconnectFromCanvas,
    yjsStatus,
    setMyInfo,
    updateMyCursor,
    startStroke,
    addPointToStroke,
    endStroke,
  } = useYjsStore();
  const userName = useUserStore((state) => state.name);

  // 캔버스 ID가 변경되면 Yjs 연결을 관리
  useEffect(() => {
    if (selectedCanvasId) {
      connectToCanvas(selectedCanvasId);
    }
    return () => {
      disconnectFromCanvas();
    };
  }, [selectedCanvasId, connectToCanvas, disconnectFromCanvas]);

  // Yjs 연결 후 내 정보 설정
  useEffect(() => {
    if (yjsStatus === "connected" && userName) {
      const colors = ["#ff0000", "#0000ff", "#00ff00", "#ffa500", "#800080"];
      const color = colors[Math.floor(Math.random() * colors.length)];
      setMyInfo({ name: userName, color });
    }
  }, [yjsStatus, userName, setMyInfo]);

  // --- 마우스/포인터 이벤트 핸들러들 ---
  const isDrawing = React.useRef(false);

  const getPointerPos = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (yjsStatus !== "connected" || !selectedLayerId) return;
    isDrawing.current = true;
    const { x, y } = getPointerPos(e);
    // TODO: 브러시 색상/크기는 UI에서 선택한 값으로 변경해야 함
    startStroke(selectedLayerId, x, y, e.pressure, "#000000", 5);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const { x, y } = getPointerPos(e);
    updateMyCursor({ x, y }); // 커서 위치는 항상 업데이트
    if (!isDrawing.current || yjsStatus !== "connected" || !selectedLayerId)
      return;
    addPointToStroke(selectedLayerId, x, y, e.pressure);
  };

  const handlePointerUp = () => {
    if (yjsStatus !== "connected") return;
    isDrawing.current = false;
    endStroke();
  };

  return (
    <div className={`panel drawing-panel ${selectedCanvasId ? "visible" : ""}`}>
      <h2>
        Drawing Canvas {selectedCanvasId && `(Canvas: ${selectedCanvasId})`}
      </h2>
      {selectedCanvasId ? (
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{
            position: "relative",
            width: "800px",
            height: "1200px",
            border: "1px solid black",
          }}
        >
          <PixiCanvas width={800} height={1200} />
          <CollaboratorCursors />
          {/* CanvasOverlay 컴포넌트도 필요 시 추가 */}
        </div>
      ) : (
        <p>Select a canvas to start drawing.</p>
      )}
    </div>
  );
};
