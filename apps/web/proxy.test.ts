import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config } from "./proxy";

describe("Proxy", () => {
   const originalEnv = process.env;

   beforeEach(() => {
      process.env = { ...originalEnv };
   });

   function createRequest(
      pathname: string,
      cookies: Record<string, string> = {},
      headers: Record<string, string> = {}
   ): NextRequest {
      const url = `https://holdmetoit.com${pathname}`;
      const request = new NextRequest(url, { headers });
      for (const [key, value] of Object.entries(cookies)) {
         request.cookies.set(key, value);
      }
      return request;
   }

   it("has matcher configured for /admin, /devboard, /profile, and platform handles", () => {
      expect(config.matcher).toEqual([
         "/admin/:path*",
         "/devboard/:path*",
         "/profile",
         "/profile/:path*",
         "/@:username",
         "/%40:username",
      ]);
   });

   it("redirects unauthenticated requests to /admin to / in production", () => {
      (process.env as Record<string, string | undefined>).NODE_ENV =
         "production";
      process.env.AUTH_DISCORD_ID = "discord_123";

      const request = createRequest("/admin");
      const response = proxy(request);

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://holdmetoit.com/");
   });

   it("redirects unauthenticated requests to /devboard to / in production", () => {
      (process.env as Record<string, string | undefined>).NODE_ENV =
         "production";
      process.env.AUTH_DISCORD_ID = "discord_123";

      const request = createRequest("/devboard");
      const response = proxy(request);

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://holdmetoit.com/");
   });

   it("allows /admin/challenges/new through when authjs.session-token is present", () => {
      (process.env as Record<string, string | undefined>).NODE_ENV =
         "production";
      process.env.AUTH_DISCORD_ID = "discord_123";

      const request = createRequest("/admin/challenges/new", {
         "authjs.session-token": "valid_token_xyz",
      });
      const response = proxy(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
   });

   it("allows /devboard through when __Secure-authjs.session-token is present", () => {
      (process.env as Record<string, string | undefined>).NODE_ENV =
         "production";
      process.env.AUTH_DISCORD_ID = "discord_123";

      const request = createRequest("/devboard", {
         "__Secure-authjs.session-token": "secure_token_123",
      });
      const response = proxy(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
   });

   it("allows access in development when dev bypass is active without cookies", () => {
      (process.env as Record<string, string | undefined>).NODE_ENV =
         "development";
      delete process.env.AUTH_DISCORD_ID;

      const request = createRequest("/admin/challenges/new");
      const response = proxy(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
   });

   it("redirects unauthenticated requests to /profile to /", () => {
      const request = createRequest("/profile");
      const response = proxy(request);

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://holdmetoit.com/");
   });

   it("allows /profile through when authjs.session-token is present", () => {
      const request = createRequest("/profile", {
         "authjs.session-token": "valid_user_session",
      });
      const response = proxy(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
   });

   it("redirects unauthenticated requests to /@username to /", () => {
      const request = createRequest("/@speedy_scholar");
      const response = proxy(request);

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://holdmetoit.com/");
   });

   it("redirects unauthenticated requests to /profile/[userId] to /", () => {
      const request = createRequest("/profile/usr_123");
      const response = proxy(request);

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://holdmetoit.com/");
   });

   it("allows /@username through when authjs.session-token is present", () => {
      const request = createRequest("/@speedy_scholar", {
         "authjs.session-token": "valid_user_session",
      });
      const response = proxy(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
   });

   it("allows social crawlers (Discordbot) through without session cookies to scrape embed metadata", () => {
      const request = createRequest(
         "/@speedy_scholar",
         {},
         {
            "user-agent":
               "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
         }
      );
      const response = proxy(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
   });
});
