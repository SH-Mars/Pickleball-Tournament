import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare, parseTournament, serialize, toFile } from '../src/domain/serialization';
import { createTournament, generateTeams, setPlayersForTest } from './fixtures';
import { setResult } from '../src/domain/bracket';
import { startTournament } from '../src/domain/tournament';
import { SCHEMA_VERSION } from '../src/domain/types';

function liveTournament() {
  let t = setPlayersForTest(createTournament(123), 'M:6,F:4');
  t.pairing = { ...t.pairing, strategy: 'custom', forbiddenPairs: [['p1', 'p2']] };
  t = generateTeams(t).tournament!;
  t = startTournament(t);
  const r = setResult(t.bracket!, t.settings.scoring, 'R1M1', [{ a: 11, b: 4 }], { confirm: true });
  if (r.ok) t = { ...t, bracket: r.bracket };
  return t;
}

describe('save / load', () => {
  it('round-trips a live tournament exactly', () => {
    const t = liveTournament();
    const back = parseTournament(serialize(t));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.tournament).toEqual(JSON.parse(JSON.stringify(t)));
  });
  it('round-trips a setup-stage tournament without a bracket', () => {
    const t = setPlayersForTest(createTournament(5), 'M:4');
    const back = parseTournament(serialize(t));
    expect(back.ok && back.tournament.bracket).toBeUndefined();
  });
  it('preserves generated teams and seed even if algorithms change later', () => {
    const t = liveTournament();
    const back = parseTournament(serialize(t));
    expect(back.ok && back.tournament.teams).toEqual(t.teams);
    expect(back.ok && back.tournament.generation?.seed).toBe(123);
    expect(back.ok && back.tournament.generation?.algorithmVersion).toBeGreaterThan(0);
  });
  it('writes the documented envelope', () => {
    const f = toFile(liveTournament());
    expect(Object.keys(f)).toEqual(expect.arrayContaining(['schemaVersion', 'applicationVersion', 'tournament', 'players', 'teams', 'pairing', 'bracket', 'matches']));
    expect(f.schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe('version compatibility', () => {
  it('opens a schema v1 file (saved before pools and sections existed)', () => {
    const f = JSON.parse(serialize(liveTournament()));
    f.schemaVersion = 1;
    delete f.tournament.settings.pools;
    delete f.tournament.settings.advancePerPool;
    f.bracket.rounds.forEach((r: any) => { delete r.section; delete r.kind; });
    delete f.bracket.groups;
    const r = parseTournament(JSON.stringify(f));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tournament.settings.pools).toBe(2);
      expect(r.tournament.settings.advancePerPool).toBe(2);
      expect(r.tournament.bracket!.rounds.every((x) => x.section === 'Main bracket' && x.kind === 'elimination')).toBe(true);
    }
  });
  it('round-trips pool play, round robin and double elimination tournaments', () => {
    for (const formatId of ['pool_play', 'round_robin', 'double_elimination'] as const) {
      let t = setPlayersForTest(createTournament(7), 'M:8,F:8');
      t = { ...t, formatId, pairing: { ...t.pairing, strategy: 'random' } };
      t = generateTeams(t).tournament!;
      t = startTournament(t);
      const back = parseTournament(serialize(t));
      expect(back.ok).toBe(true);
      if (back.ok) expect(back.tournament).toEqual(JSON.parse(JSON.stringify(t)));
    }
  });
});

describe('validation', () => {
  const good = () => JSON.parse(serialize(liveTournament()));
  const bad = (mutate: (f: any) => void) => {
    const f = good();
    mutate(f);
    return parseTournament(JSON.stringify(f));
  };
  it('rejects non-JSON', () => expect(parseTournament('hello')).toMatchObject({ ok: false }));
  it('rejects empty and non-objects', () => {
    expect(parseTournament('')).toMatchObject({ ok: false });
    expect(parseTournament('[]')).toMatchObject({ ok: false });
    expect(parseTournament('null')).toMatchObject({ ok: false });
  });
  it('rejects a missing schema version', () => expect(bad((f) => delete f.schemaVersion)).toMatchObject({ ok: false }));
  it('rejects a newer schema with a helpful message', () => {
    const r = bad((f) => (f.schemaVersion = SCHEMA_VERSION + 1));
    expect(!r.ok && r.error).toMatch(/newer version/);
  });
  it('rejects bad player data', () => {
    expect(bad((f) => (f.players[0].gender = 'robot'))).toMatchObject({ ok: false });
    expect(bad((f) => (f.players[0].rating = 'high'))).toMatchObject({ ok: false });
    expect(bad((f) => (f.players[1].id = f.players[0].id))).toMatchObject({ ok: false });
  });
  it('rejects teams that reference unknown or duplicated players', () => {
    expect(bad((f) => (f.teams[0].playerIds[0] = 'ghost'))).toMatchObject({ ok: false });
    expect(bad((f) => (f.teams[1].playerIds[0] = f.teams[0].playerIds[0]))).toMatchObject({ ok: false });
  });
  it('rejects matches that reference unknown teams, matches or rounds', () => {
    expect(bad((f) => (f.matches[0].slotA = { kind: 'team', teamId: 'nope' }))).toMatchObject({ ok: false });
    expect(bad((f) => (f.matches[f.matches.length - 1].slotA = { kind: 'winner', matchId: 'nope' }))).toMatchObject({ ok: false });
    expect(bad((f) => (f.matches[0].roundId = 'nope'))).toMatchObject({ ok: false });
  });
  it('rejects a live tournament with no bracket', () => {
    expect(bad((f) => { f.matches = []; delete f.bracket; })).toMatchObject({ ok: false });
  });
  it('rejects bad settings and pairing', () => {
    expect(bad((f) => (f.tournament.settings.scoring.gamesPerMatch = 2))).toMatchObject({ ok: false });
    expect(bad((f) => (f.pairing.strategy = 'chaos'))).toMatchObject({ ok: false });
    expect(bad((f) => (f.pairing.forbiddenPairs = [['a']]))).toMatchObject({ ok: false });
  });
  it('never throws on arbitrary junk', () => {
    for (const junk of ['{}', '{"schemaVersion":1}', '{"schemaVersion":1,"tournament":5}', '{"schemaVersion":"1"}', '"x"', '123']) {
      expect(() => parseTournament(junk)).not.toThrow();
      expect(parseTournament(junk).ok).toBe(false);
    }
  });
});

describe('share link', () => {
  it('round-trips through the URL fragment and is compact', async () => {
    const t = liveTournament();
    const frag = await encodeShare(t);
    expect(frag.startsWith('t=')).toBe(true);
    expect(frag).toMatch(/^t=[A-Za-z0-9_-]+$/);
    expect(frag.length).toBeLessThan(JSON.stringify(t).length);
    const back = await decodeShare('#' + frag);
    expect(back.ok && back.tournament).toEqual(JSON.parse(JSON.stringify(t)));
  });
  it('rejects damaged links', async () => {
    expect(await decodeShare('#t=%%%')).toMatchObject({ ok: false });
    expect(await decodeShare('#t=AAAA')).toMatchObject({ ok: false });
    expect(await decodeShare('#other')).toMatchObject({ ok: false });
  });
});
