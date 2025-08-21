import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path"; // path 모듈 import

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"), // '@'를 'src' 폴더의 절대 경로로 설정
    },
  },
});
