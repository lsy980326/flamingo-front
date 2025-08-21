import { useState } from "react";
import { useSocketStore } from "../store/useSocketStore";

export const PagesPanel = () => {
  const [pageName, setPageName] = useState("");
  const {
    isConnected,
    allData,
    projectId,
    selectedPageId,
    selectPage,
    createPage,
  } = useSocketStore();

  const handleCreatePage = () => {
    if (!pageName) return alert("페이지 이름을 입력해주세요.");
    createPage(pageName);
    setPageName("");
  };

  return (
    <div className="panel">
      <h2>2. Pages</h2>
      {isConnected && projectId && (
        <div>
          <input
            type="text"
            value={pageName}
            onChange={(e) => setPageName(e.target.value)}
            placeholder="New Page Name"
          />
          <button onClick={handleCreatePage}>Create Page</button>
        </div>
      )}
      <div className="list-container">
        {allData.pages
          .sort((a, b) => a.order - b.order)
          .map((page) => (
            <div
              key={page._id}
              className={`list-item ${
                selectedPageId === page._id ? "selected" : ""
              }`}
              onClick={() => selectPage(page._id)}
            >
              {page.name}
            </div>
          ))}
      </div>
    </div>
  );
};
