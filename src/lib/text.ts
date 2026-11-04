// 台詞データの {name} を値に置きかえる。負号は「−」で表示する。
export function fill(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vars[k];
    if (v === undefined) return `{${k}}`;
    return String(v).replace(/^-/, '−');
  });
}
