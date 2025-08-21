import { io, Socket } from "socket.io-client";

const SERVER_URL = "ws://localhost:8080";
// const SERVER_URL = "ws://3.38.2.73:8080";

// 앱 전반에서 사용할 메인 네임스페이스('/') 소켓
export const mainSocket: Socket = io(SERVER_URL, {
  autoConnect: false,
  transports: ["websocket"],
});
