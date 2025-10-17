import { useEffect, useState } from "react";
import "./App.css";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { PagesPanel } from "./components/PagesPanel";
import { CanvasesPanel } from "./components/CanvasesPanel";
import LayersPanel from "./components/LayersPanel";
import { DrawingPanel } from "./components/DrawingPanel";
import PerformanceTestPanel from "./components/PerformanceTestPanel";
import { PerformanceOptimizationPanel } from "./components/PerformanceOptimizationPanel";
import { PerformanceWarning } from "./components/PerformanceWarning";
import { useUserStore } from "./store/useUserStore";
import { useSocketStore } from "./store/useSocketStore";
import { PerformanceMonitor } from "./utils/PerformanceMonitor";

function App() {
  const [showPerformanceTest, setShowPerformanceTest] = useState(false);
  const [showPerformanceOptimization, setShowPerformanceOptimization] =
    useState(false);
  const [performanceMonitor] = useState(() => new PerformanceMonitor());

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
      {/* 개발자 도구 토글 버튼 */}
      <div className="dev-tools-toggle">
        <button
          onClick={() => setShowPerformanceTest(!showPerformanceTest)}
          className="dev-tools-button"
        >
          {showPerformanceTest ? "🚀 테스트 패널 숨기기" : "🚀 성능 테스트"}
        </button>
        <button
          onClick={() =>
            setShowPerformanceOptimization(!showPerformanceOptimization)
          }
          className="dev-tools-button"
        >
          {showPerformanceOptimization ? "⚡ 성능 탭 숨기기" : "⚡ 성능 탭"}
        </button>
      </div>

      {/* 성능 테스트 패널 */}
      {showPerformanceTest && (
        <div className="performance-test-container">
          <PerformanceTestPanel />
        </div>
      )}

      {/* 성능 최적화 패널 */}
      {showPerformanceOptimization && (
        <div className="performance-optimization-container">
          <PerformanceOptimizationPanel
            performanceMonitor={performanceMonitor}
            onQualityChange={(quality) => {
              console.log("품질 설정 변경:", quality);
              // 품질 설정에 따른 최적화 로직
            }}
            onOptimizationToggle={(enabled) => {
              console.log("자동 최적화:", enabled);
              // 자동 최적화 토글 로직
            }}
          />
        </div>
      )}

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

      {/* 성능 경고 컴포넌트 */}
      <PerformanceWarning />
    </div>
  );
}
export default App;
