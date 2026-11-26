# Pós-compra v2 — pendências

Fluxo: `lib/posCompraV2.ts` (mapa das telas e regras). Fila dos produtos de casa: `lib/filaProdutosCasa.ts`.
Design: `design-handoff/pos-compra-v2/` (fora do git).

## Antes da build (decididos em 26/nov/2026)

- [x] **Pontos dos produtos no servidor** (26/nov/2026): migration nova `20261225120000_boas_vindas_produtos` (`p_produtos`, +20 cada, até 10, no mesmo evento do pacto; a `20261114120000_boas_vindas` já estava em produção desde 09/nov), função `cartas` (`produtos` no corpo) e app (`registrarProdutosBoasVindas`).
- [ ] **Publicar a migration `20261225120000_boas_vindas_produtos` e depois a função `cartas`** (os +20 por produto). Só com OK, antes da próxima build.
- [ ] **Teste de ponta a ponta com conta real**: envio dos produtos dá certo; envio falha e volta na próxima abertura (gatilho de dev `Documents/niks-dev-falhar-envio-produtos`); ex-convidada que assina.
- [ ] **Versão da build**: a 1.66 (1) já foi enviada; a próxima precisa de outro número.

## Depois

- [ ] **Mixpanel**: nomes das telas `pc-*` em `lib/mixpanel/useScreenTracking.ts`; eventos novos no `docs/tracking-plan.md` — `bv_exclusivo_vista`, `boas_vindas_aviso_scan`, `boas_vindas_dicas`, `boas_vindas_sequencia`, `produtos_casa_descartados`, e `lote_enviado` / `lote_erro` com `origem: 'pos_compra_v2'`, `boas_vindas_recusada` (motivo) e `boas_vindas_creditada`.
- [ ] **Caixas da tela 5** ("Sua rotina está pronta"): "Me avisar na hora de escanear a pele" e "Receber dicas pra minha pele" só ficam na tela e no Mixpanel; não há preferência guardada. Só "Me lembrar da rotina" grava (`setLembreteBoasVindas`).
- [ ] **Limpeza das telas antigas**: `bv-entrou`, `bv-rotina`, `bv-foto`, `bv-projecao`, `bv-recompensa`, `bv-sequencia`, `bv-nivel` ficaram sem uso (mantidas nesta build para voltar atrás fácil). A `bv-pacto` continua em uso. Junto: os ramos `usePosCompraV2.ativo` dentro delas e as listas `SEM_GESTO`/`TELAS_SEM_GESTO`.
- [ ] **Ex-convidada e os pontos**: a função `boas_vindas` só credita conta NOVA (`conta_antiga`); a ex-convidada vê a recompensa, mas não recebe os pontos (igual ao fluxo antigo). Decidir se a tela muda para ela.

## Cortesia de boas-vindas (26/nov/2026)
- [x] Crédito de +100 às 633 contas (migration `20261228120000`, `scripts/boas-vindas-cortesia/creditar.sql`).
- [ ] **Publicar a migration `20261229120000_cortesia_aviso`** (funções do card) antes da próxima build. Só com OK.
- [ ] **Publicar a `send-notifications`** com o tipo `boas_vindas_cortesia` e disparar o push (só com OK). Nas builds da loja o toque abre o app (home); a partir da próxima build, a Caminhada.
- [ ] Mixpanel: `cortesia_aviso_visto`, `cortesia_aberta` (origem aviso/push), `cortesia_dispensada` no tracking-plan.
