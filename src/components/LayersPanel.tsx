import React, { useState, useEffect } from "react";
import { useSocketStore } from "../store/useSocketStore";
import { useYjsStore } from "../store/useYjsStore";
import { mainSocket } from "../socket";

interface Version {
  version: number;
  timestamp: Date;
  userId: string;
  description: string;
  isSnapshot: boolean;
}

interface VersionHistory {
  versions: Version[];
  currentVersion: number;
}

interface ApiResponse {
  success: boolean;
  data?: VersionHistory;
  error?: string;
}

const LayersPanel: React.FC = () => {
  const {
    allData,
    selectedCanvasId,
    selectedLayerId,
    selectCanvas,
    selectLayer,
    createLayer,
    getLayersForCanvas,
    getPages,
    getCanvasesForPage,
  } = useSocketStore();

  // 계층구조 데이터 사용
  const layers = selectedCanvasId ? getLayersForCanvas(selectedCanvasId) : [];
  const { currentCanvasId, connectToCanvas } = useYjsStore();

  // 레이어 생성 관련 상태
  const [layerName, setLayerName] = useState("");
  const [layerType, setLayerType] = useState("brush");

  // 레이어 비지빌리티 상태
  const [layerVisibility, setLayerVisibility] = useState<
    Record<string, boolean>
  >({});

  // 버전 관리 상태
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [versionHistory, setVersionHistory] = useState<VersionHistory>({
    versions: [],
    currentVersion: 0,
  });
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [revertingVersion, setRevertingVersion] = useState<number | null>(null);

  // 캔버스 선택 시 자동으로 연결
  useEffect(() => {
    if (selectedCanvasId && selectedCanvasId !== currentCanvasId) {
      connectToCanvas(selectedCanvasId);
    }
  }, [selectedCanvasId, currentCanvasId, connectToCanvas]);

  // 레이어 생성
  const handleCreateLayer = () => {
    if (!layerName) return alert("레이어 이름을 입력해주세요.");
    if (!selectedCanvasId) return alert("먼저 캔버스를 선택해주세요.");

    createLayer({ name: layerName, type: layerType });
    setLayerName("");
  };

  // 레이어 비지빌리티 토글
  const toggleLayerVisibility = (layerId: string) => {
    setLayerVisibility((prev) => ({
      ...prev,
      [layerId]: !prev[layerId],
    }));
  };

  // 레이어 비지빌리티 초기화
  useEffect(() => {
    if (selectedCanvasId && layers.length > 0) {
      const initialVisibility: Record<string, boolean> = {};
      layers.forEach((layer) => {
        initialVisibility[layer.id] = true; // 기본적으로 모든 레이어를 보이게 설정
      });
      setLayerVisibility(initialVisibility);
    }
  }, [selectedCanvasId, layers]);

  // 버전 히스토리 로드
  const loadVersionHistory = async (layerId: string) => {
    if (!mainSocket.connected) return;

    setIsLoadingVersions(true);
    try {
      mainSocket.emit(
        "get-version-history",
        { layerId },
        (response: ApiResponse) => {
          if (response.success && response.data) {
            setVersionHistory(response.data);
          } else {
            console.error("Failed to load version history:", response.error);
          }
        }
      );
    } catch (error) {
      console.error("Error loading version history:", error);
    } finally {
      setIsLoadingVersions(false);
    }
  };

  // 버전 복구
  const revertToVersion = async (layerId: string, version: number) => {
    if (!mainSocket.connected) return;

    setRevertingVersion(version);
    try {
      mainSocket.emit(
        "revert-to-version",
        { layerId, version },
        async (response: ApiResponse) => {
          if (response.success) {
            // 성공적으로 복구된 경우 모달 닫기
            setShowVersionModal(false);
            // 버전 히스토리 새로고침
            loadVersionHistory(layerId);
            alert(`버전 ${version}으로 성공적으로 복구되었습니다.`);

            // 버전 복구 후 캔버스 강제 업데이트
            setTimeout(() => {
              const yjsStore = useYjsStore.getState();
              yjsStore.forceRerender();
            }, 500);
          } else {
            alert(`복구 실패: ${response.error}`);
          }
        }
      );
    } catch (error) {
      console.error("Error reverting to version:", error);
      alert("복구 중 오류가 발생했습니다.");
    } finally {
      setRevertingVersion(null);
    }
  };

  // 수동 버전 생성
  const createManualVersion = async (layerId: string) => {
    if (!mainSocket.connected) return;

    const description = prompt("버전에 대한 설명을 입력하세요:");
    if (!description) return;

    try {
      mainSocket.emit(
        "create-manual-version",
        { layerId, description },
        (response: ApiResponse) => {
          if (response.success) {
            alert("수동 버전이 생성되었습니다.");
            loadVersionHistory(layerId);
          } else {
            alert(`버전 생성 실패: ${response.error}`);
          }
        }
      );
    } catch (error) {
      console.error("Error creating manual version:", error);
      alert("버전 생성 중 오류가 발생했습니다.");
    }
  };

  // 버전 히스토리 모달 열기
  const openVersionModal = (layerId: string) => {
    loadVersionHistory(layerId);
    setShowVersionModal(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("ko-KR");
  };

  return (
    <div className="panel">
      <h2>레이어 관리</h2>

      {/* 캔버스 선택 */}
      <div>
        <h3>캔버스 선택</h3>
        <select
          value={selectedCanvasId || ""}
          onChange={(e) => selectCanvas(e.target.value || null)}
        >
          <option value="">캔버스를 선택하세요</option>
          {allData.canvases.map((canvas) => (
            <option key={canvas._id} value={canvas._id}>
              {canvas.name} ({canvas.width}x{canvas.height} {canvas.unit})
            </option>
          ))}
        </select>
      </div>

      {/* 레이어 생성 */}
      {selectedCanvasId && (
        <div>
          <h3>새 레이어 생성</h3>
          <input
            type="text"
            value={layerName}
            onChange={(e) => setLayerName(e.target.value)}
            placeholder="레이어 이름"
          />
          <select
            value={layerType}
            onChange={(e) => setLayerType(e.target.value)}
          >
            <option value="brush">브러시</option>
            <option value="text">텍스트</option>
            <option value="shape">도형</option>
          </select>
          <button onClick={handleCreateLayer}>레이어 생성</button>
        </div>
      )}

      {/* 레이어 목록 및 비지빌리티 컨트롤 */}
      {selectedCanvasId && (
        <div className="layer-controls">
          <div className="controls-header">
            <h3>레이어 목록</h3>
            <div className="version-controls">
              <button
                className="version-history-btn"
                onClick={() =>
                  selectedLayerId && openVersionModal(selectedLayerId)
                }
                disabled={!selectedLayerId}
              >
                📋 버전 히스토리
              </button>
              <button
                className="create-version-btn"
                onClick={() =>
                  selectedLayerId && createManualVersion(selectedLayerId)
                }
                disabled={!selectedLayerId}
              >
                ✨ 수동 버전 생성
              </button>
            </div>
          </div>

          {/* 레이어 디버깅 정보 */}
          <div
            style={{
              fontSize: "12px",
              color: "#666",
              margin: "5px 0",
              padding: "5px",
              background: "#f8f9fa",
            }}
          >
            Selected Canvas: {selectedCanvasId || "None"}
            <br />
            Canvas Layers: {layers.length}
            <br />
            Layer Names: {layers.map((l) => l.name).join(", ")}
          </div>

          <div className="layer-list">
            {selectedCanvasId && layers.length === 0 && (
              <div
                style={{
                  padding: "10px",
                  textAlign: "center",
                  color: "#666",
                  fontStyle: "italic",
                }}
              >
                ⚠️ 이 캔버스에 레이어가 없습니다. 새 레이어를 생성하세요.
              </div>
            )}
            {layers
              .sort((a, b) => a.order - b.order)
              .map((layer) => (
                <div
                  key={layer.id}
                  className={`layer-item ${
                    selectedLayerId === layer.id ? "selected" : ""
                  }`}
                  onClick={() => selectLayer(layer.id)}
                >
                  <div className="layer-label">
                    <input
                      type="checkbox"
                      className="layer-checkbox"
                      checked={selectedLayerId === layer.id}
                      onChange={() => selectLayer(layer.id)}
                    />
                    <span className="layer-name">{layer.name}</span>
                    <span className="layer-status">{layer.type}</span>

                    {/* 레이어 비지빌리티 토글 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation(); // 레이어 선택 방지
                        toggleLayerVisibility(layer.id);
                      }}
                      style={{
                        marginLeft: "auto",
                        padding: "2px 8px",
                        fontSize: "12px",
                        backgroundColor: layerVisibility[layer.id]
                          ? "#28a745"
                          : "#dc3545",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                    >
                      {layerVisibility[layer.id] ? "보임" : "숨김"}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 디버깅 정보 */}
      <div
        style={{
          margin: "10px 0",
          padding: "10px",
          background: "#f0f0f0",
          borderRadius: "4px",
        }}
      >
        <strong>디버깅 정보:</strong>
        <br />- allData.canvases.length: {allData.canvases.length}
        <br />- allData.layers.length: {allData.layers.length}
        <br />- selectedCanvasId: {selectedCanvasId || "없음"}
        <br />- selectedLayerId: {selectedLayerId || "없음"}
      </div>

      {/* 버전 히스토리 모달 */}
      {showVersionModal && (
        <div className="version-history-modal">
          <div className="modal-content">
            <div className="modal-header">
              <h3>
                버전 히스토리 -{" "}
                {allData.layers.find((l) => l._id === selectedLayerId)?.name}
              </h3>
              <button
                className="close-modal-btn"
                onClick={() => setShowVersionModal(false)}
              >
                ×
              </button>
            </div>

            <div className="version-list">
              {isLoadingVersions ? (
                <div style={{ textAlign: "center", padding: "20px" }}>
                  버전 히스토리를 불러오는 중...
                </div>
              ) : versionHistory.versions.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "20px",
                    color: "#6c757d",
                  }}
                >
                  아직 버전이 없습니다.
                </div>
              ) : (
                versionHistory.versions
                  .sort((a, b) => b.version - a.version)
                  .map((version) => (
                    <div
                      key={`${version.version}-${version.timestamp}`}
                      className="version-item"
                    >
                      <div className="version-info">
                        <span className="version-number">
                          v{version.version}
                        </span>
                        <span className="version-description">
                          {version.description}
                        </span>
                        <span className="version-timestamp">
                          {formatDate(version.timestamp.toString())}
                        </span>
                        <span className="version-user">{version.userId}</span>
                        <span className="version-type">
                          {version.isSnapshot ? "자동" : "수동"}
                        </span>
                      </div>

                      {version.version !== versionHistory.currentVersion && (
                        <button
                          className="revert-btn"
                          onClick={() =>
                            selectedLayerId &&
                            revertToVersion(selectedLayerId, version.version)
                          }
                          disabled={revertingVersion === version.version}
                        >
                          {revertingVersion === version.version
                            ? "복구 중..."
                            : "🔄 복구"}
                        </button>
                      )}
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LayersPanel;
