// TEMP-FPS (12/nov/2026): medidor de quadros para a investigação de travamentos. Em __DEV__, ou
// numa build de teste com EXPO_PUBLIC_MEDIR_FPS=1 (Release de simulador, sem depurador): aí
// grava a cada segundo uma linha em Documents/fps.log (lida pelo Mac na pasta do simulador).
// UI thread: cada quadro da Reanimated (`useFrameCallback`); JS thread: requestAnimationFrame.
// Lido pelo depurador: `globalThis.__fps.ler()` → { ui, js } com nº de quadros, quadros lentos
// (> 20 ms), o pior quadro e a média, desde o último `globalThis.__fps.zerar()`.
// Apagar este arquivo e a linha TEMP-FPS do app/_layout.tsx depois da investigação.
import { useEffect } from 'react';
import { File, Paths } from 'expo-file-system';
import { useFrameCallback } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

type Conta = { n: number; lentos: number; pior: number; soma: number; acima33: number };
const nova = (): Conta => ({ n: 0, lentos: 0, pior: 0, soma: 0, acima33: 0 });
let ui = nova();
let js = nova();
const somar = (c: Conta, d: number) => {
  c.n += 1; c.soma += d; if (d > 20) c.lentos += 1; if (d > 33) c.acima33 += 1; if (d > c.pior) c.pior = d;
};
const resumo = (c: Conta) => ({ quadros: c.n, lentos_20ms: c.lentos, lentos_33ms: c.acima33, pior_ms: Math.round(c.pior), media_ms: c.n ? +(c.soma / c.n).toFixed(1) : 0 });
const doUiRef = { fn: (d: number) => somar(ui, d) };
const jsRef = { fn: (_d: number) => {} };
function doUi(lote: number[]) { for (const d of lote) doUiRef.fn(d); }

export default function MedidorFps() {
  useFrameCallback((fi) => {
    'worklet';
    const d = fi.timeSincePreviousFrame;
    if (d == null) return;
    const g = globalThis as any;
    g.__fpsLote = g.__fpsLote ?? [];
    g.__fpsLote.push(d);
    if (g.__fpsLote.length >= 30) { const l = g.__fpsLote; g.__fpsLote = []; scheduleOnRN(doUi, l); }
  });
  useEffect(() => {
    let ultimo = 0; let vivo = true;
    const loop = (t: number) => { if (!vivo) return; if (ultimo) { somar(js, t - ultimo); jsRef.fn(t - ultimo); } ultimo = t; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    // Linha por segundo no arquivo (build de teste sem depurador).
    let janela = { ui: nova(), js: nova() };
    const uiAntes = doUiRef.fn;
    doUiRef.fn = (d: number) => { uiAntes(d); somar(janela.ui, d); };
    const jsLoop = jsRef;
    jsLoop.fn = (d: number) => somar(janela.js, d);
    const linhas: string[] = [];
    const t0 = Date.now();
    const iv = setInterval(() => {
      const r = { t: Math.round((Date.now() - t0) / 1000), ui: resumo(janela.ui), js: resumo(janela.js) };
      janela = { ui: nova(), js: nova() };
      linhas.push(JSON.stringify(r));
      if (linhas.length > 600) linhas.shift();
      try { const f = new File(Paths.document, 'fps.log'); if (!f.exists) f.create(); f.write(linhas.join('\n') + '\n'); } catch { /* teste */ }
    }, 1000);
    (globalThis as any).__fps = {
      zerar: () => { ui = nova(); js = nova(); },
      ler: () => JSON.stringify({ ui: resumo(ui), js: resumo(js) }),
    };
    return () => { vivo = false; clearInterval(iv); };
  }, []);
  return null;
}
