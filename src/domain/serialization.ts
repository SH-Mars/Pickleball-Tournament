import type { Tournament } from './types';
import { APP_VERSION, SCHEMA_VERSION } from './types';

export interface TournamentFile {
  schemaVersion: number;
  applicationVersion: string;
  savedAt: string;
  tournament: Omit<Tournament, 'players' | 'teams' | 'pairing' | 'bracket'>;
  players: Tournament['players'];
  teams: Tournament['teams'];
  pairing: Tournament['pairing'];
  bracket?: { formatId: string; rounds: NonNullable<Tournament['bracket']>['rounds']; groups?: NonNullable<Tournament['bracket']>['groups'] };
  matches: NonNullable<Tournament['bracket']>['matches'];
}

export function toFile(t: Tournament, now = new Date()): TournamentFile {
  const { players, teams, pairing, bracket, ...meta } = t;
  return {
    schemaVersion: SCHEMA_VERSION,
    applicationVersion: APP_VERSION,
    savedAt: now.toISOString(),
    tournament: meta,
    players,
    teams,
    pairing,
    bracket: bracket ? { formatId: bracket.formatId, rounds: bracket.rounds, groups: bracket.groups } : undefined,
    matches: bracket?.matches ?? [],
  };
}

export function serialize(t: Tournament, now = new Date()): string {
  return JSON.stringify(toFile(t, now), null, 2);
}

export type ParseResult = { ok: true; tournament: Tournament } | { ok: false; error: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

class Bad extends Error {}
const need = (cond: unknown, msg: string): void => {
  if (!cond) throw new Bad(msg);
};

const GENDERS = ['male', 'female', 'other', 'unspecified'];
const STRATEGIES = ['random', 'balanced', 'skill', 'mens', 'womens', 'mixed', 'custom'];
const FORMATS = ['single_elimination', 'round_robin', 'double_elimination', 'pool_play'];
const SLOT_KINDS = ['team', 'winner', 'loser', 'bye', 'standing', 'gfReset'];

/** Upgrade older schema versions. Add a step here whenever SCHEMA_VERSION changes. */
function migrate(raw: Obj): Obj {
  let f = raw;
  if ((f.schemaVersion as number) < 2) {
    // v1 -> v2: pool settings and round sections were added for the new formats.
    const meta = isObj(f.tournament) ? { ...f.tournament } : {};
    const settings = isObj(meta.settings) ? { ...meta.settings } : {};
    if (settings.pools === undefined) settings.pools = 2;
    if (settings.advancePerPool === undefined) settings.advancePerPool = 2;
    meta.settings = settings;
    const bracket = isObj(f.bracket) ? { ...f.bracket } : f.bracket;
    if (isObj(bracket) && Array.isArray(bracket.rounds)) {
      bracket.rounds = (bracket.rounds as unknown[]).map((r) => (isObj(r) ? { section: 'Main bracket', kind: 'elimination', ...r } : r));
    }
    f = { ...f, schemaVersion: 2, tournament: meta, bracket };
  }
  return f;
}

export function parseTournament(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not a valid tournament file (it could not be read as JSON).' };
  }
  try {
    need(isObj(raw), 'The file does not look like a tournament.');
    const o = raw as Obj;
    need(isNum(o.schemaVersion), 'The file has no schema version, so it is probably not a tournament file.');
    const v = o.schemaVersion as number;
    need(v >= 1, 'The file has an invalid schema version.');
    need(v <= SCHEMA_VERSION, `This file was saved by a newer version of the app (schema ${v}). Please update the app to open it.`);
    const f = migrate(o);

    need(isObj(f.tournament), 'The tournament details are missing.');
    const meta = f.tournament as Obj;
    need(isStr(meta.id) && isStr(meta.name) && isStr(meta.date), 'The tournament name, date or id is missing.');
    need(FORMATS.includes(meta.formatId as string), 'The tournament format is not recognised.');
    need(meta.status === 'setup' || meta.status === 'live', 'The tournament status is invalid.');
    need(isObj(meta.settings), 'The tournament settings are missing.');
    const s = meta.settings as Obj;
    need(isNum(s.courts) && s.courts >= 1, 'The number of courts is invalid.');
    need(isObj(s.scoring), 'The scoring settings are missing.');
    const sc = s.scoring as Obj;
    need(isNum(sc.pointsToWin) && sc.pointsToWin >= 1, 'Points to win is invalid.');
    need(typeof sc.winBy2 === 'boolean', 'The win-by-2 setting is invalid.');
    need(sc.gamesPerMatch === 1 || sc.gamesPerMatch === 3 || sc.gamesPerMatch === 5, 'Games per match is invalid.');
    need(typeof s.thirdPlaceMatch === 'boolean', 'The third-place setting is invalid.');
    need(['order', 'rating', 'random'].includes(s.seeding as string), 'The seeding setting is invalid.');
    need(isNum(s.pools) && Number.isInteger(s.pools) && s.pools >= 1, 'The number of pools is invalid.');
    need(isNum(s.advancePerPool) && Number.isInteger(s.advancePerPool) && s.advancePerPool >= 1, 'The number of teams advancing from each pool is invalid.');

    need(Array.isArray(f.players), 'The player list is missing.');
    const playerIds = new Set<string>();
    for (const p of f.players as unknown[]) {
      need(isObj(p) && isStr(p.id) && isStr(p.name), 'A player entry is malformed.');
      const pp = p as Obj;
      need(GENDERS.includes(pp.gender as string), `Player "${pp.name}" has an invalid gender.`);
      need(typeof pp.active === 'boolean', `Player "${pp.name}" has an invalid active flag.`);
      need(pp.rating === undefined || isNum(pp.rating), `Player "${pp.name}" has an invalid rating.`);
      need(!playerIds.has(pp.id as string), 'The file lists the same player id twice.');
      playerIds.add(pp.id as string);
    }

    need(isObj(f.pairing), 'The pairing configuration is missing.');
    const pr = f.pairing as Obj;
    need(STRATEGIES.includes(pr.strategy as string), 'The pairing strategy is not recognised.');
    need(isNum(pr.teamSize) && Number.isInteger(pr.teamSize) && pr.teamSize >= 1, 'The team size is invalid.');
    need(Array.isArray(pr.allowedCombinations) && (pr.allowedCombinations as unknown[]).every(isStr), 'The allowed combinations are invalid.');
    need(
      Array.isArray(pr.forbiddenPairs) && (pr.forbiddenPairs as unknown[]).every((x) => Array.isArray(x) && x.length === 2 && x.every(isStr)),
      'The forbidden pairs are invalid.',
    );
    need(isObj(pr.preferences) && typeof (pr.preferences as Obj).balanceSkill === 'boolean', 'The pairing preferences are invalid.');
    need(isNum(pr.seed), 'The random seed is invalid.');

    need(Array.isArray(f.teams), 'The team list is missing.');
    const teamIds = new Set<string>();
    const onTeam = new Set<string>();
    for (const t of f.teams as unknown[]) {
      need(isObj(t) && isStr(t.id) && Array.isArray(t.playerIds) && t.playerIds.every(isStr), 'A team entry is malformed.');
      const tt = t as Obj;
      need(tt.source === 'generated' || tt.source === 'manual', 'A team has an invalid source.');
      need(typeof tt.locked === 'boolean', 'A team has an invalid lock flag.');
      need(!teamIds.has(tt.id as string), 'The file lists the same team id twice.');
      teamIds.add(tt.id as string);
      for (const pid of tt.playerIds as string[]) {
        need(playerIds.has(pid), 'A team refers to a player who is not in the roster.');
        need(!onTeam.has(pid), 'A player is on more than one team.');
        onTeam.add(pid);
      }
    }

    let bracket: Tournament['bracket'];
    const matches = f.matches;
    need(Array.isArray(matches), 'The match list is missing.');
    if ((matches as unknown[]).length || f.bracket) {
      need(isObj(f.bracket), 'The bracket is missing.');
      const b = f.bracket as Obj;
      need(FORMATS.includes(b.formatId as string) && Array.isArray(b.rounds), 'The bracket is malformed.');
      const roundIds = new Set<string>();
      for (const r of b.rounds as unknown[]) {
        need(isObj(r) && isStr(r.id) && isStr(r.name) && isNum(r.order), 'A round entry is malformed.');
        need(isStr((r as Obj).section) && ((r as Obj).kind === 'elimination' || (r as Obj).kind === 'group'), 'A round has an invalid section.');
        roundIds.add((r as Obj).id as string);
      }
      const matchIds = new Set((matches as Obj[]).map((m) => (isObj(m) ? m.id : undefined)));
      const groupIds = new Set<string>();
      if (b.groups !== undefined) {
        need(Array.isArray(b.groups), 'The pool list is malformed.');
        for (const g of b.groups as unknown[]) {
          need(isObj(g) && isStr(g.id) && isStr(g.name) && Array.isArray(g.teamIds) && g.teamIds.every((x) => isStr(x) && teamIds.has(x)), 'A pool is malformed or refers to an unknown team.');
          groupIds.add((g as Obj).id as string);
        }
      }
      for (const m of matches as unknown[]) {
        need(isObj(m) && isStr(m.id) && isStr(m.roundId) && isNum(m.number), 'A match entry is malformed.');
        const mm = m as Obj;
        need(roundIds.has(mm.roundId as string), 'A match refers to an unknown round.');
        need(mm.kind === 'main' || mm.kind === 'third_place', 'A match has an invalid kind.');
        need(['not_started', 'in_progress', 'complete'].includes(mm.status as string), 'A match has an invalid status.');
        need(
          Array.isArray(mm.games) && (mm.games as unknown[]).every((g) => isObj(g) && isNum(g.a) && isNum(g.b)),
          'A match has invalid game scores.',
        );
        need(mm.court === undefined || isNum(mm.court), 'A match has an invalid court.');
        need(mm.label === undefined || isStr(mm.label), 'A match has an invalid label.');
        need(mm.groupId === undefined || (isStr(mm.groupId) && groupIds.has(mm.groupId)), 'A match refers to an unknown pool.');
        for (const slot of [mm.slotA, mm.slotB]) {
          need(isObj(slot) && SLOT_KINDS.includes(slot.kind as string), 'A match slot is malformed.');
          const sl = slot as Obj;
          if (sl.kind === 'team') need(isStr(sl.teamId) && teamIds.has(sl.teamId), 'A match refers to a team that does not exist.');
          if (sl.kind === 'winner' || sl.kind === 'loser') need(isStr(sl.matchId) && matchIds.has(sl.matchId), 'A match refers to a match that does not exist.');
          if (sl.kind === 'gfReset') need(isStr(sl.matchId) && matchIds.has(sl.matchId) && (sl.side === 'A' || sl.side === 'B'), 'A grand-final reset slot is malformed.');
          if (sl.kind === 'standing') need(isStr(sl.groupId) && groupIds.has(sl.groupId) && isNum(sl.rank) && sl.rank >= 1, 'A playoff slot refers to an unknown pool.');
        }
      }
      bracket = { formatId: b.formatId as Tournament['formatId'], rounds: b.rounds as never, matches: matches as never, groups: b.groups as never };
    }
    need(meta.status !== 'live' || bracket, 'A running tournament must have a bracket.');

    const tournament: Tournament = {
      id: meta.id as string,
      name: meta.name as string,
      date: meta.date as string,
      formatId: meta.formatId as Tournament['formatId'],
      status: meta.status as Tournament['status'],
      settings: meta.settings as unknown as Tournament['settings'],
      generation: isObj(meta.generation) ? (meta.generation as unknown as Tournament['generation']) : undefined,
      pairing: pr as unknown as Tournament['pairing'],
      players: f.players as Tournament['players'],
      teams: f.teams as Tournament['teams'],
      bracket,
    };
    return { ok: true, tournament };
  } catch (e) {
    if (e instanceof Bad) return { ok: false, error: e.message };
    return { ok: false, error: 'This file could not be read.' };
  }
}

// ---------- Share links: deflate + base64url in the URL fragment ----------

const toB64Url = (bytes: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64Url = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const w = stream.writable.getWriter();
  // Write errors (corrupt input) surface through the readable side; swallow them here.
  w.write(data as unknown as BufferSource).catch(() => undefined);
  w.close().catch(() => undefined);
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

export const SHARE_PREFIX = 't=';
/** Beyond this many characters many chat apps truncate links. */
export const MAX_SHARE_LENGTH = 12000;

export async function encodeShare(t: Tournament): Promise<string> {
  const compact = JSON.stringify(toFile(t, new Date(0)));
  const bytes = await pipe(new TextEncoder().encode(compact), new CompressionStream('deflate-raw'));
  return SHARE_PREFIX + toB64Url(bytes);
}

export async function decodeShare(fragment: string): Promise<ParseResult> {
  try {
    const f = fragment.replace(/^#/, '');
    if (!f.startsWith(SHARE_PREFIX)) return { ok: false, error: 'This is not a tournament link.' };
    const bytes = await pipe(fromB64Url(f.slice(SHARE_PREFIX.length)), new DecompressionStream('deflate-raw'));
    return parseTournament(new TextDecoder().decode(bytes));
  } catch {
    return { ok: false, error: 'This tournament link is damaged or incomplete.' };
  }
}
