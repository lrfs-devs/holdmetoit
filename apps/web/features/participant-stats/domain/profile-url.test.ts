import { describe, expect, it } from "vitest";
import { buildUserProfileUrl } from "./profile-url";

describe("buildUserProfileUrl", () => {
   it("builds profile URL from platform username", () => {
      expect(buildUserProfileUrl({ username: "octocat" })).toBe("/@octocat");
      expect(buildUserProfileUrl({ username: "Afnan" })).toBe("/@Afnan");
   });

   it("strips leading @ symbol if already provided in username", () => {
      expect(buildUserProfileUrl({ username: "@scholar_42" })).toBe(
         "/@scholar_42"
      );
   });

   it("trims whitespace from username", () => {
      expect(buildUserProfileUrl({ username: "  speedy  " })).toBe("/@speedy");
   });

   it("falls back to userId/id when username is not present", () => {
      expect(buildUserProfileUrl({ id: "cmuv5m72y0000jm04j9wcrpf9" })).toBe(
         "/@cmuv5m72y0000jm04j9wcrpf9"
      );
      expect(buildUserProfileUrl({ userId: "cmuv5m72y0000jm04j9wcrpf9" })).toBe(
         "/@cmuv5m72y0000jm04j9wcrpf9"
      );
   });

   it("prioritizes username over userId", () => {
      expect(
         buildUserProfileUrl({
            username: "octocat",
            userId: "cmuv5m72y0000jm04j9wcrpf9",
         })
      ).toBe("/@octocat");
   });

   it("falls back to /profile when identity is missing or empty", () => {
      expect(buildUserProfileUrl(null)).toBe("/profile");
      expect(buildUserProfileUrl({})).toBe("/profile");
      expect(buildUserProfileUrl({ username: "   ", id: "" })).toBe("/profile");
   });

   it("preserves challengeId and tab query parameters", () => {
      expect(
         buildUserProfileUrl(
            { username: "octocat" },
            { challengeId: "chal_123", tab: "history" }
         )
      ).toBe("/@octocat?challengeId=chal_123&tab=history");
   });

   it("preserves view and day query parameters for daily challenge views", () => {
      expect(
         buildUserProfileUrl(
            { username: "octocat" },
            { challengeId: "chal_123", view: "day", day: 3 }
         )
      ).toBe("/@octocat?challengeId=chal_123&view=day&day=3");
   });
});
