import React from "react";
import { useYjsStore } from "../store/useYjsStore";

export const CollaboratorCursors = () => {
  // Zustand 스토어에서 awareness 상태 맵을 가져옴
  const awarenessStates = useYjsStore((state) => state.awarenessStates);

  // 내 자신의 클라이언트 ID (내 커서는 그리지 않기 위함)
  const myClientId = useYjsStore(
    (state) => state.webrtcProvider?.awareness.clientID
  );

  const cursors = [];

  // 모든 참여자의 상태를 순회
  awarenessStates.forEach((state, clientId) => {
    // 내 자신은 건너뜀
    if (clientId === myClientId) {
      return;
    }

    // user 정보와 cursor 정보가 모두 있어야 렌더링
    if (state.user && state.cursor) {
      cursors.push(
        <div
          key={clientId}
          style={{
            position: "absolute",
            left: `${state.cursor.x}px`,
            top: `${state.cursor.y}px`,
            transition: "left 0.1s, top 0.1s", // 부드러운 움직임
            zIndex: 9999,
          }}
        >
          {/* SVG로 만든 커서 아이콘 */}
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M5.5 3.5L18.4358 13.9803L13.0886 15.0297L11.531 20.375L5.5 3.5Z"
              fill={state.user.color}
              stroke="white"
              strokeWidth="2"
            />
          </svg>
          {/* 커서 아래에 사용자 이름 표시 */}
          <div
            style={{
              backgroundColor: state.user.color,
              color: "white",
              padding: "2px 6px",
              borderRadius: "4px",
              fontSize: "12px",
              marginTop: "4px",
              whiteSpace: "nowrap",
            }}
          >
            {state.user.name}
          </div>
        </div>
      );
    }
  });

  return <>{cursors}</>;
};
