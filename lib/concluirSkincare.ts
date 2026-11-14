// ─────────────────────────────────────────────────────────────────────────────
// "Iniciar skincare" da HOME (05/nov/2026): lista de produtos → Concluir skincare →
// câmera do check-in → Novo check-in → carta(s) → mural do grupo. Este arquivo tem o que
// as telas desse caminho (`(app)/skincare`, `(app)/checkin?fluxo=skincare`) dividem.
// Desde as regras novas das cartas (05/nov/2026) é o caminho ÚNICO: o botão da aba Rotina
// também abre a lista. A carta do dia abre sozinha no fim do fluxo, com ou sem check-in.
// ─────────────────────────────────────────────────────────────────────────────
import { irParaFim } from './navegar';
import type { Router } from 'expo-router';
import {
  markStepCompleted, markRoutineDone, clearRoutineFlow, type RoutinePeriod, type StepKey,
} from './routineProgress';
import { concluirRotina, estadoCartas, invalidarCartas, type CartaGanha, type PontosGanhos } from './cartasServidor';
import { reagendarLembretes } from './routineReminders';
import { soltarPontos } from './pontosAnimacao';
import { marcarCartaAberta } from './cartaDoDia';

/**
 * Modo de teste, desligado para o lançamento (09/nov/2026): `true` deixa os botões
 * "Iniciar skincare" (home e aba Rotina) disponíveis a qualquer hora — sem a trava de horário;
 * na home o herói ignora as rotinas já feitas hoje — e o "Concluir skincare" funcionando a
 * qualquer hora, mesmo com a rotina do período já feita. Com `false`, valem a trava de horário
 * dos botões e a regra da rotina feita.
 */
export const SKINCARE_SEMPRE_DISPONIVEL = false;

/**
 * A rotina do período pode ser concluída agora? MESMA regra do `windowOpen` da aba Rotina
 * (`app/(app)/protocolo.tsx`): a manhã vai do horário dela até o horário da noite (dá
 * para fazer atrasada); a noite vai do horário dela até as 04:00 (a virada da
 * sessão-do-dia). Horários em minutos do dia. Mudou lá, muda aqui.
 */
export function janelaDoSkincare(periodo: RoutinePeriod, agora: Date, amTime: number, pmTime: number): boolean {
  const t = agora.getHours() * 60 + agora.getMinutes();
  return periodo === 'am' ? t >= amTime && t < pmTime : t >= pmTime || t < 4 * 60;
}

export type ResultadoSkincare = { carta: CartaGanha | null; pontos: PontosGanhos | null } | null;

/**
 * Conclui o skincare do período: todos os passos de hoje feitos, a rotina no histórico do
 * celular (semana e sequência) e, no servidor (regras novas), a sequência e a CARTA DO DIA
 * (1º skincare de hoje) ou os PONTOS do skincare sem carta. Sem rede, vai para a fila e sobe
 * depois (devolve null). Depois dos dois, os lembretes são reagendados. Roda ANTES da
 * câmera: a sequência não depende da foto.
 */
export async function concluirSkincare(periodo: RoutinePeriod, chaves: StepKey[]): Promise<ResultadoSkincare> {
  // Um de cada vez: `markStepCompleted` lê e regrava a lista, em paralelo um apagaria o outro.
  for (const k of chaves) await markStepCompleted(periodo, k);
  const feita = markRoutineDone(periodo);
  const noServidor = concluirRotina(periodo).then(async (r) => { await invalidarCartas(); return r; });
  void Promise.allSettled([feita, noServidor]).then(() => reagendarLembretes());
  // Um guia deixado pela metade na aba Rotina não reabre mais (a rotina já está feita).
  void clearRoutineFlow(periodo);
  await feita;
  const r = await noServidor.catch(() => null);
  return r ? { carta: r.carta ?? null, pontos: r.pontos ?? null } : null;
}

/** A 1ª carta a raspar agora (estado fresco do servidor), ou null. Nunca falha. */
export async function cartaARasparAgora(): Promise<string | null> {
  try {
    await invalidarCartas();
    const e = await estadoCartas();
    return e.a_raspar[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Fim do caminho (check-in publicado, "Agora não", câmera fechada): a carta de hoje abre
 * SOZINHA para raspar e, quando ela acabar, o `destino`. Sem carta — ou sem conseguir ler o
 * estado —, vai direto ao destino e a barra mostra os pontos segurados (com carta, eles
 * sobem junto depois de raspar).
 */
export async function abrirCartasEDepois(router: Router, destino: string, pronto?: Promise<string | null>): Promise<void> {
  // `pronto` (12/nov/2026): a carta a raspar já buscada antes (`cartaARasparAgora`), para a
  // saída não esperar a rede com a tela parada.
  const primeira = await (pronto ?? cartaARasparAgora());
  if (primeira) {
    marcarCartaAberta(primeira);
    router.push({ pathname: '/(carta)/carta', params: { id: primeira, depois: destino } } as any);
  } else {
    // Fim do fluxo: grupo por cima da aba Grupos; aba/tela na pilha: desce até ela. A barra
    // de pontos só entra com o destino já na tela (antes subia no meio da troca de telas).
    irParaFim(destino as any, () => soltarPontos());
  }
}
