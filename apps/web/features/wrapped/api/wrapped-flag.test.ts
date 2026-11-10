import { beforeEach, describe, expect, it, vi } from "vitest";

import {
   isMandatoryFeedbackEnabled,
   isWrappedFeatureEnabled,
   MANDATORY_FEEDBACK_FEATURE_FLAG_KEY,
   WRAPPED_FEATURE_FLAG_KEY,
} from "./wrapped-flag";
import * as flagsServerModule from "@/features/feature-flags/api/server";

vi.mock("@/features/feature-flags/api/server", () => ({
   isFeatureEnabled: vi.fn(),
}));

describe("wrapped-flag", () => {
   beforeEach(() => {
      vi.clearAllMocks();
   });

   it("pins the canonical challenge_wrapped_v1 key", () => {
      expect(WRAPPED_FEATURE_FLAG_KEY).toBe("challenge_wrapped_v1");
   });

   it("delegates to the feature-flag evaluator with the wrapped key", async () => {
      vi.mocked(flagsServerModule.isFeatureEnabled).mockResolvedValue(true);

      await expect(isWrappedFeatureEnabled()).resolves.toBe(true);
      expect(flagsServerModule.isFeatureEnabled).toHaveBeenCalledWith(
         "challenge_wrapped_v1"
      );
   });

   it("fails closed when the evaluator reports the flag as off", async () => {
      vi.mocked(flagsServerModule.isFeatureEnabled).mockResolvedValue(false);

      await expect(isWrappedFeatureEnabled()).resolves.toBe(false);
   });

   it("pins the canonical mandatory_feedback_v1 key and delegates evaluation", async () => {
      expect(MANDATORY_FEEDBACK_FEATURE_FLAG_KEY).toBe("mandatory_feedback_v1");

      vi.mocked(flagsServerModule.isFeatureEnabled).mockResolvedValue(true);
      await expect(isMandatoryFeedbackEnabled()).resolves.toBe(true);
      expect(flagsServerModule.isFeatureEnabled).toHaveBeenCalledWith(
         "mandatory_feedback_v1"
      );

      vi.mocked(flagsServerModule.isFeatureEnabled).mockResolvedValue(false);
      await expect(isMandatoryFeedbackEnabled()).resolves.toBe(false);
   });
});
