import { redirect, RedirectType } from "next/navigation";
import { auth } from "@/core/auth";
import { getGlobalUserProfile } from "@/features/participant-stats/data/global-profile.repository";
import { buildUserProfileUrl } from "@/features/participant-stats/domain/profile-url";

export const dynamic = "force-dynamic";

interface ProfilePageProps {
   searchParams?: Promise<{
      challengeId?: string;
      tab?: string;
   }>;
}

/** Redirects the current authenticated session user to their canonical /@<platformUsername> profile. */
export default async function ProfilePage({ searchParams }: ProfilePageProps) {
   const query = (await searchParams) ?? {};
   const session = await auth();

   if (!session?.user?.id) {
      redirect("/");
      return;
   }

   const profile = await getGlobalUserProfile(session.user.id);
   if (!profile) {
      redirect("/");
      return;
   }

   const canonicalUrl = buildUserProfileUrl(profile.user, query);
   redirect(canonicalUrl, RedirectType.replace);
}
