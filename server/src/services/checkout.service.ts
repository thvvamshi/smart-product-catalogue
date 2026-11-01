import { env } from "../config/env.js";
import * as model from "../models/checkout.model.js";
export const validate = (sessionId: string, addressId: string) =>
  model.validateCheckout(sessionId, addressId);
export async function reserve(
  sessionId: string,
  addressId: string,
  key: string,
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await model.reserve(
        sessionId,
        addressId,
        key,
        env.RESERVATION_TTL_MINUTES,
      );
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (attempt < 2 && (code === "40001" || code === "40P01")) continue;
      throw error;
    }
  }
}
export async function placeOrder(
  sessionId: string,
  addressId: string,
  key: string,
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await model.placeOrder(sessionId, addressId, key, env.RESERVATION_TTL_MINUTES);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (attempt < 2 && (code === "40001" || code === "40P01")) continue;
      throw error;
    }
  }
}
export const get = (sessionId: string, id: string) =>
  model.getReservation(sessionId, id);
export const release = (sessionId: string, id: string) =>
  model.releaseReservation(sessionId, id);
export const expire = () => model.expireReservations();
