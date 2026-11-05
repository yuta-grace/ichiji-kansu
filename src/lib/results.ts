// 問題ごとの結果：称号（解いた数・スピード・一次関数クリア・一次関数マスター）と、講師用画面の系統別タイムに使う（5.10・5.12）
import challenge from '../content/challenge.json';
import dungeon from '../content/dungeon.json';
import home from '../content/home.json';
import figures from '../content/figures.json';
import life from '../content/life.json';
import points from '../content/points.json';
import practice from '../content/practice.json';
import settings from '../content/settings.json';
import titles from '../content/titles.json';
import { update } from './storage';
import type { SaveData } from './storage';
import { fill } from './text';

const T = settings.titles;

/** 問題1問の結果 */
export interface ProblemResult {
  /** どの入口の問題か（ミックスで解いたときも、元の入口） */
  entry: string;
  problemId: string;
  /** 区分のタグ（基本・標準・発展・生活） */
  level: string;
  /** 問題の型のタグ（グラフから関数を決定 など。1問に複数付けられる） */
  types: string[];
  /** 解き方を見せずに正解した（途中で間違えて直した場合も含む）。ヒントを使っても正解なら true */
  correct: boolean;
  /** 問題を出してから正解するまでの時間（ミリ秒） */
  ms: number;
  hint: boolean;
  at: number;
  mix?: boolean;
  /** 問題ごとの目標タイム（秒）。書いていなければ区分の目標タイム */
  targetSec?: number;
}

/** 学ぶの一覧の入口（名前と区分） */
const ALL_ENTRIES = home.groups.flatMap((g) => g.items) as { id: string; label: string; level?: string }[];
export const entryLabel = (id: string) => ALL_ENTRIES.find((e) => e.id === id)?.label ?? id;
/** 問題の型（講師用画面の「型別」の並び） */
export const TYPES: string[] = settings.types;

/** 挑戦：スピードの称号はなく、一次関数クリアには数えない（一次関数マスターの条件） */
export const CHALLENGE = 'challenge';

/** 入口ごとの問題（一次関数クリア・マスターの「すべての問題」）。新しい入口を作ったらここに足す */
const ENTRY_PROBLEMS: Record<string, string[]> = {
  practice: practice.problems.map((p) => p.id),
  dungeon: dungeon.problems.map((p) => p.id),
  points: points.problems.map((p) => p.id),
  figures: figures.problems.map((p) => p.id),
  life: life.problems.map((p) => p.id),
  [CHALLENGE]: challenge.problems.map((p) => p.id),
};
/** 称号に数える入口：問題がある入口（学ぶの一覧の順） */
export const TITLE_ENTRIES = ALL_ENTRIES.filter((e) => ENTRY_PROBLEMS[e.id]?.length);
/** 講師用画面の「入口別」の並び */
export const STAT_ENTRIES = TITLE_ENTRIES;

/** 時間の表示：「42秒」「1分05秒」「3分」 */
export function formatTime(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}秒`;
  return s % 60 === 0 ? `${s / 60}分` : `${Math.floor(s / 60)}分${String(s % 60).padStart(2, '0')}秒`;
}

export const targetSec = (level: string, override?: number) => override ?? (T.targetSec as Record<string, number>)[level] ?? 60;

/** スピードに数える：ヒントを使わずに、目標タイム以内に正解 */
export const isFast = (r: ProblemResult) => r.correct && !r.hint && r.ms <= targetSec(r.level, r.targetSec) * 1000;

export interface TitleState {
  solved: number;
  steps: { n: number; name: string; got: boolean }[];
  speed: number;
  speedGot: boolean;
  /** スピードの称号があるか（挑戦にはない） */
  hasSpeed: boolean;
  /** 解いた数の最後の段階とスピードがそろった */
  complete: boolean;
}

export function titleState(results: ProblemResult[], entry: string): TitleState {
  const mine = results.filter((r) => r.entry === entry);
  const solved = mine.filter((r) => r.correct).length;
  const steps = T.solvedSteps.map((n, i) => ({ n, name: titles.solved[i], got: solved >= n }));
  const speed = mine.filter(isFast).length;
  const hasSpeed = entry !== CHALLENGE;
  const speedGot = hasSpeed && speed >= T.speedCount;
  return { solved, steps, speed, speedGot, hasSpeed, complete: steps[steps.length - 1].got && (speedGot || !hasSpeed) };
}

export interface MasterState {
  /** 一次関数クリア：挑戦以外の入口で、そろった入口の数 */
  done: number;
  total: number;
  /** 挑戦以外で、まだ自力で正解していない問題の数 */
  unsolved: number;
  clear: boolean;
  /** 挑戦で、まだ自力で正解していない問題の数 */
  challengeUnsolved: number;
  /** 一次関数マスター：クリアして、挑戦のすべての問題を一度は自力で正解 */
  master: boolean;
}

export function masterState(results: ProblemResult[]): MasterState {
  const solvedIds = new Set(results.filter((r) => r.correct).map((r) => `${r.entry}/${r.problemId}`));
  const unsolvedIn = (id: string) => ENTRY_PROBLEMS[id].filter((p) => !solvedIds.has(`${id}/${p}`)).length;
  const normal = TITLE_ENTRIES.filter((e) => e.id !== CHALLENGE);
  const done = normal.filter((e) => titleState(results, e.id).complete).length;
  const unsolved = normal.reduce((n, e) => n + unsolvedIn(e.id), 0);
  const clear = done === normal.length && unsolved === 0;
  const challengeUnsolved = unsolvedIn(CHALLENGE);
  return { done, total: normal.length, unsolved, clear, challengeUnsolved, master: clear && challengeUnsolved === 0 };
}

/** 新しく手に入れた称号を、博士の台詞にして返す */
function gainedLines(prev: ProblemResult[], next: ProblemResult[], entry: string): string[] {
  const label = entryLabel(entry);
  const before = titleState(prev, entry);
  const after = titleState(next, entry);
  const lines = after.steps.filter((s, i) => s.got && !before.steps[i].got).map((s) => fill(titles.gained, { entry: label, title: s.name }));
  if (after.speedGot && !before.speedGot) lines.push(fill(titles.gained, { entry: label, title: titles.speed }));
  const m0 = masterState(prev);
  const m1 = masterState(next);
  // クリアのときは、次の目標（挑戦）を軽く伝える
  if (m1.clear && !m0.clear) lines.push(...(m1.master ? titles.gainedClearAndMaster : titles.gainedClear));
  else if (m1.master && !m0.master) lines.push(fill(titles.gainedMaster, { title: titles.master }));
  return lines;
}

/** 結果を記録し、新しく手に入れた称号の台詞を返す */
export function addResult(r: Omit<ProblemResult, 'at'>): string[] {
  let lines: string[] = [];
  update((d) => {
    const prev = d.results ?? [];
    const next = [...prev, { ...r, at: Date.now() }];
    lines = gainedLines(prev, next, r.entry);
    d.results = next;
  });
  return lines;
}

export const resultsOf = (d: SaveData) => d.results ?? [];

// ---- 講師用画面：直近の問題の系統別タイム ----

export interface StatRow {
  key: string;
  count: number;
  /** そのうちヒントを使った問題の数 */
  hinted: number;
  correct: number;
  /** 正解した問題だけの平均時間（ミリ秒）。正解がなければ null */
  avgMs: number | null;
}

/** 直近 n 問（0 は全部）を、型別か入口別に分けて集計する。型が複数ある問題は、それぞれの型に数える */
export function recentStats(results: ProblemResult[], n: number, by: 'type' | 'entry'): StatRow[] {
  const recent = [...results].sort((a, b) => a.at - b.at).slice(n > 0 ? -n : 0);
  const keys = by === 'type' ? TYPES : STAT_ENTRIES.map((e) => e.id);
  return keys.map((key) => {
    const rows = recent.filter((r) => (by === 'type' ? (r.types ?? []).includes(key) : r.entry === key));
    const ok = rows.filter((r) => r.correct);
    return {
      key,
      count: rows.length,
      hinted: rows.filter((r) => r.hint).length,
      correct: ok.length,
      avgMs: ok.length ? ok.reduce((s, r) => s + r.ms, 0) / ok.length : null,
    };
  });
}
