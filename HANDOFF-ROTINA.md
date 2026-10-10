# Handoff: "Minha rotina" feita com os produtos dela

Atualizado em 09/10/2026 (fim do dia). Branch: `newdesign2`. **Todo o trabalho foi commitado na `newdesign2` em 10/10/2026** (commits `744f38b` a `0d1d779`).

A ideia: além da **rotina ideal** (gerada pela IA, tabela `protocolos`), cada usuária tem a **Minha rotina** (tabela `minha_rotina_passos`), que é a que ela faz de verdade. Ela pode editar os passos, escolher produtos da estante, de escaneados ou de recomendados, e um dia vai poder montar a rotina fotografando os produtos que tem em casa.

---

## Regras

- **Não fazer commit** sem o ok do Douglas.
- **Não publicar nada que afete o app em produção** (Edge Function, migração, mudança no banco) sem o ok do Douglas.
- **A rotina ideal salva (`protocolos`) nunca é alterada** por essa feature. A Minha rotina é uma cópia nova.
- A rotina ideal só muda num scan de pele novo. Ela é gerada em 3 caminhos, e os 3 ficam como estão: no cadastro, no 1º scan dentro do app que der certo, e ao abrir a Rotina sem rotina salva.
- Subagentes nunca rodam git.

---

## Decisões já tomadas (respostas do Douglas às 8 perguntas do plano)

1. Um produto recomendado que ela não tem pode entrar num passo. ⚠️ **Substituída depois:** agora **todo produto da rotina vai para a estante**, sem duplicar.
2. Quem já usa o app vê a intro de 3 telas **uma única vez**.
3. O chat altera a **Minha rotina**, sempre com a aprovação dela. A ideal só muda com scan de pele novo.
4. Passos não diários mantêm os dias da semana, que ela pode editar ou liberar para "todo dia". No dia em que o passo não vale, ele some do checklist.
5. No lote, um produto que prejudica a pele dela vai para a estante, marcado como não indicado, com o motivo, e fica fora da rotina.
6. Um passo sem produto aparece no checklist só com o nome e pode ser marcado.
7. Passos criados por ela mostram só o nome, sem instrução da IA.
8. Teto de **1 lote "Montar minha rotina" por dia**. Lote que termina em erro não conta.

Mais duas decisões:
- Na cópia para a Minha rotina, **os passos com retinoide são pulados** para quem está grávida, amamentando ou tentando engravidar.
- O aviso "Sua rotina ideal mudou" aparece **só depois do 1º scan de pele dentro do app**.

---

## Plano em fases

| Fase | O que entrega | Status |
|---|---|---|
| **0. Teste técnico** | Função `montar-rotina-com-produtos` testada com 7 produtos reais | ✅ Feita e aprovada |
| **1. Minha rotina no servidor** | Tabela, cópia da ideal, aba Rotina lendo a Minha rotina, passo concluído marcado pelo código do passo | ✅ Feita e aprovada |
| **2. "Escolher produto"** | Folha com estante, escaneados e recomendados; avisos leve e forte; escanear pela folha | ✅ Feita e aprovada, com ajustes |
| **3. Editar rotina** | Tremor, arrastar, remover, "+ Novo passo", dias da semana | ✅ Feita, com ajustes. **Falta o teste do Douglas nos últimos ajustes** |
| **4. Rotina ideal visível** | Card "Faltam N passos", tela da ideal com ✓ e "Adicionar à minha rotina", aviso "Sua rotina ideal mudou" (só no 1º scan dentro do app) | ✅ Feita e aprovada |
| **5. Scan em lote (só as fotos)** | Frente → rótulo → imagem combinada, pular o rótulo, limite de 7, envio ao armazenamento. | ✅ Feita e aprovada |
| **6. Montar rotina com a IA** | Ligar o app à função, tabela `rotina_lotes`, "Montando sua rotina…", aviso no app e push, teto de 1 lote por dia | ✅ Feita e aprovada (falta o push num iPhone de verdade) |
| **7. Intro de 3 telas** | Primeira abertura da aba, três caminhos, acesso ao "escanear depois". Campo `users.rotina_intro_status`. | ✅ Feita e aprovada |
| **8. Scan avulso + IA lendo a Minha rotina** | "Adicionar à minha rotina" com "Desfazer" no resultado do scan; `analisar-produto` e `niks-chat` lendo e alterando a Minha rotina | ✅ Feita e publicada (09/10). Falta o teste do Douglas. ⚠️ Ver a pendência 1 (sugestões do chat paradas desde a troca de modelo, que não é da Fase 8) |

### O que foi feito em cada fase

**Fase 0:**
- A função `montar-rotina-com-produtos` foi criada e publicada. Ela usa a chave da OpenAI do Supabase e por enquanto **não grava nada no banco**.
- **Teste:** 7 produtos com fotos do Open Beauty Facts, chamados com a conta de teste gestante. A IA leu bem os rótulos, inclusive os redondos e os de letra miúda.
- **1ª rodada:** cortou demais (só 1 de 7 produtos na rotina). Três ajustes no pedido à IA corrigiram isso:
  - os cortes duros valem só para a lista literal;
  - um problema de adequação vira "com ressalva";
  - nunca deixar de fora o único produto de uma categoria essencial.
- **Raciocínio do modelo:** ligado no nível **baixo**, com o resultado:
  - 5 de 7 produtos na rotina e julgamento correto;
  - **23 s e US$ 0,028 (≈ R$ 0,15) por lote**.
  - No nível médio eram 103 s e US$ 0,08, perto do limite de cerca de 150 s.

**Fase 1:**
- Tabela `minha_rotina_passos` com RLS (cada usuária só vê e altera os próprios passos).
- Função `criar_minha_rotina()`:
  - copia a ideal mais recente uma única vez;
  - só **lê** `protocolos`;
  - a marca `users.minha_rotina_criada_em` impede que a cópia seja recriada.
- No app:
  - [lib/minhaRotina.ts](lib/minhaRotina.ts) cria a cópia na 1ª abertura da Rotina e migra os produtos salvos no celular (`savedProducts`) para o servidor;
  - [protocolo.tsx](app/(app)/protocolo.tsx) lê a Minha rotina, e o passo concluído é marcado pelo código do passo;
  - [home.tsx](app/(app)/home.tsx) e [routineReminders.ts](lib/routineReminders.ts) contam os passos da Minha rotina;
  - "O que esperar" e "Como introduzir" continuam vindo da ideal.
- Ajuste: a cópia pula passos com retinoide para grávida, amamentando ou tentando engravidar. É o mesmo detector do `generate-protocol`, agora em SQL, e acertou 14 de 14 casos.

**Fase 2:**
- Folha [EscolherProdutoSheet.tsx](components/rotina/EscolherProdutoSheet.tsx), aberta pelo passo vazio, por "Trocar produto" ou pelo círculo do produto no guia.
- Avisos em [lib/avisoProduto.ts](lib/avisoProduto.ts):
  - **forte:** alerta "Escolher outro / Usar mesmo assim" (retinoide, hidroquinona ou não seguro na gestação, para grávida, amamentando ou tentando engravidar; e alergia);
  - **leve:** texto embaixo do produto.
- "Escanear produto" pela folha manda o produto para a estante e para o passo. O pedido expira em 15 min.
- Saíram o "Salvar na minha rotina" do Recomendado e o atalho da Rotina para Produtos.
- Coluna `product_scan_id`.
- Arquivos novos: [lib/productCategory.ts](lib/productCategory.ts), [lib/escaneados.ts](lib/escaneados.ts) e [lib/productMatch.ts](lib/productMatch.ts).
- Ajustes da folha:
  - as três seções viraram fileiras horizontais com "Ver todos";
  - "Recomendados pra você" mostra todos, com os do passo primeiro quando o passo veio da ideal;
  - "Seus escaneados" esconde o que já está na estante;
  - filtros de categoria em cima da estante e dos recomendados.
- "Ver todos" abre a aba Produtos em **modo escolha**:
  - o da estante abre as próprias prateleiras, com a nota "Toque num produto para usar no passo X";
  - sem arrastar, sem Editar, sem compartilhar, sem carrosséis e sem pílula;
  - [Shelf.tsx](components/product/Shelf.tsx) ganhou o modo "só tocar".

**Fase 3:**
- Modo Editar em [ListaEditavel.tsx](components/rotina/ListaEditavel.tsx):
  - "Editar rotina" liga o modo, e o contador vira "OK";
  - os cards tremem e mostram o x, que remove com confirmação;
  - a alça ≡ arrasta para reordenar;
  - "+ Novo passo" fica no fim da lista.
- Folha [PassoSheet.tsx](components/rotina/PassoSheet.tsx) para criar e editar: nome, dias e produto.
- Coluna `dias`: a cópia lê "(Ter/Qui/Sáb)" do texto da ideal. Passo que alterna dois ativos ("A Seg/Qua/Sex OU B Ter/Qui/Sáb") fica como todo dia.
- Ajustes depois da Fase 3:
  - passo sem produto mostra o ícone da categoria (genérico, de brilho, se não houver categoria);
  - o nome do passo é opcional, mas o passo precisa de nome ou produto, e o card se adapta;
  - "Remover produto" ao lado de "Trocar";
  - **todo produto da rotina vai para a estante, sem duplicar.** Uma migração passou para a estante os produtos dos passos que já tinham produto.

**Ajustes depois da Fase 3 (09/10):**
- **Ícones:** cada categoria tem um desenho próprio, em [StepIcon.tsx](components/rotina/StepIcon.tsx): sérum = conta-gotas, hidratante = pote de creme aberto, protetor = sol, limpeza = frasco com válvula, tônico = garrafinha, olhos = olho, genérico = brilho.
- **Categoria pelo nome primeiro:** a categoria do passo, em [lib/tipoPasso.ts](lib/tipoPasso.ts), olha primeiro o nome e só depois o ingrediente. O "Hidratante Leve" caía em sérum por causa do ácido hialurônico.
- **"Escolher produto" rosa:** abre direto a folha, sem expandir o card.
- **Notificações sem número de passos** ([lib/routineReminders.ts](lib/routineReminders.ts)):
  - **Manhã:** "Seu skincare da manhã está te esperando".
  - **Noite:** "Seu skincare noturno está te esperando".
  - **Título e "ainda dá tempo":** iguais a antes.
  - **Contagem:** o agendamento não conta mais os passos.
  - **Prévia do onboarding:** a tela "Aviso de lembretes" mostra o texto novo da noite.

**Fase 4 (rotina ideal visível):**
- **Card abaixo dos passos (e do "Editar rotina"):** é calculado para o período aberto, Manhã ou Noite. Tocar abre a folha da ideal. Some no modo Editar. Mostra um destes três:
  - "Faltam N passos pra sua pele: A, B e C · Ver rotina ideal ›";
  - "Sua rotina cobre tudo o que sua pele precisa ✓ · Ver rotina ideal ›";
  - "Sua rotina ideal mudou com o novo scan · Ver o que mudou ›".
- **Folha "Rotina ideal"** ([RotinaIdealSheet.tsx](components/rotina/RotinaIdealSheet.tsx)):
  - Manhã e Noite;
  - ✓ "Na sua rotina", com o nome do passo dela quando é outro;
  - **"Adicionar à minha rotina"** nos que faltam;
  - selo **"Novo"** e uma faixa explicando a mudança, quando aberta por "Ver o que mudou".
- **Lógica** ([lib/rotinaIdeal.ts](lib/rotinaIdeal.ts)). A cobertura é calculada pelo texto, um para um, em 3 níveis: mesmo nome → ativo em comum → mesma categoria.
  - **Por que não pelo índice:** o índice guardado em `passo_ideal` não serve depois de um scan novo, porque a ideal vira outra linha.
  - **Grávida, amamentando ou tentando engravidar:** passos com retinoide da ideal não aparecem.
  - **"Adicionar":** copia o passo, sem produto, na posição da ordem da ideal. Lê os dias pela função do banco `dias_do_ingrediente`. A ideal não muda.
  - **Quando o aviso "mudou" aparece:** quando `users.inapp_protocol_regenerated_at` é posterior a `minha_rotina_criada_em` e ela ainda não abriu a ideal.
  - **"Já vi":** fica no aparelho (AsyncStorage), e não no banco, para não precisar de migração. Em outro celular o aviso aparece uma vez a mais.
  - **Selo "Novo":** comparado com a linha anterior de `protocolos`.
- **Sem mudança no banco nem nas funções do servidor.**
- **Testado pelo depurador com a conta de teste, sem gravar nada:**
  - ela cobre todos os passos da ideal, e o adapaleno fica de fora por ela ser gestante;
  - sem Vitamina C e Protetor, os dois aparecem como faltando;
  - um passo dela só com produto de vitamina C cobre pelo ativo;
  - "Meu FPS" cobre o protetor pela categoria;
  - a Vitamina C adicionada entraria logo depois da limpeza.
- **A conta de teste ainda não fez scan de pele dentro do app** (`inapp_protocol_regenerated_at` vazio). O próximo scan dela troca a ideal e liga o aviso "mudou".

**Card da rotina ideal (09/10):**
- **Estado normal:** encostado na borda direita.
- **Toque:** o card desliza para a esquerda até o meio da tela e a folha da ideal sobe junto, num movimento só. Ao fechar, ele volta para o canto.
- **Implementação:** só `translateX` (driver nativo) com mola. A largura é fixa, a do expandido; recolhido, um pedaço fica além da borda.

**Frequência dos passos não diários (09/10):**
- **App** ([lib/frequencia.ts](lib/frequencia.ts) e [protocolo.tsx](app/(app)/protocolo.tsx)):
  - **selo rosa com calendário** abaixo do nome: "3x por semana · Seg, Qua, Sex";
  - **no dia em que o passo não vale:** o card fica apagado e o selo diz "Hoje não · Use só Seg, Qua e Sex", e o passo continua fora do checklist e do guia;
  - **card expandido:** 1ª linha em negrito, "Use só 3 vezes por semana: segunda, quarta e sexta.";
  - **selo comprido:** quebra em 2 linhas em vez de cortar.
- **`montar-rotina-com-produtos` (publicado, v4):**
  - cada produto identificado devolve `uso: { diario, dias }`;
  - cada passo da `rotina` sai com os `dias` do produto;
  - a função normaliza os dias: só Seg…Dom, na ordem, e vazio ou os 7 dias viram `null` (todo dia).
  - **Na Fase 6, o passo criado nasce com esses `dias`.**
- **`analisar-produto` (publicado, v17):**
  - `decisao_rotina` ganha `dias` (null = diário, só em adicionar/substituir), com a mesma normalização;
  - o resultado do scan mostra o chip "3x por semana · Seg, Qua, Sex" ou "Todo dia", ao lado de Manhã/Noite ([ProductAnalysis.tsx](components/product/ProductAnalysis.tsx));
  - análise antiga, sem o campo, fica sem o chip;
  - **na Fase 8, o "Adicionar à minha rotina" usa esses `dias`.**
- **Verificação:** as duas funções passam no `deno check`. O único erro, `EdgeRuntime`, já existia e é do próprio Supabase.

**Fase 5 (scan em lote, só as fotos):**
- **Lógica** ([lib/loteProdutos.ts](lib/loteProdutos.ts)):
  - o lote em montagem fica só na memória (zustand `useLote`), até 7 produtos;
  - `montarProduto` monta a imagem combinada com o Skia: **1024×1536**, frente no terço de cima e rótulo nos 2/3 de baixo, as duas inteiras sobre branco; **sem rótulo, 1024×1024**, só a frente. É o formato testado na Fase 0;
  - antes do Skia, a foto passa pelo ImageManipulator, para a rotação da câmera (EXIF) ficar gravada na imagem;
  - `enviarLote` envia para o bucket `rotina-lotes`, em `{user_id}/{lote_id}/{n}.jpg`. Se um envio falha, apaga o que já subiu daquele lote.
- **Câmera** ([lote-camera.tsx](app/(scan)/lote-camera.tsx)):
  - "Produto N de 7"; foto da frente (moldura quadrada) e depois do rótulo (moldura alta + "Vire o produto e enquadre a lista de ingredientes inteira. Chegue perto, com boa luz e sem reflexo.");
  - "Pular rótulo"; miniaturas dos produtos já fotografados; "Pronto (N)"; no 7º produto, vai direto para a revisão;
  - sair no meio pede confirmação; no simulador, o disparador abre a galeria;
  - `?rotuloDe=<id>` abre direto no rótulo de um produto ("Adicionar foto do rótulo"), sem o "Pular".
- **Revisão** ([lote-revisao.tsx](app/(scan)/lote-revisao.tsx)):
  - grade com as imagens combinadas; tocar abre em tela cheia ("É assim que a IA vai ver esse produto");
  - remover com confirmação;
  - sem rótulo: "Precisão baixa" + "Sem a lista de ingredientes, essa análise é menos exata" + "Adicionar foto do rótulo";
  - "Adicionar outro produto"; com 7: "Você pode adicionar mais depois pela estante";
  - **"Pronto, montar minha rotina"** envia as fotos e mostra "Fotos enviadas". **A IA é simulada**: a Fase 6 troca essa tela pelo "Montando sua rotina…".
- **Entrada PROVISÓRIA:** link "Escanear meus produtos" na Rotina, abaixo do "Editar rotina". O lugar definitivo é a Fase 7.
- **Banco:** migração [20261009170000_rotina_lotes_storage.sql](supabase/migrations/20261009170000_rotina_lotes_storage.sql), com o bucket privado `rotina-lotes` (JPEG, até 5 MB) e as políticas de enviar, ler e apagar só na própria pasta. **Aplicada (09/10).**
- **`delete-account` v7 (publicado):** `rotina-lotes` na lista de buckets + listagem com subpastas.
- **Limpeza de arquivos sem dono:** a lista de buckets fica na função SQL da migração `20261001130000_cleanup_orphan_storage.sql`, e `rotina-lotes` (e `colecao`) não estão nela. Vale uma migração depois.
- **Testado pelo depurador:**
  - imagem combinada do retinoide The Ordinary (1024×1536, rótulo legível) e do Hydro Boost sem rótulo (1024×1024);
  - câmera, etapa do rótulo e revisão abrem certas;
  - depois da migração, o envio de um lote real (2 fotos) funcionou.

**Fase 6 (montar a rotina com a IA):**
- **Fluxo:**
  1. "Pronto, montar minha rotina" envia as fotos: a combinada e, ao lado, `{n}-frente.jpg` só com a frente.
  2. `iniciarLote` chama a função em **modo lote** (`{ caminhos, tem_rotulo }`).
  3. A tela "Montando sua rotina…" acompanha o lote, com "Continuar usando o app".
  4. Quando fica pronto, abre o resultado.
- **Função `montar-rotina-com-produtos` (publicada, v5):**
  - **Na chamada:** valida que os caminhos são da pasta dela e confere o teto (1 lote por dia no fuso de Brasília; erro não conta → 429). Cria a linha em `rotina_lotes` e responde 202 com o `lote_id`.
  - **Em segundo plano (`EdgeRuntime.waitUntil`):**
    1. baixa as imagens e roda a mesma IA e a mesma conferência;
    2. cada produto **identificado** vira um `product_scans` (foto da frente no bucket product-scans; `resultado` no formato do analisar-produto, com `origem: 'montar_rotina'`) e entra na estante (`colecao_produtos`). Se já está lá, com mesma marca e nome (`sameBrand`/`sameName` do `_shared/scanCutout.ts`, agora exportados), reaproveita;
    3. grava `resultado` (com o `colecao_item_id` de cada produto);
    4. **troca a Minha rotina pela montada, automaticamente** (`aplicar_lote_rotina`; se a rotina montada estiver vazia, a atual não é apagada) e só então marca `pronto`;
    5. manda o push "Sua rotina está pronta ✨" (`data: { type: 'rotina_lote', lote_id }`);
    6. faz os recortes sem fundo, um por vez, por último;
    7. se der erro: status `erro` e o push "Não deu para montar sua rotina".
  - **Não identificado:** não vira registro.
  - **"Não indicado" (evitaria):** vai para a estante, e ao ser escolhido num passo o aviso aparece pela regra que já existe (`avaliarProduto`).
  - **Modo direto** (base64, Fase 0): continua, para testes.
- **Banco:** migração [20261009180000_create_rotina_lotes.sql](supabase/migrations/20261009180000_create_rotina_lotes.sql), **aplicada e registrada**:
  - tabela `rotina_lotes`, em que ela lê e marca visto/aplicado, e só a função cria;
  - função `aplicar_lote_rotina(lote)`: numa transação, troca os passos da Minha rotina pelos do lote (origem `ia_produtos`, com o item da estante, os dias e o aviso), marca `minha_rotina_criada_em` e `aplicado_em`.
  - migração [20261009190000_rotina_lotes_aplicar_automatico.sql](supabase/migrations/20261009190000_rotina_lotes_aplicar_automatico.sql), **aplicada e registrada**: a função passa a aceitar o service role (a dona vem do lote), aceita lote ainda `processando` e **não mexe na rotina se a montada estiver vazia**.
- **App:**
  - [lib/rotinaLotes.ts](lib/rotinaLotes.ts): iniciar, buscar, pendente, de hoje, marcar visto, aplicar, tentar de novo;
  - [lote-montando.tsx](app/(scan)/lote-montando.tsx): acompanha a cada 3 s; em erro, "Tentar de novo" com as mesmas fotos;
  - [lote-resultado.tsx](app/(scan)/lote-resultado.tsx): confirmação **"Sua rotina está pronta"** ("…e ela já é a sua rotina"): rotina manhã/noite com produto, instrução, dias e ressalva; "Pra chegar na sua rotina ideal, falta"; "Ficaram de fora" ("Não indicado pra você" + motivo); "Não identificados" com a mensagem combinada; precisão baixa; botão **"Começar"** → Rotina. Nenhum produto serviu → "sua rotina continua como estava";
  - [AvisoLote.tsx](components/rotina/AvisoLote.tsx), no layout do (app): o cartão "Sua rotina está pronta ✨ · Ver" ou o de erro, por cima de qualquer aba. Confere ao abrir e ao voltar ao app, e a cada 5 s enquanto há lote processando. **Trata o toque no push** (inclusive o que abre o app do zero);
  - [lib/notifications.ts](lib/notifications.ts): o push do lote não vira banner do sistema com o app aberto, porque quem avisa é o `AvisoLote`;
  - **link provisório da Rotina** segue o lote de hoje: "Escanear meus produtos" / "Montando sua rotina…" / "Ver a rotina montada com seus produtos" (pronto e ainda não visto) / aviso do teto;
  - revisão: teto atingido → aviso e as fotos enviadas são apagadas do bucket.
- **Decisão (Douglas, 09/10):** quando o lote termina, a rotina montada **substitui a Minha rotina automaticamente**, sem botão e sem confirmação. A tela de resultado é só a confirmação, com "Começar". (Substituiu a decisão anterior, de "Usar essa rotina" com confirmação.)
- **Teste de ponta a ponta (09/10, conta de teste gestante, 5 produtos: Effaclar, CeraVe, ISDIN, retinoide The Ordinary, Hydro Boost sem rótulo):**
  - envio das fotos em cerca de 12 s, análise em 36 s (15 mil tokens);
  - rotina trocada sozinha: manhã com CeraVe + ISDIN (aviso leve), noite com Effaclar (aviso leve) + CeraVe;
  - fora: retinoide ("Não indicado pra você", gravidez) e Hydro Boost (repete o CeraVe);
  - os 5 identificados entraram na estante e os 5 recortes ficaram prontos (Replicate);
  - card da ideal na Rotina: "Falta 1 passo pra sua pele: Sérum de Ácido Salicílico 2%";
  - aviso dentro do app: o cartão apareceu na home e o toque abriu o resultado. Ajuste: o "✨" saiu do cartão, porque a fonte mostrava "?";
  - segundo lote no mesmo dia: recusado (429) sem criar nada;
  - **push:** não testado (o simulador não tem token), e o caminho de erro com "Tentar de novo" também não.
- **Cópia da Minha rotina da conta de teste antes do teste** (8 passos da ideal): `/private/tmp/.../scratchpad/minha_rotina_antes.json`, numa pasta temporária que pode ser apagada.

**Fase 7 (intro de 3 telas):**
- **Quando aparece:** na primeira abertura da aba Rotina, **uma vez por conta**, inclusive para quem já usava o app. É controlada por `users.rotina_intro_status` (null = ainda não viu). Só aparece com a Minha rotina e a ideal carregadas.
- **Componente** [IntroRotina.tsx](components/rotina/IntroRotina.tsx): tela cheia, com as duas telas deslizando e pontinhos de página.
  - **Tela 1:** "Essa é a rotina ideal pra sua pele" / "Montada pela IA a partir da sua análise de pele.", com os passos da ideal de manhã e de noite (ícones de categoria) e "Continuar". Para gestantes, os passos com retinoide não aparecem (mesma regra de `lib/rotinaIdeal`).
  - **Tela 2:** "Você não precisa comprar nada pra começar" / "Me mostra os produtos que você tem em casa e eu monto uma rotina eficaz com eles.", com **Escanear meus produtos** / **Não tenho produtos** / **Fazer isso depois** e a seta para voltar.
  - **Tela 3:** é a "Sua rotina está pronta" da Fase 6 (rotina, o que falta da ideal, "Você pode mudar quando quiser").
- **Escolhas** (gravadas em `rotina_intro_status`):
  - `escanear`: abre a câmera do lote; se já montou hoje, mostra o aviso do teto;
  - `sem_produtos`: fica na rotina ideal com os passos vazios;
  - `depois`: também fica na rotina ideal, e a Rotina mostra no topo dos passos o card **"Monte sua rotina com o que você tem · Escanear meus produtos ›"**, enquanto ela não montar a rotina no dia. Esse é o caminho visível para escanear depois.
- **Link "Escanear meus produtos"** abaixo da lista: deixou de ser provisório e virou a entrada permanente. Some quando o card do "depois" está na tela.
- **Banco:** migração [20261009200000_users_rotina_intro_status.sql](supabase/migrations/20261009200000_users_rotina_intro_status.sql), **aplicada e registrada**: coluna `users.rotina_intro_status` (`escanear` / `sem_produtos` / `depois`, ou null).
- **Testado no simulador:**
  - a intro abriu na Rotina da conta de teste e as duas telas aparecem certas (corrigi a largura das páginas e o rodapé da tela 1);
  - "Fazer isso depois" gravou `depois`;
  - o card aparece no topo dos passos (conferido ignorando por um instante o lote de hoje, depois desfeito).
  - **A conta de teste voltou para "ainda não viu"**, para o Douglas ver a intro.

**Fase 8 (scan avulso + IA lendo e alterando a Minha rotina):**
- **Regra de compatibilidade:** só quem tem `users.minha_rotina_criada_em` (a build nova criou a cópia) passa a ter o chat e a análise de produto lendo e alterando a **Minha rotina**. Para todos os outros, inclusive quem usa o app das lojas, tudo continua na **rotina ideal** (`protocolos`), exatamente como antes.
- **[`_shared/minha-rotina.ts`](supabase/functions/_shared/minha-rotina.ts) (novo):**
  - `temMinhaRotina`;
  - `lerMinhaRotina`: a Minha rotina no formato de passo que o chat e a análise já usam. Cada passo leva `_rowId`, o produto da estante e os dias no texto do ingrediente;
  - `gravarMudanca`: aplica o resultado de `applyProposal` (as **mesmas travas clínicas** de hoje). Mantém os passos que não mudaram, apaga os que saíram, cria os que entraram (origem `chat`, sem produto, com os dias) e renumera.
- **`analisar-produto` (publicado, v18):**
  - o contexto lê a Minha rotina quando existe;
  - cada passo vai para a IA com `[passo_id: …]`;
  - `decisao_rotina` ganha `depois_do_passo_id` e `substitui_passo_id`, que a função confere contra os passos dela (código desconhecido vira null);
  - `buildContext` ganhou `{ rotina: 'auto' | 'ideal' }`. O `montar-rotina-com-produtos` pede `'ideal'`, para continuar recebendo a rotina ideal no `<IdealRoutine>`.
- **`niks-chat` (publicado, v43):**
  - o contexto lê a Minha rotina quando existe;
  - a aprovação por texto (`protocol-actions.ts`) grava na Minha rotina por `gravarMudanca`.
- **`approve-coach-protocol-change` (publicado, v20):** a aprovação pelo cartão grava na Minha rotina e responde `{ success, action: 'applied', rotina: 'minha_rotina' }`.
- **Banco:** migração [20261009210000_minha_rotina_origem_chat.sql](supabase/migrations/20261009210000_minha_rotina_origem_chat.sql), **aplicada e registrada**. A origem `chat` passa a ser aceita nos passos.
- **App:**
  - [lib/adicionarDoScan.ts](lib/adicionarDoScan.ts) (novo): "Adicionar à minha rotina".
    - **Adicionar:** cria o passo no período sugerido (am, pm ou os dois), logo depois do `depois_do_passo_id`; sem ele, **antes do primeiro passo de categoria posterior** (passo sem categoria, como "Máscara de LED", não conta).
    - **Substituir:** troca o produto do passo indicado; se não achar, vira adicionar.
    - **Também:** usa os `dias` sugeridos, põe o produto na estante e calcula o aviso.
    - **Desfazer:** apaga os passos criados, devolve o produto trocado, tira da estante só o que entrou agora e renumera.
    - **Leitura enxuta** dos passos (sem fotos assinadas): o toque leva cerca de 3 s.
  - [ProductAnalysis.tsx](components/product/ProductAnalysis.tsx): no card "Sobre a sua rotina", o botão **"Adicionar à minha rotina"** (ou "Trocar na minha rotina"), que vira "✓ Na sua rotina". Só aparece quando a sugestão é adicionar ou substituir.
  - [product-result.tsx](app/(scan)/product-result.tsx):
    - o botão não aparece quando o scan veio da folha "Escolher produto";
    - **aviso forte pede confirmação**;
    - sem Minha rotina ainda, cria a cópia antes;
    - aviso escuro acima do botão da estante: "Adicionado à sua rotina da manhã, depois do hidratante · **Desfazer**" (8 s).
  - [niks-chat.tsx](app/(app)/niks-chat.tsx): depois de aprovar uma mudança, invalida `minharotina`, `protocolo` e `rotinaideal`.
- **Testado no simulador** (com uma sugestão de exemplo, sem IA, sobre o Hydro Boost da conta de teste):
  - "Hidratante leve" entrou em 3º, entre o hidratante e o protetor;
  - o aviso dizia "depois do hidratante";
  - o "Desfazer" removeu o passo e renumerou;
  - a rotina da conta foi deixada como estava.
- **Testes depois da publicação (09/10, conta de teste):**
  - **`analisar-produto`:** responde sem erro (9 a 11 s) com `depois_do_passo_id`/`substitui_passo_id` na resposta. Os dois produtos testados (Centella Ampoule e um sérum de niacinamida 10%) deram "manter a rotina" para a conta gestante, porque a IA só sugere "adicionar" quando cobre uma prioridade. **O `depois_do_passo_id` preenchido pela IA ainda não foi visto**;
  - **chat lendo a Minha rotina:** numa conversa nova, "quais os passos da manhã?" listou exatamente a Minha rotina (limpeza, hidratante, protetor, máscara de LED);
  - **chat sem Minha rotina** (marca apagada por um instante e restaurada): listou a rotina ideal, como antes;
  - **aprovação gravando na Minha rotina:** sugestão de teste "add Sérum de Vitamina C, manhã" criada direto no banco e aprovada pelo `approve-coach-protocol-change` → `applied`, passo criado com origem `chat`, **entre a limpeza e o hidratante**; a rotina ideal não mudou;
  - **trava clínica:** "remover o protetor" → recusado (`protected-step:Proteção`);
  - **ficou na conta de teste:** o passo "Sérum de Vitamina C" (origem chat) na manhã, e dois produtos escaneados novos (Centella e niacinamida Aroma Zone). As conversas de teste foram apagadas.
- **Versões anteriores (para voltar, se precisar):** `analisar-produto` v17, `niks-chat` v42 e `approve-coach-protocol-change` v19, baixadas em `/private/tmp/.../scratchpad/no-ar8` (pasta temporária).
- **Versões no ar baixadas e comparadas (09/10):** as únicas diferenças são as da Fase 8, e em `_shared/scanCutout.ts` só o `export` de `sameBrand`/`sameName`.

**Correção do fluxo de mudança de rotina pelo chat (09/10, plano aprovado em 4 etapas):**
- **Diagnóstico** (caso real de 28/09 + logs da função):
  1. **Cartão invisível + "já tem uma sugestão aguardando":** o app procurava a sugestão por só 4 s e ela era gravada depois (após a extração de memórias). Presa à última bolha, sumia quando essa bolha vinha vazia. Com uma pendente, nenhuma proposta nova nascia por 24 h, e o pedido à IA mandava dizer literalmente "Já tem uma sugestão aguardando…".
  2. **Balão em branco:** a IA respondia só com o bloco escondido. Cortado o bloco, a mensagem ficava vazia (cerca de 60 em 30 dias).
  3. **"Atualizei" sem aplicar:** com o cartão, o "sim" por texto não faz nada, mas a IA não sabia e afirmava a mudança. No app sem cartão, o "pode" aprovava a pendente mais antiga (até de outro período).
  4. **Período errado:** pendente velha da manhã + um único campo de período + alvo achado pela categoria.
  5. **Vários produtos num passo:** o formato só permitia um passo e proibia "rotina inteira", então a IA espremia três produtos num passo (está no banco, 28/09).
  6. **gpt-5.4-mini:** a frase sem o bloco (log `phrase-without-block`).
- **Etapa 1 — servidor (publicado: `niks-chat` v46):**
  - a IA chama a **ferramenta `propor_mudanca_rotina`** (tool calling da OpenAI), em [`niks-chat/proposta.ts`](supabase/functions/niks-chat/proposta.ts) e [`model.ts`](supabase/functions/niks-chat/model.ts). O bloco antigo continua como reserva;
  - a sugestão é gravada **antes de a resposta terminar** (no `flush` do stream), depois de validada, **testada na rotina atual** (proposta que falharia nem vira cartão) e passada pela **trava de gravidez**;
  - a proposta nova **substitui** a pendente (status `superseded`);
  - a pendente com +24 h é **expirada de verdade**;
  - **app novo** (`rotinaV2: true`): recebe `[[SUGESTAO:<id>]]` no fim da resposta;
  - **app das lojas:** o servidor acrescenta "Posso incluir isso no seu protocolo?" se faltar;
  - **resposta sem texto:** linha que descreve a proposta. Sem nada: "Me perdi aqui…". **Recusada:** o motivo em linguagem simples;
  - **pedido à IA:** saiu o contrato do bloco e a regra "resolva a pendente primeiro"; entrou a **regra de ouro** (nunca dizer que alterou; "sim" por texto → "toque em Aprovar"); `<UltimaMudanca>` com o que de fato aconteceu; passos com `[passo_id]`;
  - aprovação por texto só no app **sem** cartão e só de sugestão de até 30 min.
- **Etapa 2 — trocar o período inteiro** (`replace_period`, só app novo), em [`_shared/protocol-write.ts`](supabase/functions/_shared/protocol-write.ts):
  - lista de passos, um produto por passo, com as travas sobre a lista inteira: ativo proibido de manhã, ativo repetido, limpeza/hidratante/protetor que o período tinha continuam, protetor por último de manhã;
  - **passo por código** (`target_id`) em remove/replace;
  - recusa de **vários produtos num passo** (`pareceVariosProdutos`);
  - na Minha rotina ([`_shared/minha-rotina.ts`](supabase/functions/_shared/minha-rotina.ts)), passo novo equivalente a um antigo **mantém o produto** (e o aviso).
- **Endpoint de aprovação (publicado: `approve-coach-protocol-change` v21):** aplica `replace_period` e grava na conversa a **confirmação verdadeira** ("Pronto, sua rotina da manhã foi atualizada ✓" ou o motivo de não ter aplicado), devolvida em `mensagem`.
- **Banco:** migração [20261009220000_coach_suggestions_superseded.sql](supabase/migrations/20261009220000_coach_suggestions_superseded.sql), **aplicada e registrada**: o CHECK de status ganhou `superseded`. A tabela foi criada fora das migrations e o CHECK original barrava a substituição.
- **Etapa 3 — app** ([niks-chat.tsx](app/(app)/niks-chat.tsx), só local):
  - manda `rotinaV2: true` e lê o código da sugestão no fim da resposta (o marcador nunca aparece na tela);
  - **cartão fixo** no fim da conversa, também com a conversa vazia, buscado a cada foco, de qualquer conversa dela;
  - cartão com o **período em destaque** ("ROTINA DA NOITE") e a **lista de passos** no `replace_period`;
  - depois de decidir, entra a confirmação do servidor (como mensagem; com a conversa vazia, no lugar do cartão);
  - sugestão já substituída → recarrega a certa.
- **Etapa 4 — testes (09/10, conta de teste):**
  - app das lojas (sem Minha rotina, simulado): resposta termina com a frase e a sugestão é gravada na hora;
  - app novo: código no fim da resposta;
  - troca de período: o pedido da noite gerou proposta da noite;
  - nova substitui pendente (3 → `superseded`);
  - "Sim, pode" → "É só tocar em Aprovar…"; "Já atualizou?" → "Ainda não…";
  - **manhã inteira** (4 passos) aprovada pelo endpoint: passos separados e na ordem, CeraVe e ISDIN mantidos, LED saiu;
  - **noite inteira** aprovada pelo **cartão no simulador**: 4 passos, Effaclar e CeraVe mantidos, azelaico Seg/Qua/Sex, confirmação na tela;
  - **inclusão de 1 passo** aprovada pelo cartão: niacinamida entre a limpeza e o hidratante.
  - **A rotina da conta de teste mudou com esses testes.** Ela agora é o resultado das trocas (manhã: limpeza, vitamina C, hidratante, protetor; noite: limpeza, niacinamida, azelaico, hidratante). A cópia de antes está em `scratchpad/rotina_antes_etapa1.json` (pasta temporária).
- **Ajustes (09/10, `niks-chat` v48):**
  - quando a NIKS recomenda NÃO fazer o que ela pediu, explica e termina com "Quer que eu tire/inclua/troque mesmo assim?", sem chamar a ferramenta. Se ela confirmar, aí sim propõe com o cartão. A regra está no pedido à IA **e na descrição da ferramenta**, porque só no pedido o modelo ainda chamava a ferramenta direto;
  - o texto do cartão (`reason`) fala direto com ela, curto: "Você pediu para tirar o ácido azelaico da sua rotina da noite.";
  - na remoção, o campo "ingrediente" ficou opcional (a IA às vezes manda só o nome e o código do passo, e a validação recusava);
  - testado: "Quero tirar o ácido azelaico da noite" → "Eu evitaria tirar… Quer que eu tire mesmo assim?" → "Sim" → cartão com o código certo do passo. **Ficou uma sugestão pendente na conta de teste** (tirar o azelaico da noite): aprovar remove o passo, recusar mantém.
- **Versões anteriores para voltar, se precisar:** `niks-chat` v43 (`scratchpad/backup-v43`) e `approve-coach-protocol-change` v20 (`scratchpad/backup-approve-v20`), em pasta temporária.

---

## O que está publicado no Supabase (produção) e o que está só local

### ✅ Publicado

| O quê | Situação |
|---|---|
| `montar-rotina-com-produtos` **v5** | **Modo lote (Fase 6)** publicado: lote em `rotina_lotes`, segundo plano, estante, troca automática da rotina, push e recortes. Testado de ponta a ponta. |
| `montar-rotina-com-produtos` v4 (histórico) | Publicada, com raciocínio "baixo" + **frequência** (`uso` por produto e `dias` por passo). O app **ainda não chama** a função, então nenhuma usuária é afetada. Registrada em `supabase/config.toml`, e a própria função confere o login. Teste real (09/10): glicólico entrou à noite em Seg e Qui; Hydro Boost diário. |
| `analisar-produto` **v17** | Publicado com a **frequência** em `decisao_rotina.dias` (null = diário, só em adicionar/substituir). A versão no ar foi baixada e comparada: a única diferença era a frequência. Mantido sem verificação no portão, como antes. Teste real: respondeu em 10 s, com `dias` presente. Ele gravou um produto escaneado (ácido glicólico) na conta de teste. |
| `delete-account` **v7** | Publicado com `rotina-lotes` na lista de buckets e a **listagem que entra em subpastas** (as fotos do lote ficam em `{user_id}/{lote_id}/{n}.jpg`; a versão anterior pulava subpastas e não as apagaria). Sem pasta no bucket = lista vazia, sem erro: a exclusão segue igual para quem nunca usou o lote. Testado: a listagem recursiva achou as 2 fotos de um lote real, e a pasta inexistente voltou vazia. Mantida a verificação no portão (401 sem login). |
| Migração `20261009180000_create_rotina_lotes.sql` | Aplicada e registrada (Fase 6): tabela `rotina_lotes` + função `aplicar_lote_rotina`. |
| `analisar-produto` **v18**, `niks-chat` **v43**, `approve-coach-protocol-change` **v20** | Fase 8: leem e alteram a Minha rotina para quem tem (`minha_rotina_criada_em`); os demais seguem na ideal. Testados (ver Fase 8). |
| `niks-chat` **v46** e `approve-coach-protocol-change` **v21** | Correção do fluxo de mudança pelo chat (ferramenta, sugestão antes do fim da resposta, substituição, `replace_period`, confirmação verdadeira). Testados. |
| Migração `20261009220000_coach_suggestions_superseded.sql` | Aplicada e registrada: status `superseded`. |
| Migração `20261009210000_minha_rotina_origem_chat.sql` | Aplicada e registrada (Fase 8): origem `chat` nos passos. |
| Migração `20261009200000_users_rotina_intro_status.sql` | Aplicada e registrada (Fase 7): `users.rotina_intro_status`. |
| Migração `20261009190000_rotina_lotes_aplicar_automatico.sql` | Aplicada e registrada: a rotina é trocada automaticamente pelo servidor (rotina vazia não apaga a atual). |
| Migração `20261009170000_rotina_lotes_storage.sql` | Aplicada e registrada: bucket privado `rotina-lotes` + políticas de enviar, ler e apagar só na própria pasta. A conta de teste tem 1 lote enviado (2 fotos), que serve para a Fase 6. |
| `recomendar-produtos` | Publicado com `gpt-5.4-mini` (antes `gpt-4.1-mini`). Testado: respondeu em 14 s. |
| `niks-chat` | Publicado com `gpt-5.4-mini` nas 3 chamadas (respostas, memórias e leitura de aprovação). Testado: 1ª palavra em 3,6 s. |
| `generate-protocol` **v45** | Publicado = **versão que já estava no ar** + `gpt-5.4-mini` + **trava de gravidez no código** (grávida, amamentando ou tentando engravidar). Sem retinoide, a IA refaz a rotina com azelaico ou bakuchiol; se ainda sobrar retinoide, o código remove o passo. **Não inclui** a mudança do onboarding (commit `a3db723`). |
| Migração `20261009120000_create_minha_rotina.sql` | Aplicada: tabela, `criar_minha_rotina()` e `users.minha_rotina_criada_em` |
| Migração `20261009130000_minha_rotina_pula_retinoide.sql` | Aplicada: a cópia pula retinoide |
| Migração `20261009140000_minha_rotina_produto_scan.sql` | Aplicada: coluna `product_scan_id` |
| Migração `20261009150000_minha_rotina_dias.sql` | Aplicada: coluna `dias` e correção dos passos já copiados |
| Migração `20261009160000_minha_rotina_estante.sql` | Aplicada: nome opcional e produtos dos passos levados para a estante |

As migrações foram aplicadas direto no banco de produção e registradas no histórico de migrações. A versão do app nas lojas não usa nada disso.

### 💻 Só no app/repositório (commitado, mas não publicado)


- **`_shared/scanCutout.ts`:** `sameBrand`/`sameName` passaram a ser exportados (usados pela função acima). Não muda o comportamento de quem já usa.


- **Todo o código do app** das Fases 1 a 4 e dos ajustes:
  - [lib/rotinaIdeal.ts](lib/rotinaIdeal.ts), [lib/tipoPasso.ts](lib/tipoPasso.ts), [lib/routineReminders.ts](lib/routineReminders.ts), [aviso-lembretes.tsx](app/(onboarding)/aviso-lembretes.tsx);
  - [lib/minhaRotina.ts](lib/minhaRotina.ts), [lib/avisoProduto.ts](lib/avisoProduto.ts), [lib/escaneados.ts](lib/escaneados.ts), [lib/productCategory.ts](lib/productCategory.ts) e [lib/productMatch.ts](lib/productMatch.ts);
  - [components/rotina/](components/rotina/), [components/product/Shelf.tsx](components/product/Shelf.tsx) e [components/product/ShelfStatus.tsx](components/product/ShelfStatus.tsx);
  - [protocolo.tsx](app/(app)/protocolo.tsx), [recomendacao-produtos.tsx](app/(app)/recomendacao-produtos.tsx), [home.tsx](app/(app)/home.tsx), [product-result.tsx](app/(scan)/product-result.tsx), [store/onboarding.ts](store/onboarding.ts) etc. (ver `git status`).
- **[supabase/functions/generate-protocol/index.ts](supabase/functions/generate-protocol/index.ts) no repositório** = mudança do onboarding (`a3db723`) + `gpt-5.4-mini` + trava de gravidez estendida. É a versão que deve ir ao ar com a build nova.
  - ⚠️ A cópia usada na publicação da v45 (sem a mudança do onboarding) ficou numa pasta temporária do Mac (`/private/tmp/.../scratchpad/deploy-gp`), que pode ser apagada.

---

## Pendências


- ~~Notificação conta todos os passos~~ **Resolvido de outro jeito:** a notificação não mostra mais o número de passos.
1. **Teste do Douglas da Fase 8 e do chat novo:** pedir uma mudança à NIKS, ver o cartão fixo, aprovar e ver a confirmação e a Rotina mudar; pedir para reorganizar a manhã ou a noite inteira; responder "sim" por texto. E o "Adicionar à minha rotina" num scan cuja análise sugira adicionar.
2. **Emoji aparecendo como "?"** no chat ("oi, Amanda! 👋") e em outros textos com a fonte do app: já acontecia antes; a fonte não traz emoji e o iPhone não está usando a reserva. Vale investigar.
3. **App muito antigo, sem cartão** (`supportsProtocolCard` ausente): a regra "toque em Aprovar" vale para todos, mas nesse app não existe botão (a aprovação é por texto). Provavelmente ninguém mais usa; conferir antes de remover o caminho.
4. **Push do lote num iPhone de verdade** (no simulador não chega push) e o caminho de erro ("Tentar de novo") da Fase 6.
5. **Publicar o `generate-protocol` de novo quando a build nova sair:** a versão do repositório (com a mudança do onboarding) precisa ir ao ar junto com a build nova. A mudança traz:
   - a trava de "ativo declarado" só confere quando ela escreveu os produtos que usa;
   - o pedido à IA ganha "o app não pergunta mais os produtos dela; nunca invente um produto que ela já usa".

   Antes de publicar, conferir que a versão do repositório ainda tem o `gpt-5.4-mini` e a trava de gravidez com os 3 casos.
6. **Limpeza de arquivos sem dono:** incluir `rotina-lotes` (e `colecao`) na lista de buckets da função SQL da migração `20261001130000_cleanup_orphan_storage.sql`. É uma migração nova no banco, então precisa de ok.
7. **Teste do Douglas nos ajustes da escolha de produto e dos ícones:**
   1. filtros dos Recomendados na folha;
   2. "Ver todos" da estante abrindo as prateleiras em modo escolha;
   3. arraste desligado nesse modo;
   4. aviso forte com a conta gestante;
   5. seta voltando sem mudar o passo;
   6. estante normal intacta.
8. **Rotinas ideais antigas de gestantes** continuam com retinoide salvo em `protocolos`. Isso foi decidido: a ideal não é alterada. A Minha rotina pula esses passos.
9. **Erro "Maximum update depth exceeded"** no `app/(app)/_layout.tsx`, visto durante a compra pela Superwall. É anterior a este trabalho, mas vale investigar separado.
10. ~~**Commit:** todo o trabalho acima está sem commit~~ **Feito:** commitado na `newdesign2` em 10/10/2026.

---

## Contexto útil

- **Conta de teste:** gestante. Útil para testar os avisos fortes e a trava de retinoide.
- **Produtos salvos em outro celular** antes da Fase 1 não voltam, porque nunca estiveram no servidor. Isso estava previsto.
- **Dia da atualização:** o checklist do dia recomeça, e a sequência e o streak não são afetados.
- **Custo do lote com fotos:** cerca de US$ 0,03 por lote de 7 produtos, com `gpt-5.4-mini` a US$ 0,75 por milhão de entrada e US$ 4,50 por milhão de saída.
