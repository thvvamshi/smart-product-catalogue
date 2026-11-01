import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchAgentDelivery, updateAgentDelivery, updateAgentLocation } from "../lib/api";

type Task = { id: string; taskNumber: string; status: string; failureReason?: string | null };

export function AgentDeliveryDetailPage() {
  const { id = "" } = useParams();
  const [identity, setIdentity] = useState("");
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState("");
  const [sharing, setSharing] = useState(false);
  const watchRef = useRef<number | null>(null);
  const lastSentRef = useRef(0);
  const load = async () => { try { setTask((await fetchAgentDelivery(id, identity)).data); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load delivery"); } };
  const stopSharing = () => { if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; setSharing(false); };
  const startSharing = () => {
    setError("");
    if (!navigator.geolocation) { setError("Geolocation is not supported by this browser."); return; }
    const watch = navigator.geolocation.watchPosition((position) => {
      if (Date.now() - lastSentRef.current < 4000) return;
      lastSentRef.current = Date.now();
      void updateAgentLocation(id, identity, { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy, headingDegrees: position.coords.heading, speedMps: position.coords.speed, capturedAt: new Date(position.timestamp).toISOString() }).then((result) => { if (!result.data.accepted) setError(`Location update rejected: ${result.data.reason}`); }).catch((reason) => { setError(reason instanceof Error ? reason.message : "Location update failed"); });
    }, (reason) => { setError(reason.code === 1 ? "Location permission was denied." : reason.code === 3 ? "Location request timed out." : "Unable to determine your location."); stopSharing(); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 });
    watchRef.current = watch;
    setSharing(true);
  };
  const advance = async (action: string, body?: unknown) => { try { const next = (await updateAgentDelivery(id, action, identity, body)).data; setTask(next); if (["delivered", "delivery_failed", "cancelled"].includes(next.status)) stopSharing(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update delivery"); } };
  useEffect(() => { if (identity.length >= 8) void load(); }, [identity]);
  useEffect(() => () => stopSharing(), []);
  useEffect(() => { if (task && ["delivered", "delivery_failed", "cancelled"].includes(task.status)) stopSharing(); }, [task?.status]);
  const terminal = task ? ["delivered", "delivery_failed", "cancelled"].includes(task.status) : false;
  return <main className="commerce-page"><header className="commerce-hero"><p className="eyebrow">Delivery workflow</p><h1>{task?.taskNumber || "Delivery task"}</h1></header><label>Agent identity<input value={identity} onChange={(event) => setIdentity(event.target.value)} placeholder="agent_identity_1" /></label>{error ? <p role="alert">{error}</p> : null}{task ? <section className="checkout-group"><h2>{task.status.replaceAll("_", " ")}</h2>{task.failureReason ? <p>{task.failureReason}</p> : null}<div className="order-list-item">{task.status === "assigned" ? <button onClick={() => void advance("heading-to-store")}>Heading to store</button> : null}{task.status === "heading_to_store" ? <button onClick={() => void advance("arrived-at-store")}>Arrived</button> : null}{task.status === "arrived_at_store" ? <button onClick={() => void advance("pickup")}>Pick up</button> : null}{task.status === "picked_up" ? <button onClick={() => void advance("out-for-delivery")}>Out for delivery</button> : null}{task.status === "out_for_delivery" ? <><button onClick={() => void advance("delivered")}>Delivered</button><button onClick={() => void advance("failed", { reason: "Delivery issue reported by agent" })}>Report failure</button></> : null}{!terminal ? (!sharing ? <button onClick={startSharing}>Start location sharing</button> : <button onClick={stopSharing}>Stop location sharing</button>) : null}</div></section> : null}</main>;
}
