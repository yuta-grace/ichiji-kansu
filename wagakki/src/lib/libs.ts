// 大きな部品は使うときに読み込む。claude.ai のページでは CDN から、普段のアプリでは同梱のものを使う
const ON_CLAUDE_PAGE = import.meta.env.VITE_CLAUDE_PAGE === '1';

const CDN = {
  vexflow: { url: 'https://cdn.jsdelivr.net/npm/vexflow@4.2.3/build/cjs/vexflow.js', global: 'Vex' },
  jspdf: { url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', global: 'jspdf' },
  html2canvas: { url: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', global: 'html2canvas' },
};

const loading = new Map<string, Promise<unknown>>();

function fromCdn<T>(key: keyof typeof CDN): Promise<T> {
  const { url, global } = CDN[key];
  const w = window as unknown as Record<string, unknown>;
  if (w[global]) return Promise.resolve(w[global] as T);
  if (!loading.has(key)) {
    loading.set(
      key,
      new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = url;
        s.onload = () => (w[global] ? resolve(w[global]) : reject(new Error(`${key} を読み込めませんでした`)));
        s.onerror = () => reject(new Error(`${key} を読み込めませんでした（通信を確認してください）`));
        document.head.appendChild(s);
      }),
    );
  }
  return loading.get(key) as Promise<T>;
}

export type VexFlow = typeof import('vexflow');
export type JsPdfModule = typeof import('jspdf');
export type Html2Canvas = typeof import('html2canvas').default;

export const loadVexFlow = (): Promise<VexFlow> => (ON_CLAUDE_PAGE ? fromCdn<VexFlow>('vexflow') : import('vexflow'));
export const loadJsPdf = (): Promise<JsPdfModule> => (ON_CLAUDE_PAGE ? fromCdn<JsPdfModule>('jspdf') : import('jspdf'));
export const loadHtml2Canvas = async (): Promise<Html2Canvas> =>
  ON_CLAUDE_PAGE ? fromCdn<Html2Canvas>('html2canvas') : (await import('html2canvas')).default;
