import React, { useEffect, useState } from "react";
import { useYjsStore } from "../store/useYjsStore";
import { useSocketStore } from "../store/useSocketStore";
import * as Y from "yjs";
import { useUserStore } from "../store/useUserStore"; // 사용자 이름 가져오기
import { CollaboratorCursors } from "./CollaboratorCursors"; // 커서 렌더링 컴포넌트
import { PixiCanvas } from "./PixiCanvas";

interface Point {
  x: number;
  y: number;
}

// 연결 상태에 따라 다른 메시지를 보여주는 헬퍼 컴포넌트
const CanvasOverlay = ({ status }: { status: string }) => {
  const styles: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.2em",
    color: "#555",
    zIndex: 10,
    borderRadius: "inherit",
  };

  // 연결 완료 시에는 아무것도 보여주지 않습니다.
  if (status === "connected") return null;

  let message = "...";
  if (status === "connecting") message = "Connecting to layer...";
  if (status === "error")
    message = "Connection failed. Please check the console.";
  if (status === "disconnected") message = "Disconnected.";

  return <div style={styles}>{message}</div>;
};

export const DrawingPanel = () => {
  const { connectToLayer, disconnectFromLayer, yjsStatus, setMyInfo } =
    useYjsStore();

  const { selectedLayerId } = useSocketStore();
  const userName = useUserStore((state) => state.name);

  // ✨ Layer ID가 변경될 때마다 Yjs 연결을 관리하는 핵심 로직
  useEffect(() => {
    if (selectedLayerId) {
      connectToLayer(selectedLayerId);
    }
    // 컴포넌트가 사라지거나 selectedLayerId가 바뀌기 전에 항상 연결을 해제합니다.
    return () => {
      disconnectFromLayer();
    };
  }, [selectedLayerId, connectToLayer, disconnectFromLayer]);

  useEffect(() => {
    if (yjsStatus === "connected" && userName) {
      console.log(`[Awareness] Setting my info with name: ${userName}`);
      // 랜덤 색상 지정
      const colors = ["#ff0000", "#0000ff", "#00ff00", "#ffa500", "#800080"];
      const color = colors[Math.floor(Math.random() * colors.length)];

      // setMyInfo 액션을 통해 스토어와 awareness에 내 정보 저장
      setMyInfo({ name: userName, color });
    }
  }, [yjsStatus, userName, setMyInfo]);

  return (
    <div className={`panel drawing-panel ${selectedLayerId ? "visible" : ""}`}>
      <h2>Drawing Canvas {selectedLayerId && `(Layer: ${selectedLayerId})`}</h2>

      {selectedLayerId ? (
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "calc(100% - 50px)",
            border: "2px solid #ccc",
            borderRadius: "8px",
            cursor: yjsStatus === "connected" ? "crosshair" : "not-allowed",
            backgroundColor: "#fff",
          }}
        >
          {/* 연결 상태에 따라 오버레이를 표시합니다. */}
          <CanvasOverlay status={yjsStatus} />
          <PixiCanvas /> {/* 이 부분은 변경 없음 */}
          {/* ✨ 2. 다른 사용자들의 커서 렌더링 컴포넌트 추가 */}
          <CollaboratorCursors />
        </div>
      ) : (
        <p>Select a layer from the 'Layers' panel to start drawing.</p>
      )}
    </div>
  );
};
