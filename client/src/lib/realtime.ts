import { io, type Socket } from "socket.io-client";
import { guestSession } from "./guest-session";

const SOCKET_URL = (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/api\/?$/, "");
export function connectOrderSocket(orderId: string, onEvent: (event: Record<string, unknown>) => void, onConnection: (connected: boolean) => void) {
  const socket: Socket = io(SOCKET_URL, { autoConnect: true, transports: ["websocket", "polling"], withCredentials: true, auth: { sessionId: guestSession() } });
  const events = ["order:created", "order:store_status_updated", "delivery:status_updated", "delivery:location_updated", "delivery:assignment_changed", "delivery:completed", "delivery:failed"];
  socket.on("connect", () => { onConnection(true); socket.emit("order:join", orderId); });
  socket.on("disconnect", () => onConnection(false));
  socket.on("connect_error", () => onConnection(false));
  for (const event of events) socket.on(event, onEvent);
  return () => { for (const event of events) socket.off(event, onEvent); socket.disconnect(); };
}
