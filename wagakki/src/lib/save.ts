// ファイルの保存。普段のアプリはブラウザのダウンロード、claude.ai のページは downloads の機能を使う
import { buildZip } from './exporters';
import { loadHtml2Canvas, loadJsPdf } from './libs';

export const ON_CLAUDE_PAGE = import.meta.env.VITE_CLAUDE_PAGE === '1';

interface DownloadsNs {
  save(req: { filename: string; data: Blob | Uint8Array | string }): Promise<{ status: string }>;
}
interface ClaudeGlobal {
  use(name: 'downloads'): Promise<DownloadsNs | null>;
}

/** claude.ai のページで、そのまま保存できる種類（それ以外は zip にまとめる） */
const PAGE_ALLOWED = ['pdf', 'zip', 'json', 'txt'];

export type SaveResult = 'saved' | 'declined' | 'unavailable';

export async function saveFile(filename: string, data: Uint8Array | string): Promise<SaveResult> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  if (!ON_CLAUDE_PAGE) {
    const blob = new Blob([bytes as BlobPart]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return 'saved';
  }
  const claude = (window as unknown as { claude?: ClaudeGlobal }).claude;
  const dl = claude ? await claude.use('downloads') : null;
  if (!dl) return 'unavailable';
  const ext = filename.split('.').pop()!.toLowerCase();
  let name = filename;
  let body: Uint8Array = bytes;
  if (!PAGE_ALLOWED.includes(ext)) {
    body = buildZip([{ name: filename, data: bytes }]);
    name = filename.replace(/\.[^.]+$/, '') + '.zip';
  }
  try {
    await dl.save({ filename: name, data: new Blob([body as BlobPart]) });
    return 'saved';
  } catch (e) {
    return (e as { code?: string }).code === 'declined' ? 'declined' : 'unavailable';
  }
}

/** ファイル名に使えない文字を除く */
export const safeName = (s: string) => (s.trim() || 'score').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);

/**
 * 画面に描いた楽譜（data-block ごとの塊）を画像にして A4 の PDF にまとめる。
 * 縦譜は塊を右から左へ並べる。
 */
export async function buildPdf(root: HTMLElement, vertical: boolean): Promise<Uint8Array> {
  const [{ jsPDF }, html2canvas] = await Promise.all([loadJsPdf(), loadHtml2Canvas()]);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210;
  const PH = 297;
  const M = 12;
  const scale = 2;
  const blocks = [...root.querySelectorAll<HTMLElement>('[data-head], [data-block]')];
  const shots: { img: string; w: number; h: number; head: boolean }[] = [];
  for (const b of blocks) {
    const c = await html2canvas(b, { scale, backgroundColor: '#ffffff', logging: false });
    // 画面の 1px を 0.26mm（96dpi）として大きさを決める
    shots.push({ img: c.toDataURL('image/png'), w: (c.width / scale) * 0.2646, h: (c.height / scale) * 0.2646, head: b.hasAttribute('data-head') });
  }
  const fit = (s: { w: number; h: number }) => {
    const k = Math.min(1, (PW - 2 * M) / s.w, (PH - 2 * M) / s.h);
    return { w: s.w * k, h: s.h * k };
  };
  let y = M;
  let xRight = PW - M;
  let rowH = 0;
  let first = true;
  for (const s of shots) {
    const { w, h } = fit(s);
    if (s.head || !vertical) {
      if (!first && y + h > PH - M) {
        pdf.addPage();
        y = M;
      }
      pdf.addImage(s.img, 'PNG', M, y, w, h);
      y += h + 4;
      xRight = PW - M;
      rowH = 0;
    } else {
      // 縦譜：右から左へ。入らなければ次の段、次のページ
      if (xRight - w < M) {
        y += rowH + 6;
        xRight = PW - M;
        rowH = 0;
      }
      if (y + h > PH - M) {
        pdf.addPage();
        y = M;
        xRight = PW - M;
        rowH = 0;
      }
      pdf.addImage(s.img, 'PNG', xRight - w, y, w, h);
      xRight -= w + 4;
      rowH = Math.max(rowH, h);
    }
    first = false;
  }
  return new Uint8Array(pdf.output('arraybuffer'));
}
