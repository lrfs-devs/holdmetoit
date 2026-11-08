/**
 * Pure domain functions for generating HoldMeToIt profile URLs.
 * Governed by Law L7 (Pure Domain Isolation): Zero Next.js, React, or Prisma imports.
 */

export interface UserProfileIdentity {
   username?: string | null;
   id?: string | null;
   userId?: string | null;
}

export interface BuildProfileUrlOptions {
   challengeId?: string | null;
   tab?: "overview" | "history" | "settings" | string | null;
   view?: string | null;
   day?: string | number | null;
}

/**
 * Builds the canonical profile URL for a scholar using their platform username.
 * Format: `/@${username}` (e.g. `/@speedy_scholar`), or fallback `/@${userId}` if username is absent.
 */
export function buildUserProfileUrl(
   identity?: UserProfileIdentity | null,
   options?: BuildProfileUrlOptions
): string {
   const cleanUsername = identity?.username?.trim().replace(/^@/, "");
   const cleanId = (identity?.userId || identity?.id)?.trim().replace(/^@/, "");

   let path: string;
   if (cleanUsername) {
      path = `/@${cleanUsername}`;
   } else if (cleanId) {
      path = `/@${cleanId}`;
   } else {
      path = "/profile";
   }

   const params = new URLSearchParams();
   if (options?.challengeId?.trim()) {
      params.set("challengeId", options.challengeId.trim());
   }
   if (options?.tab?.trim()) {
      params.set("tab", options.tab.trim());
   }
   if (options?.view?.trim()) {
      params.set("view", options.view.trim());
   }
   if (
      options?.day !== undefined &&
      options?.day !== null &&
      String(options.day).trim()
   ) {
      params.set("day", String(options.day).trim());
   }

   const query = params.toString();
   return query ? `${path}?${query}` : path;
}
