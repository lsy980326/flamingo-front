import { useState } from "react";
import { useSocketStore } from "../store/useSocketStore";

export const ConnectionPanel = () => {
  const [token, setToken] = useState("");
  const [projectIdInput, setProjectIdInput] = useState(
    "0ff8e0e5-c029-481a-b198-ed66760b72c5"
  );
  const { connect, disconnect, isConnected, joinProject } = useSocketStore();

  const handleJoin = () => {
    if (!projectIdInput) return alert("프로젝트 ID를 입력해주세요.");
    joinProject(projectIdInput);
  };

  return (
    <div className="panel">
      <h2>1. Connection</h2>
      <input
        type="text"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="accessToken"
      />
      <button onClick={() => connect(token)} disabled={isConnected}>
        Connect
      </button>
      <button onClick={disconnect} disabled={!isConnected}>
        Disconnect
      </button>
      <hr />
      <input
        type="text"
        value={projectIdInput}
        onChange={(e) => setProjectIdInput(e.target.value)}
        placeholder="Project ID (UUID)"
      />
      <button onClick={handleJoin} disabled={!isConnected}>
        Join Project
      </button>
      <p>
        Status:{" "}
        {isConnected ? (
          <span style={{ color: "green" }}>Connected</span>
        ) : (
          <span style={{ color: "red" }}>Disconnected</span>
        )}
      </p>
    </div>
  );
};
