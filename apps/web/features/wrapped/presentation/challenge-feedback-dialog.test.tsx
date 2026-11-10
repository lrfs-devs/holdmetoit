// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";

vi.mock("@/features/wrapped/api/wrapped.actions", () => ({
   submitChallengeFeedbackAction: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/features/wrapped/presentation/wrapped-storage", () => ({
   writeWrappedLocalState: vi.fn(),
}));

import { ChallengeFeedbackDialog } from "./challenge-feedback-dialog";

afterEach(cleanup);

function renderToHtml(el: ReactElement): string {
   const { container } = render(el);
   return document.body.innerHTML.replace(container.outerHTML, "");
}

describe("ChallengeFeedbackDialog", () => {
   const defaultProps = {
      isOpen: true,
      challengeId: "chal_1",
      challengeTitle: "October Study Battle",
      onClose: () => {},
      onSuccess: () => {},
   };

   it("renders nothing when isOpen is false", () => {
      const html = renderToHtml(
         <ChallengeFeedbackDialog {...defaultProps} isOpen={false} />
      );
      expect(html).toBe("");
   });

   it("renders header and challenge title when open", () => {
      const html = renderToHtml(<ChallengeFeedbackDialog {...defaultProps} />);

      expect(html).toContain("Challenge Feedback");
      expect(html).toContain("October Study Battle");
      expect(html).toContain("Help shape upcoming events");
   });

   it("renders a unified form without Part 1 or Part 2 dividers", () => {
      const html = renderToHtml(<ChallengeFeedbackDialog {...defaultProps} />);

      expect(html).not.toContain("Part 1");
      expect(html).not.toContain("Part 2");
   });

   it("renders all 5 survey questions", () => {
      const html = renderToHtml(<ChallengeFeedbackDialog {...defaultProps} />);

      // Q1
      expect(html).toContain(
         "Did the Team Battles help improve your study consistency?"
      );
      expect(html).toContain("Yes, significantly");
      expect(html).toContain("Somewhat");
      expect(html).toContain("No, it did not make a difference");

      // Q2
      expect(html).toContain(
         "How would you rate the fairness of the previous Team Battles?"
      );
      expect(html).toContain("1 · Unfair");
      expect(html).toContain("5 · Very Fair");

      // Q3
      expect(html).toContain(
         "Suggestions to improve Team Battles or any complaints?"
      );

      // Q4
      expect(html).toContain("Why did you join the battle?");
      expect(html).toContain("One word only");

      // Q5
      expect(html).toContain(
         "Any other ideas or thoughts for the upcoming Solo Challenge?"
      );

      // Assert removed questions are absent
      expect(html).not.toContain(
         "Which tracking method do you prefer for future challenges?"
      );
      expect(html).not.toContain(
         "Should we adjust targets to account for work or school hours?"
      );
      expect(html).not.toContain(
         "How would you prefer the Solo Challenge to operate?"
      );
      expect(html).not.toContain(
         "Should we keep the punishment PFP system for the Solo Challenge?"
      );
   });

   it("uses ratified Obsidian tokens and no prototype variables", () => {
      const html = renderToHtml(<ChallengeFeedbackDialog {...defaultProps} />);

      expect(html).toContain("bg-surface-primary");
      expect(html).toContain("border-border-default");
      expect(html).toContain("bg-surface-elevated");
      expect(html).toContain("text-text-primary");
      expect(html).toContain("text-text-tertiary");
      expect(html).toContain("bg-feedback-success");
      expect(html).not.toContain("var(--hl-yellow)");
      expect(html).not.toContain("var(--hl-pink)");
      expect(html).not.toContain("var(--ink)");
   });

   it("includes submit and cancel action buttons by default", () => {
      const html = renderToHtml(<ChallengeFeedbackDialog {...defaultProps} />);

      expect(html).toContain("Submit Feedback");
      expect(html).toContain("Cancel");
      expect(html).toContain("Close dialog");
   });

   it("omits cancel and close buttons when mandatory is true", () => {
      const html = renderToHtml(
         <ChallengeFeedbackDialog {...defaultProps} mandatory={true} />
      );

      expect(html).toContain("Submit Feedback");
      expect(html).not.toContain("Cancel");
      expect(html).not.toContain("Close dialog");
   });
});
