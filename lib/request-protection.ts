import {isIP} from "node:net";
import {timingSafeEqual} from "node:crypto";

export function clientBucket(headers: Headers, trusted = process.env.TRUST_PROXY === "true", token = process.env.PROXY_AUTH_TOKEN) {
  // Fetch Request exposes no socket peer address. Untrusted requests share a
  // bounded bucket; forwarded headers cannot manufacture new identities.
  if (!trusted) return "unverified-client";
  const supplied = headers.get("x-proxy-token") ?? "";
  const providedBytes = Buffer.from(supplied), expectedBytes = Buffer.from(token ?? "");
  if (!token || token.length < 32 || providedBytes.length !== expectedBytes.length || !timingSafeEqual(providedBytes, expectedBytes)) throw new Error("Untrusted ingress");
  // Our single authenticated ingress must overwrite, never append, this header.
  const ip = headers.get("x-forwarded-for")?.trim() ?? "";
  if (!isIP(ip)) throw new Error("Invalid ingress address");
  return ip.toLowerCase();
}

export function concurrencyLimit() {
  const value = Number(process.env.MAX_CONCURRENT_CHATS);
  return Number.isInteger(value) && value >= 1 && value <= 8 ? value : 2;
}
export function createChatSlots() {
  let active = 0;
  return {
    acquire(maximum = concurrencyLimit()): (() => void) | null {
      if (active >= maximum) return null;
      active++;
      let released = false;
      return () => {if (!released) {released = true; active--;}};
    },
    count: () => active,
  };
}
export const chatSlots = createChatSlots();

export function createGlobalBudget() {
  let start = 0, count = 0;
  return (now = Date.now(), maximum = 100) => {
    if (now >= start + 600000) {start = now; count = 0;}
    if (count >= maximum) return false;
    count++; return true;
  };
}
export const allowGlobalRequest = createGlobalBudget();
