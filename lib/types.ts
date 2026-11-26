export type Variant = { id: number; size: string; price: number };
export type Item = { id: string; name: string; portion: string | null; available: boolean; variants: Variant[] };
export type Category = { name: string; items: Item[] };
export type PayStatus = "created" | "authorized" | "captured" | "refund_due" | "refunded";
// Paid orders go straight to Safal (placed), who marks them ready and hands them over.
export type Status = "awaiting_payment" | "placed" | "ready" | "collected" | "rejected" | "cancelled" | "not_collected" | "expired";
export type OrderLine = { name: string; size: string; price: number; qty: number };
export type Order = { id: string; code: string; status: Status; total: number; note: string; pickup_at: string | null; created_at: string; pay_status: PayStatus | null; reason: string | null; lines: OrderLine[] };
export const PAY_MINUTES = 10;
export const PICKUP_MINUTES = 20;
export const REASONS = ["Item not available", "Too busy right now", "Closing soon"] as const;
export type ShopOrder = Order & { student: string; placed_at: string | null; ready_at: string | null };
export const ORDER_LIMIT = 300;
// Orders a student can have on the go at once (unpaid, accepted or ready to collect).
export const MAX_ACTIVE_ORDERS = 5;
export const ACTIVE: Status[] = ["awaiting_payment", "placed", "ready"];
