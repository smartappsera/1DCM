import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const rootEl = document.getElementById('root')!;
const benchParam = new URLSearchParams(window.location.search).get('bench');

if (benchParam === '1' || benchParam === 'quick') {
  const pre = document.createElement('pre');
  pre.style.cssText =
    'margin:0;padding:16px;min-height:100vh;background:#0f172a;color:#e2e8f0;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word;';
  rootEl.innerHTML = '';
  rootEl.appendChild(pre);

  const appendLine = (line: string) => {
    pre.textContent += `${line}\n`;
    console.log(line);
  };

  appendLine(`CutMaster 1D — запуск бенчмарка (${benchParam === 'quick' ? 'quick' : 'full'})...`);

  import('./utils/cutting/benchmark')
    .then(({ runBenchmarkAsync }) =>
      runBenchmarkAsync({
        quick: benchParam === 'quick',
        log: appendLine,
      })
    )
    .then((ok) => {
      appendLine(ok ? '\nГОТОВО: регрессий не обнаружено.' : '\nОШИБКА: обнаружены регрессии.');
    })
    .catch((err: unknown) => {
      appendLine(`\nКРИТИЧЕСКАЯ ОШИБКА: ${err instanceof Error ? err.message : String(err)}`);
    });
} else {
  createRoot(rootEl).render(<App />);
}
