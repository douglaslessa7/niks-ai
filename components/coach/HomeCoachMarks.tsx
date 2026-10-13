// ─────────────────────────────────────────────────────────────────────────────
// Tutorial de primeira entrada da HOME — paradas dos designs 58a–58d (Claude
// Design, NiksHomeTutorial.dc.html). O overlay é o `TutorialOverlay`; aqui ficam
// só as 5 paradas (a 1ª do design dividida em duas), copiadas do `STOPS` do design (frases, alvos, folgas e raios).
// Os alvos são registrados pela `home.tsx` (`useCoachMark('home-…')`).
// Uma vez por conta: ver "Feature: Tutorial de primeiro acesso da home" no README.
// ─────────────────────────────────────────────────────────────────────────────
import TutorialOverlay, { type TutStop } from './TutorialOverlay';

const STOPS: TutStop[] = [
  // A parada 1 do design (contador + botão) foi dividida em duas a pedido do Douglas
  // (11/10/2026): mesmos recortes do design, um de cada vez.
  { t: 'Aqui você vê quanto tempo falta para o seu próximo skincare.', a: { u: ['home-cnt', 'home-cnt2'], w: 270, pad: 10, r: 22 } },
  { t: 'Quando chegar a hora, o botão acende e você faz seu skincare passo a passo por aqui.', a: { u: ['home-rot'], pad: 6, r: 'pill' } },
  { t: 'Cada skincare feito marca o dia no calendário e te faz acumular pontos de beleza.', a: { u: ['home-week'], pad: 4, r: 20 }, b: { u: ['home-streak'], pad: 6, r: 'pill' } },
  { t: 'A cada 7 dias, escaneie seu rosto e veja sua pele evoluir.', a: { u: ['home-scan'], pad: 5, r: 22 } },
  // "alarme" saiu da frase enquanto o card de alarme está ocultado na home (11/10/2026).
  { t: 'Deslize para o lado e descubra mais: seu progresso, a NIKS, scan de produtos e dica do dia.', a: { u: ['home-rowTitle', 'home-row'], pad: 6, r: 22 } },
];

export default function HomeCoachMarks({ onFinish }: { onFinish: () => void }) {
  return <TutorialOverlay stops={STOPS} onFinish={onFinish} />;
}
