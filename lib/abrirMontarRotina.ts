// ─────────────────────────────────────────────────────────────────────────────
// "Montar minha rotina com os produtos de casa" — a entrada do lote (Fase 6).
// Fonte única da navegação + teto de 1 lote por dia. Entradas: a 1ª opção do NIKS
// Chat (a ÚNICA entrada permanente) e o "Escanear meus produtos" do tutorial da Rotina.
// (O card "Monte sua rotina com o que você tem" da Rotina saiu em 10/10/2026.)
//   · lote de hoje processando     → "Montando sua rotina…"
//   · lote de hoje pronto, não visto → resultado
//   · lote de hoje já visto          → aviso do teto (1 por dia)
//   · sem lote hoje                  → câmera do lote, do zero
// Lote que terminou em erro não conta (ver `loteDeHoje`).
// ─────────────────────────────────────────────────────────────────────────────
import { Alert } from 'react-native';
import type { useRouter } from 'expo-router';
import { useLote } from './loteProdutos';
import type { Lote } from './rotinaLotes';

export function abrirMontarRotina(router: ReturnType<typeof useRouter>, loteHoje: Lote | null | undefined): void {
  if (loteHoje?.status === 'processando') {
    router.push({ pathname: '/(scan)/lote-montando', params: { id: loteHoje.id } } as any);
  } else if (loteHoje?.status === 'pronto' && !loteHoje.visto_em) {
    router.push({ pathname: '/(scan)/lote-resultado', params: { id: loteHoje.id } } as any);
  } else if (loteHoje) {
    Alert.alert('Você já montou uma rotina hoje', 'Dá para montar uma por dia. Tente de novo amanhã.');
  } else {
    useLote.getState().limpar();
    router.push('/(scan)/lote-camera' as any);
  }
}
