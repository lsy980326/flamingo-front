import React, { useEffect, useState, useMemo } from "react";
import { useYjsStore } from "../store/useYjsStore";
import { useSocketStore } from "../store/useSocketStore";
import { useUserStore } from "../store/useUserStore"; // 사용자 이름 가져오기
import { CollaboratorCursors } from "./CollaboratorCursors"; // 커서 렌더링 컴포넌트
import { PixiCanvas } from "./PixiCanvas";
import { TextInputPanel } from "./TextInputPanel"; // 텍스트 입력 패널

export const DrawingPanel = () => {
  // ✨ 캔버스 ID와 활성 레이어 ID를 가져옴
  const { selectedCanvasId, selectedLayerId, getLayersForCanvas } =
    useSocketStore();
  const {
    connectToCanvas,
    disconnectFromCanvas,
    yjsStatus,
    setMyInfo,
    updateMyCursor,
    startStroke,
    addPointToStroke,
    endStroke,
    isLayerConnected,
    forceUpdate,
  } = useYjsStore();
  const userName = useUserStore((state) => state.name);

  // 레이어 표시/숨기기 상태 관리
  const [layerVisibility, setLayerVisibility] = useState<
    Record<string, boolean>
  >({});

  // 전체 화면 모드 상태 (기본값은 false)
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 캔버스 ID가 변경되면 Yjs 연결을 관리
  useEffect(() => {
    if (selectedCanvasId) {
      connectToCanvas(selectedCanvasId);
      // 캔버스 선택 시에는 자동으로 풀스크린이 되지 않음
      // setIsFullscreen(true); // 이 줄 제거

      // 캔버스 연결 시 모든 레이어를 기본적으로 보이도록 설정
      const canvasLayers = getLayersForCanvas(selectedCanvasId);
      const initialVisibility: Record<string, boolean> = {};
      canvasLayers.forEach((layer) => {
        initialVisibility[layer.id] = true; // 기본적으로 모든 레이어 보임
      });
      setLayerVisibility(initialVisibility);
    } else {
      setIsFullscreen(false); // 캔버스 선택 해제 시 전체 화면 모드 비활성화
    }
    return () => {
      disconnectFromCanvas();
      setLayerVisibility({});
    };
  }, [
    selectedCanvasId,
    connectToCanvas,
    disconnectFromCanvas,
    getLayersForCanvas,
  ]);

  // Yjs 연결 후 내 정보 설정
  useEffect(() => {
    if (yjsStatus === "connected" && userName) {
      const colors = ["#ff0000", "#0000ff", "#00ff00", "#ffa500", "#800080"];
      const color = colors[Math.floor(Math.random() * colors.length)];
      setMyInfo({ name: userName, color });
    }
  }, [yjsStatus, userName, setMyInfo]);

  // forceUpdate 값 변화 감지하여 캔버스 강제 업데이트
  useEffect(() => {
    // forceUpdate 값이 변경되면 캔버스가 다시 그려지도록 함
    // 이는 버전 복구 후 캔버스 업데이트를 위한 것
  }, [forceUpdate]);

  // 레이어 표시/숨기기 토글
  const toggleLayerVisibility = (layerId: string) => {
    setLayerVisibility((prev) => ({
      ...prev,
      [layerId]: !prev[layerId],
    }));
  };

  // 전체 화면 모드 토글
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // 전체 화면 모드 종료
  const exitFullscreen = () => {
    setIsFullscreen(false);
  };

  // --- 마우스/포인터 이벤트 핸들러들 ---
  const isDrawing = React.useRef(false);

  const getPointerPos = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (
      yjsStatus !== "connected" ||
      !selectedLayerId ||
      !isLayerConnected(selectedLayerId)
    )
      return;
    isDrawing.current = true;
    const { x, y } = getPointerPos(e);
    // TODO: 브러시 색상/크기는 UI에서 선택한 값으로 변경해야 함
    startStroke(selectedLayerId, x, y, e.pressure, "#000000", 5);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const { x, y } = getPointerPos(e);
    updateMyCursor({ x, y }); // 커서 위치는 항상 업데이트
    if (
      !isDrawing.current ||
      yjsStatus !== "connected" ||
      !selectedLayerId ||
      !isLayerConnected(selectedLayerId)
    )
      return;
    addPointToStroke(selectedLayerId, x, y, e.pressure);
  };

  const handlePointerUp = () => {
    if (yjsStatus !== "connected") return;
    isDrawing.current = false;
    endStroke();
  };

  // 현재 캔버스의 레이어 목록 (계층구조 데이터 사용) - useMemo로 최적화
  const currentCanvasLayers = useMemo(() => {
    return selectedCanvasId ? getLayersForCanvas(selectedCanvasId) : [];
  }, [selectedCanvasId, getLayersForCanvas]);

  // 전체 화면 모드일 때의 캔버스 크기
  const fullscreenCanvasSize = {
    width: window.innerWidth - 40, // 좌우 여백 20px씩
    height: window.innerHeight - 200, // 상단 여백 200px (헤더 + 컨트롤)
  };

  // 일반 모드일 때의 캔버스 크기
  const normalCanvasSize = {
    width: 800,
    height: 1200,
  };

  const canvasSize = isFullscreen ? fullscreenCanvasSize : normalCanvasSize;

  return (
    <div
      className={`panel drawing-panel ${selectedCanvasId ? "visible" : ""} ${
        isFullscreen ? "fullscreen" : ""
      }`}
    >
      {isFullscreen && (
        <div className="fullscreen-header">
          <h2>
            Drawing Canvas {selectedCanvasId && `(Canvas: ${selectedCanvasId})`}
            {selectedLayerId && ` - Active Layer: ${selectedLayerId}`}
          </h2>
          <button className="exit-fullscreen-btn" onClick={exitFullscreen}>
            ✕ Exit Fullscreen
          </button>
        </div>
      )}

      {!isFullscreen && (
        <div className="normal-header">
          <h2>Drawing Canvas</h2>
          <div
            style={{ fontSize: "14px", color: "#666", marginBottom: "10px" }}
          >
            Canvas:{" "}
            {selectedCanvasId
              ? `✅ Selected (${selectedCanvasId.slice(-8)})`
              : "❌ Not selected"}
            <br />
            Layer:{" "}
            {selectedLayerId
              ? `✅ Active (${selectedLayerId.slice(-8)})`
              : "❌ Not selected"}
            <br />
            Yjs Status:{" "}
            {yjsStatus === "connected"
              ? "🟢 Connected"
              : yjsStatus === "connecting"
              ? "🟡 Connecting"
              : "🔴 Disconnected"}
          </div>
          {selectedCanvasId && (
            <button className="enter-fullscreen-btn" onClick={toggleFullscreen}>
              🖥️ Enter Fullscreen
            </button>
          )}
        </div>
      )}

      {selectedCanvasId && (
        <div
          className={`layer-controls ${
            isFullscreen ? "fullscreen-controls" : ""
          }`}
        >
          <div className="controls-header">
            <h3>Layer Visibility Controls</h3>
          </div>

          <div className="layer-list">
            {currentCanvasLayers.map((layer) => (
              <div key={layer.id} className="layer-item">
                <label className="layer-label">
                  <input
                    type="checkbox"
                    checked={layerVisibility[layer.id] ?? true}
                    onChange={() => toggleLayerVisibility(layer.id)}
                    className="layer-checkbox"
                  />
                  <span className="layer-name">
                    {layer.name || `Layer ${layer.order}`}
                  </span>
                  <span className="layer-status">
                    {isLayerConnected(layer.id)
                      ? "🟢 Connected"
                      : "🔴 Disconnected"}
                  </span>
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedCanvasId ? (
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className={`canvas-container ${
            isFullscreen ? "fullscreen-canvas" : ""
          }`}
          style={{
            position: "relative",
            width: `${canvasSize.width}px`,
            height: `${canvasSize.height}px`,
            border: "1px solid black",
            margin: "0 auto",
          }}
        >
          <PixiCanvas
            width={canvasSize.width}
            height={canvasSize.height}
            layerVisibility={layerVisibility}
          />
          <CollaboratorCursors />
          <TextInputPanel />
        </div>
      ) : (
        <div style={{ padding: "20px", textAlign: "center", color: "#666" }}>
          <h3>🎨 캔버스를 선택해주세요</h3>
          <p>그림을 그리려면 다음 단계를 따라주세요:</p>
          <ol
            style={{ textAlign: "left", maxWidth: "300px", margin: "0 auto" }}
          >
            <li>🔗 프로젝트에 연결</li>
            <li>📄 페이지 선택</li>
            <li>🎨 캔버스 선택</li>
            <li>🎭 레이어 선택</li>
          </ol>
          <p style={{ marginTop: "15px", fontSize: "14px" }}>
            모든 단계를 완료하면 여기에 캔버스가 표시됩니다.
          </p>
        </div>
      )}
    </div>
  );
};
