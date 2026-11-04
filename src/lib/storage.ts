import type { MethodId } from './dungeon';
import type { ProblemResult } from './results';

export interface NoteMethod {
  learnedAt: number;
  name?: string;
}

// 端末内（localStorage）への保存。サーバーには送らない（8章）。
// 1台を複数の生徒で使うため、記録はニックネームごとに分ける。本名は入れないよう画面で伝える。
// localStorage が使えない環境（プライベートモード等）でも、その間はメモリに置いて動くようにする。

const KEY = 'ichiji-kansu.v2';

export interface LogEntry {
  part: 'entry' | 'diagnostic' | 'understanding' | 'practice' | 'dungeon' | 'notebook';
  step: string;
  /** 正解までにかかった回数（3回目で答えを見せた場合は shown: true） */
  attempts?: number;
  shown?: boolean;
  hintsUsed?: number;
  /** 予想・選んだ解き方などの選択 */
  choice?: string;
  ms?: number;
  at: number;
}

/** 「あとで聞く」にしたもの */
export interface LaterItem {
  id: string;
  /** どのパートの問題か（古い記録には無いのでダンジョンとして扱う） */
  part?: 'dungeon' | 'practice';
  problemId: string;
  /** ダンジョンの解き方。練習では無し（問題単位） */
  method?: MethodId;
  /** others＝正解後に「他のやり方」から、solving＝解いている途中に */
  from: 'others' | 'solving';
  at: number;
  /** 講師が「聞いた」にチェックした（生徒の一覧からは消える） */
  asked?: boolean;
}

export interface SaveData {
  entryAnswer?: 'beginner' | 'some';
  /** 最後に入った入口（学ぶの「続きから」カードに出す） */
  lastPart?: string;
  understanding: {
    /** 途中から再開するためのステップ */
    stepId?: string;
    done: boolean;
    /** 予想の選択（予想と結果を比べる場面で使う） */
    predictions: Record<string, string>;
  };
  /** 練習の進み具合。queue は出題順（解き方を見せた後に並べかえることがある） */
  practice?: { queue: string[]; pos: number; streak: number; done: boolean };
  /** 2点から式を作るの進み具合。pos：次に出す問題（問題集の何番目か）、solved：解いた問題の数、offered1：①を提案したか、seen：正解後に見たことのある解き方 */
  dungeon?: { pos: number; solved?: number; offered1?: boolean; seen?: MethodId[] };
  /** 解き方ノート：学んだ解き方（学んだ時刻と、生徒が付けた名前） */
  notebook?: Partial<Record<MethodId, NoteMethod>>;
  later: LaterItem[];
  /** 問題ごとの結果（称号と講師用画面の集計に使う） */
  results?: ProblemResult[];
  /** 準備運動の結果。記録するだけで、他の機能には使わない（5.1） */
  diagnostic?: { done: boolean; results: { id: string; correct: boolean; answer: string }[] };
  log: LogEntry[];
}

export interface Profile {
  id: string;
  name: string;
  createdAt: number;
}

interface Store {
  profiles: Profile[];
  /** 前回使ったニックネーム（「○○で続ける」に使う） */
  lastId?: string;
  /** 講師用の暗証番号（ハッシュ）。ニックネームの削除のときだけ聞く */
  teacherPin?: string;
  data: Record<string, SaveData>;
}

const emptyData = (): SaveData => ({
  understanding: { done: false, predictions: {} },
  later: [],
  log: [],
});

let memory: Store | null = null;
let currentId: string | null = null;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch {
    // 下でメモリを使う
  }
  return memory ?? { profiles: [], data: {} };
}

function writeStore(s: Store): void {
  memory = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 保存できなくても学習は続けられる
  }
}

// ---- ニックネーム ----

export const listProfiles = (): Profile[] => readStore().profiles;
export const lastProfile = (): Profile | undefined => {
  const s = readStore();
  return s.profiles.find((p) => p.id === s.lastId);
};
export const currentProfile = (): Profile | undefined => readStore().profiles.find((p) => p.id === currentId);

export function selectProfile(id: string): void {
  currentId = id;
  const s = readStore();
  writeStore({ ...s, lastId: id });
}

/** 新しいニックネームを作って選ぶ。同じ名前がすでにあれば null */
export function createProfile(name: string): Profile | null {
  const s = readStore();
  const trimmed = name.trim();
  if (!trimmed || s.profiles.some((p) => p.name === trimmed)) return null;
  const p: Profile = { id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: trimmed, createdAt: Date.now() };
  writeStore({ ...s, profiles: [...s.profiles, p], data: { ...s.data, [p.id]: emptyData() }, lastId: p.id });
  currentId = p.id;
  return p;
}

/** 講師用画面からだけ使う */
export function deleteProfile(id: string): void {
  const s = readStore();
  const data = { ...s.data };
  delete data[id];
  writeStore({ ...s, profiles: s.profiles.filter((p) => p.id !== id), data, lastId: s.lastId === id ? undefined : s.lastId });
  if (currentId === id) currentId = null;
}

// ---- 選んでいるニックネームの記録 ----

export function loadProfileData(id: string): SaveData {
  return { ...emptyData(), ...readStore().data[id] };
}

export function updateProfileData(id: string, fn: (d: SaveData) => void): SaveData {
  const s = readStore();
  const d = { ...emptyData(), ...s.data[id] };
  fn(d);
  writeStore({ ...s, data: { ...s.data, [id]: d } });
  return d;
}

export function load(): SaveData {
  return currentId ? loadProfileData(currentId) : emptyData();
}

export function update(fn: (d: SaveData) => void): SaveData {
  if (!currentId) {
    const d = emptyData();
    fn(d);
    return d;
  }
  return updateProfileData(currentId, fn);
}

export function addLog(entry: Omit<LogEntry, 'at'>): void {
  update((d) => {
    d.log.push({ ...entry, at: Date.now() });
  });
}

// ---- あとで聞く ----

/** アプリを開いた時刻。「前に」あとで聞くにしたものを、開いたときに1件だけ提案するため */
export const sessionStartedAt = Date.now();

export function addLater(item: Omit<LaterItem, 'id' | 'at'>): void {
  update((d) => {
    d.later.push({ ...item, id: `l${Date.now().toString(36)}`, at: Date.now() });
  });
}

/** 生徒に見せる一覧（講師が「聞いた」にしたものは除く） */
export const openLater = (d: SaveData) => d.later.filter((l) => !l.asked);

// ---- 講師用の暗証番号（端末の中にだけ保存） ----

async function hashPin(pin: string): Promise<string> {
  const text = `ichiji-kansu:${pin}`;
  // crypto.subtle は https か localhost でしか使えない（同じ Wi-Fi の http で開いたとき用に簡単なハッシュで代える）
  if (!globalThis.crypto?.subtle) {
    let h = 0x811c9dc5;
    for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
    return `f${h.toString(16)}`;
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export const hasTeacherPin = () => !!readStore().teacherPin;

export async function setTeacherPin(pin: string): Promise<void> {
  const hashed = await hashPin(pin);
  writeStore({ ...readStore(), teacherPin: hashed });
}

export async function checkTeacherPin(pin: string): Promise<boolean> {
  const saved = readStore().teacherPin;
  return !!saved && saved === (await hashPin(pin));
}
