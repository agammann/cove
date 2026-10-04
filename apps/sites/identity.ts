import { createHash } from "node:crypto";
export function sitesUserId(id: string) {
  return "siwc_" + createHash("sha256").update(id).digest("hex");
}
