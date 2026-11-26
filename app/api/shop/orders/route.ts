import { syncPayments } from "@/lib/payments";
import { shopBoard } from "@/lib/shop";
import { shopRoute } from "@/lib/shoproute";
export const GET = () => shopRoute(() => { void syncPayments(); return shopBoard(); });
