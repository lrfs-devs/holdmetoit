import { z } from "zod";

export const consistencyOptions = [
   "Yes, significantly",
   "Somewhat",
   "No, it did not make a difference",
] as const;

/**
 * Counts the number of whitespace-separated words in a string.
 */
export function countWords(value: string): number {
   return value.trim().split(/\s+/).filter(Boolean).length;
}

export const submitChallengeFeedbackSchema = z.object({
   challengeId: z
      .string({ message: "Challenge ID is required" })
      .trim()
      .min(1, "Challenge ID cannot be empty"),
   consistency: z.enum(consistencyOptions, {
      message: "Please indicate if Team Battles helped your consistency",
   }),
   fairnessRating: z
      .number({ message: "Fairness rating is required" })
      .int("Fairness rating must be an integer")
      .min(1, "Fairness rating must be between 1 and 5")
      .max(5, "Fairness rating must be between 1 and 5"),
   teamBattleFeedback: z
      .string()
      .trim()
      .max(2000, "Feedback must be under 2000 characters")
      .optional()
      .or(z.literal("")),
   joinReason: z
      .string()
      .trim()
      .max(50, "Word must be under 50 characters")
      .refine((val) => countWords(val) <= 1, {
         message:
            "Why you joined must be just one word (e.g. 'Accountability')",
      })
      .optional()
      .or(z.literal("")),
   soloIdeas: z
      .string()
      .trim()
      .max(2000, "Ideas must be under 2000 characters")
      .optional()
      .or(z.literal("")),
});

export type SubmitChallengeFeedbackInput = z.infer<
   typeof submitChallengeFeedbackSchema
>;
