// ─────────────────────────────────────────────────────────────────────────────
// Tutorial de primeira entrada da tela de PRODUTOS — paradas dos designs 59a–59d
// (Claude Design, NiksProductsTutorial.dc.html). O overlay é o `TutorialOverlay`;
// aqui ficam só as 4 paradas, copiadas do `STOPS` do design. A parada 3 rola a
// tela até o fim (os recomendados). Os alvos são registrados por
// `recomendacao-produtos.tsx` e `components/product/Shelf.tsx`.
// Uma vez por conta (`users.produtos_tutorial_seen_at`, ver `lib/produtosTutorial.ts`).
// ─────────────────────────────────────────────────────────────────────────────
import TutorialOverlay, { type TutStop } from './TutorialOverlay';

const STOPS: TutStop[] = [
  { t: 'Essa é a sua estante de produtos. Conforme você for escaneando os produtos que tem em casa, eles aparecerão aqui.', a: { u: ['prod-shelf'], pad: 4, r: 24 } },
  { t: 'Toque em Editar para organizar a sua estante e compartilhe ela nas redes sociais e com seus amigos.', a: { u: ['prod-edit'], pad: 6, r: 'pill' } },
  { t: 'Aqui ficam os produtos que a NIKS recomenda para a sua pele. Conforme você for comprando, poderá adicioná-los à sua estante.', a: { u: ['prod-recTitle', 'prod-recRow'], pad: 6, r: 22 }, scroll: true },
  { t: 'Tire foto de qualquer produto e descubra se ele é compatível com a sua pele e se vale a pena adicioná-lo no seu skincare.', a: { u: ['prod-scanBtn'], pad: 5, r: 'pill' } },
];

export default function ProdutosCoachMarks({ onFinish }: { onFinish: () => void }) {
  return <TutorialOverlay stops={STOPS} onFinish={onFinish} />;
}
