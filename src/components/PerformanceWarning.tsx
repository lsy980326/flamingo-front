import React from "react";
import { useYjsStore } from "../store/useYjsStore";

interface PerformanceWarningProps {
  className?: string;
}

export const PerformanceWarning: React.FC<PerformanceWarningProps> = ({
  className = "",
}) => {
  const {
    performanceWarnings,
    hiddenLayers,
    clearPerformanceWarnings,
    showLayerForPerformance,
  } = useYjsStore();

  if (performanceWarnings.length === 0 && hiddenLayers.size === 0) {
    return null;
  }

  return (
    <div className={`fixed top-4 right-4 z-50 max-w-md ${className}`}>
      {/* 성능 경고 알림 */}
      {performanceWarnings.length > 0 && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-2">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-bold">성능 경고</h4>
              <p className="text-sm">
                대용량 데이터가 로드되어 브라우저 성능이 저하될 수 있습니다.
              </p>
              <div className="mt-2 text-xs">
                {performanceWarnings.map((warning, index) => (
                  <div key={index} className="mb-1">
                    레이어 {warning.layerId}: {warning.dataSizeMB}MB
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={clearPerformanceWarnings}
              className="ml-2 text-yellow-600 hover:text-yellow-800"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 숨겨진 레이어 알림 */}
      {hiddenLayers.size > 0 && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-bold">숨겨진 레이어</h4>
              <p className="text-sm">
                성능상의 이유로 다음 레이어들이 숨겨졌습니다:
              </p>
              <div className="mt-2 text-xs">
                {Array.from(hiddenLayers).map((layerId) => (
                  <div
                    key={layerId}
                    className="mb-1 flex items-center justify-between"
                  >
                    <span>레이어 {layerId}</span>
                    <button
                      onClick={() => showLayerForPerformance(layerId)}
                      className="ml-2 px-2 py-1 bg-red-200 hover:bg-red-300 rounded text-xs"
                    >
                      표시
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
