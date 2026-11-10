import { describe, expect, it } from "vitest";
import {
   countWords,
   submitChallengeFeedbackSchema,
} from "./challenge-feedback.schema";

describe("challenge-feedback.schema", () => {
   const validPayload = {
      challengeId: "chal_123",
      consistency: "Yes, significantly" as const,
      fairnessRating: 5,
      teamBattleFeedback: "The team battles were very engaging.",
      joinReason: "Accountability",
      soloIdeas: "Daily streak bonuses would be awesome!",
   };

   describe("countWords", () => {
      it("counts whitespace separated words accurately", () => {
         expect(countWords("")).toBe(0);
         expect(countWords("   ")).toBe(0);
         expect(countWords("Accountability")).toBe(1);
         expect(countWords("  Discipline  ")).toBe(1);
         expect(countWords("Self-discipline")).toBe(1);
         expect(countWords("Two words")).toBe(2);
         expect(countWords("Three little words")).toBe(3);
      });
   });

   it("accepts a complete valid feedback submission", () => {
      const parsed = submitChallengeFeedbackSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
         expect(parsed.data.consistency).toBe("Yes, significantly");
         expect(parsed.data.fairnessRating).toBe(5);
         expect(parsed.data.joinReason).toBe("Accountability");
      }
   });

   it("accepts empty optional text fields including joinReason", () => {
      const parsed = submitChallengeFeedbackSchema.safeParse({
         ...validPayload,
         teamBattleFeedback: "",
         joinReason: "",
         soloIdeas: "",
      });
      expect(parsed.success).toBe(true);
   });

   it("accepts single word joinReason variants", () => {
      for (const word of [
         "Discipline",
         "Focus",
         "Competition",
         "Self-improvement",
      ]) {
         const parsed = submitChallengeFeedbackSchema.safeParse({
            ...validPayload,
            joinReason: word,
         });
         expect(parsed.success).toBe(true);
      }
   });

   it("rejects multi-word joinReason", () => {
      const parsedMulti = submitChallengeFeedbackSchema.safeParse({
         ...validPayload,
         joinReason: "To build study habits",
      });
      expect(parsedMulti.success).toBe(false);
      if (!parsedMulti.success) {
         expect(parsedMulti.error.issues[0]?.message).toContain(
            "Why you joined must be just one word"
         );
      }

      const parsedTwo = submitChallengeFeedbackSchema.safeParse({
         ...validPayload,
         joinReason: "Two words",
      });
      expect(parsedTwo.success).toBe(false);
   });

   it("rejects joinReason exceeding 50 characters", () => {
      const parsed = submitChallengeFeedbackSchema.safeParse({
         ...validPayload,
         joinReason: "a".repeat(51),
      });
      expect(parsed.success).toBe(false);
   });

   it("rejects invalid fairness ratings", () => {
      const parsedLow = submitChallengeFeedbackSchema.safeParse({
         ...validPayload,
         fairnessRating: 0,
      });
      expect(parsedLow.success).toBe(false);

      const parsedHigh = submitChallengeFeedbackSchema.safeParse({
         ...validPayload,
         fairnessRating: 6,
      });
      expect(parsedHigh.success).toBe(false);
   });

   it("rejects invalid options for enum fields", () => {
      const parsed = submitChallengeFeedbackSchema.safeParse({
         ...validPayload,
         consistency: "Maybe",
      });
      expect(parsed.success).toBe(false);
   });

   it("rejects missing required fields", () => {
      const { consistency, ...missingField } = validPayload;
      const parsed = submitChallengeFeedbackSchema.safeParse(missingField);
      expect(parsed.success).toBe(false);
   });

   it("rejects text exceeding 2000 characters", () => {
      const parsed = submitChallengeFeedbackSchema.safeParse({
         ...validPayload,
         teamBattleFeedback: "a".repeat(2001),
      });
      expect(parsed.success).toBe(false);
   });
});
