import { notFound, redirect, RedirectType } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/core/auth";
import { hasAdminPrivileges } from "@/features/auth/domain/auth-roles";
import {
   getGlobalUserProfile,
   getChallengeSnapshotForUser,
} from "@/features/participant-stats/data/global-profile.repository";
import { canViewFullProfileHistory } from "@/features/participant-stats/domain/profile-privacy";
import { checkAreAcceptedFriends } from "@/features/participant-stats/data/profile-privacy.repository";
import { GlobalProfileView } from "@/features/participant-stats/presentation/global-profile-view";
import type { ParticipantStatsViewModel } from "@/features/participant-stats/domain/participant-stats.types";
import {
   buildProfileEmbedDescription,
   buildProfileEmbedTitle,
   getRankThemeColor,
} from "@/features/participant-stats/domain/profile-embed";
import { buildUserProfileUrl } from "@/features/participant-stats/domain/profile-url";
import { FEATURE_FLAG_KEYS } from "@/features/feature-flags/domain/feature-flag-keys";
import { isFeatureEnabled } from "@/features/feature-flags/api/server";

export const dynamic = "force-dynamic";

interface ScholarProfilePageProps {
   params: Promise<{
      userHandle: string;
   }>;
   searchParams?: Promise<{
      challengeId?: string;
      tab?: string;
   }>;
}

/** Generates rich Discord link preview and search metadata for scholar profiles. */
export async function generateMetadata({
   params,
}: ScholarProfilePageProps): Promise<Metadata> {
   const { userHandle } = await params;
   const decoded = decodeURIComponent(userHandle);

   if (!decoded.startsWith("@")) {
      return {
         title: "Page Not Found | HoldMeToIt",
      };
   }

   const cleanHandle = decoded.slice(1).trim();
   if (!cleanHandle) {
      return {
         title: "Scholar Not Found | HoldMeToIt",
      };
   }

   const profile = await getGlobalUserProfile(cleanHandle);

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

/** Renders the Global User Profile using the canonical @platformUsername route. */
export default async function ScholarProfilePage({
   params,
   searchParams,
}: ScholarProfilePageProps) {
   const { userHandle } = await params;
   const decoded = decodeURIComponent(userHandle);

   // Gate: must begin with '@' to prevent collisions with other top-level routes
   if (!decoded.startsWith("@")) {
      notFound();
      return;
   }

   const cleanHandle = decoded.slice(1).trim();
   if (!cleanHandle) {
      notFound();
      return;
   }

   // Gate: mandatory authentication required to access profiles
   const session = await auth();
   if (!session?.user?.id) {
      redirect("/");
      return;
   }

   const query = (await searchParams) ?? {};
   const profile = await getGlobalUserProfile(cleanHandle);

   if (!profile) {
      notFound();
      return;
   }

   // Canonical Redirect: If accessed via CUID but scholar has a platform username, redirect
   if (
      cleanHandle.toLowerCase() === profile.user.id.toLowerCase() &&
      profile.user.username
   ) {
      const canonicalUrl = buildUserProfileUrl(profile.user, query);
      redirect(canonicalUrl, RedirectType.replace);
      return;
   }

   const targetUserId = profile.user.id;
   const isOwnProfile = Boolean(session.user.id === targetUserId);
   const isAcceptedFriend = await checkAreAcceptedFriends(
      session.user.id,
      targetUserId
   );

   const isAuthorizedHistory = canViewFullProfileHistory({
      viewerId: session.user.id,
      viewerRole: session.user.role,
      targetUserId,
      isAcceptedFriend,
   });

   let initialSnapshot: ParticipantStatsViewModel | null = null;
   let selectedChallengeId = query.challengeId;

   if (isAuthorizedHistory && profile.challengeHistory.length > 0) {
      const match = profile.challengeHistory.find(
         (c) => c.challengeId === selectedChallengeId
      );
      if (!match) {
         selectedChallengeId = profile.challengeHistory[0].challengeId;
      }

      if (selectedChallengeId) {
         initialSnapshot = await getChallengeSnapshotForUser(
            targetUserId,
            selectedChallengeId,
            {
               currentUserId: session.user.id,
               isAdmin: hasAdminPrivileges(session.user.role),
            }
         );
      }
   }

   const [isGlobalLeaderboardEnabled, isPlatformUsernameEnabled] =
      await Promise.all([
         isFeatureEnabled(FEATURE_FLAG_KEYS.globalLeaderboard),
         isFeatureEnabled(FEATURE_FLAG_KEYS.platformUsername),
      ]);

   return (
      <GlobalProfileView
         profile={profile}
         initialChallengeSnapshot={initialSnapshot}
         selectedChallengeId={selectedChallengeId}
         isAuthorizedHistory={isAuthorizedHistory}
         isOwnProfile={isOwnProfile}
         viewerRole={session.user.role}
         initialYptId={isOwnProfile ? profile.user.yptId : undefined}
         isGlobalLeaderboardEnabled={isGlobalLeaderboardEnabled}
         isPlatformUsernameEnabled={isPlatformUsernameEnabled}
      />
   );
}
