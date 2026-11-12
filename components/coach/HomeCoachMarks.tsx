// ─────────────────────────────────────────────────────────────────────────────
// Tour de primeira entrada da HOME (refeito em 06/nov/2026 — o app de hoje). O overlay é o
// `TutorialOverlay` (mesmo visual de antes: véu, recorte, balão, "N de M", "Pular"); aqui
// ficam só as 6 paradas, uma frase cada (textos aprovados pelo produto em 06/nov/2026).
// Alvos: `home.tsx` (nível, botão, carta do dia, "Seu grupo") e a barra do `(app)/_layout`
// (Rotina, Produtos). Só contas NOVAS (armado no cadastro), uma vez por conta
// (`users.home_tutorial_seen_at`). Depois dele, o tutorial guiado (`lib/missoes.ts`).
// Ver "Feature: Tutorial de primeiro acesso da home" no README.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react';
import TutorialOverlay, { type TutStop } from './TutorialOverlay';
import { useEstadoCartas } from '../../lib/cartasServidor';

const STOPS: TutStop[] = [
  { t: 'Cada skincare, check-in e carta vira NIKS Points, e eles sobem o seu nível.', a: { u: ['home-nivel'], pad: 6, r: 14 } },
  // O texto atual do botão (aprovado em 05/nov/2026).
  { t: 'Quando chegar a hora, toque aqui para fazer seu skincare e o check-in no seu grupo.', a: { u: ['home-rot'], pad: 6, r: 'pill' } },
  { t: 'O primeiro skincare do dia libera uma carta para raspar.', a: { u: ['home-carta'], pad: 4, r: 24 } },
  // "Seu grupo" (ou o convite "Criar grupo") fica mais embaixo: a home rola até ele.
  { t: 'Faça skincare com suas amigas e veja quem já fez hoje.', a: { u: ['home-grupo'], pad: 4, r: 24 }, scroll: true },
  { t: 'Sua rotina de manhã e de noite, com os seus produtos.', a: { u: ['nav-rotina'], pad: 2, r: 'pill' } },
  { t: 'Escaneie um produto e veja se ele combina com a sua pele.', a: { u: ['nav-produtos'], pad: 2, r: 'pill' } },
];

// Pontos diretos (20261204): no modo pontos não há carta do dia — os textos falam de NIKS Points.
const TEXTOS_MODO_PONTOS: Record<number, string> = {
  0: 'Cada skincare e check-in vira NIKS Points, e eles sobem o seu nível.',
  2: 'O primeiro skincare do dia vale até 50 NIKS Points.',
};

export default function HomeCoachMarks({ onFinish }: { onFinish: () => void }) {
  const { data: estado } = useEstadoCartas();
  const stops = useMemo(
    () => (estado?.modo_pontos ? STOPS.map((s, i) => (TEXTOS_MODO_PONTOS[i] ? { ...s, t: TEXTOS_MODO_PONTOS[i] } : s)) : STOPS),
    [estado?.modo_pontos],
  );
  return <TutorialOverlay stops={stops} onFinish={onFinish} />;
}
