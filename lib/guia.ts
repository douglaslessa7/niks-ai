// ─────────────────────────────────────────────────────────────────────────────
// A DICA atual dos desafios do primeiro acesso (08/nov/2026) — atravessa telas.
//
// Diferente do tour (que só explica), a dica destaca ONDE tocar e ela faz a ação de
// verdade: o recorte deixa o toque passar (`components/coach/GuiaHost.tsx`). Cada tela
// registra o alvo com `useCoachMark` e avisa os eventos; a navegação avança sozinha
// (o host compara a rota). Tocar fora do recorte encerra a dica.
//
// Passos, um por desafio (08/nov/2026):
//   d1  escanear um produto: aba Produtos → "Escanear produto" → botão da câmera → (análise)
//   d2  colocar na estante: logo depois do d1, "Adicionar à estante" no resultado; vindo do
//       card, aba Produtos → último escaneado → "Adicionar à estante" (dentro do Modal do detalhe)
//   d3  produtos na rotina: aba Rotina → "+" do 1º passo vazio → folha → repete até completar
//   d4  fazer o skincare: "Iniciar skincare" (home) → "Concluir skincare"; fora do horário, o
//       balão "Seu skincare abre às HH:MM."
// Em memória: app fechado = a dica some; o progresso fica no servidor e o card retoma.
// ─────────────────────────────────────────────────────────────────────────────
import { useSyncExternalStore } from 'react';

export type PassoGuia =
  | 'd1-aba' | 'd1-scan' | 'd1-foto' | 'd1-espera'
  | 'd2-aba' | 'd2-card' | 'd2-detalhe' | 'd2-adicionar' | 'd2-pronto'
  | 'd3-aba' | 'd3-escolher' | 'd3-folha' | 'd3-pronto'
  | 'd4-iniciar' | 'd4-concluir' | 'd4-fora';

export type Guia = {
  passo: PassoGuia;
  /** Começou sozinha depois do tour, e não pelo toque no card. */
  guiado?: boolean;
  /** Desafio 3: o período escolhido (o mais perto de completo). */
  periodo?: 'am' | 'pm';
  /** d4-fora: "HH:MM" em que o skincare abre. */
  hora?: string;
};

let atual: Guia | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

export function guiaAtual(): Guia | null {
  return atual;
}

export function iniciarGuia(g: Guia) {
  atual = g;
  avisar();
}

/** Vai para o passo `passo`, mantendo o resto (guiado, período). */
export function irParaGuia(passo: PassoGuia, extra?: Partial<Guia>) {
  if (!atual) return;
  atual = { ...atual, ...extra, passo };
  avisar();
}

export function encerrarGuia() {
  if (!atual) return;
  atual = null;
  avisar();
}

/** Só avança se a dica estiver mesmo em `de` (evento que chega atrasado não pula passo). */
export function avancarGuiaDe(de: PassoGuia | PassoGuia[], para: PassoGuia, extra?: Partial<Guia>) {
  const lista = Array.isArray(de) ? de : [de];
  if (atual && lista.includes(atual.passo)) irParaGuia(para, extra);
}

export function useGuia(): Guia | null {
  return useSyncExternalStore(
    (f) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; },
    () => atual,
    () => atual,
  );
}

// Atalho "Escanear vários de uma vez" (balão do passo d3-escolher): quem sabe abrir o lote é
// a aba Rotina (precisa do lote de hoje), então o host só avisa.
const atalhos = new Set<() => void>();
export function onAtalhoGuia(f: () => void): () => void {
  atalhos.add(f);
  return () => { atalhos.delete(f); };
}
export function dispararAtalhoGuia() {
  atalhos.forEach((f) => f());
}
