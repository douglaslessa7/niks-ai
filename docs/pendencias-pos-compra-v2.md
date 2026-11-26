# Pós-compra v2 — pendências

Fluxo: `lib/posCompraV2.ts` (mapa das telas e regras). Fila dos produtos de casa: `lib/filaProdutosCasa.ts`.
Design: `design-handoff/pos-compra-v2/` (fora do git).

## Antes da build (decididos em 26/nov/2026)

- [ ] **Pontos dos produtos no servidor.** A recompensa mostra 100 do pacto + 20 por produto (até 10). Hoje só os 100 são creditados (função `boas_vindas`, migration `20261114120000_boas_vindas`); os +20 ficam só no aparelho. Mudança de backend planejada junto com a migration, **só vai para produção com OK**.
- [ ] **Migration `20261114120000_boas_vindas`** aplicada em produção (grava os +100 do pacto e a sequência de 1 dia). Só com OK.
- [ ] **Teste de ponta a ponta com conta real**: envio dos produtos dá certo; envio falha e volta na próxima abertura (gatilho de dev `Documents/niks-dev-falhar-envio-produtos`); ex-convidada que assina.
- [ ] **Versão da build**: a 1.66 (1) já foi enviada; a próxima precisa de outro número.

## Depois

- [ ] **Mixpanel**: nomes das telas `pc-*` em `lib/mixpanel/useScreenTracking.ts`; eventos novos no `docs/tracking-plan.md` — `bv_exclusivo_vista`, `boas_vindas_aviso_scan`, `boas_vindas_dicas`, `boas_vindas_sequencia`, `produtos_casa_descartados`, e `lote_enviado` / `lote_erro` com `origem: 'pos_compra_v2'`.
- [ ] **Caixas da tela 5** ("Sua rotina está pronta"): "Me avisar na hora de escanear a pele" e "Receber dicas pra minha pele" só ficam na tela e no Mixpanel; não há preferência guardada. Só "Me lembrar da rotina" grava (`setLembreteBoasVindas`).
- [ ] **Limpeza das telas antigas**: `bv-entrou`, `bv-rotina`, `bv-foto`, `bv-projecao`, `bv-recompensa`, `bv-sequencia`, `bv-nivel` ficaram sem uso (mantidas nesta build para voltar atrás fácil). A `bv-pacto` continua em uso. Junto: os ramos `usePosCompraV2.ativo` dentro delas e as listas `SEM_GESTO`/`TELAS_SEM_GESTO`.
- [ ] **Ex-convidada e os pontos**: a função `boas_vindas` só credita conta NOVA (`conta_antiga`); a ex-convidada vê a recompensa, mas não recebe os pontos (igual ao fluxo antigo). Decidir se a tela muda para ela.
