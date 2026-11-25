# Plano de tracking — Mixpanel (NIKS)

> Fonte única de quais eventos o app manda ao Mixpanel. **Mudou um evento no código, mude aqui.**
> Última atualização: 25/nov/2026 (Fases 1 e 2, Session Replay e assinaturas pelo Superwall).

## ⚠️ Relatórios: filtrar `usuario_interno = false`

Todo relatório, funil e coorte de produto deve filtrar **`usuario_interno = false`**. Vale `true` para:
- qualquer build de desenvolvimento (`__DEV__`: Metro/dev client) — desde o 1º evento da sessão;
- contas cujo e-mail está em `EMAILS_INTERNOS` (`lib/mixpanel/perfil.ts`), a partir do `identify`;
- **aparelhos do time**: quando um e-mail da lista faz login, o aparelho ganha a marca `niks_aparelho_interno` no Keychain (`expo-secure-store`, `lib/mixpanel/aparelhoInterno.ts`). Ela **não sai no logout** e, no iOS, **sobrevive à reinstalação** do app: o onboarding anônimo, os logouts e as instalações novas nesse aparelho saem com `true` desde o 1º evento (a marca é lida no início do Mixpanel, antes de esvaziar a fila). Qualquer conta que use esse aparelho conta como interna. ⚠️ No Android a marca some quando o app é desinstalado. Para "desmarcar" um aparelho: apagar o item do Keychain (ex.: apagar o iPhone) — não há botão no app.

É super property (vai em todo evento) e propriedade do perfil. No logout volta ao valor base (`__DEV__` ou aparelho do time). Eventos de antes de 25/nov/2026 não têm a propriedade (use "não é `true`" se precisar incluí-los). TestFlight e loja são builds Release: lá, só o e-mail decide.

## Regras

- **Nunca renomear** um evento existente (quebra o histórico). Para separar contextos, propriedade nova.
- Eventos novos em `snake_case`, com o prefixo da área (`scan_*`, `paywall_*`, `transaction_*`…).
- Visualização sempre em `useEffect` / `useFocusEffect` com guarda — nada de `track` no corpo do componente.
- **Privacidade:** nunca texto de mensagem do chat, foto, URL de imagem ou resposta em texto livre. Só metadados (tipo, tamanho, contagem, resultado, códigos de enumeração).
- Tudo passa pela fila do `lib/mixpanel/MixpanelProvider.tsx` (`track` dentro do React, `trackFora` fora): nada se perde antes do Mixpanel iniciar.

## Inicialização e identidade

| Item | Onde | Como |
|---|---|---|
| SDK | `lib/mixpanel/mixpanelClient.ts` | `mixpanel-react-native` 3.3.0, `useNative = true`, `trackAutomaticEvents = false` |
| Super properties fixas | `superPropertiesBase()` | `platform`, `app_version`, `data_source: 'app'`, `usuario_interno` (= `__DEV__` ou aparelho do time no Keychain; o e-mail da conta também conta no `identify`) — re-registradas depois de todo `reset` |
| Super property de onboarding | `app/(onboarding)/_layout.tsx` | `onboarding_version: '2.0'` |
| Super property `plano` | `lib/mixpanel/perfil.ts` | `free` · `trial` · `pago` · `convidada` · `expirado` — atualizada a cada mudança. **Registrada ANTES do 1º evento da sessão**: a fila do Mixpanel só é esvaziada depois que o plano inicial é conhecido — portão de acesso, ou Superwall sem conta — (teto de 3 s; sem resposta, vale a super property gravada pelo SDK na sessão anterior — na 1ª abertura sem resposta, os primeiros eventos saem sem `plano`). **Atualizada na hora** depois de `purchase_completed` (`trial` ou `pago`) e `trial_started` (`trial`): por 10 min, nada rebaixa para `free`/`expirado` enquanto o portão ainda não confirmou |
| `identify(user_id do Supabase)` | `app/_layout.tsx` (`getSession` + `onAuthStateChange` → `identificarSessao`), `login.tsx`, `signup.tsx`, `concluirComContaLogada` | O mesmo id não é repetido (`identifyFora`) |
| `reset()` | `hooks/useAuth.ts` → `clearLocalData` (logout e apagar conta) | Id anônimo novo + super properties fixas de volta |
| Superwall (identidade) | `lib/mixpanel/superwallIdentidade.ts`, chamado pelo `MixpanelProvider` logo depois de cada `identify` do Mixpanel | `Superwall.identify(user_id do Supabase)` com o MESMO id (não repete se o `appUserId` já é esse). O `Superwall.reset()` roda no logout e no "apagar conta" (`limparIdentidadeSuperwall`, em `clearLocalData`). Necessário porque a integração Superwall → Mixpanel usa o `appUserId` do Superwall como distinct_id |
| Superwall (atributo `mixpanelDistinctId`) | `lib/mixpanel/superwallIdentidade.ts` (`definirMixpanelNoSuperwall`), chamado pelo `MixpanelProvider` | `setIntegrationAttributes({ mixpanelDistinctId })` com o distinct_id ATUAL do Mixpanel: o anônimo logo que o Mixpanel inicia, o user_id depois de cada `identify`, o novo anônimo depois de cada `reset`. Reaplicado depois do `Superwall.identify` e do `Superwall.reset()` (que podem limpar os atributos). É o que faz os `sw_*` da compra feita ANTES do cadastro caírem no perfil anônimo que o `identify` do cadastro depois liga à conta |
| Id da conta na compra | SDK do Superwall | **iOS:** o SuperwallKit manda o `appUserId` como `appAccountToken` da compra quando ele é um UUID (o id do Supabase é) — `IdentityManager.appAccountToken`, sem código nosso. **Android:** `passIdentifiersToPlayStore: true` nas opções do `SuperwallProvider` (`app/_layout.tsx`). ⚠️ A compra do onboarding acontece ANTES do cadastro: vai com o id anônimo do Superwall, que o servidor liga à conta depois (`lib/assinaturaServidor.ts`) |
| Session Replay | `lib/mixpanel/sessionReplay.ts` | Inicia depois do Mixpanel principal (fila esvaziada), mesmo token e mesmo distinct_id. Ordem: `identify` no principal, DEPOIS no Session Replay; depois do `reset`, o novo id anônimo vai para o Session Replay |
| Id do onboarding anônimo | — | `first_open`, o onboarding e o paywall ficam no id anônimo do aparelho; o `identify` do cadastro (ou do login) liga esse id à conta. **Não há `reset()` nem troca de id entre o `first_open` e o cadastro** — só no logout e no "apagar conta". A junção do histórico anônimo depende da configuração de ID Merge do projeto no Mixpanel |

## Perfil da usuária (people)

| Propriedade | Tipo | Quando | Onde |
|---|---|---|---|
| `usuario_interno` | set | Abertura do app (`__DEV__`) e todo identify (e-mail em `EMAILS_INTERNOS` ou `__DEV__`) | `lib/mixpanel/perfil.ts` |
| `first_seen` | set_once (ISO) | 1ª abertura da instalação e todo identify | `lib/mixpanel/perfil.ts` |
| `$email` | set | identify | `identificarSessao` |
| `$name` | set | identify (lê `users.nome` uma vez por abertura) | `identificarSessao` |
| `plano` | set | resultado do portão de acesso (ver a regra abaixo) | `ligarPlanoMixpanel` |
| `onboarding_concluido_em` | set_once (ISO) | `onboarding_completed` | `perfilOnboardingConcluido` |
| `scans_total` | increment +1 | `scan_completed` com `contexto: 'app'` | `perfilScanConcluido` (`loading-dentro-app.tsx`) |
| `skin_score_atual`, `skin_type` | set | idem | idem |
| `nivel`, `sequencia_atual` | set (só quando muda) | estado das cartas chega | `perfilNivelSequencia` (`lib/cartasServidor.ts`) |

**Regra do plano (fonte: o portão de acesso — a mesma regra que libera o app):**
- `subscriptionVerified` (store) ou `useAcesso.estado = 'assinante'` → `trial` ou `pago`. Os dois só viram "sim" depois do `confirmPremium` (Superwall → servidor → RevenueCat de reserva) ou de compra/restauração confirmada no paywall/cadeado. **Trial × pago:** `trial` se o comprovante da Apple (JWS lido pelo `expo-iap`) tem oferta de teste grátis válida (`offerDiscountType = FREE_TRIAL`, ou oferta de introdução de preço 0) ou se este aparelho viu a compra com trial / `freeTrialStart` e o teste ainda não acabou (`mx:trial_ate`); senão `pago`.
- `useAcesso.estado = 'convidada'` → `convidada`.
- `useAcesso.estado = 'sem_acesso'` → `expirado` se este aparelho já viu acesso de assinante (`mx:ja_assinou`); senão `free`.
- Portão ainda sem resposta: **com conta logada**, nada é publicado (vale o `plano` gravado na sessão anterior); **sem conta** (onboarding anônimo, quando não há portão), decide o status do Superwall (ACTIVE → trial/pago; INACTIVE → free/expirado).
- Depois de `purchase_completed`/`trial_started`, o plano muda na hora e, por 10 min, só `trial`/`pago` o substituem.
- ⚠️ `expirado` é por aparelho (numa instalação nova, quem venceu aparece como `free`).
- Em dev, cada troca aparece no Metro como `[MIXPANEL] plano = … (portão: …)`.

**Confirmar o perfil:** em build de desenvolvimento o log do SDK nativo fica ligado (`setLoggingEnabled(__DEV__)`, `lib/mixpanel/mixpanelClient.ts`). No console do Xcode (ou `devicectl … --console`), cada envio do perfil aparece como `https://api.mixpanel.com/engage/?ip=1` seguido de "Successfully deleted rows from table …_people". Se o servidor recusar algo, aparece "api rejected some items": o SDK apaga a fila mesmo assim, sem tentar de novo. O envio acontece a cada 60 s ou quando o app vai para o segundo plano.

## Eventos

### App e navegação

| Evento | Quando dispara | Propriedades | Arquivo |
|---|---|---|---|
| `first_open` | 1ª abertura da instalação (flag `mx:first_open_em` no AsyncStorage) | — | `lib/mixpanel/perfil.ts` (`registrarFirstOpen`) |
| `app_opened` | Abertura do zero e volta depois de **30 s ou mais em segundo plano** (`background`; só `inactive` — central de notificações, folha de compra, Face ID — não conta) | `origem`: `cold` \| `foreground`; `segundos_fora` (só no foreground) | `app/_layout.tsx` |
| `Screen Viewed` | Mudança de rota (telas da pilha e de fora do app) | `screen_name`, `pathname`, `modo?`, `q?` | `lib/mixpanel/useScreenTracking.ts` |
| `Screen Viewed` (aba) | Cada foco de aba (home, protocolo, produtos, chat, grupos, perfil) | `screen_name`, `pathname`, `aba: true` | `useAbaVista` nas 6 abas |
| `erro_tela` | ErrorBoundary da raiz ou de uma aba | `tela`, `nome`, `mensagem` | `app/_layout.tsx`, `components/ErroAba.tsx` |
| `nav_folha_reparada` | O vigia da pilha consertou uma 2ª cópia do app | `telas` | `app/_layout.tsx` |
| `push_aberto` | Toque numa notificação | `tipo`, `kind`, `dia` | `lib/pushToque.ts` |
| `atualizacao_aviso_visto` / `_atualizar` / `_agora_nao` | Aviso de versão nova | `instalada`, `loja` | `components/AvisoAtualizacao.tsx` |

### Onboarding

| Evento | Quando dispara | Propriedades | Arquivo |
|---|---|---|---|
| `onboarding_started` | Entrada no grupo `(onboarding)` (1×) — também abre o `timeEvent('onboarding_completed')` | `onboarding_version`, `total_steps` | `app/(onboarding)/_layout.tsx` |
| `onboarding_step_viewed` / `onboarding_step_completed` | Cada passo do funil (`OB_STEPS`) | `step_number`, `step_name`, `step_total`, `onboarding_attempt` + campos da tela | telas do onboarding, `components/onboarding/passo.ts` |
| `onboarding_completed` | Fim do onboarding: conta criada com premium (`cadastro`), convidada sem premium (`convidada`) ou boas-vindas já logada (`conta_logada`) | `onboarding_version`, `passos_total`, `caminho`, `$duration` (SDK) | `app/(onboarding)/signup.tsx`, `lib/onboardingObrigatorio.ts` |
| `avaliacao_onboarding` | "Seu caminho", 2 s depois da entrada | `decisao`, `storefront`, `regiao`, `chave`, `versao`, `build`, `plataforma` | `lib/avaliacaoOnboarding.ts` |
| `conta_sem_onboarding_vista` / `_comecou` | Tela rosa de conta sem onboarding | `conta` | `app/(onboarding)/conta-sem-onboarding.tsx` |
| `login_sem_onboarding` | Login em conta sem onboarding | `conta`, `origem` | `lib/onboardingObrigatorio.ts` |
| `onboarding_refeito_concluido` | Fim das boas-vindas já logada | — | `lib/onboardingObrigatorio.ts` |
| `rotina_tentou_de_novo` / `rotina_seguiu_para_o_app` | Tela de espera da rotina | `tentativa`, `motivo(s)`, `tentativas` | `app/(onboarding)/loading-rotina.tsx` |
| `rotina_nao_salva` / `rotina_adiada` / `rotina_recuperada` / `rotina_desistiu` | Compra sem rotina pronta | `tentativa`, `falhas` | `lib/concluirCompra.ts`, `app/index.tsx` |
| `codigo_tela_vista` / `codigo_digitado` / `codigo_pulado` | Tela do código do grupo | `resultado`, `origem` | `app/(onboarding)/codigo-grupo.tsx` |

### Boas-vindas pós-compra

| Evento | Quando dispara | Propriedades | Arquivo |
|---|---|---|---|
| `bv_tela_vista` | Cada tela `bv-*` (único evento de visualização) | `tela` (pathname), `numero` (1–8), `nome`, `dor` (telas 2 e 4) | `components/boasVindas/kit.tsx` |
| `boas_vindas_foto` | Foto tirada ou pulada | `tirou` | `bv-foto.tsx` |
| `boas_vindas_pacto` | Pacto selado | `selado_em` | `bv-pacto.tsx` |
| `boas_vindas_lembrete` | Liga/desliga lembrete | `ativo` | `bv-sequencia.tsx` |
| `boas_vindas_concluidas` | Fim das boas-vindas | — | `bv-nivel.tsx` |
| ~~`boas_vindas_tela`~~ | **Desativado em 25/nov/2026** (duplicava `bv_tela_vista`) | — | — |

### Conta

| Evento | Quando dispara | Propriedades | Arquivo |
|---|---|---|---|
| `login_viewed` | Tela de login aberta (1× por montagem) | — | `app/(onboarding)/login.tsx` |
| `user_logged_in` | Login com sucesso | `method`: `email` \| `google` \| `apple` | `app/(onboarding)/login.tsx` |
| `signup_completed` | Conta criada (logo depois do `identify`); por e-mail com confirmação pendente, sai ainda anônimo | `method`: `email` \| `google` \| `apple`, `confirmacao_pendente?` | `app/(onboarding)/signup.tsx` |
| `logout` | "Sair da conta" (antes do `reset`, fica no perfil da conta) | — | `hooks/useAuth.ts` (`signOut`) |
| `conta_apagada` | Conta apagada com sucesso (antes do `reset`) | — | `hooks/useAuth.ts` (`deleteAccount`) |
| `notif_permissao` | Resposta a um pedido de permissão de notificação (já concedida antes não gera evento) | `resultado`: `concedida` \| `negada`, `origem`: `onboarding` \| `perfil` \| `onboarding_antigo`, `pop_up` (o sistema ainda mostraria o pop-up) | `lib/notifications.ts` (`askPushPermission`) |
| `convidada_conta_criada` | Conta da convidada sem premium | `grupo_id` | `app/(onboarding)/signup.tsx` |

### Paywall e compras (Superwall)

Todos os eventos desta tabela, exceto os de cupom e de pergunta, saem de `lib/mixpanel/superwallBridge.tsx` (ouvinte global dos eventos do Superwall 1.0.9). Propriedades do paywall em todos: `placement`, `paywall_id`, `paywall_name`, `experiment_id`, `variant_id`. Propriedades do produto: `product_id`, `periodo` (`mensal` \| `anual` \| `semanal`), `preco`, `moeda`. ⚠️ O período se chama `periodo`, não `plano`: `plano` é a super property (`free`/`trial`/`pago`/`convidada`/`expirado`) e uma propriedade do evento com o mesmo nome a sobrescreveria. Até 25/nov/2026 esses eventos saíam com `plano = mensal/anual`.

| Evento | Quando dispara | Propriedades extras |
|---|---|---|
| `paywall_viewed` | Cada abertura real de um paywall (`paywallOpen`) — inclusive downsell, cupom e convidada | `screen: 'superwall'` + paywall |
| `paywall_closed` | Paywall fechado (`onPaywallDismiss`) | `motivo`: `comprou` \| `restaurou` \| `x` \| `proximo_paywall` \| `fechou`, `close_reason` |
| `transaction_started` | Folha da Apple aberta | paywall + produto |
| `purchase_completed` | Compra concluída (`transactionComplete`) — **inclusive a que começa com trial** | `fonte: 'superwall'`, `tipo` (`SUBSCRIPTION_START` \| `FREE_TRIAL_START` \| `NON_RECURRING_PRODUCT_PURCHASE`), **`com_trial`** + paywall + produto |
| `trial_started` | Início de teste grátis (`freeTrialStart`, logo depois do `transactionComplete` da mesma compra) | paywall + produto |
| `transaction_abandoned` | Desistiu na folha da Apple | paywall + produto |
| `transaction_failed` | Compra falhou | `erro` (até 200 caracteres) + paywall |
| `purchase_restored` | Restauração | `fonte: 'superwall'`, `restore_type` + paywall |
| `coupon_viewed` | Tela do cupom aberta (`promo-cupom.tsx`, 1× por montagem) | — |
| `assinatura_pergunta_vista` / `_usou` / `_recusou` | Pergunta "Você já tem uma assinatura" (`paywall-soft.tsx`) | `com_sessao`, `outra_conta` |
| `coupon_button_tapped` / `coupon_applied` / `coupon_rejected` / `coupon_error` | Cupom (`paywall-soft.tsx`, `promo-cupom.tsx`) | `codigo`, `motivo`, `status` |

> **Compra paga = `purchase_completed` com `com_trial = false`.** Numa compra com trial, o SuperwallKit manda `transactionComplete` (type `FREE_TRIAL_START`) e em seguida `freeTrialStart` (conferido em `ios/Pods/SuperwallKit/.../TransactionManager.swift`, `trackTransactionDidSucceed`): a mesma compra gera `purchase_completed { com_trial: true }` e `trial_started`. ⚠️ No StoreKit 2 o SDK marca `FREE_TRIAL_START` para QUALQUER oferta de introdução (`transaction.offer != nil`), não só teste grátis.
>
> **Conversão do trial em pago NÃO sai do app:** ela acontece na renovação, na Apple, sem o app aberto, e o SDK do Superwall não emite evento para isso (o `subscriptionStart` é a compra paga direta, não a conversão). Vem dos eventos `sw_*` do servidor do Superwall (seção abaixo).
>
> ⚠️ Até 25/nov/2026, `paywall_viewed` saía do corpo da `paywall-soft` (a cada render, inflado) com `screen: 'soft'`, e havia eventos `purchase_*` (com `plan`) que nunca dispararam. Comparar períodos com cuidado.

### Convidada

| Evento | Quando dispara | Propriedades | Arquivo |
|---|---|---|---|
| `convidada_paywall_aberto` / `_fechado` | Paywall da convidada | `origem` | `paywall-soft.tsx`, `components/trava/AvisoCadeado.tsx` |
| `convidada_assinou` | Assinou pelo cadeado | `origem` | `AvisoCadeado.tsx` |
| `convidada_cadeado_tocado` | Tocou num cadeado | `funcao` | `AvisoCadeado.tsx` |
| `convidada_carta_especial` | Carta especial da convidada | `tipo`, `numero_checkin` | `app/(carta)/carta.tsx` |
| `convidada_perdeu_acesso` / `assinante_virou_convidada` | Mudança de acesso | `motivo` / `estado` | `lib/acesso.ts` |

### Scans

| Evento | Quando dispara | Propriedades | Arquivo |
|---|---|---|---|
| `scan_started` | Início do scan de rosto: botão da home/Rotina/boas-vindas (`hooks/useFaceScan.tsx`) ou "Abrir câmera" do tutorial do onboarding (`scan-prep.tsx`) | `contexto`: `app` \| `onboarding`, `origem`: `home` \| `rotina` \| `boas_vindas` \| `tutorial`, `tutorial` (app: vai passar pelo tutorial) | `hooks/useFaceScan.tsx`, `app/(scan)/scan-prep.tsx` |
| `camera_aberta` | Câmera do scan de pele aberta (1× por montagem) | `tipo: 'pele'`, `contexto`: `app` \| `onboarding` | `app/(scan)/camera.tsx` |
| `resultado_visto` | Relatório do scan de pele aberto (1× por montagem) | `contexto`: `app` \| `onboarding`, `skin_score`, `achados` | `app/(scan)/resultado-scan.tsx` |
| `scan_completed` | Análise de pele pronta | `contexto`: `onboarding_rapida` (com `analise`, `idade_pele`, `problema`, `intensidade`) \| `app` \| `onboarding_completa` (com `skin_score`, `skin_type`) | `analisando-foto.tsx`, `loading-dentro-app.tsx`, `loading.tsx` (fora do fluxo) |
| `scan_failed` | Análise de pele falhou | `contexto`, `error` | idem |
| `scan_nao_salvo` | Scan do app analisado mas não gravado | `error` | `loading-dentro-app.tsx` |
| `food_scan_completed` / `food_scan_failed` | Refeição | `meal_score`, `meal_label` / `error` | `app/(scan)/food-report.tsx` |
| `product_scan_completed` / `product_scan_failed` | Produto | `origem`, `status`, `compatibilidade`, `veredito` / `error`, `etapa` | `hooks/useProductAnalysis.ts`, `share-product-loading.tsx` |
| `product_camera_aberta` | Câmera do scan de produto aberta | `do_passo` (veio da folha "Escolher produto" da Rotina) | `app/(scan)/product-camera.tsx` |
| `product_resultado_visto` | Resultado do scan de produto (1× por `scan_id`) | `status`, `compatibilidade`, `veredito`, `decisao_rotina`, `do_passo` | `app/(scan)/product-result.tsx` |
| `product_add_estante` | "Adicionar à estante" / "Tenho em casa" (resultado, detalhe dos Escaneados e dos Recomendados) | `origem`: `scan` \| `catalogo`, `compatibilidade` | `hooks/useColecaoToggle.ts` |
| `product_add_rotina` | Produto posto na Minha rotina a partir do produto | `origem`: `resultado_scan` (com `periodo`, `tipo_decisao`) \| `passo_da_rotina` (com `aviso`) \| `estante` (com `fonte_produto`) | `app/(scan)/product-result.tsx`, `components/product/ProdutoEstanteOverlay.tsx` |
| `product_share_received` / `_image_extracted` / `_no_image` / `_blocked_by_modal` | "Compartilhar com o NIKS" | `origem`, `dominio`, `fonte`, `motivo`, `ms`, `tipo` | `ShareIntentBridge.tsx`, `share-product-loading.tsx`, `app/(app)/_layout.tsx` |

### Rotina, cartas e pontos

| Evento | Quando dispara | Propriedades | Arquivo |
|---|---|---|---|
| `rotina_passo_marcado` | Passo marcado no checklist ou concluído no guia passo a passo (os dois ficam fora do caminho único do skincare desde as regras v2 — hoje pouco tráfego) | `periodo`, `posicao`, `fonte`: `checklist` \| `guia` | `app/(app)/(abas)/protocolo.tsx` |
| `rotina_editada` | Edição da Minha rotina pela usuária | `tipo`: `reordenar` (`passos`) \| `remover_passo` \| `criar_passo` (`periodo`, `com_nome`, `dias`) \| `editar_passo` (`com_nome`, `dias`) \| `remover_produto` | `protocolo.tsx`, `components/rotina/PassoSheet.tsx` |
| `rotina_produto_escolhido` | Produto escolhido para um passo | `origem`: `estante` \| `escaneado` \| `catalogo`, `aviso`: `nenhum` \| `leve` \| `forte`, `periodo`, `fonte`: `folha` \| `ver_todos` | `components/rotina/EscolherProdutoSheet.tsx`, `recomendacao-produtos.tsx` |
| `lote_iniciado` | Abriu a câmera do "Montar minha rotina" | `origem`: `chat` \| `tutorial_rotina` \| `guia` | `lib/abrirMontarRotina.ts` |
| `lote_enviado` | Fotos enviadas e lote criado no servidor | `qtd_produtos`, `com_rotulo` | `app/(scan)/lote-revisao.tsx` |
| `lote_concluido` | O app viu o lote pronto (1× por lote; só lotes que terminaram nas últimas 6 h) | `ms` (servidor: criado → concluído), `qtd_produtos`, `identificados`, `fora_da_rotina` | `lib/rotinaLotes.ts` (`buscarLote`, `lotePendente`) |
| `lote_erro` | Falha no envio, teto do dia ou erro no servidor | `qtd_produtos`, `etapa`: `envio` \| `teto_do_dia` \| `servidor`, `ms?` | `lote-revisao.tsx`, `lib/rotinaLotes.ts` |
| `skincare_iniciado` | "Iniciar skincare" na lista | `periodo`, `passos` | `app/(app)/skincare.tsx` |
| `skincare_concluido` | Sessão concluída | `periodo`, `duracao_s`, `passos` | `app/(app)/skincare-sessao.tsx` |
| `carta_recebida` | Carta aparece para raspar (1× por carta) | `origem`, `tipo`, `motivo` | `lib/cartasServidor.ts` |
| `carta_raspada` | Carta raspada | `pontos`, `rara`, `origem`, `tipo` | `lib/cartasServidor.ts` |
| `nivel_subiu` | Subiu de nível ao raspar | `nivel`, `origem` | `lib/cartasServidor.ts` |
| `semana1_recompensa` | Recompensa da 1ª semana | `dia`, `tipo`, `fallback` | `lib/cartasServidor.ts` |

### Chat (NIKS)

Nenhum evento leva o texto da mensagem, da resposta nem as fotos — só tipo, contagem e tamanho (número de caracteres).

| Evento | Quando dispara | Propriedades | Arquivo |
|---|---|---|---|
| `chat_aberto` | Cada foco da aba do chat | `origem`: `home` \| `sos_espinha` \| `outro` | `app/(app)/(abas)/niks-chat.tsx` (origem marcada por `lib/mixpanel/origem.ts`) |
| `chat_mensagem_enviada` | Mensagem enviada no chat comum, ou opção pronta tocada | `tipo`: `texto` \| `foto` \| `opcao_pronta`, `fotos`, `tamanho`, `numero_da_mensagem_na_sessao` (recomeça a cada `chat_aberto`) | `niks-chat.tsx` |
| `chat_resposta_recebida` | Fim da resposta (ou falha) | `ms`, `conversa`: `chat` \| `espinha`, `erro`: `null` \| `http` (`status`) \| `rede` \| `timeout` \| `sem_sessao`, `proposta_rotina`, `tamanho` | `niks-chat.tsx` |
| `chat_mudanca_rotina` | Aprovou/recusou a mudança de rotina proposta | `decisao`: `aprovada` \| `recusada`, `resultado` (`applied`, `rejected`, `not_applied`, `expired`, `falhou`…), `card`: `fixo` \| `mensagem` | `niks-chat.tsx` |

### SOS espinha

| Evento | Quando dispara | Propriedades | Arquivo |
|---|---|---|---|
| `sos_iniciado` | Câmera do SOS aberta | — | `app/(scan)/sos-camera.tsx` |
| `sos_resultado` | Análise pronta | `ms`, `produtos`, `cuidados` (contagens) | `app/(scan)/sos-loading.tsx` |
| `sos_erro` | Análise sem resultado | `ms`, `motivo`: `precisa_foto` \| `limite` \| `erro` | `sos-loading.tsx` |
| `sos_conversa` | Mensagem enviada na conversa de acompanhamento da espinha (no lugar do `chat_mensagem_enviada`) | `tipo`, `fotos`, `tamanho`, `numero_da_mensagem_na_sessao` | `niks-chat.tsx` |

### Compartilhar (Story) e perfil

| Evento | Quando dispara | Propriedades | Arquivo |
|---|---|---|---|
| `share_story_aberto` | Tela da colagem aberta | — | `app/(share)/share-capture.tsx` |
| `share_story_concluido` | Folha de compartilhar do sistema fechada depois de gerar a imagem (o iOS não informa o app escolhido) | `destino: 'folha_do_sistema'`, `fotos` | `app/(share)/share-preview.tsx` |
| `share_salvo_galeria` | Colagem salva na galeria | `fotos` | `share-preview.tsx` |
| `foto_perfil_alterada` | Foto de perfil salva | — | `app/(foto)/ajustar-foto.tsx` |
| `nome_alterado` | Nome salvo em "Seu nome" (também atualiza `$name`) | — | `app/(app)/set-name.tsx` |
| `horario_rotina_alterado` | Horário salvo no Perfil/Alarme | `periodo`: `am` \| `pm`, `horario` (`HH:MM`) | `components/rotina/HorariosRotina.tsx` |

### Evolução

| Evento | Quando dispara | Propriedades | Arquivo |
|---|---|---|---|
| `progresso_visto` | "Seu progresso" aberto | — | `app/(app)/progresso.tsx` |
| `conquistas_visto` | "Suas conquistas" aberto | — | `app/(app)/conquistas.tsx` |
| `caminhada_visto` | "Sua caminhada" aberta | `de` | `app/(app)/caminhada.tsx` |
| `dica_do_dia_vista` | Dica do dia carregada na tela | `ordem` | `app/(app)/dica-do-dia.tsx` |
| `carta_do_dia_vista` | Carta do servidor aberta na tela de raspar (1× por carta) | `origem`, `familia`, `ja_raspada`, `com_destino` | `app/(carta)/carta.tsx` |

### Tutoriais

| Evento | Quando dispara | Propriedades | Arquivo |
|---|---|---|---|
| `tutorial_visto` | Tutorial começou (paradas com alvo na tela) | `qual`: `home` \| `produtos` \| `grupos` \| `rotina` \| `scan_app`, `paradas` | `components/coach/TutorialOverlay.tsx` (`qual`), `components/rotina/RotinaTutorial.tsx`, `app/(scan)/scan-prep-app.tsx` |
| `tutorial_concluido` | Última parada (no dos grupos, o último trecho) / escolha na intro da Rotina / "Abrir câmera" do tutorial do scan | `qual`, `paradas`, `escolha?` (rotina: `escanear` \| `sem_produtos`) | idem |
| `tutorial_pulado` | "Pular" / "Fazer isso depois" (rotina) / voltar no 1º passo do tutorial do scan | `qual`, `parada?`, `paradas`, `escolha?` | idem |

### Grupos

| Evento | Quando dispara | Propriedades | Arquivo |
|---|---|---|---|
| `grupo_criado` | Grupo criado | `banner`, `com_descricao` | `app/(app)/seus-grupos.tsx` |
| `entrar_com_codigo` | Código digitado | `tela`, `resultado` | `seus-grupos.tsx`, `sem-grupo.tsx` |
| `convite_enviado` | Convite compartilhado/copiado | `canal`, `tela` | `convidar-grupo.tsx`, `lib/convite.ts` |
| `convite_aceito` | Entrou por convite | `tipo` | `components/grupos/ConvitePendente.tsx` |
| `checkin_feito` | Check-in publicado | `rotina`, `grupos`, `com_estatisticas`, `com_titulo`, `carta` | `app/(app)/checkin.tsx` |
| `compartilhado` | Rotina/produto/estante compartilhado no grupo | `origem`, `grupos`, `com_foto`, `carta` | `protocolo.tsx`, `product-result.tsx`, `ProdutoEstanteOverlay.tsx` |
| `foto_bloqueada_filtro` | Foto barrada pela moderação | `categoria` | `lib/gruposServidor.ts` |

## Eventos de assinatura do servidor (`sw_*`, integração Superwall → Mixpanel)

Renovação, **conversão do trial em pago**, cancelamento, reembolso, problema de cobrança e expiração **não saem do app**: acontecem na Apple, muitas vezes com o app fechado. Eles chegam ao Mixpanel pelo **servidor do Superwall** (integração Superwall → Mixpanel, configurada no painel do Superwall, fora do repositório), como eventos **`sw_*`** — os nomes e as propriedades são os da integração do Superwall, não definidos aqui.

- **De quem é o evento:** o app manda ao Superwall o atributo de integração **`mixpanelDistinctId`** = o distinct_id atual do Mixpanel (anônimo no início, user_id depois do `identify`, novo anônimo depois do `reset`), e também faz `Superwall.identify(user_id do Supabase)` junto com o `identify` do Mixpanel, com o mesmo id. Assim os `sw_*` caem no mesmo perfil dos eventos do app.
- **Compra anônima (antes do cadastro):** no momento da compra, o `mixpanelDistinctId` é o distinct_id anônimo do Mixpanel deste aparelho (o mesmo do `first_open` e do onboarding); o `identify` do cadastro liga esse perfil anônimo à conta. Isso depende de a integração do Superwall usar o `mixpanelDistinctId` quando ele existe (no lugar do `appUserId`) — conferir no painel/eventos depois da 1ª compra de teste.
- ⚠️ A integração precisa estar ligada no painel do Superwall (com o token do projeto do Mixpanel) — sem isso, nada chega.
- Não confundir com os eventos do app (`purchase_completed`, `trial_started`…, tabela "Paywall e compras"): aqueles são o momento da compra no aparelho; os `sw_*` são o que a loja fez depois.

## Session Replay — o que fica mascarado

Pacote `@mixpanel/react-native-session-replay` **2.1.0** (Turbo Module; nova arquitetura suportada; iOS 15+ — o app é 15.1; sem config plugin: entra por autolinking). Config: `recordingSessionsPercent` **40 para usuárias reais e 100 para `usuario_interno = true`** (cota do plano: 20 mil gravações por mês), `wifiOnly: false`, `autoStartRecording: true`, `enableLogging` só em dev. A porcentagem inicial vem do valor base de `usuario_interno` (build de desenvolvimento ou aparelho do time); se ela só descobre que é interna no `identify` (pelo e-mail), o Session Replay é reiniciado com 100% (vale para a sessão e para as seguintes).

**Regras gerais (todas as telas):**
- **Toda imagem** é mascarada automaticamente (`autoMaskedViews`: Image, Web, Map): fotos de rosto, de produto, de check-in, avatares, banners e a WebView invisível do "Compartilhar com o NIKS".
- **Todo `TextInput`** é mascarado pelo SDK (não dá para desligar): busca, chat, cadastro/login (e-mail e senha), nome, cupom, título do check-in, código do grupo.
- **Texto da interface fica visível** (títulos, botões, opções) — é o que torna o replay útil.
- Áreas extras marcadas à mão com `<Sensivel>` (`components/Sensivel.tsx` → `MPSessionReplayView sensitive`). Sem o módulo nativo no binário, `<Sensivel>` vira uma `View` comum.

| Tela | Mascarado à mão (além das regras gerais) | Arquivo |
|---|---|---|
| Scan de pele (onboarding e app) | Câmera (MediaPipe/Vision/expo-camera), fundo desfocado ao vivo e a malha do rosto (o SVG inteiro do oval) | `app/(scan)/camera.tsx` |
| Resultado do scan (relatório) | Caixa da foto do rosto e as miniaturas recortadas da foto | `app/(scan)/resultado-scan.tsx` |
| Câmera do produto | Prévia da câmera | `app/(scan)/product-camera.tsx` |
| Câmera da refeição | Prévia da câmera | `app/(scan)/food-camera.tsx` |
| Câmera do lote ("Montar minha rotina") | Prévia da câmera | `app/(scan)/lote-camera.tsx` |
| SOS espinha — câmera | Prévia da câmera (frontal) | `app/(scan)/sos-camera.tsx` |
| Boas-vindas — foto | Prévia da câmera (frontal) | `app/(onboarding)/bv-foto.tsx` |
| Rotina — Foto do dia | Prévia da câmera | `app/(app)/(abas)/protocolo.tsx` |
| Check-in — câmera e prévia | Prévia da câmera e a foto tirada (nas duas telas) | `app/(app)/checkin.tsx` |
| Detalhe do check-in | Foto do check-in (as duas variantes) + avatar da autora (via `FotoComMoldura`) | `app/(app)/checkin-detalhe.tsx` |
| Grupo (mural) | Foto de cada item do mural, banner com foto e avatares (via `FotoComMoldura`) | `app/(app)/grupo.tsx` |
| Story — colagem | Câmera da célula e o fundo ao vivo borrado (`CameraMirror`) | `app/(share)/share-capture.tsx` |
| Story — adesivo (share-preview) | Cada foto da colagem (a área inteira da colagem) | `app/(share)/share-preview.tsx` |
| Ajustar foto de perfil | A foto no círculo | `app/(foto)/ajustar-foto.tsx` |
| Perfil | Foto, **nome** e **e-mail** | `app/(app)/(abas)/perfil.tsx` |
| Seu progresso | Foto do topo e as fotos de cada scan | `app/(app)/progresso.tsx` |
| Avatares em qualquer tela (perfil da convidada, grupos, ranking, jornada, check-in) | A foto dentro da moldura | `components/medalhas/FotoComMoldura.tsx` |
| NIKS Chat (inclui a conversa do SOS espinha) | A lista de mensagens inteira (boas-vindas com o nome, mensagens, fotos, respostas, card de mudança de rotina) e o painel "Conversas" (os títulos são o começo da 1ª mensagem) | `app/(app)/(abas)/niks-chat.tsx` |

Fora do mascaramento à mão (só as regras gerais valem): home (a saudação "Olá, <primeiro nome>" fica visível; a foto é imagem), resultado do SOS (texto dos cuidados e produtos), resultado do produto, Rotina, cartas, conquistas e o onboarding (o nome digitado é `TextInput`; o "<nome>, …" dos títulos fica visível).

## Fora do app

- Conversão do trial, renovação, cancelamento e reembolso — eventos `sw_*` do servidor do Superwall (acima), não do app.
