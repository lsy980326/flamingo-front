import { useState } from "react";
import { useSocketStore } from "../store/useSocketStore";

export const LayersPanel = () => {
  const [layerName, setLayerName] = useState("");
  const [layerType, setLayerType] = useState("brush");
  const {
    isConnected,
    allData,
    selectedCanvasId,
    selectedLayerId,
    selectLayer,
    createLayer,
  } = useSocketStore();

  const handleCreateLayer = () => {
    if (!layerName) return alert("레이어 이름을 입력해주세요.");
    createLayer({ name: layerName, type: layerType });
    setLayerName("");
  };

  const filteredLayers = allData.layers.filter(
    (layer) => layer.canvasId === selectedCanvasId
  );

  return (
    <div className="panel">
      <h2>4. Layers</h2>
      {isConnected && selectedCanvasId && (
        <div>
          <input
            type="text"
            value={layerName}
            onChange={(e) => setLayerName(e.target.value)}
            placeholder="New Layer Name"
          />
          <select
            value={layerType}
            onChange={(e) => setLayerType(e.target.value)}
          >
            <option value="brush">Brush</option>
            <option value="text">Text</option>
          </select>
          <button onClick={handleCreateLayer}>Create Layer</button>
        </div>
      )}
      <div className="list-container">
        {filteredLayers
          .sort((a, b) => a.order - b.order)
          .map((layer) => (
            <div
              key={layer._id}
              className={`list-item ${
                selectedLayerId === layer._id ? "selected" : ""
              }`}
              onClick={() => selectLayer(layer._id)}
            >
              [{layer.type}] {layer.name}
            </div>
          ))}
      </div>
    </div>
  );
};
