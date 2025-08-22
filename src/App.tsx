import { useEffect } from "react";
import "./App.css";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { PagesPanel } from "./components/PagesPanel";
import { CanvasesPanel } from "./components/CanvasesPanel";
import { LayersPanel } from "./components/LayersPanel";
import { DrawingPanel } from "./components/DrawingPanel";
import { useUserStore } from "./store/useUserStore";
import { useSocketStore } from "./store/useSocketStore";

function App() {
  // 임시 방편: 앱 로드 시 강제로 유저를 설정합니다.
  useEffect(() => {
    const randomName = `User_${Math.floor(Math.random() * 1000)}`;
    useUserStore
      .getState()
      .setUser({ id: 1, name: randomName, email: "user@example.com" });
  }, []);

  const selectedLayerId = useSocketStore((state) => state.selectedLayerId);

  return (
    <div className="main-layout">
      {/* 상단 패널들을 감싸는 컨테이너 */}
      <div className="top-panels-container">
        <ConnectionPanel />
        <PagesPanel />
        <CanvasesPanel />
        <LayersPanel />
      </div>

      {/* 하단 DrawingPanel을 감싸는 컨테이너 */}
      <div className="bottom-panel-container">
        {/* ✨ DrawingPanel에 selectedLayerId를 key로 전달합니다. */}
        <DrawingPanel key={selectedLayerId} />
      </div>
    </div>
  );
}
export default App;
