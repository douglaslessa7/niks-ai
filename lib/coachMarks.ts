// ─────────────────────────────────────────────────────────────────────────────
// Coach marks — onde cada elemento destacado ESTÁ na tela.
//
// O tutorial de primeiro acesso escurece a tela inteira e recorta um buraco em
// volta de um elemento. O buraco precisa das coordenadas REAIS (em coordenadas
// de janela) de elementos que vivem em ARQUIVOS DIFERENTES:
//   • botão "Escanear" e card de métricas → `app/(app)/home.tsx`
//   • ícones da navbar                    → `app/(app)/_layout.tsx`
// e o overlay, que precisa cobrir a navbar, mora no `_layout` (ver a seção
// "Feature: Tutorial de primeiro acesso" no README).
//
// Por que um registro de MÓDULO e não o Zustand: as medidas são efêmeras (mudam
// a cada layout/rotação) e não têm nada a ver com o estado do app — persistir ou
// versionar isso no store seria ruído. Mesmo padrão de `lib/nativePresentation.ts`
// e `lib/shareResume.ts`. O que PERSISTE (já viu / está armado) vive no store.
//
// Fluxo de medição, em 2 canais separados de propósito (a ordem importa):
//   1. `requestCoachPrepare()` — o overlay avisa a tela que vai destacar algo.
//      A home aproveita para ROLAR PARA O TOPO (o card de métricas pode estar
//      fora da viewport; medir antes disso daria um buraco no lugar errado).
//   2. `requestCoachMeasure()` — só depois, todos os alvos se remedem.
// Um canal só não resolveria: a ordem de execução dos listeners dependeria da
// ordem dos hooks, e a home mediria ANTES de ter rolado.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState, useCallback } from 'react';
import type { View } from 'react-native';

export type CoachTargetKey =
  | 'scan'          // botão "Escanear" da home (pílula)
  | 'metrics'       // card de métricas da home (retângulo arredondado)
  | 'nav-rotina'    // navbar: ícone "beauty" → /protocolo (círculo)
  | 'nav-produtos'  // navbar: ícone de frasco → /recomendacao-produtos (círculo)
  | 'nav-chat';     // navbar: balão → /niks-chat (círculo)

/** Formato do recorte. `radius` só é lido no 'rect'. */
export type CoachShape = 'pill' | 'rect' | 'circle';

export type CoachRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: CoachShape;
  radius?: number;
};

export type CoachTargets = Partial<Record<CoachTargetKey, CoachRect>>;

let targets: CoachTargets = {};
let stageReady = false;

const subscribers = new Set<() => void>();
const prepareListeners = new Set<() => void>();
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
    Math.abs(a.height - b.height) < 0.5 &&
    a.shape === b.shape &&
    a.radius === b.radius
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
 * A tela de fundo terminou de carregar e pode ser destacada. A home chama com
 * `true` quando os dados chegam (ela abre com SKELETON no cold start — destacar
 * um card ainda pulsando explicaria a coisa errada).
 */
export function setCoachStageReady(value: boolean): void {
  if (stageReady === value) return;
  stageReady = value;
  emit();
}

/** Canal 1 — "vou destacar algo, se prepare" (a home rola para o topo). */
export function requestCoachPrepare(): void {
  prepareListeners.forEach((fn) => fn());
}

/** Canal 2 — "agora meça". Sempre DEPOIS do prepare (ver cabeçalho). */
export function requestCoachMeasure(): void {
  measureListeners.forEach((fn) => fn());
}

export function onCoachPrepare(fn: () => void): () => void {
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
export function useCoachStageReady(): boolean {
  const [value, setValue] = useState(stageReady);
  useEffect(() => {
    const fn = () => setValue(stageReady);
    subscribers.add(fn);
    fn();
    return () => { subscribers.delete(fn); };
  }, []);
  return value;
}

/**
 * Liga um elemento ao registro. Devolve `{ ref, onLayout }` para pregar num
 * componente de HOST (`<View>` puro) — não num `TouchableOpacity`: o que
 * interessa é a caixa desenhada, e o touchable pode ser bem maior que ela
 * (os itens da navbar são `flex: 1`, uma coluna inteira).
 *
 * `enabled: false` desregistra o alvo — é assim que a home some com o passo do
 * card de métricas para quem ainda não tem scan (ver o overlay).
 */
export function useCoachMark(
  key: CoachTargetKey,
  shape: CoachShape,
  options?: { radius?: number; enabled?: boolean },
) {
  const radius = options?.radius;
  const enabled = options?.enabled ?? true;
  const ref = useRef<View | null>(null);

  const measure = useCallback(() => {
    if (!enabled) { registerCoachTarget(key, null); return; }
    const node = ref.current;
    if (!node) return;
    // measureInWindow → coordenadas de JANELA, que é o mesmo sistema do overlay
    // (ele é absoluto sobre a View raiz do (app)/_layout, que preenche a tela).
    node.measureInWindow?.((x, y, width, height) => {
      if (!width || !height) return; // view ainda sem layout — o próximo onLayout resolve
      registerCoachTarget(key, { x, y, width, height, shape, radius });
    });
  }, [key, shape, radius, enabled]);

  useEffect(() => {
    if (!enabled) { registerCoachTarget(key, null); return; }
    measureListeners.add(measure);
    measure();
    return () => { measureListeners.delete(measure); };
  }, [measure, enabled, key]);

  // Desregistra ao desmontar: um alvo fantasma viraria buraco no vazio.
  useEffect(() => () => { registerCoachTarget(key, null); }, [key]);

  return { ref, onLayout: measure };
}
