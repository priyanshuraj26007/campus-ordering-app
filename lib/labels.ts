import type { Status } from "./types";
export const LABEL: Record<Status, string> = { awaiting_payment: "Waiting for payment", placed: "Order accepted", ready: "Ready to collect",
  collected: "Collected", rejected: "Cancelled by Safal", cancelled: "Cancelled", not_collected: "Not collected", expired: "Expired" };
