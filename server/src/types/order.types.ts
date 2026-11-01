export type OrderStatus =
  | "placed"
  | "partially_accepted"
  | "confirmed"
  | "partially_rejected"
  | "rejected"
  | "cancelled"
  | "completed";

export type StoreOrderStatus =
  | "pending_acceptance"
  | "accepted"
  | "rejected"
  | "preparing"
  | "ready_for_pickup"
  | "delivered"
  | "cancelled";

export type RejectionReasonCode =
  | "OUT_OF_STOCK"
  | "DAMAGED_ITEM"
  | "VARIANT_UNAVAILABLE"
  | "STORE_UNABLE_TO_FULFIL"
  | "OTHER";

export type AddressSnapshot = {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: number;
  longitude: number;
};
