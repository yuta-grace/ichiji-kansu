// 問題ごとの結果：称号（解いた数・スピード・一次関数マスター）と、講師用画面の系統別タイムに使う（5.10・5.12）
import dungeon from '../content/dungeon.json';
import home from '../content/home.json';
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

/** 「問題を解く」の入口（区分のラベルがあるもの） */
export const SOLVE_ENTRIES = home.groups.flatMap((g) => g.items).filter((i): i is typeof i & { level: string } => 'level' in i);
export const entryLabel = (id: string) => SOLVE_ENTRIES.find((e) => e.id === id)?.label ?? id;
/** 問題の型（講師用画面の「型別」の並び） */
export const TYPES: string[] = settings.types;

/** 入口ごとの問題（一次関数マスターの「すべての問題」）。新しい入口を作ったらここに足す */
const ENTRY_PROBLEMS: Record<string, string[]> = {
  practice: practice.problems.map((p) => p.id),
  dungeon: dungeon.problems.map((p) => p.id),
};
/** 称号と一次関数マスターに数える入口：問題がある入口（まだ作っていない入口は数えない） */
export const TITLE_ENTRIES = SOLVE_ENTRIES.filter((e) => ENTRY_PROBLEMS[e.id]?.length);

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
  /** 解いた数の最後の段階とスピードがそろった */
  complete: boolean;
}

export function titleState(results: ProblemResult[], entry: string): TitleState {
  const mine = results.filter((r) => r.entry === entry);
  const solved = mine.filter((r) => r.correct).length;
  const steps = T.solvedSteps.map((n, i) => ({ n, name: titles.solved[i], got: solved >= n }));
  const speed = mine.filter(isFast).length;
  const speedGot = speed >= T.speedCount;
  return { solved, steps, speed, speedGot, complete: steps[steps.length - 1].got && speedGot };
}

export interface MasterState {
  /** そろった入口の数 */
  done: number;
  total: number;
  /** まだ自力で正解していない問題の数（すべての入口の合計） */
  unsolved: number;
  master: boolean;
}

/** 一次関数マスター：すべての入口がそろい、すべての問題を一度は自力で正解している */
export function masterState(results: ProblemResult[]): MasterState {
  const solvedIds = new Set(results.filter((r) => r.correct).map((r) => `${r.entry}/${r.problemId}`));
  const done = TITLE_ENTRIES.filter((e) => titleState(results, e.id).complete).length;
  const unsolved = TITLE_ENTRIES.reduce((n, e) => n + ENTRY_PROBLEMS[e.id].filter((id) => !solvedIds.has(`${e.id}/${id}`)).length, 0);
  const total = TITLE_ENTRIES.length;
  return { done, total, unsolved, master: done === total && unsolved === 0 };
}

/** 新しく手に入れた称号を、博士の台詞にして返す */
function gainedLines(prev: ProblemResult[], next: ProblemResult[], entry: string): string[] {
  const label = entryLabel(entry);
  const before = titleState(prev, entry);
  const after = titleState(next, entry);
  const lines = after.steps.filter((s, i) => s.got && !before.steps[i].got).map((s) => fill(titles.gained, { entry: label, title: s.name }));
  if (after.speedGot && !before.speedGot) lines.push(fill(titles.gained, { entry: label, title: titles.speed }));
  if (masterState(next).master && !masterState(prev).master) lines.push(fill(titles.gainedMaster, { title: titles.master }));
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
  const keys = by === 'type' ? TYPES : SOLVE_ENTRIES.map((e) => e.id);
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
