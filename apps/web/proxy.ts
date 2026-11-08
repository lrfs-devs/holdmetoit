import { NextResponse, type NextRequest } from "next/server";

import { getServerEnv } from "@/core/env/server";

const SESSION_COOKIE_NAMES = [
   "authjs.session-token",
   "__Secure-authjs.session-token",
   "next-auth.session-token",
   "__Secure-next-auth.session-token",
];

const CRAWLER_USER_AGENTS =
   /Discordbot|Twitterbot|facebookexternalhit|LinkedInBot|Slackbot|TelegramBot|WhatsApp/i;

/**
 * Lightweight proxy for early gatekeeping on protected administrative and profile routes.
 * Deflects completely unauthenticated requests before Server Components or
 * database connections are initialized.
 *
 * Fine-grained RBAC (checking ADMIN vs DEV vs PARTICIPANT roles) remains enforced by
 * Server Component layouts and Server Actions using the database-backed session.
 */
export function proxy(request: NextRequest) {
   const env = getServerEnv();
   const { pathname } = request.nextUrl;

   if (pathname.startsWith("/admin") || pathname.startsWith("/devboard")) {
      const isDevBypass =
         env.NODE_ENV === "development" &&
         (env.ALLOW_DEV_BYPASS || !env.AUTH_DISCORD_ID);

      if (isDevBypass) {
         return NextResponse.next();
      }

      const hasSessionCookie = SESSION_COOKIE_NAMES.some(
         (name) =>
            request.cookies.has(name) &&
            Boolean(request.cookies.get(name)?.value)
      );

      if (!hasSessionCookie) {
         const redirectUrl = new URL("/", request.url);
         return NextResponse.redirect(redirectUrl);
      }
   }

   const isProfileRoute =
      pathname === "/profile" ||
      pathname.startsWith("/profile/") ||
      pathname.startsWith("/@") ||
      pathname.startsWith("/%40");

   if (isProfileRoute) {
      const userAgent = request.headers.get("user-agent") ?? "";
      const isCrawler = CRAWLER_USER_AGENTS.test(userAgent);

      // Social crawlers (e.g. Discordbot) bypass proxy redirection so they can scrape
      // OpenGraph / Twitter metadata tags for rich link embeds in chat.
      if (isCrawler) {
         return NextResponse.next();
      }

      const hasSessionCookie = SESSION_COOKIE_NAMES.some(
         (name) =>
            request.cookies.has(name) &&
            Boolean(request.cookies.get(name)?.value)
      );

      if (!hasSessionCookie) {
         const redirectUrl = new URL("/", request.url);
         return NextResponse.redirect(redirectUrl);
      }
   }

   return NextResponse.next();
}

export const config = {
   matcher: [
      "/admin/:path*",
      "/devboard/:path*",
      "/profile",
      "/profile/:path*",
      "/@:username",
      "/%40:username",
   ],
};
