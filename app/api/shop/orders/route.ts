import { after } from "next/server";
import { syncPayments } from "@/lib/payments";
import { shopBoard } from "@/lib/shop";
import { shopRoute } from "@/lib/shoproute";
export const GET = () => shopRoute(() => { after(syncPayments); return shopBoard(); });
