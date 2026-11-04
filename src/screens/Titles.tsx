// 称号一覧（ノートの「称号」）。C で「解いた数」「スピード」に作り直すまでは、一言だけ出す
import { Hakase } from '../components/Hakase';
import content from '../content/dungeon.json';

export default function Titles() {
  return <Hakase lines={content.lines.titles.empty} />;
}
