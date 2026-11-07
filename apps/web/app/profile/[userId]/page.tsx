import { notFound, redirect, RedirectType } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/core/auth";
import { getGlobalUserProfile } from "@/features/participant-stats/data/global-profile.repository";
import { buildUserProfileUrl } from "@/features/participant-stats/domain/profile-url";
import {
   buildProfileEmbedDescription,
   buildProfileEmbedTitle,
   getRankThemeColor,
} from "@/features/participant-stats/domain/profile-embed";

export const dynamic = "force-dynamic";

interface UserProfilePageProps {
   params: Promise<{
      userId: string;
   }>;
   searchParams?: Promise<{
      challengeId?: string;
      tab?: string;
   }>;
}

/** Generates social and search metadata for legacy user profile URLs. */
export async function generateMetadata({
   params,
}: UserProfilePageProps): Promise<Metadata> {
   const { userId } = await params;
   const profile = await getGlobalUserProfile(userId);

   if (!profile) {
      return {
         title: "Scholar Not Found | HoldMeToIt",
      };
   }

   const title = buildProfileEmbedTitle(profile);
   const description = buildProfileEmbedDescription(profile);
   const { hex } = getRankThemeColor(profile.careerStats.trophyRank);
   const imageUrl = profile.user.image ?? undefined;

   return {
      title,
      description,
      openGraph: {
         type: "profile",
         siteName: "HoldMeToIt",
         title,
         description,
         images: imageUrl ? [{ url: imageUrl, width: 256, height: 256 }] : [],
      },
      twitter: {
         card: "summary",
         title,
         description,
         images: imageUrl ? [imageUrl] : [],
      },
      themeColor: hex,
   };
}

/**
 * Legacy Profile Route (/profile/[userId]).
 * Permanently redirects scholars to their canonical /@<platformUsername> profile URL.
 */
export default async function UserProfilePage({
   params,
   searchParams,
}: UserProfilePageProps) {
   const { userId } = await params;
   const query = (await searchParams) ?? {};
   const session = await auth();

   // Gate: mandatory authentication required
   if (!session?.user?.id) {
      redirect("/");
      return;
   }

   const targetUserId =
      userId === "me" && session?.user?.id ? session.user.id : userId;

   const profile = await getGlobalUserProfile(targetUserId);

   if (!profile) {
      notFound();
      return;
   }

   const canonicalUrl = buildUserProfileUrl(profile.user, query);
   redirect(canonicalUrl, RedirectType.replace);
}
