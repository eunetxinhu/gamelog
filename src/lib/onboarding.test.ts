import { describe, expect, it } from "vitest";
import { FOLLOW_GOAL, onboardingSteps } from "./onboarding";

describe("primeiros passos", () => {
  it("conta o que já foi feito", () => {
    const r = onboardingSteps({ hasSteam: true, favorites: 0, following: FOLLOW_GOAL - 1 });
    expect(r.done).toBe(1);
    expect(r.complete).toBe(false);
  });

  it("completo quando tudo foi feito", () => {
    expect(onboardingSteps({ hasSteam: true, favorites: 4, following: FOLLOW_GOAL }).complete).toBe(true);
  });
});
