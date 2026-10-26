import { describe, expect, it } from "vitest";
import { nowPlayingFrom } from "./now-playing";

describe("jogando agora", () => {
  it("só quem está com jogo aberto, na ordem pedida", () => {
    const summaries = [
      { steamid: "1", gameid: "1145360", gameextrainfo: "Hades" },
      { steamid: "2" },
      { steamid: "3", gameid: "570", gameextrainfo: " Dota 2 " },
      { steamid: "4", gameid: "lixo" },
    ];
    expect(nowPlayingFrom(summaries, ["3", "2", "1", "4", "9"])).toEqual([
      { steamId: "3", appId: 570, name: "Dota 2" },
      { steamId: "1", appId: 1145360, name: "Hades" },
    ]);
  });

  it("sem nome do jogo usa um genérico", () => {
    expect(nowPlayingFrom([{ steamid: "1", gameid: "10" }], ["1"])[0].name).toBe("Um jogo");
  });
});
