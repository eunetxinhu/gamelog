// Passos do "Primeiros passos" (sem banco: testável).

/** O último passo, aceitar as regras, é o botão que conclui (grava users.onboarded_at). */
export type OnboardingState = { hasSteam: boolean; favorites: number; following: number };

/** Quantas pessoas seguir para o feed "Seguindo" ganhar vida. */
export const FOLLOW_GOAL = 3;

export function onboardingSteps(s: OnboardingState) {
  const steps = [
    { id: "steam", label: "Vincule sua Steam", done: s.hasSteam },
    { id: "top4", label: "Escolha seu Top 4", done: s.favorites > 0 },
    { id: "follow", label: `Siga ${FOLLOW_GOAL} jogadores`, done: s.following >= FOLLOW_GOAL },
  ] as const;
  const done = steps.filter((x) => x.done).length;
  return { steps, done, total: steps.length, complete: done === steps.length };
}
