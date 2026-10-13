// ─────────────────────────────────────────────────────────────────────────────
// Coach marks — onde cada elemento destacado ESTÁ na tela.
//
// Os tutoriais de primeira entrada (home = designs 58a–58d, Produtos = 59a–59d)
// escurecem a tela inteira e recortam um buraco em volta de um elemento. O buraco
// precisa das coordenadas REAIS (de janela) de elementos que vivem nas telas
// (`home.tsx`, `recomendacao-produtos.tsx`, `Shelf.tsx`), e o overlay, que cobre
// a navbar, mora no `(app)/_layout` (ver `components/coach/TutorialOverlay.tsx`).
//
// Por que um registro de MÓDULO e não o Zustand: as medidas são efêmeras (mudam
// a cada layout/rolagem) e não têm nada a ver com o estado do app. O que PERSISTE
// (já viu / está armado) vive no store e no banco.
//
// Dois canais, em ordem:
//   1. `requestCoachPrepare(scroll)` — o overlay avisa a tela que vai destacar a
//      próxima parada; a tela ROLA ('top' = início; 'end' = fim, parada 3 dos
//      Produtos). Medir antes disso daria um buraco no lugar errado.
//   2. `requestCoachMeasure()` — todos os alvos se remedem. O overlay chama a cada
//      300 ms (e em rajada durante as transições), como o `setInterval` do design.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState, useCallback } from 'react';
import type { View } from 'react-native';

// Nomes = `data-tut` dos designs (NiksHomeFlo / NiksProductsShelf).
export type CoachTargetKey =
  | 'home-cnt' | 'home-cnt2' | 'home-rot' | 'home-week' | 'home-streak'
  | 'home-scan' | 'home-rowTitle' | 'home-row'
  | 'prod-shelf' | 'prod-edit' | 'prod-recTitle' | 'prod-recRow' | 'prod-scanBtn';

export type CoachRect = { x: number; y: number; width: number; height: number };
export type CoachTargets = Partial<Record<CoachTargetKey, CoachRect>>;
export type CoachStage = 'home' | 'produtos';
export type CoachScroll = 'top' | 'end';

let targets: CoachTargets = {};
const stageReady: Record<CoachStage, boolean> = { home: false, produtos: false };

const subscribers = new Set<() => void>();
const prepareListeners = new Set<(scroll: CoachScroll) => void>();
const measureListeners = new Set<() => void>();

function emit() {
  subscribers.forEach((fn) => fn());
}

function sameRect(a: CoachRect | undefined, b: CoachRect | null): boolean {
  if (!a || !b) return a == null && b == null;
  return (
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

/** Grava (ou apaga, com `null`) a posição de um alvo. Só notifica se mudou de verdade. */
export function registerCoachTarget(key: CoachTargetKey, rect: CoachRect | null): void {
  if (sameRect(targets[key], rect)) return;
  targets = { ...targets };
  if (rect) targets[key] = rect;
  else delete targets[key];
  emit();
}

/**
 * A tela de fundo terminou de carregar e pode ser destacada (destacar um card
 * ainda carregando explicaria a coisa errada). Uma flag por tela.
 */
export function setCoachStageReady(stage: CoachStage, value: boolean): void {
  if (stageReady[stage] === value) return;
  stageReady[stage] = value;
  emit();
}

/** Canal 1 — "vou destacar a próxima parada, role para `scroll`". */
export function requestCoachPrepare(scroll: CoachScroll): void {
  prepareListeners.forEach((fn) => fn(scroll));
}

/** Canal 2 — "agora meça". */
export function requestCoachMeasure(): void {
  measureListeners.forEach((fn) => fn());
}

export function onCoachPrepare(fn: (scroll: CoachScroll) => void): () => void {
  prepareListeners.add(fn);
  return () => { prepareListeners.delete(fn); };
}

/** Todas as posições conhecidas. Re-renderiza quando alguma muda. */
export function useCoachTargets(): CoachTargets {
  const [snapshot, setSnapshot] = useState<CoachTargets>(targets);
  useEffect(() => {
    const fn = () => setSnapshot(targets);
    subscribers.add(fn);
    fn(); // pega o que já foi medido antes deste componente montar
    return () => { subscribers.delete(fn); };
  }, []);
  return snapshot;
}

/** `true` quando a tela de fundo terminou de carregar (ver `setCoachStageReady`). */
export function useCoachStageReady(stage: CoachStage): boolean {
  const [value, setValue] = useState(stageReady[stage]);
  useEffect(() => {
    const fn = () => setValue(stageReady[stage]);
    subscribers.add(fn);
    fn();
    return () => { subscribers.delete(fn); };
  }, [stage]);
  return value;
}

/**
 * Liga um elemento ao registro. Devolve `{ ref, onLayout, collapsable }` para
 * espalhar num componente de HOST (`<View>` puro, ou `<Text>`) — não num
 * `TouchableOpacity`: o que interessa é a caixa desenhada.
 *
 * `enabled: false` desregistra o alvo (ex.: botão "Ver rotina" some com a rotina feita).
 */
export function useCoachMark(key: CoachTargetKey, options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const ref = useRef<View | null>(null);

  const measure = useCallback(() => {
    if (!enabled) { registerCoachTarget(key, null); return; }
    const node = ref.current;
    if (!node) return;
    // measureInWindow → coordenadas de JANELA, o mesmo sistema do overlay (ele é
    // absoluto sobre a View raiz do (app)/_layout, que preenche a tela).
    node.measureInWindow?.((x, y, width, height) => {
      if (!width || !height) return; // ainda sem layout — o próximo onLayout resolve
      registerCoachTarget(key, { x, y, width, height });
    });
  }, [key, enabled]);

  useEffect(() => {
    if (!enabled) { registerCoachTarget(key, null); return; }
    measureListeners.add(measure);
    measure();
    return () => { measureListeners.delete(measure); };
  }, [measure, enabled, key]);

  // Desregistra ao desmontar: um alvo fantasma viraria buraco no vazio.
  useEffect(() => () => { registerCoachTarget(key, null); }, [key]);

  return { ref, onLayout: measure, collapsable: false as const };
}
