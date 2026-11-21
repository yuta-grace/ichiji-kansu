// dist-page/app.js と app.css を、claude.ai に載せる1枚の HTML（wagakki.html）にまとめる
import { readFileSync, writeFileSync } from 'node:fs';

const js = readFileSync('dist-page/app.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync('dist-page/app.css', 'utf8');
const html = `<title>三味線・尺八 和楽器</title>
<meta name="theme-color" content="#415f91">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Noto+Serif+JP:wght@600&display=swap">
<style>
html, body { height: 100%; }
${css}
</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>
${js}
</script>
`;
writeFileSync('dist-page/wagakki.html', html);
console.log(`dist-page/wagakki.html ${(html.length / 1024).toFixed(0)} KB`);
