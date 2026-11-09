import { cache } from "react";
import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "@/core/db";
import { getServerEnv } from "@/core/env/server";
import { createLogger, logEvents } from "@/core/observability/logger";
import {
   buildDiscordAvatarUrl,
   getDiscordDefaultAvatarUrl,
} from "@/features/auth/domain/discord-avatar";
import { revalidatePrivilegedRole } from "@/features/auth/data/role-revalidation.service";
import {
   syncUserFromDiscordProfile,
   syncUserRoleFromDiscord,
} from "@/features/auth/data/user.repository";
import type { UserRoleType } from "@/features/auth/domain/auth-roles";
import {
   SESSION_MAX_AGE_SECONDS,
   SESSION_UPDATE_AGE_SECONDS,
} from "@/features/auth/domain/role-policy";

const logger = createLogger("auth");
const serverEnv = getServerEnv();

const nextAuthResult = NextAuth({
   adapter: PrismaAdapter(prisma),
   providers: [
      Discord({
         clientId: serverEnv.AUTH_DISCORD_ID,
         clientSecret: serverEnv.AUTH_DISCORD_SECRET,
         issuer: "https://discord.com",
         authorization: {
            params: {
               scope: "identify",
            },
         },
      }),
   ],
   session: {
      strategy: "database",
      // Short-lived sessions bound how long stale privileges can survive (SEC-05).
      maxAge: SESSION_MAX_AGE_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
   },
   pages: {
      signIn: "/",
   },
   events: {
      async signIn({ user, account, profile }) {
         if (!user.id || !account || account.provider !== "discord") {
            return;
         }

         const discordProfile = profile as {
            username?: string;
            global_name?: string | null;
            avatar?: string | null;
            discriminator?: string | null;
         };

         logger.info(logEvents.authDiscordSignin, {
            context: { userId: user.id, discordId: account.providerAccountId },
         });

         try {
            // Persist fresh Discord OAuth access and refresh tokens to prevent token expiration
            if (account.providerAccountId && account.access_token) {
               await prisma.account
                  .upsert({
                     where: {
                        provider_providerAccountId: {
                           provider: account.provider,
                           providerAccountId: account.providerAccountId,
                        },
                     },
                     create: {
                        userId: user.id,
                        type: account.type,
                        provider: account.provider,
                        providerAccountId: account.providerAccountId,
                        access_token: account.access_token,
                        refresh_token: account.refresh_token,
                        expires_at: account.expires_at,
                        token_type: account.token_type,
                        scope: account.scope,
                        id_token: account.id_token,
                        session_state:
                           typeof account.session_state === "string"
                              ? account.session_state
                              : undefined,
                     },
                     update: {
                        access_token: account.access_token,
                        refresh_token: account.refresh_token,
                        expires_at: account.expires_at,
                        token_type: account.token_type,
                        scope: account.scope,
                        id_token: account.id_token,
                        session_state:
                           typeof account.session_state === "string"
                              ? account.session_state
                              : undefined,
                     },
                  })
                  .catch((err) => {
                     logger.error(logEvents.appError, {
                        context: {
                           action: "updateAccountTokensOnSignIn",
                           userId: user.id,
                        },
                        error: err,
                     });
                  });
            }
            await syncUserFromDiscordProfile(user.id, {
               providerAccountId: account.providerAccountId,
               username: discordProfile.username,
               globalName: discordProfile.global_name,
               image: discordProfile.avatar
                  ? buildDiscordAvatarUrl(
                       account.providerAccountId,
                       discordProfile.avatar
                    )
                  : discordProfile.discriminator
                    ? getDiscordDefaultAvatarUrl(
                         account.providerAccountId,
                         discordProfile.discriminator
                      )
                    : (user.image ??
                      getDiscordDefaultAvatarUrl(account.providerAccountId)),
            });

            await syncUserRoleFromDiscord(user.id, account.providerAccountId);

            logger.info(logEvents.authUserSynced, {
               context: {
                  userId: user.id,
                  discordId: account.providerAccountId,
               },
            });
         } catch (error) {
            logger.error(logEvents.authUserSynced, {
               context: {
                  userId: user.id,
                  discordId: account.providerAccountId,
               },
               error,
            });
            throw error;
         }
      },
   },
   callbacks: {
      async session({ session, user }) {
         if (session.user) {
            session.user.id = user.id;
            session.user.role = user.role;
            session.user.discordId = user.discordId;
            session.user.displayName = user.displayName;
            session.user.username = (user as any).username ?? null;
            session.user.isSick = Boolean((user as any).isSick);
            session.user.sickModeActivatedAt = (user as any).sickModeActivatedAt
               ? new Date((user as any).sickModeActivatedAt).toISOString()
               : null;
            session.user.sickModeNote = (user as any).sickModeNote ?? null;
            session.user.sickModeReminderSnoozedUntil = (user as any)
               .sickModeReminderSnoozedUntil
               ? new Date(
                    (user as any).sickModeReminderSnoozedUntil
                 ).toISOString()
               : null;
            session.user.sickModeLastDeactivatedAt = (user as any)
               .sickModeLastDeactivatedAt
               ? new Date((user as any).sickModeLastDeactivatedAt).toISOString()
               : null;

            // Privileged roles are re-checked against Discord on a short cache.
            // Demotions are persisted by the service; this callback performs no
            // role writes of its own.
            if (session.user.role !== "PARTICIPANT") {
               try {
                  session.user.role = await revalidatePrivilegedRole({
                     userId: user.id,
                     discordId: user.discordId,
                     currentRole: session.user.role as UserRoleType,
                  });
               } catch (error) {
                  logger.error(logEvents.authRoleSyncFailed, {
                     context: { userId: user.id, discordId: user.discordId },
                     error,
                  });
               }
            }
         }

         return session;
      },
   },
});

export const handlers = nextAuthResult.handlers;
export const signIn = nextAuthResult.signIn;
export const signOut = nextAuthResult.signOut;
export const auth = cache(nextAuthResult.auth);
