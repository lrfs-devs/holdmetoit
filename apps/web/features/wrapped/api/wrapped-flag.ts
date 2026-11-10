import { isFeatureEnabled } from "@/features/feature-flags/api/server";
import { FEATURE_FLAG_KEYS } from "@/features/feature-flags/domain/feature-flag-keys";

/** Canonical feature-flag key for the Challenge Wrapped experience (toggled in /devboard). */
export const WRAPPED_FEATURE_FLAG_KEY = "challenge_wrapped_v1";

/** Canonical feature-flag key for mandatory post-challenge feedback enforcement. */
export const MANDATORY_FEEDBACK_FEATURE_FLAG_KEY =
   FEATURE_FLAG_KEYS.mandatoryFeedback;

/**
 * Server-only. Fails closed: a missing flag row or `rolloutMode = DISABLED`
 * both resolve to `false`.
 */
export function isWrappedFeatureEnabled(): Promise<boolean> {
   return isFeatureEnabled(WRAPPED_FEATURE_FLAG_KEY);
}

/**
 * Server-only. Fails closed: checks whether mandatory challenge feedback is enabled.
 */
export function isMandatoryFeedbackEnabled(): Promise<boolean> {
   return isFeatureEnabled(MANDATORY_FEEDBACK_FEATURE_FLAG_KEY);
}
