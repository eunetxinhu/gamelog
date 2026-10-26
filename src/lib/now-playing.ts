// "Jogando agora": cruza os perfis da Steam com quem a pessoa segue (sem banco: testável).

export type NowPlayingSummary = { steamid: string; gameid?: string; gameextrainfo?: string };

/** Quem está com um jogo aberto, na ordem de `steamIds` (a ordem de quem a pessoa segue). */
export function nowPlayingFrom(summaries: NowPlayingSummary[], steamIds: string[]): { steamId: string; appId: number; name: string }[] {
  const bySteam = new Map(summaries.map((s) => [s.steamid, s]));
  return steamIds.flatMap((id) => {
    const s = bySteam.get(id);
    const appId = Number(s?.gameid);
    if (!s || !Number.isInteger(appId) || appId <= 0) return [];
    return [{ steamId: id, appId, name: s.gameextrainfo?.trim() || "Um jogo" }];
  });
}
