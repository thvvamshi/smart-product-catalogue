import * as model from "../models/order.model.js";
import type { RejectionReasonCode } from "../types/order.types.js";

export const create = (sessionId: string, reservationId: string, key: string) => model.createFromReservation(sessionId, reservationId, key);
export const list = (sessionId: string, limit?: number, cursor?: string) => model.listCustomerOrders(sessionId, limit, cursor);
export const get = (sessionId: string, id: string) => model.getCustomerOrder(sessionId, id);
export const history = (sessionId: string, id: string) => model.getOrderHistory(sessionId, id);
export const cancel = (sessionId: string, id: string) => model.cancelCustomerOrder(sessionId, id);
export const listStore = (operatorKey: string, limit?: number) => model.listStoreOrders(operatorKey, limit);
export const listDemoStore = (limit?: number) => model.listDemoStoreOrders(limit);
export const transitionDemoStore = (id: string, action: "accept" | "prepare" | "ready") => model.transitionDemoStoreOrder(id, action);
export const getStore = (operatorKey: string, id: string) => model.getStoreOrder(operatorKey, id);
export const storeHistory = (operatorKey: string, id: string) => model.getStoreOrderHistory(operatorKey, id);
export const accept = (operatorKey: string, id: string) => model.transitionStoreOrder(operatorKey, id, "accept");
export const prepare = (operatorKey: string, id: string) => model.transitionStoreOrder(operatorKey, id, "prepare");
export const ready = (operatorKey: string, id: string) => model.transitionStoreOrder(operatorKey, id, "ready");
export const reject = (operatorKey: string, id: string, reason: RejectionReasonCode, note: string) => model.rejectStoreOrder(operatorKey, id, reason, note);
