import { useEffect, useState } from "react";
import { connectOrderSocket } from "../lib/realtime";
export function useDeliveryRealtime(orderId: string, onEvent: (event: Record<string, unknown>) => void) {
  const [connected, setConnected] = useState(false);
  useEffect(() => { if (!orderId) return; return connectOrderSocket(orderId, onEvent, setConnected); }, [orderId, onEvent]);
  return connected;
}
