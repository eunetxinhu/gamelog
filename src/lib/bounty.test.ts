import { describe, expect, it } from "vitest";
import { bountyFor, bountyRank, formatBounty } from "./bounty";

const zero = { platinums: 0, rarePlatinums: 0, completed: 0, achievements: 0, hours: 0, reviews: 0, followers: 0 };

describe("cartaz de recompensa", () => {
  it("todo mundo começa com 1 milhão", () => {
    expect(bountyFor(zero)).toBe(1_000_000);
  });

  it("arredonda para 3 algarismos e cresce com platinas", () => {
    const a = bountyFor({ ...zero, platinums: 3, hours: 1234 });
    expect(a).toBe(99_700_000); // 75.000.000 + 24.680.000
    expect(bountyFor({ ...zero, platinums: 4, hours: 1234 })).toBeGreaterThan(a);
  });

  it("formata e dá o título", () => {
    expect(formatBounty(1_230_000_000)).toBe("1.230.000.000");
    expect(bountyRank(1_000_000)).toBe("Novato do Mar");
    expect(bountyRank(1_500_000_000)).toBe("Supernova");
  });
});
