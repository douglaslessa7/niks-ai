# NIKS AI — README Completo

> **Para Claude Code:** Leia este arquivo inteiro antes de qualquer ação. Ele contém o estado completo do projeto, decisões técnicas já tomadas, e o que ainda precisa ser feito.

---

## O QUE É O PROJETO

App mobile de análise de pele por IA.

**Fluxo principal:** Usuário tira foto do rosto → IA retorna Skin Score (0-100) + diagnóstico + protocolo de skincare personalizado.
**Fluxo secundário:** Foto de refeição → análise do impacto de cada alimento na pele (Food Analysis).

**Diferenciais:**
- Único app no Brasil que combina análise de pele + análise alimentar
- Skin Score compartilhável (motor viral)
- Food Analysis: semáforo científico por alimento com motivo biológico
- Inspirado no playbook do Cal AI aplicado ao skincare

**Monetização:** Freemium — R$29,90/mês, R$179,90/ano via RevenueCat. Trial de 3 dias (plano anual).

**Regulação importante:**
- Nunca usar a palavra "diagnóstico" — sempre "análise" ou "avaliação"
- Posicionamento 100% wellness, nunca médico
- LGPD: foto de rosto é dado biométrico — consentimento explícito obrigatório

---

## STACK (DECISÕES FINAIS — NÃO MUDAR)

| Camada | Tecnologia |
|---|---|
| Framework | Expo + React Native (managed workflow) — **New Architecture ativada** (`newArchEnabled: true`) |
| Estilo | NativeWind v4 + Tailwind CSS (sempre `className`, nunca `StyleSheet`) |
| Navegação | Expo Router v3 (`useRouter`, `router.push`, `router.back`) |
| Backend | Supabase (PostgreSQL + Edge Functions + Storage) |
| IA | OpenAI (`analyze-skin`, `generate-protocol`, `niks-chat`, `generate-skin-preview`) / Gemini 2.5 Pro (`analyze-food`) via Supabase Edge Functions |
| Pagamentos | RevenueCat (verificação de entitlement) + Superwall (apresentação do paywall) |
| Analytics | Mixpanel (`mixpanel-react-native`, `useNative=true`) — `lib/mixpanel/` |
| Camera | expo-camera + expo-image-picker |
| Compartilhamento (Story) | `react-native-view-shot` (captureRef) + `expo-sharing` (share sheet) + `expo-media-library` (salvar na galeria) |
| Vídeo | expo-video (`useVideoPlayer` + `VideoView`) — usado nas 5 telas de welcome (`app/index.tsx`) |
| Estado global | Zustand (`useAppStore` em `store/onboarding.ts`) |

**Localização do projeto:** `~/Desktop/niks-ai/`

**Para rodar localmente:**
```bash
# Mudanças nativas (app.json, plugins, novas dependências) — rebuilda e instala no device:
cd ~/Desktop/niks-ai && npx expo run:ios --device

# Mudanças só em código JS/TS — inicia Metro com tunnel (device físico via USB):
cd ~/Desktop/niks-ai && npx expo start --dev-client --tunnel
# → Abre o app no iPhone → "Enter URL manually" → digita a URL https://... que aparecer no terminal
```

**Para subir build no TestFlight (build via Xcode — não EAS Build):**
```
1. Xcode → Product → Clean Build Folder (⇧⌘K)
2. Xcode → Product → Archive
3. Organizer → Distribute App → App Store Connect → Upload
4. Aguardar processamento no App Store Connect (5–15 min)
5. TestFlight → instalar novo build → testar
```
> ⚠️ **Nunca ativar "Enable User Script Sandboxing"** nas recommended settings do Xcode — quebra os scripts do Hermes, CocoaPods e Expo Dev Launcher.

> ⚠️ **Regra de versão:** A Apple rejeita o upload se `CFBundleShortVersionString` (campo `"version"` no `app.json` e no Xcode General → Version) não for **maior** que a última versão aprovada na App Store. Sempre incremente a versão antes de subir um novo build após uma aprovação (ex: 1.0.1 aprovado → próximo build deve ser 1.0.2+).

---

## SPLASH SCREEN + ÍCONE + NOME DO APP + GOTCHAS NATIVOS (iOS/Android)

**Nome do app: `NIKS`** (era "NIKS AI"). É o nome que aparece sob o ícone na home screen. Vive em **3 lugares** — mudar nos três: `app.json` → `expo.name`, `ios/NIKSAI/Info.plist` → `CFBundleDisplayName`, `android/app/src/main/res/values/strings.xml` → `app_name`.
> O `PRODUCT_NAME` do Xcode continua **`NIKSAI`** de propósito (é o `CFBundleName`, nome interno do binário — o usuário nunca vê). Trocar mexeria no pbxproj, no caminho do bundle e possivelmente em certificados. O nome da **listagem na App Store** é outra coisa ainda: vem do App Store Connect, não do código.

**Ícone atual: `assets/icon-niks.png`** — 1024×1024 **RGB opaco** (a Apple rejeita ícone com canal alpha). É a **logo invertida**: flor branca sobre fundo rosa `#FF9D9D`, logo a 70% do canvas. O `assets/icon.png` antigo continua no repo (não foi sobrescrito) — reverter = apontar `app.json` de volta e recopiar o PNG nativo.

**Como o ícone foi gerado** (não é derivável de nenhum PNG do repo — é reprodutível **só** a partir do vetor do Figma; ver "Vetor da logo" na seção do Figma): exportar o node `101:386` como SVG, remover os 2 rects de fundo do canvas do Figma (`#F5F5F5` e `#F9F9F9`), e **inverter os papéis** trocando só a cor da tinta — todos os `stop-color` opacos (`#FF5EA8`, e um `#FF0000` residual) e a ponta transparente (`#C1AAE9`) viram `#FFFFFF`; o círculo `#ACD5EB` da elipse de overlay também vira `#FFFFFF`; o rect de fundo vira `#FF9D9D`. **Geometria, `fill-opacity` e a curva dos degradês ficam intactas** — é troca de tinta, não redesenho. Rasterizar em 1024 (headless Chrome renderiza os gradientes e o `mix-blend-mode` corretamente). ⚠️ **O rect de fundo é obrigatório** — ver o gotcha do `mix-blend-mode` na seção do Figma.
> Consequência do design: as pétalas **esvanecem no rosa** nas bordas (o degradê original desaparecia pro fundo), então a flor **não tem silhueta fechada** — ela dissolve. Isso é o comportamento fiel do vetor invertido, **não um bug**. Não "consertar" fechando o degradê sem o usuário pedir.

**Splash atual:** **fundo branco `#FFFFFF` + a logo `niks-logo.png` tintada rosa `#FF9D9D`** (a mesma do herói do protocolo) centralizada. A imagem é gerada como `assets/splash-niks.png` (1024×1024, PNG branco com a logo rosa no centro).

**Config (`app.json` → `expo.splash`):** `image: ./assets/splash-niks.png`, `resizeMode: contain`, `backgroundColor: #FFFFFF`.

**Como a logo rosa foi gerada** (o `niks-logo.png` é um bloom com transparência; `tintColor` não existe em splash estática, então a cor é "assada" no PNG): recolorir os pixels opacos para `#FF9D9D` **mantendo o alpha original** (fiel ao `tintColor` do RN — **sem** reforçar opacidade nem compor 2×, senão fica mais densa/saturada do que aparece no app). Feito com Python PIL: `im.putdata([(0xFF,0x9D,0x9D,a) for (_,_,_,a) in im.getdata()])` e centralizar num canvas branco.

> ⚠️ **A pasta `ios/` (e `android/`) é gitignorada e regenerável (workflow prebuild).** Por isso mudanças em assets nativos **não aparecem no `git status`**, e o **`app.json` é a fonte de verdade** — mas veja o ponto abaixo.

> ⚠️ **`npx expo run:ios` NÃO re-roda o prebuild quando a pasta `ios/` já existe** → ele buildA do `ios/` atual e **ignora mudanças de splash, ÍCONE e NOME no `app.json`**. Para propagar depois de existir `ios/`, use **`npx expo prebuild -p ios`** (ver o aviso sobre `--clean` abaixo) **ou** edite os assets nativos direto:
> - **Ícone (iOS):** `ios/NIKSAI/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png` — é um **PNG único de 1024**, basta substituí-lo. Foi o caminho usado (mais cirúrgico que prebuild, e `ios/` é gitignorada/regenerável).
> - **Nome (iOS):** `ios/NIKSAI/Info.plist` → `CFBundleDisplayName`. **Nome (Android):** `values/strings.xml` → `app_name`.
> - **Splash (iOS):** `ios/NIKSAI/Images.xcassets/SplashScreenLegacy.imageset/image.png` (+@2x/@3x) e a cor em `SplashScreenBackground.colorset/Contents.json` + `SplashScreen.storyboard` (`UILaunchStoryboardName = SplashScreen`).
> - **Splash (Android):** `android/app/src/main/res/drawable-*/splashscreen_logo.png` (5 densidades, logo transparente centralizada) + `values/colors.xml` → `splashscreen_background`.

> ⚠️ **Prefira `npx expo prebuild -p ios` SEM `--clean` para propagar config nova (plugins/permissões).** O `--clean` **regenera o `ios/` do zero** e apaga tudo que **não** está expresso no `app.json` — inclusive a capability **In-App Purchase**, que é configurada à mão no Xcode e sem a qual o `getOfferings()` do RevenueCat falha **silenciosamente em produção** (ver GOTCHA na decisão 16). O prebuild não-clean aplica os mods (Info.plist, Podfile) **por cima** do projeto existente e preserva o pbxproj — na feature de compartilhamento ele só mudou aspas (`PRODUCT_NAME = NIKSAI` → `"NIKSAI"`), mantendo `DEVELOPMENT_TEAM`, entitlements e o User Script Sandboxing desligado. Depois do prebuild, rodar `pod install --project-directory=ios`. Use `--clean` só como último recurso, sabendo que terá de **reativar a capability de In-App Purchase no Xcode** depois.
>
> ⚠️ **Motivo NOVO e mais grave para nunca rodar `--clean`:** agora que `expo.name` é **`NIKS`** (era "NIKS AI"), o `--clean` regeneraria a pasta nativa como **`ios/NIKS/`** em vez de `ios/NIKSAI/` — os caminhos deste README, o `PRODUCT_NAME`, o Podfile e o projeto do Xcode **quebram todos de uma vez**. O prebuild **sem** `--clean` continua seguro (aplica os mods por cima e preserva o pbxproj).

> ⚠️ **NUNCA apagar a pasta `ios/build` inteira** para "limpar cache" — ela contém o **codegen do React Native (New Architecture)** em `ios/build/generated/ios/ReactCodegen/…`. Apagá-la quebra o build com `Build input file cannot be found: …-generated.mm`. **Correção:** rodar `pod install --project-directory=ios` (regenera o codegen). Para limpar cache de build com segurança: `rm -rf ~/Library/Developer/Xcode/DerivedData/NIKSAI-*` (ou Xcode → Product → Clean Build Folder) — **isso não toca no codegen**.

> ⚠️ **iOS cacheia o launch screen E o ícone** (snapshot) por app/simulador — mesmo com build novo e app apagado, pode mostrar a splash **ou o ícone** antigos. Isso engana com muita facilidade quando se está comparando ícones em sequência: **antes de suspeitar do arquivo, apague o app e reinicie o aparelho.** **Limpar no simulador** (via CLI): `xcrun simctl uninstall booted br.com.niksai.app`; depois `xcrun simctl shutdown <UDID>` → `rm -rf ~/Library/Developer/CoreSimulator/Devices/<UDID>/data/Library/SplashBoard/Snapshots/*` → `xcrun simctl boot <UDID>` (ou, mais simples no menu do Simulador: **Device → Erase All Content and Settings**). Em **device físico**: apagar o app + **reiniciar o iPhone**.

---

## REGRAS DE DESENVOLVIMENTO (NUNCA VIOLAR)

- **NativeWind (`className`)** para estilo — `StyleSheet.create()` só em último caso absoluto
  - **Exceção — telas de perguntas do onboarding (design system NIKS):** Todas as telas da jornada de perguntas (`birthday` até `social-proof`, incluindo `skincare-routine`, `allergies`, `goal-desire`, `scan-prep`, `loading`, `results`, `plan-preview`) usam **inline styles + tokens locais** — sem NativeWind, sem `Colors` constants. Tokens padrão definidos no topo de cada arquivo: `CREAM = '#FFFFFF'` (fundo branco, sem LinearGradient), `DEEP = '#1D3A44'`, `CORAL = '#FB7B6B'`, `CORAL_DEEP = '#E5654F'`, `DEEP_SOFT = 'rgba(29,58,68,0.55)'`, `DEEP_HAIR = 'rgba(29,58,68,0.10)'`. Estrutura padrão: **QHeader** (botão voltar 40×40 branco semitransparente + barra de progresso na mesma linha horizontal — `TOTAL = 13`, steps de 1 a 13: `birthday=1`, `gender/pregnancy=2`, `goal=3`, `goal-validation=4`, `concerns=5`, `skin-type=6`, `sun-exposure=7`, `hydration-sleep=8`, `skincare-routine/detail=9`, `allergies/detail=10`, `goal-desire=11`, `social-proof=12`, `scan-prep=13`), **QTitleBlock** (eyebrow coral uppercase + título bold DEEP com destaque em Playfair Italic coral + subtítulo DEEP_SOFT), **OptionCards** (pill `borderRadius: 100`, borda CORAL + glow shadow quando selected), **PrimaryButton** (`height: 60`, `borderRadius: 100`, bg CORAL, shadow coral). Novas telas de pergunta do onboarding devem seguir esse sistema — não o `QuizLayout`, não `LinearGradient`, não `Colors`.
  - **Exceção — telas de auth e utilitárias:** `login` e `paywall-soft` ainda usam inline styles + `Colors` constants com `LinearGradient` rosa→branco. Manter esse padrão ao editar essas telas.
  - **Exceção — `signup`, `nome` e `notifications`:** essas três telas migraram para o **design system NIKS** (inline styles + tokens locais `DEEP/CORAL/CORAL_DEEP/DEEP_SOFT/CREAM`, fundo branco puro `#FFFFFF`, sem `LinearGradient`, sem `Colors` constants). Ao editar, seguir o mesmo padrão das telas de pergunta do onboarding.
  - **Exceção — tela `niks-chat.tsx`:** **redesenhada para o "Novo design app NIKS"** (Nunito, tema claro), em harmonia com `home`/`protocolo`/`recomendacao-produtos`. Inline styles + tokens locais (não `Colors`, não NativeWind, **não mais Playfair**): `INK='#121212'`, `INK_SOFT='#515151'`, `INK_MUTE='#818181'`, `INK_FAINT='#B5B5B5'`, `CORAL='#FF9D9D'` (**rosa da Rotina** — era `#F86B79`), `CARD_BD='#E3E3E6'`, `BUBBLE_BG='#F3EEEE'` (balão da usuária), `WHITE`/`PILL_BG='#FFFFFF'`, `RED_GRAD=['#FF9D9D','#FF9D9D']` (botão enviar — rosa da Rotina, era o vermelho `#FF6661→#C02225`). Fontes **Nunito** (`@expo-google-fonts/nunito`). **Fundo branco puro `#FFFFFF`** — sem gradiente (o usuário pediu para remover a mescla rosa/branco). O avatar da NIKS, o hero e a logo do header são a **logo `niks-logo.png`** (sparkle) **tintada `#FF9D9D`** (como o herói de `protocolo`); o `MiniOrb` coral antigo foi **removido**. Dois estados (`empty`/`active`) — o visual de cada um está na seção **"Tela NIKS Chat"** (Design System). **O design serif antigo (`design_handoff_chat_screen/`, Playfair, tokens creme) foi aposentado.**
    - **Sem modo noturno:** o antigo tema noturno (`isDark`/`debugMode`/`autoNight`/`NightSky`/crateras de lua do `MiniOrb`) foi **removido** neste redesign — a tela é sempre clara, como as demais telas do novo design. O `useFocusEffect` apenas chama `setTabBarTheme('light')`. (`NightSky` continua existindo e em uso só no `protocolo.tsx`.)
    - **`ChatInputBar` é `position: 'absolute'`** (não in-flow) dentro de um `View style={{ flex: 1 }}` que vive dentro do `KeyboardAvoidingView`. Isso é obrigatório: a tab bar customizada de `_layout.tsx` também é absoluta e cobre qualquer input in-flow. O KAV ainda levanta o input corretamente quando o teclado abre porque o View pai encolhe. **Nunca mover o ChatInputBar para o fluxo normal.** O `paddingBottom` em repouso é **fixo (`100` = navbar de 80px + ~20 de folga), sem somar `insets.bottom`** — a navbar já cobre o home indicator, então somar a safe area criava um vão grande sobre o menu; com o teclado aberto cai para `8`. Pill de input **branca** (`#FFFFFF`), container transparente (o fundo branco da tela aparece por trás sem emenda).
    - **Campo de texto do `ChatInputBar` é `multiline`** e cresce linha a linha até o máximo de 4 linhas (estilo WhatsApp) usando apenas `maxHeight`. Não tem `height` explícito — ver decisão técnica 17.
    - **Dois estados: `mode: 'empty' | 'active'`.** No estado `active`, renderizar o array `messages[]` carregado do banco (tabela `coach_messages`, via `coach_conversations` do dia). Cada item do array é `{ id, role, content, isStreaming?, imageUris?: string[] }`. Suporta até 5 fotos por mensagem. Regras de render: `role === 'user'` → `UserBubble` (+ um `UserPhotoBubble` por item em `imageUris`, se houver); `role === 'assistant' && content === '' && isStreaming` → `TypingDots`; `role === 'assistant' && content !== ''` → `NiksMessage`. **Nunca hardcodar mensagens de conversa** — o design prototype tinha mensagens ilustrativas que foram implementadas como definitivas por engano; esse erro já foi corrigido.
    - **Persistência de modo entre navegações:** `niksChatMode: 'empty' | 'active'` no `useAppStore` controla o que o `useFocusEffect` faz ao ganhar foco. Default `'empty'` → cold start (app fechado/reaberto) sempre mostra a tela inicial. App backgroundado preserva o valor em memória → conversa ativa é restaurada ao voltar. `sendMessage`, `handleSuggestionPress` e `loadConversation` chamam `setNiksChatMode('active')`; o botão voltar chama `setNiksChatMode('empty')`. Esse estado está no store (não em `useRef` local) precisamente para sobreviver ao ciclo de vida do componente sem ser resetado por remounts, mas ser descartado no cold start junto com todo o store in-memory.
    - **Botão voltar:** oculto no estado `empty`; no estado `active` volta para `empty` chamando `setNiksChatMode('empty')` no store e resetando `messages[]` — **não** chama `router.back()`.
    - **Botão de histórico (topo direito):** abre painel flutuante com as últimas 5 conversas do usuário (`coach_conversations` ordenadas por `created_at desc`). Cada item exibe o título (primeiros 80 chars da primeira mensagem do usuário) e o tempo relativo da última mensagem (`Xm`, `Xh`, `Xd`, `Xmm`). Ao tocar em um item, carrega as mensagens daquela conversa e entra em modo `active`.
- **TODO elemento clicável dá retorno tátil** — `import { haptics } from '.../lib/haptics'` e chamar como primeira linha do `onPress`. **Nunca** `expo-haptics` direto na tela. Ver "HAPTICS" para a escala (`tap`/`action`/`select`/`success`/`warning`/`error`) e o que fica de fora
- **Dado de rede vai por `useCachedQuery`** (`lib/cache.ts`), não por `useFocusEffect` cru — senão a tela refaz tudo a cada troca de aba. E quem **escreve** no banco precisa chamar `invalidateCache`. Ver "CACHE DE DADOS"
- **`getUserId()`/`useUserId()` (`lib/currentUser.ts`) em vez de `supabase.auth.getUser()`** — o `getUser()` é ida à rede; só usar nele operações sensíveis (apagar conta)
- **Expo Router** para navegação — `useRouter()`, `router.push()`, `router.back()`
- **TypeScript** em tudo — nunca JavaScript puro
- **Nunca inventar cores** — usar sempre `constants/colors.ts`
- **NUNCA chamar APIs de IA diretamente no app** — sempre via Supabase Edge Function
- **SafeAreaView** em todas as telas — respeitar notch e home indicator do iPhone
- **Portrait only** — nunca landscape
- **Max width 393px** — iPhone 14 Pro
- **Store usa `useAppStore`** (de `store/onboarding.ts`) — não `useOnboardingStore`
- **Para iniciar o scan de rosto a partir de qualquer tela**, usar `useFaceScan()` (`hooks/useFaceScan.tsx`) → `startFaceScan()`. ⚠️ **`setScanModalOpen` NÃO existe mais** — o `ScanModal` (bottom sheet de escolha de tipo) saiu do fluxo; ver "ScanModal (APOSENTADO)". O `GlobalBottomBar` (navbar do Figma) continua sendo renderizado em `_layout.tsx` e se aplica a todas as abas. **Não existe mais FAB de scan** — na home o único acesso ao scan é o botão "Escanear", que chama `startFaceScan()` e vai **direto** para `scan-prep-app` (sem passar por nenhum modal). **O scan de produto só existe na tela de Recomendação de Produtos** (botão "Escanear produto" → `product-camera`). **O scan de comida só existe no NIKS Chat** — o card de sugestão "Analisar o impacto da minha refeição na minha pele" → `food-camera` (ver "Tela NIKS Chat", Sessão 48). A home nova é estática e **não tem mais** o card `RefeicoesSection` nem o atalho direto para `/(scan)/food-camera` (ver "Tela Home").
- **Imagens viajam pelo Zustand** — nunca via `router.push` params (truncamento no bridge do RN)
- **`fetch` direto** para Edge Functions grandes — `supabase.functions.invoke` trunca payloads

---

## HAPTICS (retorno tátil) — `lib/haptics.ts`

**Regra do projeto: todo elemento clicável dá retorno tátil.** Ao criar um botão novo, escolher um dos 6 abaixo — **nunca** chamar `expo-haptics` direto na tela.

```typescript
import { haptics } from '../../lib/haptics';   // caminho relativo varia por arquivo
haptics.tap();      // dentro do onPress, como primeira linha
```

| Chamada | Intensidade real | Usar em |
|---|---|---|
| `haptics.tap()` | `Impact.Light` | voltar, card clicável, link, expandir/colapsar, aba da navbar |
| `haptics.action()` | `Impact.Medium` | **CTA principal**: Continuar, Escanear, Enviar, Salvar, obturador |
| `haptics.select()` | `selectionAsync` | escolher entre opções: chip, aba interna, segmented, wheel picker |
| `haptics.success()` | `Notification.Success` | conclusão: rotina finalizada, produto salvo na rotina |
| `haptics.warning()` | `Notification.Warning` | destrutivo/atenção: apagar conta, sair da conta |
| `haptics.error()` | `Notification.Error` | falha |

> A API é por **significado, não por intensidade** — de propósito. Se um dia decidirmos que o CTA principal deve ser `Heavy`, muda-se **um** arquivo e a escala inteira do app acompanha. Por isso não existe `haptics.light()`/`haptics.medium()`.

### ⚠️ Onde NÃO colocar

Fechar teclado (`Keyboard.dismiss`), **backdrop/overlay de fechar modal**, handlers de scroll, e os botões de `Alert.alert` (são nativos do iOS, não são nossos touchables — só o botão que **abre** o Alert leva haptic). Haptic em excesso vira ruído e faz o usuário desligar a vibração do aparelho inteiro.

### Detalhes que já estão resolvidos (não "consertar")

- **`disabled` já é respeitado de graça:** no `TouchableOpacity`/`Pressable` do RN, `disabled` impede o `onPress` de disparar. Como o haptic mora **dentro** do `onPress`, botão desabilitado não vibra. Não é preciso checar `disabled` de novo.
  - ⚠️ **Exceção — botões que só têm `opacity` visual, sem a prop `disabled`:** o voltar do ritual em `protocolo.tsx` era assim (usava `opacity: 0.35` no passo 0 mas disparava mesmo assim). Esses precisam de guarda explícita antes do haptic.
  - ⚠️ **Exceção — guarda dentro do `onPress`** (ex.: `onPress={() => uri && handleRetake(i)}` em `share-capture.tsx`): o haptic vai **depois** da guarda, no ramo que executa.
- **Falha de haptic nunca quebra o botão:** o `fire()` do módulo engole o erro (`.catch`). Se o motor háptico estiver ocupado ou a vibração desligada nos Ajustes, o `onPress` roda normalmente. Sem esse `.catch` seria um "possible unhandled promise rejection" por toque.
- **Guarda de plataforma:** o módulo não faz nada fora de iOS/Android.
- **`await` no haptic é desnecessário** — é fire-and-forget. O padrão antigo `onPress={async () => { await Haptics.impactAsync(...); router.back(); }}` estava em 19 telas e **atrasava a navegação** à toa; foi migrado para `onPress={() => { haptics.tap(); router.back(); }}`.

> ⚠️ **Haptic não funciona no simulador** — só em iPhone físico. Não conclua que está quebrado por não sentir nada no Simulator.

> ⚠️ **`components/ui/CTAButton.tsx`, `OptionCard.tsx`, `Pill.tsx`, `QuizLayout.tsx` são CÓDIGO MORTO (0 usos).** As telas de onboarding reimplementaram tudo com `TouchableOpacity` inline. Não adianta mexer nesses arquivos esperando afetar alguma tela — e, se um dia forem adotados, é neles que o haptic deve morar.

---

## CACHE DE DADOS (por que as telas não recarregam mais)

**O problema que isso resolveu:** as 5 telas de `(app)` vivem num `Tabs` — montam uma vez e **nunca desmontam**. Mas os `useFocusEffect` refaziam **todas** as consultas ao Supabase a cada troca de aba, sem nenhuma guarda. A home fazia 4–5 round-trips por entrada; o chat rebaixava a conversa inteira. Para o usuário, isso parecia "a tela recarrega toda vez".

### As duas peças

**1. `lib/cache.ts` — stale-while-revalidate.** Cada consulta tem uma chave. O resultado é gravado em **memória** (leitura síncrona no primeiro render → sem piscar) **e no AsyncStorage** (sobrevive a fechar o app). Ao focar a tela: dado fresco → **zero rede**; dado velho → a tela já aparece com a versão antiga e a atualização acontece por trás, **sem estado de loading**.

```typescript
const { data, state, refresh } = useCachedQuery(
  userId ? `home:${userId}` : null,   // key null desliga o hook
  fetchHome,                          // useCallback estável
  { enabled: Boolean(userId), staleMs: 60_000 },
);
```
- `state === 'loading'` **só** quando não há nada em cache para mostrar.
- Falha de rede **com** dado em tela é silenciosa (o usuário continua vendo a última versão boa); sem dado, vira `'error'`.
- Requisições com a mesma chave são **deduplicadas** (uma promise compartilhada).

**2. `persist` no store Zustand** (`store/onboarding.ts`). O store era 100% em memória, então o cache do protocolo **nunca funcionava** na prática — depois de qualquer restart ele caía direto no fallback do Supabase.

> ⚠️ **O `partialize` é uma LISTA BRANCA deliberada — hoje `skinScore`, `protocolResult`, `scanTutorialSeen` e `appliedCoupon`.** Não adicionar campo sem entender o porquê de cada exclusão: `subscriptionVerified` **precisa** voltar a `false` no cold start (RevenueCat, decisão 16); `niksChatMode` **precisa** cair em `'empty'` no cold start; `*ImageBase64`/`*ImageUri`/`collagePhotos`/`homePhotoDraft` são base64 de foto (**estouram o AsyncStorage**) e hand-offs de vida curta entre telas. `scanTutorialSeen` está **dentro** justamente porque o tutorial de prep deve aparecer uma vez só e nunca mais (o oposto de `stickerSheetSeen`, que fica fora). `appliedCoupon` está **dentro** porque o cupom é aplicado ANTES do signup e precisa sobreviver até o cadastro para ligar ao `user_id` (ver "Sistema de cupons de influenciadora", seção 15). ⚠️ **Cuidado com a supressão de reapresentação do paywall (`lib/paywallFlow.ts`): essa NUNCA pode ser persistida** — é de uso único e em memória de propósito; persistir viraria brecha para escapar do paywall.

### ⚠️ Regra de ouro: escreveu no banco, invalide o cache

Sem isso a tela mostra dado velho até o cache vencer. Pontos já cobertos — **seguir o padrão ao criar novos**:

| Onde escreve | Invalida |
|---|---|
| `(scan)/loading-dentro-app.tsx` (novo scan) | `home:${uid}` |
| `(foto)/ajustar-foto.tsx` (troca a foto da home) | `home:${uid}` |
| `(app)/set-name.tsx` (muda o nome) | `perfil:${uid}` + `chat:${uid}` |
| `niks-chat.tsx` (`xhr.onload`, mensagem nova) | `chat:${uid}` |
| `hooks/useAuth.ts` (`signOut`/`deleteAccount`) | **tudo** — `clearAllCache()` + `persist.clearStorage()` + `resetUserId()` |

> ⚠️ **O cache é POR USUÁRIO** (a chave carrega o `user_id`). Por isso o logout limpa cache, store persistido **e** o id memoizado — sem isso, a próxima conta a logar no aparelho abriria vendo o score, a rotina e o nome da conta anterior.

### ⚠️ O que NÃO cachear

- **URLs assinadas do Storage** — expiram (as de `product-scans` em 1h) e a URL muda a cada geração; cachear quebra a imagem depois de 1h. É por isso que a aba "Escaneados" de `recomendacao-produtos` continua refazendo `createSignedUrls`.
- **Qualquer base64 de imagem** — estoura o AsyncStorage.

### `lib/currentUser.ts` — pare de chamar `supabase.auth.getUser()`

⚠️ **`getUser()` faz uma REQUISIÇÃO DE REDE** (valida o JWT no servidor) e estava no começo de praticamente todo bloco de fetch do app — uma ida à rede extra por tela, por foco, só para descobrir um id que já está no disco. Use `getUserId()` / `useUserId()`, que leem a sessão local. **Exceção:** operações sensíveis que precisam de um usuário verificado pelo servidor (apagar conta) continuam com `supabase.auth.getUser()`.

---

## COMO ACESSAR O FIGMA MAKE

### Método correto (IMPORTANTE)
**NÃO use `get_metadata`** — retorna erro para arquivos Make.

**Use `get_design_context` com `nodeId: "0:1"`** para obter o índice de todos os arquivos. O retorno lista todos os Resource Links com os caminhos corretos.

### Projetos Figma Make ativos

| Projeto | File Key | Conteúdo |
|---|---|---|
| Onboarding / auth original | `XrX2xnE32aNLOaFw5ayPM0` | Welcome, Login, Signup, telas de onboarding |
| Home Screen + ScanModal | `sxih7FXdLGWu1lKovpOjIa` | `home.tsx` (tela principal), ScanModal bottom sheet |
| Tab Bar + Home v2 | `cFsFcVSjOMkTdHIJpHgSDk` | Tab bar inferior, menu "scanear/protocolo/perfil" |
| Onboarding quiz screens design | `kcw7wez680I06tnIMm1ZEz` | PlanPreview, Goal, Results (onboarding) e outras telas do quiz |
| App principal v2 — Protocolo/Perfil | `gZ5sSJErlJ3lcBTaqzwgjN` | `protocolo.tsx` (redesign Sessão 12), perfil, home v3 — tudo em `home.tsx` |

### Figma DESIGN (não Make) — "Novo design app NIKS"

> ⚠️ Este é um arquivo Figma **Design** normal (não Figma Make). Acessa-se por **node**, não pelo `ReadMcpResourceTool`.

| Item | Valor |
|---|---|
| File Key | `0OySQA5EgG5RSj4QuMOXpJ` |
| URL | `https://www.figma.com/design/0OySQA5EgG5RSj4QuMOXpJ/Novo-design-app-NIKS` |

> ⚠️ **Os node IDs `1:*` citados neste README estão DESATUALIZADOS — não confie neles.** O arquivo foi renumerado em algum momento: `1:8` (o frame `home`) **não existe mais** e retorna "node not found". Os IDs válidos hoje são `101:*`, `128:*` e `136:*`. Sempre que um `1:*` falhar, **redescubra**: chame `get_metadata` com o `fileKey` **e sem `nodeId`** → lista as páginas (só existe `0:1`); depois `get_metadata` em `0:1` → dump XML com todos os IDs atuais. As referências a `1:63` (card de métricas), `1:27` (navbar), `1:273` (recomendação) e `1:393` (chat) espalhadas neste README sofrem do mesmo problema — as telas **já estão implementadas**, então os IDs só importam se for preciso reabrir o design.

**Frames verificados (julho 2026):** o `home` existe em **4 cópias, uma por faixa de score** — `101:59` (score 25), `101:170` (50), `101:392` (75), `101:281` (100). Também: `128:4` (produtos/recomendação) e `136:126` (compatibilidade → `components/product/ProductAnalysis`).

Telas já implementadas deste arquivo: **home** (`app/(app)/home.tsx`), **navbar**, **chat-niks** (`app/(app)/niks-chat.tsx`) e **recomendação de produtos** (`app/(app)/recomendacao-produtos.tsx` — **saiu da réplica do Figma** e foi reformada para a identidade do app; ver "Tela Recomendação de Produtos"). Única tela deste arquivo ainda **não** implementada: `rotina`.

#### Vetor da logo (sparkle) — a fonte de verdade para assets em alta resolução

A logo **é vetor no Figma** (4 elipses com degradê linear + uma quinta em `mix-blend-mode: overlay`), embora no app ela viva como PNG de **196×199**. Nodes:

| Node | Corresponde a | Cor do degradê |
|---|---|---|
| `101:97` | `assets/home/niks-logo.png` (bloom base) e `score-logo-red.png` | `#FF0000` → `#C1AAE9` |
| `101:386` | `assets/home/score-logo-pink.png` (tema score 76–100) | `#FF5EA8` → `#C1AAE9` |

**Regra: para qualquer asset acima de ~200px (ícone, splash, imagens de compartilhamento), usar o VETOR — não ampliar o PNG.** Ampliar `score-logo-pink.png` de 196px para 1024 **serrilha visivelmente** a borda (ela tem contorno de círculo nítido e cor saturada, então cada degrau de pixel aparece). O `niks-logo.png` amplia sem serrilhado — mas só porque é pálido e de baixo contraste contra o branco, o que **esconde** o mesmo defeito. Não generalize a partir dele.

> ⚠️ **GOTCHA CRÍTICO — o SVG da logo EXIGE um fundo por trás.** Uma das elipses usa `mix-blend-mode: overlay`, que **depende do backdrop**. O export do Figma vem com 2 rects de fundo (`#F5F5F5` e `#F9F9F9`) — se você removê-los para "isolar a logo" e rasterizar sobre transparente, **o blend quebra**: aparece um **blob vermelho espúrio** (o stop `#FF0000` residual da paint5, que o overlay normalmente neutraliza) e a logo inteira fica **bem mais densa** do que é de verdade. O sintoma é traiçoeiro: a comparação com o PNG do app dá "não bate" (~29/255 de diferença média) e leva à **conclusão errada de que o vetor do Figma é outra logo, mais forte**. Esse erro foi cometido duas vezes. **Com o backdrop mantido, o vetor bate com o PNG do app a ~1,4–1,9/255** — é a mesma logo. Ao gerar um asset, troque o rect de fundo pela cor final desejada; nunca o remova.

**Rasterizar:** headless Chrome (`--headless --screenshot --window-size=W,H`) renderiza corretamente os degradês e o `mix-blend-mode`. Não há `cairosvg`/`rsvg`/`inkscape` na máquina, e `cairosvg` ignoraria o blend mode de qualquer forma.

**Como acessar (ferramentas do MCP `figma`):**
- `get_design_context` (`nodeId` + `fileKey`) → medidas, cores, tipografia exatas de um node
- `get_screenshot` → imagem de referência para comparar pixel a pixel
- `download_assets` → baixar ícones/imagens exatos do design

Para bater o design **pixel-perfect**, o método que funciona é renderizar no simulador e comparar com o screenshot do Figma na mesma largura (o app roda em iPhone de 402pt, o frame do Figma é 393pt — comparar sempre por **proporção**, não por pixel absoluto).

### Paths do projeto principal (XrX2xnE32aNLOaFw5ayPM0)
```
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/screens/Welcome.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/screens/Login.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/screens/Signup.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/screens/Home.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/screens/Protocolo.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/screens/Analise.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/screens/Perfil.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/components/TabBar.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/routes.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/styles/theme.css
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/package.json
```

### Paths do projeto Home Screen (sxih7FXdLGWu1lKovpOjIa)
```
file://figma/make/source/sxih7FXdLGWu1lKovpOjIa/src/app/components/home.tsx
file://figma/make/source/sxih7FXdLGWu1lKovpOjIa/src/app/components/comparison.tsx
```

### Paths do projeto Tab Bar v2 (cFsFcVSjOMkTdHIJpHgSDk)
```
file://figma/make/source/cFsFcVSjOMkTdHIJpHgSDk/src/app/components/home.tsx
```

### Paths do projeto App principal v2 (gZ5sSJErlJ3lcBTaqzwgjN)
```
file://figma/make/source/gZ5sSJErlJ3lcBTaqzwgjN/src/app/components/home.tsx   ← contém: home, protocolo, perfil, set-name (tudo em um arquivo)
```

### Padrão de nomeação (CRÍTICO)
- ✅ Correto: `PaywallSoft.tsx`, `Home.tsx`, `Notifications.tsx`
- ❌ Errado: `PaywallSoftScreen.tsx`, `HomeScreen.tsx`

### Fluxo ao iniciar nova tarefa visual
1. Ler este README
2. Chamar `ReadMcpResourceTool` com o path correto da tela no Figma Make
3. Converter web → React Native seguindo a tabela de conversão abaixo

### Tabela de conversão Figma Make → React Native
| Web (Figma Make) | React Native |
|---|---|
| `div` | `View` |
| `button` | `TouchableOpacity` ou `Pressable` |
| `span`, `p`, `h1` | `Text` |
| `img` | `Image` |
| `useNavigate` (react-router) | `useRouter` (expo-router) |
| `navigate(-1)` | `router.back()` |
| `navigate('/path')` | `router.push('/path')` |
| `lucide-react` icons | `lucide-react-native` |
| `motion/react` animations | `react-native-reanimated` |
| CSS `overflow-hidden` | `overflow: 'hidden'` no style |
| `pb-safe` / safe area | `useSafeAreaInsets()` |
| `className` (Tailwind) | `className` (NativeWind v4) |

---

## ADICIONAR/ATUALIZAR GITHUB

  1. git add .  
  2. git commit -m "alterações design do onboarding"
  3. git push

---

## CORES OFICIAIS (`constants/colors.ts`)

```typescript
export const Colors = {
  black: '#1A1A1A',
  white: '#FFFFFF',
  gray: '#9CA3AF',
  lightGray: '#F5F5F7',
  disabled: '#D1D5DB',
  border: 'rgba(0,0,0,0.1)',
  muted: '#717182',
  inputBg: '#F3F3F5',
  destructive: '#D4183D',
  accent: '#FF9B8A',
  tabBarBg: '#EDEDEE',
  tabActive: '#1D3A44',
  tabInactive: '#8A8A8E',
  scanBtn: '#FB7B6B',
  scanBtnShadow: 'rgba(251,123,107,0.4)',
  cardBg: '#F6F4EE',
  gold: '#FFD700',
} as const;
```

> 🎨 **COR PRIMÁRIA ATUAL = rosa da Rotina `#FF9D9D`** (o `BRAND` de `protocolo.tsx`, a.k.a. `--coral-soft`). Por decisão do usuário, o **antigo vermelho/coral padrão** (gradiente de scan `#FF6661→#C02225` e o coral `#F86B79`/`#FB7B6B`) foi **substituído por `#FF9D9D`** em todos os CTAs/acentos principais: **botão "Escanear" da home** (agora `#FF9D9D` chapado + glow rosa, não mais o gradiente vermelho), **navbar** (ícone ativo + ponto + badge de notificação), **modal "Novo scan"** (`ScanModal.tsx`), **NIKS Chat** (botão enviar, saudação "Olá, X", ícones das sugestões, caret, **e as logos hero+header+avatares tintadas `#FF9D9D`** via `tintColor`, como o herói de `protocolo`), **Home** ("X passos" do card de rotina), e **Recomendação de Produtos** (logo do header, ícone sol, botão "Salvar na minha rotina", tags). As constantes `Colors.scanBtn/scanBtnShadow` em `constants/colors.ts` **não** são a fonte de verdade dos CTAs (que usam valores inline) — a cor viva é `#FF9D9D`. ⚠️ **`Image` `tintColor` NÃO repinta com fast-refresh** (RN cacheia o bitmap tintado) — precisa **reload completo** do app pra ver a mudança de cor de logo.

---

## SISTEMA DE FONTES

A maior parte do app usa arquivos `.ttf` locais em `assets/fonts/` (Playfair/DM Serif). **Exceção — as telas do "Novo design" (`home.tsx`, `recomendacao-produtos.tsx`) e a navbar** usam os pacotes **`@expo-google-fonts/nunito`, `@expo-google-fonts/exo-2` e `@expo-google-fonts/lato`**, carregados via `useFonts` diretamente das constantes do pacote (ex.: `import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito'`). Pesos usados: **Nunito** ExtraBold/Bold/SemiBold (home) + Medium/Regular/Light (recomendacao-produtos: título/label/chips), **Exo 2** Bold (números das métricas), **Lato** Regular (labels das métricas) e **Lato Black (900)** (títulos dos cards da análise de produto — `components/product/ProductAnalysis`; o Figma pede Lato **Bold**, mas o 700 ficou fraco demais em texto colorido, então subimos pro 900 a pedido do usuário). Nas telas antigas, o `latoFont` continua sendo um alias legado que aponta para `PlayfairDisplay-Regular`.

> ⚠️ **Lato não tem SemiBold (600):** o pacote só traz 100/300/**400**/700/900. Onde o Figma pede "Lato SemiBold" (ex.: labels do card de métricas node 1:63) usamos **Lato Regular (400)** — o 700 Bold ficaria pesado demais. Se precisar do SemiBold exato, adicionar `Lato-SemiBold.ttf` como fonte local em `assets/fonts/`.

### Fontes disponíveis em `assets/fonts/`

| Arquivo | Status |
|---|---|
| `PlayfairDisplay-Regular.ttf` | ✅ Fonte principal — usada em toda a app |
| `PlayfairDisplay-Italic.ttf` | ✅ Fonte display — títulos grandes, destaques |
| `DMSerifDisplay-Regular.ttf` | ✅ Fonte "cerimônia" — tela de celebração do protocolo |
| `DMSerifDisplay-Italic.ttf` | ✅ Fonte "cerimônia" itálica + `cerimSkiaFont` no Canvas Skia |
| `CormorantGaramond-Regular.ttf` | ⚠️ Disponível mas não carregada via `useFonts` em nenhuma tela |
| `CormorantGaramond-Italic.ttf` | ⚠️ Disponível mas não carregada via `useFonts` em nenhuma tela |

### Padrão de variáveis por tela

Cada tela/componente que usa fontes personalizadas chama `useFonts` localmente (não há provider global de fontes) e define variáveis locais:

```typescript
const [fontsLoaded] = useFonts({
  'PlayfairDisplay-Regular': require('../../assets/fonts/PlayfairDisplay-Regular.ttf'),
  'PlayfairDisplay-Italic':  require('../../assets/fonts/PlayfairDisplay-Italic.ttf'),
  'DMSerifDisplay-Regular':  require('../../assets/fonts/DMSerifDisplay-Regular.ttf'),
  'DMSerifDisplay-Italic':   require('../../assets/fonts/DMSerifDisplay-Italic.ttf'),
});
const displayFont    = fontsLoaded ? 'PlayfairDisplay-Italic'  : undefined; // títulos/destaques
const displayFontReg = fontsLoaded ? 'PlayfairDisplay-Regular' : undefined; // texto normal serif
const latoFont       = fontsLoaded ? 'PlayfairDisplay-Regular' : undefined; // alias — aponta para Regular
const cerimFont      = fontsLoaded ? 'DMSerifDisplay-Italic'   : undefined; // tela de celebração
const cerimFontReg   = fontsLoaded ? 'DMSerifDisplay-Regular'  : undefined; // tela de celebração normal
```

> **Regra:** usar `undefined` (não `''`) quando as fontes ainda não carregaram — o React Native usa a fonte do sistema como fallback automático, evitando flash de layout.

### Onde cada fonte é usada

| Variável | Fonte real | Usada em |
|---|---|---|
| `displayFont` | PlayfairDisplay-Italic | Títulos grandes (54px), subtítulos em destaque, nomes de itálico em `home`, `ScanModal` |
| `displayFontReg` | PlayfairDisplay-Regular | Texto serif normal: score e data nos cards de scan, score de refeição |
| `latoFont` | PlayfairDisplay-Regular | Alias de `displayFontReg` — usado em `ScanCard`, `RefeicoesSection`, `RitualCard` |
| `cerimFont` / `cerimFontReg` / `cerimSkiaFont` | DMSerifDisplay-Italic/Regular | **Cerimônia (ritual) da Rotina** — re-portada da produção (seção 6). `protocolo.tsx` carrega DM Serif no `useFonts` (além de Nunito) e usa `cerimSkiaFont` (`useFont`) no numeral do orb. |

> ⚠️ **`protocolo.tsx` usa Nunito** (`@expo-google-fonts/nunito`, mesmas fontes da `home`/`recomendacao`) para a tela **e DM Serif Display** para a cerimônia/ritual (re-portada da produção — seção 6). Não usa Playfair.

---

## SUPABASE

| Campo | Valor |
|---|---|
| Project URL | https://utpljvwmeyeqwrfulbfr.supabase.co |
| Anon Key | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0cGxqdndtZXllcXdyZnVsYmZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwOTc4MTUsImV4cCI6MjA4ODY3MzgxNX0.zFbYbO2LbjK1DZSK4JRkieWiD0JHnDRCMtkPU1kWaxI |
| Project Ref | utpljvwmeyeqwrfulbfr |
| Docker | NÃO necessário (deploy de functions funciona sem ele) |

> ⚠️ **`tsconfig.json` — excluir `supabase/functions`:** O `tsconfig.json` do app deve conter `"exclude": ["supabase/functions"]`. As Edge Functions são Deno (não Node/RN) e causam erros de TypeScript se o compilador do app tentar incluí-las.

### SQL Functions criadas

**`delete_user()`** — necessária para o botão "Apagar minha conta" em `perfil.tsx`:
```sql
CREATE OR REPLACE FUNCTION delete_user()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
AS $$ BEGIN DELETE FROM auth.users WHERE id = auth.uid(); END; $$;
```
Chamada via `supabase.rpc('delete_user')` no client. O `SECURITY DEFINER` permite que o usuário autenticado delete a própria conta sem expor a service role key no app.

### Tabelas criadas
- `users` — criada automaticamente no signup via trigger `handle_new_user()`
- `skin_scans` — histórico de análises de pele
- `food_scans` — histórico de análises de comida
- `protocolos` — rotina AM/PM gerada pelo `generate-protocol`
- `subscriptions` — sync RevenueCat (atualizada via webhook `revenuecat-webhook`)
- `coach_conversations` — criada por `niks-chat.tsx` em `sendMessage` (quando não há conversa ativa ou `mode === 'empty'`) e em `handleSuggestionPress` (respostas pré-definidas); o `useFocusEffect` apenas busca a conversa mais recente — **nunca cria**; agrupa mensagens em `coach_messages`
- `coach_messages` — histórico de mensagens do chat com a NIKS (lido e escrito por `niks-chat`)
- `coach_memories` — memórias de longo prazo extraídas das conversas pelo `niks-chat`
- `coach_protocol_suggestions` — propostas de alteração de protocolo aguardando aprovação da usuária
- `recomendacoes_produtos` — recomendação de produtos reais (catálogo `produtos`) por usuária, gerada **uma vez** no primeiro scan pela Edge Function `recomendar-produtos` e **nunca regenerada** (UNIQUE em `user_id`). RLS: usuária lê só a própria linha; escrita só via service role. Migration: `supabase/migrations/20260708120000_create_recomendacoes_produtos.sql`
- `product_scans` — histórico da feature **Escanear Produto** (uma linha por scan de produto). Escrita só via service role (Edge Function `analisar-produto`); RLS: usuária lê só as próprias linhas (`auth.uid() = user_id`). Idempotência por `client_scan_id` (índice único PARCIAL `WHERE client_scan_id IS NOT NULL`). Migration: `supabase/migrations/20260710120000_create_product_scans.sql`
- `cupons` — cupons de influenciadora. Colunas: `codigo` (UNIQUE, CHECK `= upper(codigo)`), `influenciadora`, `ativo`, `expira_em` (opc), `max_usos` (opc), `total_aplicacoes`, `total_assinaturas`, `created_at`. **RLS ligado SEM nenhuma policy** → o app nunca lê a lista; só as Edge Functions (service role) acessam. Cupons cadastrados: `MAISENA10` (real) + `TESTE10`/`TESTEOFF`/`TESTEEXP`/`TESTELIMITE` (teste). Migration: `20260722120000_create_cupons_influenciadoras.sql` (+ reset pós-teste `20260722130000`)
- `cupom_aplicacoes` — uma linha por aplicação de cupom. Colunas: `cupom_id`, `rc_app_user_id` (id do RevenueCat no momento da aplicação, anônimo), `user_id` (NULL até o signup ligar), `aplicado_em`, `converteu`. **UNIQUE(`cupom_id`, `rc_app_user_id`)** = dedup por pessoa. **RLS ligado SEM policy.** Trigger `cupom_aplicacoes_contadores_trg`: INSERT → `cupons.total_aplicacoes++`; `converteu` false→true → `cupons.total_assinaturas++` (idempotente). Mesma migration acima. Ver "Sistema de cupons de influenciadora" (seção 15)
- `cupom_desempenho` (**view**, não tabela) — consulta de desempenho por cupom: `aplicacoes`, `conversoes`, `conversoes_com_conta`, `taxa_conversao_pct`, calculadas direto de `cupom_aplicacoes` (fonte da verdade). `security_invoker = true` + `revoke` de anon/authenticated → app não lê; consulte no SQL editor: `select * from cupom_desempenho`. Migration: `20260722140000_cupom_desempenho_view.sql`

**Schema da tabela `subscriptions`:**
```sql
id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
plano text,                           -- 'mensal' | 'anual' (derivado do product_id)
status text,                          -- 'trial' | 'active' | 'cancelled' | 'expired'
rc_original_app_user_id text,         -- app_user_id vindo do RevenueCat (debug)
start_date timestamptz,               -- purchased_at_ms / 1000
end_date timestamptz,                 -- expiration_at_ms / 1000
trial_end_date timestamptz,           -- trial_end_at_ms / 1000
updated_at timestamptz DEFAULT now()
```
> ⚠️ **`user_id` tem constraint `UNIQUE` (`subscriptions_user_id_key`)** — obrigatório porque o webhook faz `.upsert(..., { onConflict: 'user_id' })`, que exige um UNIQUE (ou exclusion) em `user_id`. O PRIMARY KEY fica em `id` (não em `user_id`), então sem esse UNIQUE o Postgres lança **`42P10`** (`"there is no unique or exclusion constraint matching the ON CONFLICT specification"`) e todo upsert do webhook falha. Migration que adicionou o constraint: `supabase/migrations/20260622192946_add_unique_user_id_subscriptions.sql` (deduplica linhas por `user_id`, mantendo a mais recente por `updated_at`, e roda `ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id)`).

**Schema da tabela `protocolos`:**
```sql
id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
skin_scan_id uuid REFERENCES skin_scans(id) ON DELETE SET NULL,
rotina_am jsonb NOT NULL DEFAULT '[]',
rotina_pm jsonb NOT NULL DEFAULT '[]',
dicas text[] DEFAULT '{}',
updated_at timestamptz DEFAULT now()
```

**Schema da tabela `recomendacoes_produtos`:**
```sql
id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,  -- 1 linha por usuária
scan_id      uuid REFERENCES skin_scans(id) ON DELETE SET NULL,           -- scan de origem
recomendacao jsonb NOT NULL DEFAULT '[]',                                 -- array de passos (ver formato abaixo)
created_at   timestamptz NOT NULL DEFAULT now()
```
Formato do `recomendacao` (jsonb): array de passos, cada passo =
`{ categoria (rótulo de exibição — bate com a tela Rotina, ex. "Limpeza"/"Tratamento"/"Proteção"), passo (nome do passo do protocolo, desambigua passos de mesma categoria), periodo ("am"|"pm"|"am+pm"), produtos: [ { produto_id, principal: bool, copy: string } ] }`. Marca/nome/imagem vêm da tabela `produtos` pelo `produto_id` (não duplicados).

**Mapeamento `generate-protocol` → `protocolos`:**
| Campo da Edge Function | Coluna |
|---|---|
| `morning[]` | `rotina_am` |
| `night[]` | `rotina_pm` |
| `introduction_warnings` | `dicas[0]` |
| `expected_timeline.two_weeks` | `dicas[1]` |
| `expected_timeline.one_month` | `dicas[2]` |
| `expected_timeline.three_months` | `dicas[3]` |
| `introduction_schedule` | `dicas[4]` |

> ⚠️ O array `dicas` usa índices fixos (nunca push condicional). `lib/generateProtocol.ts` monta o array com posições garantidas — se um campo for null, salva null na posição. Isso garante que `dicas[4]` seja sempre `introduction_schedule`.

> ⚠️ **Parsing de `dicas[4]` em `protocolo.tsx`:** *(implementado — a Rotina consome dados reais via `parseCronograma()`, seção 6.)* O campo `introduction_schedule` pode vir em vários formatos dependendo do que a IA gerar. O regex de parsing suporta: `"Semana 1:"` (semana única), `"Semanas 1-2:"` ou `"Semanas 1–2:"` (intervalo, hífen ou en-dash), `"Nas semanas 3–4,"` (prefixo "Nas" + vírgula), `"A partir da semana 5:"` ou `"A partir da semana 5,"` (aberto, dois-pontos ou vírgula). Regex: `/(?:(?:Nas\s+)?Semanas?\s+([\d][\d\-–—]*\+?(?:\s+em diante)?)|A partir da semana\s+(\d+))\s*[,:]/gi`. Se o regex encontrar menos de 2 ocorrências, o texto é exibido inteiro como bloco único com label "Introdução gradual". Não alterar o formato do prompt sem verificar compatibilidade com esse regex.

**Colunas extras na tabela `users`:**
```sql
genero text, idade int4, tipo_pele text,
concerns text[] DEFAULT '{}', objetivo text,
frequency text, sun_exposure text, hydration text,
sleep text, sunscreen text, birthday text,
pregnancy_status text,              -- 'none' | 'pregnant' | 'breastfeeding' | 'trying' — só coletado para gênero Feminino
skincare_routine_type text,         -- 'zero' | 'complement' | 'prescribed' | 'unsure'
skincare_routine_description text,  -- texto livre (só coletado para complement/prescribed)
allergy_type text,                  -- 'none' | 'sensitive' | 'reaction' | 'no_history'
allergy_description text,           -- texto livre (só coletado para reaction)
push_token text,                    -- token Expo Push Notifications (salvo na tela notifications.tsx)
foto_home_url text,                 -- foto escolhida pela usuária na galeria p/ a home (signed URL do bucket `scans`, 1 ano). PRECEDÊNCIA ABSOLUTA sobre skin_scans.foto_url — ver "Feature: Foto da home escolhida pela galeria"
streak_days int4 DEFAULT 0,         -- dias consecutivos com AMBAS as rotinas (manhã + noite) concluídas
last_protocol_completed_at timestamptz  -- última vez que o streak foi incrementado (evita duplo incremento no mesmo dia)
```
> ⚠️ **`streak_days` / `last_protocol_completed_at` continuam sem ser atualizados pelo app** — a cerimônia re-portada (seção 6) marca conclusão de passo, mas o **progresso é guardado client-side em AsyncStorage** (`lib/routineProgress.ts`), **não** em `streak_days`. As colunas seguem dormentes no banco; reativar streak é trabalho futuro.

**Colunas extras na tabela `skin_scans`:**
```sql
full_result jsonb  -- objeto ScanResult completo retornado pela analyze-skin
```

**Colunas extras na tabela `food_scans`:**
```sql
meal_name text, meal_score int4, meal_label text, meal_summary text, image_url text,
full_result jsonb  -- objeto FoodAnalysisResult completo retornado pela analyze-food
```

**Schema da tabela `product_scans`:**
```sql
id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
skin_scan_id   uuid REFERENCES skin_scans(id) ON DELETE SET NULL,  -- scan de pele vigente (rastreabilidade)
image_path     text NOT NULL,       -- chave DENTRO do bucket product-scans (URL assinada gerada na leitura)
produto_nome   text,                -- denormalizado (lista "Escaneados" sem abrir o jsonb)
produto_marca  text,                -- idem
resultado      jsonb NOT NULL,      -- objeto INTEIRO da análise (re-renderiza a tela sem re-rodar IA)
client_scan_id text,                -- idempotência (double-tap / StrictMode)
created_at     timestamptz NOT NULL DEFAULT now()
-- índices: (user_id, created_at DESC); UNIQUE(client_scan_id) WHERE client_scan_id IS NOT NULL
```

**Storage buckets:**
- `scans` — **PRIVADO** — fotos de scan facial. Policies de upload/leitura por `user_id`. Sempre usar `createSignedUrl` (não `getPublicUrl`).
- `coach-images` — **PRIVADO** — fotos enviadas no chat com a NIKS. Path: `{userId}/{timestamp}.jpg`. URL assinada com TTL de 1 ano gerada por `niks-chat`.
- `skin-previews` — **PÚBLICO** — previews geradas pela `generate-skin-preview`. Usar `getPublicUrl` (não `createSignedUrl`). Path: `preview_{timestamp}.jpg`.
- `product-scans` — **PRIVADO** — fotos de produtos escaneados. Upload via service role na Edge Function `analisar-produto`; path `{userId}/{timestamp}.jpg`. **Leitura pelo app é client-side** (`createSignedUrls`) na aba "Escaneados" → **exige policy de SELECT em `storage.objects`** para a usuária ler a própria pasta (`(storage.foldername(name))[1] = auth.uid()::text`), senão a URL assinada volta vazia e a foto não aparece. Migrations: `20260710120000_create_product_scans.sql` (bucket) + `20260710130000_product_scans_storage_read_policy.sql` (policy). ⚠️ Diferente do `coach-images` (que é lido só por service role dentro de Edge Function) — por isso este precisou da policy explícita.

**Schema da tabela `coach_messages`:**
```sql
id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
conversation_id uuid NOT NULL,
user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
role text NOT NULL,                  -- 'user' | 'assistant'
content text NOT NULL,
image_url text,                      -- NULL, URL única (legado), ou JSON array de URLs assinadas (múltiplas fotos)
client_message_id text,              -- identificador do cliente; sem UNIQUE constraint no banco — salvo via insert direto
created_at timestamptz DEFAULT now()
```

**Schema da tabela `coach_memories`:**
```sql
id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
type text NOT NULL,                  -- 'allergy' | 'sensitivity' | 'pregnancy_status' | 'medication' | 'product_reaction' | 'preference' | 'routine_note' | 'skin_observation'
value text NOT NULL,
confidence float4 NOT NULL,
is_active boolean DEFAULT true,      -- false quando substituída por memória mais recente do mesmo type
created_at timestamptz DEFAULT now()
```

**Schema da tabela `coach_protocol_suggestions`:**
```sql
id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
conversation_id uuid NOT NULL,
reason text NOT NULL,                -- justificativa clínica extraída da resposta da NIKS
proposed_changes jsonb NOT NULL,     -- { action, step_name, period, duration_days, details }
status text DEFAULT 'pending',       -- 'pending' | 'applied' | 'rejected'
approved_at timestamptz,             -- preenchido quando applied
applied_at timestamptz,              -- preenchido quando applied
created_at timestamptz DEFAULT now()
```

### Edge Functions deployadas

**Comando de deploy:**
```bash
supabase functions deploy <nome> --no-verify-jwt --project-ref utpljvwmeyeqwrfulbfr
```

| Função | Status | Entrada | Saída |
|---|---|---|---|
| `analyze-skin` | ✅ | **Onboarding, 1 foto:** `{ imageBase64, skinProfile: { skin_type, concerns, genero, idade, sun_exposure, hydration, sleep, objetivo } }`. ⚠️ **A análise multi-foto do app é uma função SEPARADA, `analyze-skin-app`** (ver linha abaixo e "Scan de pele multi-foto (13b)") — esta aqui é só o onboarding. | Schema clínico completo — ver tipo `ScanResult` no store. Campos-chave: `skin_score`, `skin_type_detected`, `headline`, `acne`, `envelhecimento`, `pigmentacao`, `cicatrizes`, `rosacea`, `textura_poros`, `barrier_status`, `qualidade_foto`, `confianca_analise`, `prioridade_clinica`, `contraindicacoes`, `pontos_fortes: string[2]`, `pontos_fracos: string[3]`, `skin_strengths[2]`, `action_recommendations[4]`, `region_insights[]` (apenas regiões com condição relevante), `goal_alignment` (apenas se `objetivo` informado), `disclaimer`, **`metricas`** (6 métricas visuais da home — `qualidade_pele/atratividade/juventude/oleosidade/acne/linhas_expressao`, inteiros 0–100, cada um pode ser `null`). ⚠️ **`metricas` é INDEPENDENTE do `skin_score`** — não entra no cálculo dele (ETAPA 8 do prompt); há um clamp no código que sanitiza cada valor (0–100 ou `null`). Consumidas **só na home**. `metricas.acne` (inteiro 0–100) é separado do objeto clínico `acne` do topo. |
| `analyze-skin-app` | ✅ | **App (dentro do app), multi-foto:** `{ imageBase64 (neutra, fallback), imagesBase64: [neutra, layoutA, layoutB], scanLayout: 'expressions_v1', skinProfile: {...} }` — usa o prompt multi só quando `scanLayout === 'expressions_v1' && imagesBase64.length === 3`; senão degrada para 1 foto. **Cópia integral da `analyze-skin`** com os blocos multi; foi separada de propósito para poder aprofundar a análise (e no futuro usar modelo mais caro) **sem tocar no onboarding**. ⚠️ **Mesmo schema de saída da `analyze-skin`** — as duas alimentam a mesma UI; divergir o prompt é o esperado, divergir o schema não. Chamada por `loading-dentro-app.tsx`. Ver "Scan de pele multi-foto (13b)". | Idêntico ao da `analyze-skin`. |
| `analyze-food` | ✅ | `{ imageBase64, mimeType, skinProfile: { skin_type, concerns } }` | `{ meal_score, meal_summary, foods[], highlights, watch_out, science_note, disclaimer }` |
| `generate-protocol` | ✅ | `{ scanResult, onboardingData }` | `{ morning[], night[], introduction_warnings, expected_timeline, introduction_schedule }` — cada item de `morning`/`night` contém: `id, name, ingredient, instruction, steps: string[], color, waitTime, product_suggestions`. **Não retorna `schedule`** — dias da semana vêm embutidos no campo `ingredient` como sufixo `(Seg/Qua/Sex)` e são parseados no cliente via `applySchedule` em `protocolo.tsx`. |
| `send-notifications` | ✅ | `{ type: 'morning_routine' \| 'night_routine' \| 'food_reminder', user_ids?: string[] }` | `{ sent: number, type }` — busca `push_token` dos usuários no Supabase e envia via Expo Push API |
| `revenuecat-webhook` | ✅ | POST do RevenueCat — header `Authorization: Bearer REVENUECAT_WEBHOOK_SECRET` | Retorna sempre HTTP 200. Faz UPSERT em `subscriptions` (`onConflict: 'user_id'`) com base no `app_user_id` (= `user_id` do Supabase). Trata: `INITIAL_PURCHASE`, `RENEWAL`, `TRIAL_STARTED`, `TRIAL_CONVERTED`, `TRIAL_CANCELLED`, `CANCELLATION`, `EXPIRATION`, `UNCANCELLATION`. **3 guardas defensivas, nesta ordem, cada uma retornando `{ ok: true, skipped: true }` (200) sem tocar no banco — não remover:** (1) **tipo de evento fora da lista tratada** (ex.: `TRANSFER`, que tem estrutura diferente e não traz `app_user_id` na raiz) → evita `Missing event fields`; (2) **`app_user_id` anônimo (`$RCAnonymousID:`) ou não-UUID** (compras antes da identificação no app) → evita `invalid input syntax for type uuid`; (3) **`user_id` inexistente em `users`** (verificado via `.maybeSingle()` antes do upsert) → evita violação da FK `subscriptions_user_id_fkey` de usuários que nunca completaram o cadastro. O 200 em todos os casos impede retry do RevenueCat. **Requer `UNIQUE (user_id)` em `subscriptions`** (ver schema da tabela acima) — sem ele o upsert falha com `42P10`. **⚠️ Atribuição de cupom (conversão):** ANTES dos 3 guards acima (que são só do upsert de `subscriptions`), roda `marcarConversaoCupom` — se `product_id === 'br.com.niksai.app.anual.promo10'` (produto de cupom, id próprio → toda compra dele veio de cupom) e o tipo é positivo (`INITIAL_PURCHASE`/`TRIAL_STARTED`/`TRIAL_CONVERTED`/`RENEWAL`/`UNCANCELLATION`), marca `converteu=true` na aplicação MAIS RECENTE de `cupom_aplicacoes`. **Casa por `rc_app_user_id` OU `user_id` quando o `app_user_id` da compra é UUID** (`.or(rc_app_user_id.eq.X,user_id.eq.X)`); só por `rc_app_user_id` quando é anônimo. ⚠️ **Não assuma que o id da compra == o id da aplicação:** se um `Purchases.logIn` ocorre entre aplicar o cupom e comprar, a compra vem com o id novo (UUID) e a linha ficou gravada com o antigo — por isso o casamento por `user_id` (que o `atribuir-cupom` já ligou). Roda ANTES do guard de anônimo de propósito (compra de usuária nova chega com id anônimo). Idempotente: `total_assinaturas` só sobe no `false→true` do trigger. Se o id da compra é UUID, liga também o `user_id`. Nunca derruba o webhook (try/catch interno). |
| `niks-chat` | ✅ | Header `Authorization: Bearer <session_token>` (JWT do usuário autenticado — **não** a ANON_KEY). O token é obtido em `sendMessage` chamando **sempre** `supabase.auth.refreshSession()` antes do XHR — não `getSession()`. O `refreshSession()` garante um token fresco independentemente de clock skew ou race conditions internas do cliente Supabase. Se `refreshSession` falhar, usa `getSession()` como fallback. Body: `{ conversationId, message?, images?: Array<{base64: string, mimeType: string}>, clientMessageId? }` — `message` e `images` são ambos opcionais, mas pelo menos um deve estar presente. `userId` **não vai no body** — é extraído internamente via verificação local do JWT (`verifyJWT` com `crypto.subtle`, suportando HS256 via `NIKS_JWT_SECRET` e ES256/RS256 via `SUPABASE_JWKS`). | Stream `text/plain; charset=utf-8` — resposta da NIKS em tempo real. Pós-stream via `waitUntil`: salva resposta em `coach_messages`; depois bifurca — se havia sugestão pendente (`context.pendingSuggestion`), chama `checkApprovalIntent` (detecta "sim"/"não" na mensagem do usuário via OpenAI e aplica/rejeita a sugestão); caso contrário, extrai memórias em `coach_memories` e detecta nova proposta em `coach_protocol_suggestions`. |
| `approve-coach-protocol-change` | ✅ | Header `Authorization: Bearer <session_token>` (JWT do usuário). Body: `{ suggestion_id, approved: boolean }`. `user_id` **não vai no body** — extraído do JWT. | `{ success: true, action: 'rejected' \| 'applied', protocol? }` — aplica ou rejeita manualmente uma proposta pendente em `coach_protocol_suggestions`. Se `approved: true`, modifica `rotina_am`/`rotina_pm` em `protocolos` (add/remove/pause com base em `proposed_changes`) e marca `status: 'applied'`. |
| `generate-skin-preview` | ✅ | `{ image: string }` — base64 da foto do rosto (com ou sem prefixo `data:image/...`) | `{ preview_url: string }` — URL pública da preview no bucket `skin-previews`. Chama **OpenAI Images Edit API** (`gpt-image-2`) — única função do projeto que usa OpenAI (não Gemini). Faz upload do resultado em `skin-previews`. Requer secret `OPENAI_API_KEY`. |
| `analisar-produto` | ✅ | Header `Authorization: Bearer <session_token>` (JWT do usuário — **não** a ANON_KEY; verificado **localmente** via `verifyJWT`/`crypto.subtle`, HS256 via `NIKS_JWT_SECRET` e ES256/RS256 via `SUPABASE_JWKS`, igual ao `niks-chat`). Body: `{ images: [{ base64, mimeType }], clientScanId? }` — `images[0]` = foto do PRODUTO (obrigatória), `images[1]` = ingredientes (opcional); sem imagem → 400. Deploy `--no-verify-jwt`. **Padrão body-first:** lê `await req.text()` ANTES de qualquer rede (evita 401 falso com imagem grande). | `{ scan_id, ...análise }` (`application/json`). Visão **`gpt-5.4-mini`** (`max_completion_tokens: 4096`, `json_object`, retry 3× em 500/503 — mesmo formato do `analyze-skin`). Monta context pack XML (perfil `users` **+ `skincare_routine_type`/`_description`**, último `skin_scans.full_result`, `protocolos`, `coach_memories` ativas — lógica adaptada do `niks-chat`). Análise em 2 momentos + veredito estruturado: `{ status, produto{nome,marca,categoria,ativos_detectados}, confianca, o_que_faz, veredito ('pode_usar'\|'com_ressalva'\|'evitaria'), **compatibilidade (inteiro 0–100)**, resumo, explicacao, resultado_esperado_para_voce, decisao_rotina{tipo ('adicionar'\|'substituir'\|'manter_rotina'), passo, periodo, produto_substituivel, justificativa}, avisos[] }`. ⚠️ **`resultado_esperado_geral` foi REMOVIDO** (era redundante com o `o_que_faz`, e os dois cards diziam quase a mesma coisa): o **Momento 1 agora cabe inteiro no `o_que_faz`** (2–3 frases: o que o produto é, como age e o que costuma entregar). O `resultado_esperado_para_voce` (versão personalizada, Momento 2) continua. **Scans antigos ainda têm o campo no jsonb** — a tela simplesmente ignora; **sem migration, sem backfill**. ⚠️ **`veredito` e `decisao_rotina.tipo` são eixos INDEPENDENTES** — `veredito` nunca é `'manter_rotina'` (correção explícita no prompt). ⚠️ **`compatibilidade` é a expressão NUMÉRICA do `veredito` (Camada 1 — quão bem o produto serve pra pele dela), não um voto na Camada 2:** o prompt exige que o número caia SEMPRE na faixa do veredito (evitaria 0–35 · com_ressalva 40–70 · pode_usar 75–100) e que a decisão de rotina seja tomada ignorando o score — compatibilidade alta + `manter_rotina` é combinação normal (produto serve, mas a rotina já cobre). É o número grande da tela de resultado (`product-result`), que define o tema de cor da tela. **Scans ANTIGOS não têm o campo** (`product_scans.resultado` guarda o objeto inteiro, então o campo novo persiste sozinho — sem migration, sem backfill): todo consumo precisa tolerar `undefined` (a tela mostra `—`, nunca "NaN%"). `status: 'ok'` → faz upload da `images[0]` no bucket `product-scans` + insere em `product_scans` (idempotente por `client_scan_id`, com try/catch — a análise volta pro app mesmo se a escrita falhar). `status: 'precisa_foto'` → não persiste. Secrets: reusa `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NIKS_JWT_SECRET`/`SUPABASE_JWKS` (nenhum novo). |
| `recomendar-produtos` | ✅ | `{ user_id, scan_id? }` (fetch direto + `apikey`; deploy `--no-verify-jwt`) | `{ recomendacao }` — array de passos com produtos do catálogo `produtos`. **Auto-guardada (gera UMA vez):** se já existe linha em `recomendacoes_produtos` p/ o user, retorna a existente sem regenerar. Busca no banco (perfil em `users`, scan em `skin_scans.full_result`, protocolo em `protocolos`). Classifica cada passo com o **`classifyStep` portado verbatim de `protocolo.tsx`** → categoria de produto. Filtro SQL de elegibilidade **generoso** (categoria + `tipos_pele` + `ativo`; gestante → só `seguro_gestante`; concerns só ranqueiam, não filtram) com **corte DURO de alérgeno** (map keyword de `allergy_description` → códigos `alergenos`; na dúvida corta). **GATE DE INGREDIENTE (só passos `classifyStep==='Tratamento'`):** extrai o ativo-alvo do `name`/`ingredient` (`detectTargetActive`) e exige que `ativos_principais` contenha o ativo — **AHA é classe** (mandélico/glicólico/láctico/aha/pha se substituem), **BHA/salicílico e azelaico são exatos**, **bakuchiol nunca vira retinoide** (segurança gestante). Isso corrige o bug "passo de vit C recebia azelaico" (os 4 séruns colapsavam no mesmo pool). Passo de Tratamento gateado sem match → entrada `{ sem_produto: true, motivo }`; **`sem_produto` é EXCLUSIVO de Tratamento gateado**. Passos de olhos/olheiras e `Cuidado` (não reconhecido) → **omitidos em silêncio** (sem mensagem); staples nunca viram `sem_produto`. **Desempate de passos-irmãos** (2+ passos na mesma categoria staple, ex.: "Hidratante Leve" AM vs "Hidratante com Ceramidas" PM): nudge de ranqueamento por intenção do passo (`stepIntent` — preferência, nunca corte) + não repete o mesmo principal entre irmãos se houver alternativa distinta. Camada de IA (`gpt-4.1-mini`, `json_object`) escolhe 1–3 por passo (traz 2–3 quando há alternativas boas e distintas), marca 1 principal, sempre **dentro do conjunto elegível** (validado por id). **Copy nunca vazia:** se a IA não devolve copy, sintetiza de `marca + ativo + ideal_para` (`synthCopy`). Disparada por [lib/generateProtocol.ts](lib/generateProtocol.ts) logo após o insert de `protocolos` (não bloqueante). Requer `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. |
| `validar-cupom` | ✅ | `{ codigo, rc_app_user_id }` (fetch direto + `apikey`; deploy `--no-verify-jwt`). **Sem autenticação de propósito:** no onboarding o paywall vem ANTES do signup — a usuária ainda não tem sessão Supabase e o RevenueCat está anônimo. A identidade provisória é o `rc_app_user_id` (id do RevenueCat no momento); o `user_id` real é resolvido depois, no signup. | `{ valido, motivo, ja_aplicado?, cupom? }`. **Válido:** `{ valido: true, motivo: 'ok', ja_aplicado, cupom: { codigo, influenciadora } }` — registra a aplicação em `cupom_aplicacoes` e o `total_aplicacoes` do cupom sobe (via trigger no banco). **Mesma pessoa (mesmo `rc_app_user_id`) 2×:** `valido: true, ja_aplicado: true` **sem contar de novo** (dedup por `UNIQUE(cupom_id, rc_app_user_id)` + `on conflict do nothing`). **Inválido, motivo distinguível p/ a tela mostrar mensagens diferentes:** `nao_existe` \| `desativado` \| `expirado` \| `limite_atingido`. Normaliza `codigo` (`trim().toUpperCase()`). Respostas de negócio sempre HTTP 200 (o app lê `valido`+`motivo`); **400** só input malformado; **500** erro inesperado. **RLS ligado em `cupons`/`cupom_aplicacoes` SEM nenhuma policy** → só esta função (service role, bypass) acessa; o app nunca lê a lista de cupons. Cupons: `MAISENA10` (real) + `TESTE10`/`TESTEOFF`/`TESTEEXP`/`TESTELIMITE` (testam os 4 motivos no simulador). Migrations `20260722120000_create_cupons_influenciadoras.sql` (+ reset `20260722130000`). Requer `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. **A CONVERSÃO (`user_id` + `converteu`) é fechada por `atribuir-cupom` + `revenuecat-webhook` (linhas abaixo).** |
| `atribuir-cupom` | ✅ | `{ user_id, rc_app_user_id, codigo }` (fetch direto + `apikey`; deploy `--no-verify-jwt`). Chamada por [lib/couponAttribution.ts](lib/couponAttribution.ts) → `attributeCouponIfAny(userId)` no signup (3 caminhos, após `saveToSupabase`) e em `paywall-soft.tsx` (usuária que já tinha conta, reengajamento → home). **⚠️ Usa o `rc_app_user_id` GUARDADO no store (`appliedCoupon`), não `getAppUserID()` atual** — no signup o `Purchases.logIn` troca o id do RC do anônimo p/ o identificado; usar o id guardado faz a busca INDEPENDER da ordem das chamadas. | `{ ok: true, linked: boolean }`. **Liga o `user_id` E marca `converteu=true`.** Resolve o cupom pelo `codigo` (atribuição precisa mesmo se testou mais de um) e faz `update cupom_aplicacoes set user_id, converteu=true where cupom_id=… and rc_app_user_id=…` (casa pelo id GUARDADO, sem guard de `user_id is null` — a conversão precisa ser marcada mesmo se o user_id já foi ligado antes). **⚠️ Por que o app marca `converteu` (e não só o webhook):** se o id do RevenueCat muda entre aplicar o cupom e comprar (um `Purchases.logIn` no meio), a compra chega com outro id e o webhook — que casa pelo app_user_id da compra — não acha a linha; o app acha (pelo id guardado), então ele é o caminho confiável nesse caso. Idempotente: o contador só sobe no `false→true` do trigger. **A FK `cupom_aplicacoes.user_id → users(id)` exige a linha em `users` já criada** — por isso a chamada vem DEPOIS de `saveToSupabase` no signup. Nunca trava o app: `attributeCouponIfAny` é fire-and-forget e engole erro (a assinatura vale mais que a métrica). Requer `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. **Consulta:** view `cupom_desempenho` (`select * from cupom_desempenho` no SQL editor) — aplicações, conversões e taxa por cupom, calculadas de `cupom_aplicacoes`; `security_invoker` + `revoke` do anon (app não lê). Migration `20260722140000`. |

**Configuração do webhook no RevenueCat Dashboard:**
- RevenueCat Dashboard → Project → Integrations → Webhooks
- URL: `https://utpljvwmeyeqwrfulbfr.supabase.co/functions/v1/revenuecat-webhook`
- Authorization header: `Bearer <valor do secret REVENUECAT_WEBHOOK_SECRET>`

**Modelos de IA:**
- `analyze-skin` (onboarding, 1 foto) e `analyze-skin-app` (app, multi-foto): **`gpt-5.4-mini` (OpenAI)** — `response_format: json_object`, `max_completion_tokens: 4096`, retry em HTTP 500/503. Mesmo modelo hoje; a `analyze-skin-app` pode subir para um modelo melhor no futuro sem afetar o onboarding
- `analyze-food`: `gemini-2.5-pro` (mais preciso para tarefas complexas)
- `generate-protocol`: **`gpt-4.1-mini` (OpenAI)** — `response_format: json_object`, `max_completion_tokens: 8192`, não usa streaming, retorna `text/plain; charset=utf-8` para compatibilidade com `response.text()` + `JSON.parse()` no cliente
- `niks-chat`: **`gpt-4.1-mini` (OpenAI)** — streaming principal + pós-stream via `waitUntil`: se havia sugestão pendente → 1 chamada não-streaming para `checkApprovalIntent`; caso contrário → 2 chamadas para `extractAndSave` + `checkForSuggestion`
- `generate-skin-preview`: **`gpt-image-2` via OpenAI Images Edit API**
- `recomendar-produtos`: **`gpt-4.1-mini` (OpenAI)** — `response_format: json_object`, `max_completion_tokens: 4096`, retry em HTTP 500/503 (mesmo padrão do `generate-protocol`)
- `analisar-produto`: **`gpt-5.4-mini` (OpenAI)** — visão (imagem do produto + ingredientes), `response_format: json_object`, `max_completion_tokens: 4096` (**nunca `max_tokens`** — família GPT-5 quebra), retry 3× em HTTP 500/503 (mesmo formato do `analyze-skin`)

Secret `GEMINI_API_KEY` configurado no Supabase Dashboard (Project Settings → Edge Functions → Secrets).

**Secrets necessários no Supabase Dashboard (Project Settings → Edge Functions → Secrets):**
- `GEMINI_API_KEY` — usado por `analyze-food`
- `OPENAI_API_KEY` — usado por `analyze-skin`, `analyze-skin-app`, `generate-protocol`, `niks-chat` e `generate-skin-preview`
- `REVENUECAT_WEBHOOK_SECRET` — usado por `revenuecat-webhook` para validar o header `Authorization`
- `NIKS_JWT_SECRET` — usado por `niks-chat` para verificar JWTs HS256 (legacy JWT secret do Supabase). Valor: JWT secret do projeto (Supabase Dashboard → Project Settings → API → JWT Secret). **⚠️ O nome não pode começar com `SUPABASE_` — a CLI do Supabase bloqueia secrets com esse prefixo. Por isso o nome é `NIKS_JWT_SECRET` e não `SUPABASE_JWT_SECRET`.**
- `SUPABASE_JWKS` — usado por `niks-chat` para verificar JWTs ES256/RS256 (novas JWT Signing Keys do Supabase). Valor: JSON completo das JWKS (Supabase Dashboard → Project Settings → API → JWT Signing Keys → "JWKS (public)"). **Se ausente e o projeto usar ES256/RS256, toda autenticação do `niks-chat` falha com 401.**

**Configuração Gemini nas Edge Functions** (apenas `analyze-food` ainda usa Gemini):
- `maxOutputTokens`: 4096 para `analyze-food`
- `system_instruction` separa o system prompt do user message (equivalente ao `system` do Claude)
- Imagens enviadas via `inlineData: { mimeType, data: base64 }` (não via URL)
- `safetySettings` com `BLOCK_NONE` em todas as categorias — obrigatório em `analyze-food`, senão o Gemini bloqueia a requisição e não retorna `candidates`, causando crash
- JSON parsing: tenta extrair bloco ` ```json ``` ` primeiro, depois fallback para `\{[\s\S]*\}` — Gemini pode retornar markdown em vez de JSON puro
- **JSON mode nas chamadas secundárias do `niks-chat`** (`extractAndSave`, `checkForSuggestion`, `checkApprovalIntent`): usam `response_format: { type: 'json_object' }` da API OpenAI — garante JSON válido sem preamble (não há `finishReason` para checar). `max_tokens`: 512 para `extractAndSave`/`checkForSuggestion`; 128 para `checkApprovalIntent`. Como defesa adicional, a função `extractJSON` localiza os delimitadores `{` e `}` no texto antes de parsear.
- Deploy com `--no-verify-jwt` — obrigatório, senão retorna `Invalid JWT`
- **Retry em `analyze-food` (Gemini 503):** o Gemini retorna 503 `UNAVAILABLE` com frequência sob alta demanda — loop de **3 tentativas** com **3s de espera** antes de retornar erro ao app. `analyze-skin` (OpenAI) também tem retry de 3 tentativas, mas verifica `response.status` HTTP 500/503 em vez de inspecionar o body. Não remover nenhum dos dois loops.
- `generate-protocol` gera o protocolo **do zero** com um system prompt dermatológico clínico extenso (hierarquia clínica, regras cronobiológicas, incompatibilidades, adaptações por fotótipo). Não usa mais `BASE_PROTOCOLS` nem recebe `baseProtocol` — o campo é ignorado se enviado
- **`generate-protocol` usa OpenAI não-streaming** — retorna `text/plain; charset=utf-8` (não `application/json`) para manter compatibilidade com o cliente. No cliente (`lib/generateProtocol.ts`), a resposta é lida com `response.text()` seguido de `JSON.parse()` — **nunca usar `response.json()` aqui**, pois o Content-Type não é `application/json`.
- **`niks-chat` usa `TransformStream` + `EdgeRuntime.waitUntil`:** o stream OpenAI passa por um `TransformStream` que intercepta cada chunk inline — reenvia para o cliente imediatamente e acumula o texto em memória. Quando o stream fecha (`flush`), uma Promise se resolve com o texto completo, e `waitUntil` executa 3 tarefas sem bloquear a resposta: (1) salva a mensagem da NIKS em `coach_messages`, (2) chama Gemini não-streaming para extrair memórias duradouras (`coach_memories`), (3) detecta a frase-gatilho `"Posso incluir isso no seu protocolo?"` e, se presente, chama Gemini não-streaming para estruturar a proposta (`coach_protocol_suggestions`). **Não usar `ReadableStream.tee()`** no lugar do `TransformStream` — o `tee()` cria dois leitores com backpressure acoplado: quando um leitor consome o stream em memória (rápido) enquanto o outro é limitado pela rede do cliente (lento), a fila interna do tee cresce indefinidamente no Deno Edge Runtime e causa corte da mensagem no meio do streaming. A função lê o body completo com `await req.text()` **antes** de qualquer chamada de rede de saída — requests com imagens grandes (base64) deixam o stream de entrada aberto enquanto o runtime faz chamadas externas, causando o proxy a retornar HTML de erro em vez de JSON, o que resultava em 401 falso. O JWT é verificado localmente via `verifyJWT` (`crypto.subtle`) sem chamada de rede ao Supabase Auth — suporta HS256 (secret legado via `NIKS_JWT_SECRET`) e ES256/RS256 (novas JWT Signing Keys via `SUPABASE_JWKS`). **Por quê local e não `auth.getUser()`:** sob determinadas condições (requests com body grande, alta carga), o serviço Supabase Auth retornava respostas HTML em vez de JSON para `auth.getUser()`, causando 401 falsos em todas as mensagens. A verificação local elimina esse ponto de falha externo. Depois usa a service role key para as operações no banco, bypassando RLS nas escritas em `coach_messages`.

### Push Notifications (`pg_cron`)

3 jobs agendados no Supabase via `pg_cron` + `pg_net`. Todos chamam a Edge Function `send-notifications`:

| Job | Schedule (UTC) | Horário Brasília | Comportamento |
|---|---|---|---|
| `morning-routine` | `0 10 * * *` | Todo dia às 7h | Envia para todos os usuários com `push_token` |
| `night-routine` | `0 0 * * *` | Todo dia às 21h | Envia para todos os usuários com `push_token` |

**⚠️ Pendência:** `push_token` real só é gerado após build no TestFlight/produção. O entitlement `aps-environment: production` está configurado no `app.json`.

### Autenticação
- **Google Sign In:** ✅ funcionando
  - iOS Client ID: `436683236946-36te4gp3c6eid9frheokli00j0pnocd4.apps.googleusercontent.com`
  - Skip nonce checks ativado no Supabase (obrigatório para iOS)
- **Apple Sign In:** ✅ funcionando — `signInWithApple` em `hooks/useAuth.ts` (com nonce via `expo-crypto`); `signup.tsx` e `login.tsx` conectados
  - Team ID: `FZRSWCG9BR` | Key ID: `CM6P7WPAP2`
- **Exclusão de conta:** `deleteAccount` em `hooks/useAuth.ts` — chama `supabase.rpc('delete_user')` + signOut do Google + `supabase.auth.signOut()`. Requer a SQL function `delete_user()` deployada no Supabase.
- **E-mail + Senha:** ✅ funcionando — `signInWithEmail` e `signUpWithEmail` em `hooks/useAuth.ts`
  - Confirmação de e-mail: infraestrutura implementada e pronta. Atualmente **desativada** no Supabase Dashboard — ativar quando aprovado na App Store.
  - `emailRedirectTo: 'niks-ai://auth/confirm'` — configurado no `signUp` de `app/(onboarding)/signup.tsx`. O scheme `niks-ai` está em `app.json`.
  - Deep link handler em `app/_layout.tsx` suporta dois fluxos de auth: PKCE (`code=` → `exchangeCodeForSession`) e token-based (`access_token=` no fragmento `#` → `setSession`). O `onAuthStateChange` detecta a sessão e redireciona automaticamente — sem navegação manual necessária.
  - ⚠️ **Links que NÃO são de auth vão para o `Superwall.shared.handleDeepLink(url)`** (necessário pro preview de paywall do Superwall por QR code). Um despachante usa a MESMA condição de auth (`auth/confirm`/`code=`/`access_token=`) para decidir: auth → fluxo de auth (inalterado); o resto → Superwall. Mutuamente exclusivos — um nunca rouba o link do outro. Aplicado nos dois pontos: `getInitialURL` (cold start) e `addEventListener` (app aberto).

---

## FLUXO DE ONBOARDING (ordem atual das telas)

### Ponto de entrada — Welcome (`app/index.tsx`)

5 telas swipeáveis antes das perguntas:

| Screen | Texto principal |
|---|---|
| Screen 1 | "Bem-vinda ao NIKS" |
| Screen 2 | "Seu glowup começa pela pele" |
| Screen 3 | "Sua expert de pele sempre disponível" |
| Screen 4 | "O que você come aparece na pele" |
| Screen 5 | "Em poucas semanas você vai se olhar no espelho de um jeito diferente" |

Cada screen exibe um vídeo animado (mockup do app) na área superior via `expo-video`. O vídeo só inicia quando o usuário chega naquela tela (`isActive` prop) — não toca em background enquanto as outras telas estão visíveis.

> ⚠️ **Nomes de arquivos de assets**: nunca use caracteres especiais (ã, é, ç, etc.) em nomes de arquivos em `assets/`. O Metro Bundler falha silenciosamente ao resolver `require()` com esses caracteres — o vídeo/imagem simplesmente não carrega sem erro de build.

Botão "Começar" em todas as screens → navega para `birthday.tsx`.

### Telas ativas — em ordem

| # | Arquivo | Pasta | Descrição |
|---|---|---|---|
| 1 | `birthday.tsx` | `(onboarding)` | "Quantos anos você tem?" — scroll picker de data |
| 2 | `gender.tsx` | `(onboarding)` | "Qual seu gênero?" |
| 3 | `pregnancy.tsx` | `(onboarding)` | "Alguns ativos precisam ser evitados em certas situações" — **condicional: só aparece se gênero = Feminino** |
| 4 | `goal.tsx` | `(onboarding)` | Objetivo principal de skincare (multi-select) |
| 5 | `goal-validation.tsx` | `(onboarding)` | "Você tem tudo para conseguir o que quer" — tela informativa com gráfico animado de evolução (sem interação, só botão Continuar) |
| 6 | `concerns.tsx` | `(onboarding)` | "O que mais te incomoda na sua pele hoje?" — multi-seleção, máx 3 |
| 7 | `skin-type.tsx` | `(onboarding)` | "Como você descreveria sua pele?" — tipo de pele |
| 8 | `sun-exposure.tsx` | `(onboarding)` | Quanto tempo a usuária passa exposta ao sol por dia |
| 9 | `hydration-sleep.tsx` | `(onboarding)` | Hidratação diária + horas de sono |
| 10 | `skincare-routine.tsx` | `(onboarding)` | "Como está sua rotina de skincare hoje?" — 4 opções |
| 11 | `skincare-routine-detail.tsx` | `(onboarding)` | "Quais produtos você já usa?" / "Quais produtos foram prescritos?" — **condicional: só para `complement` ou `prescribed`** |
| 12 | `allergies.tsx` | `(onboarding)` | Alergias/sensibilidades a ativos |
| 13 | `allergies-detail.tsx` | `(onboarding)` | "Qual ativo ou produto causou reação?" — **condicional: só para `reaction`** |
| 14 | `goal-desire.tsx` | `(onboarding)` | "Qual é o seu verdadeiro objetivo?" — 6 opções emocionais; salva em `onboarding.goal_desire` no Zustand |
| 15 | `social-proof.tsx` | `(onboarding)` | "Com o NIKS, você vai conseguir 3x mais rápido" → navega direto para `scan-prep` (onboarding) ou `skin-result` (scan do app) |
| 16 | `scan-prep.tsx` | `(scan)` | Preparação para o scan facial |
| 17 | `camera.tsx` | `(scan)` | Câmera — captura da foto |
| 18 | `loading.tsx` | `(scan)` | Loading da análise de pele (chama `analyze-skin`) |
| 19 | `results.tsx` | `(scan)` | "Relatório de Pele" — resultado completo do scan |
| 20 | `plan-preview.tsx` | `(onboarding)` | "Sua rotina de skincare está pronta" → navega para `paywall-soft` |
| 21 | `paywall-soft.tsx` | `(onboarding)` | Gateway para o Superwall (sem UI própria) — em `__DEV__` pula o paywall **respeitando a sessão** (com sessão → `home`; sem sessão → `signup`); após assinatura confirmada → `signup` (nova usuária) ou `home` (usuária existente). **Botão "TENHO CUPOM" do paywall → custom action `showPromoRedeem` → tela `promo-cupom` (ver "Sistema de cupons" na seção 15)** |
| 21b | `promo-cupom.tsx` | `(onboarding)` | Tela de digitar cupom de influenciadora (só alcançável pelo botão do paywall). Valida via `validar-cupom`; válido → volta e registra `paywall_cupom` (plano com desconto); voltar → paywall normal. **Nenhuma navegação para dentro do app** — ver seção 15 |
| 22 | `signup.tsx` | `(onboarding)` | Criação de conta (e-mail, Google ou Apple) → dispara geração do protocolo em background via `lib/generateProtocol.ts` (fire-and-forget) → **liga o cupom ao `user_id` via `attributeCouponIfAny`** → navega para `nome` |
| 23 | `nome.tsx` | `(onboarding)` | "Como você quer ser chamada?" → salva em `users.nome` + **chama `attributeCouponIfAny` (chokepoint de toda usuária nova com sessão ativa, idempotente)** + navega para `notifications` |
| 24 | `notifications.tsx` | `(onboarding)` | Permissão de notificações push → navega para `/(app)/home` |

> ⚠️ **`rate-us.tsx` (`(scan)`) saiu do fluxo de onboarding.** Era o passo entre `social-proof` e `scan-prep` e disparava o popup nativo de avaliação da App Store (`requestAppReview()`) no `useEffect`. A **Apple não permite** pedir avaliação antes de o usuário realmente usar o app, então o gatilho foi desativado: `social-proof` agora navega direto para `scan-prep`/`skin-result`, e o `requestAppReview()` + o import estão comentados na `rate-us.tsx`. **O arquivo continua no projeto** (não foi deletado) para ser reaproveitado quando a avaliação for reintroduzida *dentro* do app, em momento estratégico.

### Telas deletadas (não existem mais no projeto)

`frequency.tsx`, `sunscreen.tsx`, `food-analysis.tsx`, `trust.tsx`, `commitment.tsx`, `protocol-loading.tsx`, `final-loading.tsx`, `food-scan-intro.tsx`, `analise.tsx`, `evolucao.tsx`

---

## ESTADO DO STORE (`store/onboarding.ts`)

Exporta `useAppStore` (não `useOnboardingStore`).

> ⚠️ **O store é PARCIALMENTE persistido** (`persist` + `createJSONStorage(AsyncStorage)`, nome `niks-app-store`). **Só `skinScore`, `protocolResult`, `scanTutorialSeen` e `appliedCoupon` sobrevivem a fechar o app** — todo o resto continua sendo memória pura e volta ao valor inicial no cold start. Isso é uma **lista branca deliberada** (`partialize`), não um esquecimento: ver "CACHE DE DADOS" para o porquê de cada exclusão. Ao adicionar campo novo ao store, o default é **não persistir**.
>
> **`appliedCoupon: { codigo, rcAppUserId } | null`** — cupom de influenciadora aplicado no paywall. É persistido de propósito (exceção à regra acima): a aplicação acontece ANTES do signup, e o valor precisa sobreviver até o cadastro para ligar o cupom ao `user_id` real (ver "Sistema de cupons de influenciadora" na seção 15). Limpo por `attributeCouponIfAny` quando a atribuição é feita.
>
> ⚠️ Consequência prática: a **hidratação do AsyncStorage é assíncrona**. No primeiro render após um cold start, `protocolResult` ainda é `null` e só depois é preenchido — quem lê esses dois campos precisa tolerar esse instante (a Rotina já tolera, via `useCachedQuery`).

**Tipos exportados:** `SkinMetric`, `ScanResult`, `ProtocolStep`, `ProtocolResult`, `OnboardingData`, `FoodReportResult`

**Tipo `ScanResult` (schema clínico expandido):**
```typescript
{
  // Campos obrigatórios (sempre presentes)
  skin_score: number                   // 0–100
  skin_type_detected: string           // mapeado automaticamente de skin_type_sebaceous pela Edge Function
  headline: string                     // frase específica descrevendo esta pele
  disclaimer: string

  // Métricas visuais da HOME — INDEPENDENTES do skin_score (não entram no seu cálculo).
  // Consumidas só na home (via full_result.metricas). Positivas: maior=melhor; negativas
  // (oleosidade/acne/linhas_expressao): menor=melhor. Cada uma pode ser null.
  // OBS: não está declarado no type do store — a home tipa local (FullResult).
  metricas?: {
    qualidade_pele: number|null; atratividade: number|null; juventude: number|null
    oleosidade: number|null;     acne: number|null;         linhas_expressao: number|null
  }

  // Campos clínicos (novos — todos opcionais para compat com scans antigos)
  skin_type_sebaceous?: 'seca'|'oleosa'|'mista'|'normal'  // fonte de skin_type_detected
  skin_phototype?: 'I'|'II'|'III'|'IV'|'V'|'VI'
  skin_hydration?: 'desidratada'|'normal'|'hidratada'
  barrier_status?: 'integra'|'levemente_comprometida'|'comprometida'|'severamente_comprometida'
  barrier_insight?: string
  acne?: {
    present?: boolean; lesion_type?: string|null; severity?: string
    severity_score?: number; distribution?: string[]; pattern?: string|null
    score?: number; label?: string; insight?: string  // score/label/insight: compat com UI
  }
  cicatrizes?: { present: boolean; type: string|null; severity: string|null; location: string[] }
  pigmentacao?: { present: boolean; type: string|null; location: string[]; intensity_score: number; insight: string }
  rosacea?: { present: boolean; subtype: string|null }
  textura_poros?: { pore_visibility: string; texture: string; insight: string }
  brilho_sebaceo?: { intensity: string; location: string[] }
  envelhecimento?: { present: boolean; lines_type: string; location: string[]; firmness_loss: string; skin_age?: number }
  area_periocular?: string
  condicoes_secundarias?: string[]
  qualidade_foto?: { score: number; nivel: 'baixa'|'media'|'alta'; notas: string }
  confianca_analise?: { score: number; nivel: 'baixa'|'media'|'alta'; campos_incertos: string[] }
  prioridade_clinica?: { primaria: string; secundaria: string|null; justificativa: string }
  contraindicacoes?: string[]

  // Campos de UI (mantidos para compatibilidade)
  skin_age?: number         // mapeado de envelhecimento.skin_age pela Edge Function
  pontos_fortes?: string[]  // 2 destaques positivos (legado — use skin_strengths)
  pontos_fracos?: string[]  // 3 áreas de atenção

  // Campos enriquecidos — adicionados após MVP
  skin_strengths?: Array<{
    title: string            // nome curto do ponto forte (máx 4 palavras)
    icon: 'shield'|'drop'|'sparkle'|'leaf'|'sun'
    body: string             // 2 frases: significado clínico + o que permite no tratamento
  }>
  action_recommendations?: Array<{
    category: string         // nome da categoria (máx 4 palavras)
    text: string             // instrução específica com ativo/abordagem concreta
  }>                         // 4 itens ordenados por prioridade clínica
  region_insights?: Array<{
    region: 'testa'|'nariz_zona_t'|'bochechas'|'queixo_mandibula'|'area_periocular'
    main_finding: string     // título do card da região (máx 10 palavras)
    consequence: string      // risco clínico se não tratado (máx 18 palavras)
    benefit: string          // melhora esperada ao tratar (começa com verbo no infinitivo)
  }>                         // gerado apenas para regiões com condição relevante
  goal_alignment?: {
    alinhamento: 'confirmado'|'parcial'|'divergente'
    regioes_afetadas: string[]
    mensagem: string         // 2 frases: contextualiza o objetivo + o que o protocolo vai fazer
  }                          // gerado apenas se skinProfile.objetivo foi informado

  // Legacy (scans antigos armazenados antes do schema clínico)
  metrics?: Record<string, SkinMetric>
  top_concerns?: string[]
  positive_highlights?: string[]
}
```

**⚠️ Dois campos de compatibilidade são injetados automaticamente pela Edge Function `analyze-skin` antes de retornar a resposta — não remover essa lógica:**
- `skin_type_detected` ← cópia de `skin_type_sebaceous` (consumido em 7 lugares no app: Mixpanel, DB, UI, protocolo)
- `skin_age` (top-level) ← cópia de `envelhecimento.skin_age` (consumido em 4 lugares: results.tsx, skin-result.tsx, loading.tsx, store)

**Campos de onboarding:** `genero`, `pregnancy_status`, `birthday`, `skin_type`, `concerns[]`, `sun_exposure`, `hydration`, `sleep`, `objetivo`, `goal_desire`, `skincare_routine_type`, `skincare_routine_description`, `allergy_type`, `allergy_description`

**Campos de imagem:**
- `foodImageBase64: string | null`
- `foodImageMimeType: string | null`
- `skinImageBase64: string | null`
- `skinImageUri: string | null`
- `skinCollagesBase64: string[]` — as 3 imagens do scan multi-foto em base64 (`[neutra, layoutA, layoutB]`); vazio no scan de 1 foto. **Nunca persistido** (~1 MB — ver `partialize`)

**Campos de contexto de scan:**
- `scanSource: 'onboarding' | 'app'` — controla o fluxo de navegação pós-scan; default `'onboarding'`

**Campos de resultado:**
- `scanResult: ScanResult | null`
- `scanImageUri: string | null`
- `skinScanId: string | null` — ID do registro inserido em `skin_scans` (para linkar ao protocolo)
- `protocolResult: ProtocolResult | null` — protocolo gerado, cacheado em memória
- `protocolGenerating: boolean` — `true` enquanto a geração do protocolo roda em background (disparada por `signup.tsx`). ⚠️ Ainda **setado**, mas **não consumido** por nenhuma tela (o `protocolo.tsx` lê `protocolResult`, não este flag — ver seção 6)
- `selectedScan: { result: ScanResult; imageUri: string } | null` — scan selecionado no carrossel da home; limpo automaticamente ao sair de `skin-result.tsx`
- `selectedFoodResult: FoodReportResult | null` — resultado salvo de food scan selecionado na home; exibido sem re-análise em `food-report.tsx`; limpo ao sair da tela ou iniciar novo scan
- `skinPreviewUrl: string | null` — URL pública da preview de pele melhorada gerada por `generate-skin-preview`; populada de forma assíncrona por `loading.tsx` (fire-and-forget — pode ainda ser `null` quando `results.tsx` monta)

**Métodos:**
- `setTabBarTheme(theme: 'light' | 'dark')` — alterna o tema visual do tab bar; hoje só `protocolo.tsx` seta dark (**só no período Noite** do toggle, light no resto e no blur). `niks-chat.tsx` chama **sempre `light`** no `useFocusEffect` (não tem mais modo noturno).
- `skinScore: number | null` / `setSkinScore(score)` — Niks score do último scan, espelhado pela home no `useFocusEffect`. Usado pela **navbar** (`_layout.tsx`) para tintar a logo central pelo tema do score (`getScoreTheme` de `lib/scoreTheme.ts`), **em AMBOS os modos (claro e noturno)** — ver "Tab Bar / Navbar". Default `null` (cold start) → tema rosa.
- `collagePhotos: string[]` / `setCollagePhotos(uris)` — URIs das fotos da colagem do Story, **na ordem das células** (é a ordem que define o layout 1/2/3/4 em `share-preview`). Gravado por `share-capture` no "Continuar", lido por `share-preview`. Está no store (e não em router params) pela regra do projeto — params truncam imagem no bridge do RN. Limpo no `reset()`
- `productDetailTarget: string | null` / `setProductDetailTarget(id)` — deep-link da home: `produto_id` cujo **detalhe deve abrir** ao entrar em `recomendacao-produtos`. A home grava ao tocar num card de "Para você"; a tela de recomendação lê quando os dados estão prontos, abre o modal de detalhe daquele produto e limpa o alvo. Ver "Tela Home → Para você".
- `setTabBarVisible(visible: boolean)` — esconde/mostra o tab bar; útil em telas onde o tab bar não deve aparecer
- `setScanSource(source: 'onboarding' | 'app')` — chamado por `useFaceScan().startFaceScan()` antes de iniciar scan do app principal
- `setOnboardingField(field, value)`
- `setFoodImage(base64, mimeType)`
- `setSkinImage(base64, uri)` — caminho de 1 foto; **limpa** `skinCollagesBase64` (senão um scan single depois de um multi reenviaria colagens velhas)
- `setSkinScanImages(neutral, collages)` — setter ATÔMICO do scan multi-foto (neutra + as 3 colagens numa transação só)
- `setScanResult(result, imageUri)`
- `setProtocolResult(result)` — armazena o protocolo gerado (escrito no signup **e na geração sob demanda da Rotina — seção 6**). ✅ **Voltou a ser consumido** por `protocolo.tsx` (cache do store, com fallback para a tabela `protocolos`) — ver seção 6
- `setProtocolGenerating(v)` — setado `true` por `signup.tsx` antes de disparar a geração; setado `false` quando `lib/generateProtocol.ts` termina (sucesso ou falha)
- `setSelectedScan(scan | null)` — define qual scan do carrossel abrir em `skin-result.tsx`
- `setSelectedFoodResult(result | null)` — define/limpa o food scan selecionado para visualização em `food-report.tsx`
- `setSkinPreviewUrl(url | null)` — salva a URL da preview de pele; chamado por `loading.tsx` após `generate-skin-preview` resolver (fire-and-forget)
- `saveToSupabase(userId)` — salva `users` + `skin_scans` (com upload para Storage + `full_result`); captura e armazena o `skinScanId` retornado

---

## DECISÕES TÉCNICAS IMPORTANTES

### 1. Zustand em vez de router params para imagens
Passar `imageBase64` via `router.push` corrompía imagens grandes (truncamento no bridge do RN).

**Padrão correto:**
```
food-camera.tsx → setFoodImage(base64, mimeType) → navega → food-report.tsx lê do store
camera.tsx → setSkinImage(base64, uri) → navega → loading.tsx lê do store
```

### 2. `fetch` direto vs `supabase.functions.invoke`

| Função | Método | Motivo |
|---|---|---|
| `analyze-skin` | `fetch` direto + anon key hardcoded | payload contém imageBase64 grande; `getSession()` pode retornar `undefined` → `"Bearer undefined"` → 401 instantâneo |
| `analyze-food` | `fetch` direto + anon key hardcoded | payload contém imageBase64 grande; `getSession()` pode retornar `undefined` → `"Bearer undefined"` → 401 instantâneo |
| `generate-protocol` | `fetch` direto + anon key hardcoded | `supabase.functions.invoke` causa 401 pós-signup (sessão não está pronta no cliente) |

**NUNCA usar `supabase.functions.invoke` para nenhuma das três funções acima.** Para `analyze-skin` e `analyze-food`, trunca o base64. Para `analyze-food` e `generate-protocol`, usar `getSession()` para obter o token é frágil — se a sessão não estiver pronta, o header fica `"Bearer undefined"` e o API gateway rejeita com 401 imediatamente. As funções foram deployadas com `--no-verify-jwt`, então o anon key hardcoded é suficiente e elimina essa classe de erro.

Exemplo para `generate-protocol` (`fetch` direto com anon key):
```typescript
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const response = await fetch(
  'https://utpljvwmeyeqwrfulbfr.supabase.co/functions/v1/generate-protocol',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
      'apikey': ANON_KEY,
    },
    body: JSON.stringify({ scanResult, onboardingData }),
  }
);
```

### 3. Simulador iOS
Não tem câmera real. As telas de câmera detectam via `!Device.isDevice` e mostram o botão de galeria só em `__DEV__` (`camera.tsx`, `camera-multi.tsx`). No `camera-multi`, toque longo na galeria preenche as 6 fotos de uma vez — ver "Scan de pele multi-foto (13b)".

### 4. Imagem de comida
Redimensionada para 512px + compress 0.5 via `expo-image-manipulator` antes de salvar no store (~52KB).

### 5. `results.tsx` (onboarding) mostra análise completa — navegação de volta bloqueada
`app/(scan)/results.tsx` exibe o resultado completo do scan (mesma estrutura de `skin-result.tsx`: parallax hero, score ring, análise por região, condição geral, pontos fortes, etc.). As métricas **não** são mais borradas/bloqueadas — o usuário vê tudo no onboarding.

**Navegação de volta bloqueada intencionalmente:** ao chegar em `results.tsx`, o usuário não pode voltar. Motivo: `loading.tsx` usa `router.push` para chegar aqui — voltar retornaria o usuário à tela de loading, que é um beco sem saída. Implementado com dois mecanismos:
- `<Stack.Screen options={{ gestureEnabled: false }} />` — desabilita swipe-back no iOS
- `BackHandler.addEventListener('hardwareBackPress', () => true)` — bloqueia botão físico no Android

### 6. Tela Rotina (`protocolo.tsx`) — redesign "Rotina de Beleza" + geração do protocolo

> ⚠️ **Estado atual:** `app/(app)/protocolo.tsx` é a réplica do design "Rotina de Beleza" (Claude Design; fonte de verdade: `Rotinas de skin care/Rotina de Beleza.dc.html`) e **já consome os dados reais do usuário** (rotina personalizada + dicas) e tem a **cerimônia (ritual passo a passo) re-portada da produção**. A rota continua `/protocolo` e o ícone **sparkles** da navbar continua abrindo a tela (nada muda em `_layout.tsx`).

**O que a tela é hoje:**
- **Réplica pixel-a-pixel** do design, escalada por `S = width/393` (mesmo padrão de `recomendacao-produtos.tsx`). Inline styles, sem NativeWind.
- **Fontes Nunito** (`@expo-google-fonts/nunito`: ExtraBold/Bold/SemiBold/Medium/Regular) — não mais Playfair/DMSerif.
- **Título exibido = "Rotina de Skincare"** (era "Rotina de Beleza" — só o texto na tela mudou; o nome do design de origem `.dc.html` segue "Rotina de Beleza").
- **Dois temas alternados pelo toggle Manhã/Noite:** claro e escuro. Tokens `DAY`/`NIGHT` no topo do arquivo. A cor de marca da tela é **`#FF9D9D`** (override do design, não o coral `#FB7B6B`/vermelho padrão).
- **Herói da Manhã = a logo do app (`niks-logo.png`) tintada em `#FF9D9D`** (a mesma cor `BRAND` do botão "Iniciar rotina"), via `<Image tintColor>`, `s(132)`. ⚠️ **Não é mais o "sol" SVG** (disco + raios) — a pedido do usuário: removidos os raios, e no fim a orbe deu lugar à logo tintada. O `SunHero` foi de raios→só-disco→logo tintada nesta ordem.
- **Modo noturno = céu antigo + lua do design:** o usuário quis o **fundo estrelado antigo** (mais rico) mas manteve a **lua do arquivo de design**. Então: Fundo = `LinearGradient ['#0F1420','#1A1F2E','#2A1F28']` + **`<NightSky />`** (`components/ui/NightSky.tsx` — 119 estrelas em 3 camadas de parallax/twinkle + nebulosas + 3 estrelas cadentes). Lua = **PNG renderizado do CSS EXATO do `.dc.html`** — `assets/home/rotina-moon.png` (900×900 transparente, gerado com headless Chrome a partir do markup do arquivo de design: corpo com gradiente radial + `inset box-shadow` + 5 crateras + glow), exibido a `s(301)` (disco ~160). É **literalmente a lua do arquivo**, não uma aproximação — o React Native não reproduz `inset box-shadow` fielmente, por isso a rendemos em imagem em vez de SVG. Para regenerar: reabrir o HTML mínimo com o CSS da lua no Chrome headless `--force-device-scale-factor=3 --default-background-color=00000000`. O layout/cards/tokens do design novo **não** mudam — só o fundo. **Espaçamento do herói (altura condicional):** `s(200)` na Noite (a lua é maior) e `s(140)` na Manhã (a logo é menor — evita vão grande até o título), com `marginTop: s(22)` na Manhã (respiro do topo). Antes era `s(200)` fixo e sobrava muito espaço na Manhã.
- **Header (topo): removido** a pedido do usuário — não há mais botão voltar nem logo (bate com o `.dc.html`, que tem o topo vazio). Como tudo está em fluxo no `ScrollView`, remover a linha do topo empurra o herói (sol/lua) e a tela inteira para cima, fechando o vão entre a lua e o topo.
- **Timeline de 5 passos** com trilho tracejado + círculo numerado; cada card **expande inline** ("Como fazer") via `LayoutAnimation` + chevron animado. O **trilho tracejado é desenhado em SVG** (`<Line strokeDasharray="4 4">` com altura medida por `onLayout`, centralizado sob o número) — **não** usar `borderStyle:'dashed'` numa borda de um só lado, que renderiza de forma não-confiável no New Architecture (some ou vira sólido). Dentro do "Como fazer" há um link **"Ver produto recomendado" + seta** (cor `BRAND #FF9D9D`) → `router.push('/recomendacao-produtos')` (abre a tela de produtos; hoje leva ao topo da tela, não ao produto específico daquele passo).
- **Dados reais** (não mais hardcoded): a rotina vem do **cache do store** (`protocolResult`, hoje **persistido em disco** — ver "CACHE DE DADOS") ou, em fallback, da tabela **`protocolos`** (`select('rotina_am, rotina_pm, dicas')`, mais recente) via `useCachedQuery`. ⚠️ **Não recarrega mais a cada `useFocusEffect`** — o fallback só vai à rede quando o store está vazio, e ainda assim no máximo 1× a cada 5 min. Cada `ProtocolStep` cru é convertido para a UI por **`mapStep()`**: `title←name`, `ingredients←ingredient`, `how←instruction` (fallback `steps.join`); `category`+`icon` derivados por **`classifyStep()`** (keyword no name+ingredient — **NÃO** usa o hex `color`, que a IA erra). Meta dinâmica: `Passos` = contagem real, `Duração` = `~${n*3} min`, `Foco` = rótulo fixo por período. Estados `loading`/**`generating`**/`ready`/`empty`/`error` (empty → CTA "Escanear minha pele" via `startFaceScan()` do `useFaceScan`; error → "Tentar novamente" — que **rearma** a geração sob demanda; **`generating`** = geração sob demanda em curso, ver callout abaixo). Os passos **crus** (`name/ingredient/steps[]/waitTime`) são mantidos em `amRaw`/`pmRaw` porque a cerimônia precisa deles.
- **Seção "Recomendações"** (abaixo dos passos, global — não depende do toggle): dois cards colapsáveis (`Collapsible`) alimentados por `dicas[]`. **Prognóstico** = `dicas[0]` (aviso, ícone alert) + marcos `dicas[1/2/3]` ("Em 2 semanas / 1 mês / 3 meses"). **Cronograma de introdução** = `dicas[4]` parseado por **`parseCronograma()`** (mesmo regex da tela antiga — ver SUPABASE) em blocos por semana + mini-timeline. Quando a rotina vem do store (campos soltos, sem o array `dicas`), o array é reconstruído na ordem `[introduction_warnings, two_weeks, one_month, three_months, introduction_schedule]`. `product_suggestions` ficou de fora **de propósito**.

> **🕰️ Geração SOB DEMANDA (`generateOnDemand`) — usuária legada (mesmo padrão da tela de Produtos).** O protocolo só nasce em `signup.tsx` e um **rescan pelo app NÃO o regenera** (intencional — ver o callout "O scan pelo app NÃO regenera a rotina"). Logo, **quem se cadastrou antes do fluxo atual tem scan+relatório mas nunca teve protocolo** — e ficava presa num "faça a avaliação" que escanear nunca resolve (o caso real: uma usuária escaneou 4× sem sair do lugar, porque escanear não gera protocolo). **Correção:** ao carregar, se **não há protocolo salvo**, a Rotina **gera na hora** — uma única vez por montagem (ref `triedGenerate`), com estado `generating` ("Montando seu protocolo…"), **nunca** a tela de "faça a avaliação". Usa **`lib/generateProtocol.ts` como está** (fetch direto com anon key, salva em `protocolos` e encadeia `recomendar-produtos`). Diferente da tela de Produtos, aqui é preciso **montar os dois inputs a partir do banco**: `scanResult` = último `skin_scans.full_result`; `onboardingData` = linha em `users` remontada no formato do `OnboardingData` (reverso do `saveToSupabase`). **Só dispara se a usuária CHEGAR nesta tela** — nunca em background, pra não gastar IA com quem não abrir. Três desfechos: **`sem-scan`** → `empty` com CTA de escanear; **`ok`** → `setProtocolResult` povoa o store e o `fromStore` mostra a rotina; **`falhou`** (rede/função/escrita) → `error` com "Tentar de novo". ⚠️ Falha **nunca** cai no `empty` de "faça a avaliação" — seria mentira com quem já escaneou (foi exatamente a origem da confusão).
>
> **Piso de dados (decisão do usuário — "protocolo ruim salvo é pior que nenhum"):** só gera se o scan for **aproveitável** — `full_result` com `skin_score` (número) **e** `skin_type_detected` (texto). Sem base clínica, gerar seria lixo e o app passaria a **achar que resolveu e nunca mais tentaria**. `skin_type` do onboarding **nunca vai vazio**: `users.tipo_pele` **ou**, se nulo na linha legada, o `skin_type_detected` do scan (a base clínica vem do scan, não da linha `users` — por isso linha furada não bloqueia quem tem scan bom). **`'ok'` SÓ depois de LER DE VOLTA a linha em `protocolos`** — o `insert` do supabase-js **não lança** em falha de RLS (volta `{ error }` silencioso), então a leitura de volta é o que garante que salvou; só então o store é povoado (evita pintar um **protocolo fantasma** — mesmo cuidado de escrita da captura de nome). **Sem loop de IA:** a trava rearma **só no toque** de "Tentar de novo" (nunca em cadeia automática — depois de `falhou`, nenhuma dependência do efeito muda), e o retry **re-lê antes de gerar** (evita protocolo duplicado se a falha foi só na leitura de volta).
- **Sincroniza o tab bar com o tema:** no período Noite chama `setTabBarTheme('dark')` (via `useFocusEffect`; light no resto e no blur), e a `GlobalBottomBar` **escurece junto** (fundo `#1A1F2E`, ícone ativo `#FF9D9D` / inativos `#8B93A8`, **logo central segue a cor do Niks score — igual ao modo claro**, ver "Tab Bar / Navbar"). Assim o menu inferior não destoa da tela escura. Ver "Tab Bar / Navbar".

**Cerimônia (ritual passo a passo) — re-portada da produção** (decisão do usuário: "igual à produção", **não** readaptada ao novo design). Abre pelo botão **"Iniciar rotina"** (`openRitual` → `setTabBarVisible(false)`; `closeRitual` restaura). Mantém a estética original: fonte **DM Serif**, tinta teal `#1D3A44` + coral `#FB7B6B` (não o `#FF9D9D` da tela), **orb Skia** com anéis respiratórios + numeral via `SkiaText`/`useFont`, e **tela de celebração** com entradas escalonadas. Overlay `position:absolute zIndex 60` dentro da View raiz (por isso `setTabBarVisible(false)` — a navbar global é sibling em `_layout.tsx`). As fontes DM Serif são carregadas no `useFonts` desta tela (além de Nunito). Imports do Skia são aliased (`SkiaCircle/SkiaRect/SkiaRadialGradient`) para não colidir com o `react-native-svg` da tela. `toggleStepCompletion(index)` faz haptic + som + **persiste o progresso** (abaixo). **Streak/gamificação continuam desativados** — a cerimônia marca conclusão de passo mas **não** incrementa `streak_days`.

**Progresso da rotina** — módulo **`lib/routineProgress.ts`** (AsyncStorage). API: `getRoutinePeriodForNow()`, `periodLabel()`, `getCompletedSteps(period)`, `markStepCompleted(period, index)`. Chave = `routine_done:${sessionDate}:${period}`, onde `sessionDate` desloca o relógio **−4h** para a noite que cruza a meia-noite (18h→03:59) ficar na MESMA sessão; reseta sozinho a cada nova sessão-dia. A cerimônia grava (`markStepCompleted(period, ritualStep)`, usando o período do toggle Manhã/Noite). ⚠️ **Não é mais compartilhado com a home** — o card de skincare saiu de lá (virou "Dica do dia", ver "Tela Home"), então hoje o único consumidor do módulo é a cerimônia, e só de `markStepCompleted`. Os outros exports ficaram sem chamador; **o módulo foi mantido** (a cerimônia depende dele, e a leitura do progresso é reaproveitável).

**Áudio da cerimônia:** `protocolo.tsx` chama `setAudioModeAsync({ playsInSilentMode: true })` uma vez (`useEffect`) — **sem isso o `expo-audio` não toca com o iPhone no silencioso** (default). O som (`check.mp3`) e o haptic saem no "Concluir este passo". ⚠️ Haptics só funcionam em **device físico** (não no simulador do Xcode).

---

**Geração do protocolo (no signup — e, para legadas, sob demanda na Rotina):**
O protocolo é gerado em background logo após o usuário criar a conta, em `signup.tsx` (fire-and-forget via `lib/generateProtocol.ts`). A geração roda enquanto o usuário avança para `nome`/`notifications`. `generate-protocol` recebe `scanResult` e `onboardingData`. Salvo em dois lugares:
1. **Zustand store** (`protocolResult`) — cache em memória
2. **Supabase `protocolos`** — persistência entre sessões

> **Segunda via (legadas):** este NÃO é o único ponto de nascimento do protocolo. Usuárias sem protocolo salvo (cadastro anterior ao fluxo atual) têm o protocolo **gerado sob demanda ao abrir a tela de Rotina**, reusando este mesmo `lib/generateProtocol.ts` — ver o callout "🕰️ Geração SOB DEMANDA" em **seção 6**.

**Detalhe crítico de closure em `signup.tsx`:** `skinScanId` é setado dentro de `saveToSupabase` (via `set({ skinScanId: ... })`). Para ler o valor correto logo depois, `startProtocolGeneration` usa `useAppStore.getState().skinScanId` — nunca a variável destrutarada do hook, que ainda estaria com o valor antigo (`null`) antes do próximo render.

**`lib/generateProtocol.ts`:** utilitário que encapsula a chamada à Edge Function com retry (até 3 tentativas, delay 3s, somente para 503/UNAVAILABLE), salva no Supabase e chama `onSuccess`/`onFinally`.

> Nota: `protocolo.tsx` **volta a ler** `protocolResult` (cache do store) com fallback para a tabela `protocolos` — ver "Dados reais" acima. `protocolGenerating` continua sendo escrito por `signup.tsx` e **não** é consumido pela tela.

**Erro em `app/(scan)/loading.tsx`:** erros após 2 retries exibem estado inline (sem `Alert`) com botão que chama `router.back()`, levando o usuário de volta à câmera para tirar uma nova foto.

**Fire-and-forget em `loading.tsx`:** logo ao montar, `loading.tsx` também dispara `generate-skin-preview` **sem `await`**, em paralelo com `analyze-skin`. O resultado (`preview_url`) é salvo no store via `setSkinPreviewUrl`. Como não bloqueia a navegação, `skinPreviewUrl` pode ser `null` quando `results.tsx` monta — consumidores devem tratar esse caso.

### 7. Storage bucket `scans` é PRIVADO — usar `createSignedUrl`

O bucket `scans` é privado. `getPublicUrl()` retorna uma URL que responde 403. **Sempre usar `createSignedUrl(path, 31536000)`** (TTL de 1 ano) para gerar a URL que vai para `foto_url` no banco.

```typescript
const { data: signed } = await supabase.storage.from('scans').createSignedUrl(path, 31536000);
fotoUrl = signed?.signedUrl ?? supabase.storage.from('scans').getPublicUrl(path).data.publicUrl;
```

Isso se aplica em: `store/onboarding.ts` (`uploadScanPhoto`), `app/(scan)/loading.tsx`, e `app/(app)/home.tsx` (repair de foto do onboarding).

---

### 8. Refs obrigatórias em callbacks assíncronas de animação (padrão a reaproveitar)

> ⚠️ **Não se aplica ao `protocolo.tsx` atual** — a cerimônia re-portada (seção 6) **não** tem o checklist gamificado com streak/animação de card; a conclusão é só `markStepCompleted` (AsyncStorage via `routineProgress`). Mantido aqui como **padrão** para reativar o streak no futuro, ou para outras telas com animação + state.

Qualquer valor de state (`useState`) capturado dentro de callbacks assíncronas — especialmente `Animated.timing().start(callback)` e `setTimeout` — é **estale**: reflete o valor do render em que a função foi criada, não o valor atual.

**Regra:** toda variável de state lida dentro de uma callback de animação ou setTimeout **deve ter um ref espelho** atualizado por `useEffect`:

```typescript
const streakDaysRef = useRef(0);
useEffect(() => { streakDaysRef.current = streakDays; }, [streakDays]);
// Dentro da callback: usar streakDaysRef.current, nunca streakDays
```

Refs que o antigo `protocolo.tsx` (gamificado) exigia: `checkedItemsRef`, `stepsRef`, `celebrationTriggeredRef`, `morningStepsRef`, `nightStepsRef`, `streakDaysRef`, `lastCompletedAtRef`.

---

### 9. Gradientes radiais — `react-native-svg` `RadialGradient` funciona (Skia é opcional)

> ✅ **Correção (antes dizia que não renderizava):** na versão atual (`react-native-svg` **15.15.3**), `RadialGradient` do `react-native-svg` **renderiza normalmente** e é o caminho mais leve. Usado em produção em: `social-proof.tsx`, `goal-validation.tsx`, `notifications.tsx`, `WelcomeOrb`, `NightSky`, e nos **glows da nova tela de Rotina** (`protocolo.tsx` — glow da lua + glows de fundo; o herói da **Manhã** agora é uma `<Image>` da logo tintada, **não** mais RadialGradient). (O `niks-chat.tsx` **não usa mais** `RadialGradient`/`MiniOrb` — o avatar da NIKS virou a logo PNG.) O fundo estrelado noturno da Rotina usa `<NightSky />` (Skia internamente) — ver seção 6. Padrão que funciona: `<Circle fill="url(#id)">` + `<RadialGradient cx="42%" cy="38%" r="66%">` com `<Stop>` (percentuais/`objectBoundingBox`) ou `gradientUnits="userSpaceOnUse"` com coords absolutas.

**Skia (`@shopify/react-native-skia`) ainda é usado** onde já estava consolidado — `loading.tsx` (orb da análise) — e o padrão abaixo segue válido para quem precisar de blur/efeitos que o SVG não dá:

**Padrão Skia — `Canvas + Circle + RadialGradient + vec`:**
```typescript
import { Canvas, Circle, RadialGradient, vec, BlurMask } from '@shopify/react-native-skia';

// Shadow no View wrapper FORA do Canvas (não no Animated.View diretamente):
<View style={{ shadowColor: '#C86651', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.45, shadowRadius: 25 }}>
  <Canvas style={{ width: 140, height: 140 }}>
    <Circle cx={70} cy={70} r={70}>
      <RadialGradient
        c={vec(49, 42)}   // ponto focal: 35%×140=49, 30%×140=42
        r={120}
        colors={['#FFEFE4', '#F9C9B6', '#E89178', '#C86651']}
        positions={[0, 0.28, 0.68, 1]}
      />
    </Circle>
    {/* Highlight especular com blur */}
    <Circle cx={50} cy={29} r={22}>
      <RadialGradient c={vec(50, 29)} r={22} colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']} />
      <BlurMask blur={4} style="normal" />
    </Circle>
  </Canvas>
</View>
```

**Onde o padrão Skia é usado:**
- `app/(scan)/loading.tsx` — orb da análise de pele (140×140, skin-tone gradient)
- `app/(app)/protocolo.tsx` — orb da Cerimônia (ritual) da Rotina, re-portado da produção (Skia com aliases `SkiaCircle/SkiaRect/SkiaRadialGradient` p/ não colidir com `react-native-svg` da tela — ver seção 6)

**Regra importante sobre shadow:** a shadow deve ficar no `View` imediatamente pai do `Canvas`, **não** no `Animated.View` externo (se houver). A Skia Canvas tem fundo transparente — o shadow só é projetado corretamente pelo conteúdo renderizado dentro dela quando há um `View` com shadow entre ela e o container animado.

**Numeral do orb da Cerimônia — `SkiaText` em vez de `<Text>` nativo:**

O numeral (`01`–`0N`) dentro do orb da Cerimônia é renderizado com `SkiaText` + `useFont`, **não** como `<Text>` nativo.

**Por quê:** quando um `<Text>` nativo é irmão de um `<Canvas>` Skia, o pipeline GPU do Skia composita acima do layout nativo. Para glifos do DM Serif Display Italic a 84pt (especialmente "2" e "3"), o bounding box óptico faz os dígitos aparecerem cortados.

```typescript
const cerimSkiaFont = useFont(require('../../assets/fonts/DMSerifDisplay-Italic.ttf'), 84);

// Dentro do Canvas 200×200:
<SkiaText
  x={(200 - skiaTextW) / 2}
  y={100 + skiaCapH / 2}
  text={text}
  font={cerimSkiaFont}
  color={...}
/>
```

---

### 10. Dias da semana em steps do protocolo — parsing client-side do `ingredient`

> ✅ **Em uso** na cerimônia re-portada do `protocolo.tsx` (seção 6) — o numeral do orb usa `SkiaText` + `useFont` exatamente como descrito aqui.

O backend (`generate-protocol`) **não retorna um campo `schedule`** nos steps. Quando um ativo deve ser usado apenas em dias específicos, a Edge Function embute essa informação como sufixo no campo `ingredient`:

```
"Sérum de Ácido Mandélico 10% (Seg/Qua/Sex)"
```

O cliente precisa parsear e separar esse dado antes de renderizar. Em `protocolo.tsx`, três funções fazem isso:

```typescript
function parseScheduleFromIngredient(ingredient: string): { label: string } | undefined {
  const match = ingredient.match(/\(([^)]+)\)$/);
  if (!match) return undefined;
  const label = match[1].split('/').map(d => d.trim()).join(' · ');
  return { label };
}

function stripScheduleFromIngredient(ingredient: string): string {
  return ingredient.replace(/\s*\([^)]+\)$/, '').trim();
}

function applySchedule(step: any) {
  const schedule = parseScheduleFromIngredient(step.ingredient ?? '');
  return { ...step, schedule, ingredient: stripScheduleFromIngredient(step.ingredient ?? '') };
}
```

`applySchedule` é chamado em **todos os três pontos de carregamento de dados** em `protocolo.tsx` (cache do store, Supabase direto, Edge Function fallback). Se esse mapeamento for esquecido em algum ponto, o badge de dias não aparece e o `ingredient` mostra o sufixo bruto ao usuário.

**Consequência:** `ProtocolStep` no store tem `schedule?: { label: string }` mas esse campo nunca vem do banco — é sempre derivado no cliente. Se o backend mudar e passar a retornar `schedule` como campo separado, remover `applySchedule` e ler diretamente.

---

### 11. Debug de modo dia/noite — 5 toques no texto "NIKS" (`home.tsx`)

> ⚠️ **Só existe na `home.tsx` hoje.** A `niks-chat.tsx` tinha o mesmo mecanismo, mas perdeu o modo noturno no redesign — não há mais `debugMode`/`autoNight`/`isDark` lá.

A home tem um modo de debug que alterna entre AM (manhã) e PM (noite) para facilitar testes visuais em dispositivo físico. **Completamente invisível para o usuário final. Funciona em TestFlight (produção).**

**Como ativar:** tocar 5 vezes seguidas no texto "NIKS" do masthead (canto superior esquerdo) dentro de 2 segundos. Ciclo: `auto → am → pm → auto`.

**Implementação:**
- O texto "NIKS" é envolto em `<TouchableOpacity activeOpacity={1}>` — sem feedback visual
- Um `useRef` conta os toques; um `setTimeout` de 2s reseta o contador
- Estado `debugMode: 'am' | 'pm' | null` substitui `new Date().getHours()` no cálculo do `ctx`

**Por que não usar `__DEV__`:** mantido em produção intencionalmente para testar os dois estados visuais num dispositivo físico sem build separado.

> ⚠️ **Não adicionar botão visível.** O trigger de 5 toques é a interface deliberada.

---

### 12. React Native iOS — `lineHeight` menor que `fontSize` corta glifos

No iOS, se `lineHeight < fontSize` o runtime **clippa os glifos ao line box** — o topo de letras altas (ex: "O", "A") fica cortado. No CSS/web isso não acontece: o texto simplesmente vaza além do line box sem ser clipado.

**Regra:** em React Native iOS, `lineHeight` deve ser **≥ `fontSize`** em qualquer texto.

Exemplo concreto em `HeroEditorial` (home.tsx): o design de referência web usa `lineHeight: 0.95` (= 51.3px para 54px de fonte). No app, usar `lineHeight: 54` (igual ao `fontSize`). Para compensar o espaço extra no layout, ajustar o `marginTop` do elemento seguinte subtraindo a diferença (`18 - (54 - 51.3) ≈ 13`).

---

### 13. Contexto de scan: app vs onboarding (`scanSource`)

O scan facial é iniciado de dois lugares distintos e segue fluxos diferentes:

| Origem | Fluxo |
|---|---|
| Onboarding | `scan-prep` (com barra de progresso) → `camera` → `loading` → `results` → `plan-preview` → `paywall-soft` → `signup` |
| App principal (botão "Escanear" da home) | **`scan-prep-app`** (design novo, sem barra de progresso) → `camera` → `loading-dentro-app` → `/(app)/skin-result` |

**Duas telas de loading distintas — não consolidar (o design das duas AGORA é diferente, de propósito):**
- `loading.tsx` — usada no **onboarding**. Mantém o design **antigo**: orb Skia skin-tone + anel de progresso coral + **checklist de steps** (inclui "Montando seu protocolo personalizado" — faz sentido, pois o protocolo será gerado logo depois) + headline Playfair (ver seção 18). **Foi deixada nesse design de propósito** — quando as telas de loading foram redesenhadas, o usuário pediu para reverter só a do onboarding.
- `loading-dentro-app.tsx` — usada no **app principal** (scan iniciado pelo botão "Escanear" da home). Hoje usa o **mesmo design da tela de carregamento de PRODUTO** (`product-loading.tsx`): véu rosa de fundo, **círculo grande com a porcentagem no centro** + arco rosa `#FF9D9D` + frase rotativa em Nunito abaixo (**sem orb, sem checklist de steps, sem headline Playfair**). Copy adaptada para a análise de pele. Como não há mais checklist, a distinção do step "Montando seu protocolo personalizado" deixou de existir aqui. Navega sempre para `/(app)/skin-result`.

> ⚠️ **A divergência visual entre as duas é INTENCIONAL — não "unifique" achando que é inconsistência.** As telas de loading de DENTRO do app foram migradas para o design da `product-loading.tsx` (círculo + porcentagem central): a de **pele** (`loading-dentro-app.tsx`) e a de **refeição** (o estado `loading` de `food-report.tsx`). A do **onboarding** (`loading.tsx`) ficou no design antigo por decisão do usuário. Em todas as três, só a **camada visual** mudou — a lógica (retry, save no banco, tracking, aviso de alta demanda, estado de erro) permaneceu idêntica. ⚠️ **Qual função cada loading chama:** `loading.tsx` → `analyze-skin` (onboarding, 1 foto); `loading-dentro-app.tsx` → `analyze-skin-app` (app, multi-foto); `food-report.tsx` → `analyze-food`.

**Como funciona:**
1. `useFaceScan().startFaceScan()` chama `setScanSource('app')` e então: se `scanTutorialSeen` for `false`, navega para **`scan-prep-app`** (o tutorial, versão do app; o onboarding usa `scan-prep`); se já visto, vai **direto para `camera-multi`**
2. **A câmera de PELE são DUAS telas** (mesmo padrão de `scan-prep`/`loading`): `camera-multi.tsx` (app, **6 fotos**) navega **sempre** para `loading-dentro-app` — rota chumbada, não lê `scanSource`; `camera.tsx` (onboarding, **1 foto**) lê `scanSource` e navega `'onboarding'` → `loading`. ⚠️ O ramo `'app'` que ainda existe em `camera.tsx` é **código morto** — o app não passa mais por essa tela.

> **Duas telas de preparação de scan — não consolidar:** `scan-prep.tsx` é a versão do **onboarding** (design antigo: tokens `DEEP/CORAL #FB7B6B`, Playfair itálico, barra de progresso `TOTAL=13`) — **não mexer** nela; segue com uma tela única de dicas → `router.push('/(scan)/camera')` (1 foto). `scan-prep-app.tsx` é a versão **dentro do app** (design novo: Nunito, fundo branco, rosa `#FF9D9D`) e desde a Sessão 47 é um **tutorial em CARROSSEL de 4 passos** (`FlatList` paginado + bolinhas de progresso; copy: luz natural / mesmo lugar-e-horário / sem acessórios / rosto limpo-e-cabelo-preso), com uma foto por slide em `assets/scan-tutorial/`. O último slide vai para `router.push('/(scan)/camera-multi')` (6 fotos), **não** `camera`. ⚠️ **É mostrado UMA vez só na vida:** o flag `scanTutorialSeen` (persistido no store) é gravado ao concluir o tutorial, e a partir daí o `useFaceScan` pula esta tela e leva o botão "Escanear" **direto à `camera-multi`**. **Testar de novo exige reinstalar o app** (o flag é permanente, igual ao consentimento de IA). ⚠️ **O consentimento de IA saiu daqui** e passou a viver na própria tela de câmera (ver seção 14). As duas telas foram duplicadas de propósito para o app ganhar a identidade nova sem tocar no onboarding.

> 🔒 **O botão de galeria da câmera de PELE só existe em `__DEV__` (`camera.tsx` e `camera-multi.tsx`).** Em produção a análise de pele exige foto tirada na hora — sem galeria, a usuária não sobe uma imagem qualquer da internet. O botão fica envolto em `{__DEV__ && (...)}`, então some sozinho em qualquer build de release (TestFlight/App Store); **não há nada para reverter antes de subir build**. Ele é mantido em dev porque no **simulador é o único jeito de fornecer uma foto** — sem câmera real, o botão branco de captura fica `disabled`. Em `camera-multi` o **toque** preenche o passo atual e o **toque longo** replica a mesma foto nos 6 slots (para testar as colagens sem 6 idas à galeria); ambos passam pelo mesmo `downscale` do caminho de produção. ⚠️ **Não "consertar" isso como se fosse um bug de UI sumida.** As câmeras de **produto** (`product-camera.tsx`) e **comida** (`food-camera.tsx`) mantêm a galeria em produção de propósito — escolher da galeria faz sentido para rótulo e refeição.

### 13b. Scan de pele multi-foto (`camera-multi.tsx`) — 6 fotos → 3 imagens

O scan **dentro do app** captura **6 fotos** (`app/(scan)/camera-multi.tsx`), o do **onboarding** segue com **1** (`camera.tsx`). São telas separadas de propósito — pedir 6 fotos antes do paywall aumentaria a desistência, e ramificar `camera.tsx` por `scanSource` transformaria a câmera do fluxo que gera receita num arquivo de dupla responsabilidade. Mesmo princípio de `scan-prep`/`scan-prep-app` e `loading`/`loading-dentro-app`.

**As 6 fotos, em ordem** (a ordem é a das células das colagens): neutra, sorrindo, surpresa, brava, perfil esquerdo, perfil direito. As 4 primeiras vão para o **Layout A** (colagem 2×2), as 2 últimas para o **Layout B** (2 células lado a lado). Textos das etapas sempre no **feminino** (público do app). As 6 são obrigatórias; ao tirar a 6ª, a tela monta as colagens e navega sozinha.

**⚠️ A IA recebe 3 imagens, NÃO 2 — e a neutra sozinha é obrigatória.** O motivo é o único ponto de verdade não óbvio desta feature: **a API de visão reduz qualquer imagem para ~768px no lado menor antes de tokenizar.** Dentro de uma colagem 2×2, cada rosto cairia para ~384px — **metade** do detalhe da foto única de hoje, justamente em poros/textura/acne pequena. Por isso o payload é `[neutra_alta, layoutA, layoutB]`: a **neutra sozinha** recupera a resolução (é dela que saem os achados finos); as 2 colagens entram como evidência complementar (linhas de expressão dinâmicas, assimetria, mandíbula/lateral do nariz nos perfis). Ainda é ~metade do custo de mandar as 6 soltas. **Não "otimize" removendo a neutra ou fundindo em 2 imagens** achando que é desperdício — é a correção de um problema real.

**Duas Edge Functions separadas (`analyze-skin` × `analyze-skin-app`) — não consolidar:**
- **`analyze-skin`** = onboarding, **1 foto** (`imageBase64`). Voltou a ser simples: sem nenhum código multi. `loading.tsx` a chama.
- **`analyze-skin-app`** = app, **multi-foto** — **cópia integral** da `analyze-skin` com os blocos multi. `loading-dentro-app.tsx` a chama. Recebe `imagesBase64: [neutra, layoutA, layoutB]` + `scanLayout: 'expressions_v1'` (e `imageBase64` como fallback de 1 foto); escolhe o prompt multi por `scanLayout === 'expressions_v1' && images.length === 3` — **nunca** pelo tamanho do array.
- **Por que separar** (decisão do usuário): a análise do app vai ficar **mais robusta e mais cara** (e pode um dia usar um modelo melhor); mantê-la numa função própria deixa ela evoluir **sem risco de regredir o onboarding** — que é o funil até o paywall e roda para gente que talvez nem assine. O custo já era separado (o onboarding sempre mandou 1 foto), mas a divisão torna estrutural e habilita divergir o modelo.
- ⚠️ **É `cópia`, não `módulo compartilhado`**: para achar/aprofundar a análise do app, mexe-se **só** em `analyze-skin-app`. A contrapartida é que a lógica clínica comum está duplicada — **um bug clínico compartilhado se corrige nos DOIS arquivos**.
- ⚠️ **O SCHEMA DE SAÍDA das duas é o mesmo** (as duas alimentam `skin-result`/home/store). Divergir o **prompt** é o esperado; divergir a **forma da resposta** exigiria mexer na UI — hoje não é o caso.

**Montagem das colagens — reaproveita o padrão da colagem do compartilhamento** (`share-capture`/`Collage`, decisões 26/28): mutex `capturingRef`, alvo congelado antes do `await`, `captureRef` de view offscreen (`collapsable={false}`, `left:-10000`), dimensões em **pontos** (`2048/PixelRatio.get()`), depois `ImageManipulator` com `base64:true` sobre o tmpfile. O layout é o componente único **`components/scan/ScanCollage.tsx`** (parametrizado por `width`, renderizado tanto na tela de revisão quanto na view de export — duas implementações divergiriam em silêncio). A foto **neutra (#1)** continua sendo a `skinImageUri` — é ela que sobe para o bucket `scans`, aparece no `skin-result`, no card da home e vai para `generate-skin-preview`.

> ⚠️ **`camera-multi` NÃO usa `mirror` (decisão deliberada, ao contrário de `share-capture`).** A foto sai anatomicamente verdadeira (a bochecha direita dela aparece à esquerda da imagem); espelhar inverteria esquerda/direita em `acne.distribution`, `pigmentacao.location` e `region_insights`. O rótulo do Layout B no prompt avisa a IA disso. Custo: as miniaturas dos perfis parecem invertidas em relação ao preview — aceitável.

> ⚠️ **Gotcha do `captureRef` em branco no retake.** As views de export só montam quando as 6 fotos existem, e um contador (`loadedRef`) espera as `<Image>` decodificarem antes de capturar. Ao **refazer** uma foto pela tela de revisão, o `loadedRef` **precisa** voltar a `0` (as views desmontam) — sem esse reset, a captura seguinte veria a contagem antiga já satisfeita e geraria uma **colagem em branco**. Esse é o modo de falha nº 1 desta tela.

**Por que `setSelectedScan(null)` é obrigatório em `loading-dentro-app.tsx`:** `skin-result.tsx` usa `selectedScan?.result ?? scanResult`. Se `selectedScan` ainda estiver populado de uma visualização anterior do carrossel da home, a tela mostra o scan antigo em vez do recém-feito.

> ⚠️ **O scan pelo app NÃO regenera a rotina nem a recomendação de produtos — e isso é INTENCIONAL.** `loading-dentro-app.tsx` insere a linha nova em `skin_scans` (com `full_result` completo — score + as 6 métricas) e **para por aí**: `protocolos` e `recomendacoes_produtos` ficam **congelados** no que foi gerado no signup. Só o `signup.tsx` chama `generateAndSaveProtocol` (que por sua vez encadeia `recomendar-produtos`). **Motivo (decisão do usuário):** a pessoa precisa **testar a rotina por ~30 dias** para medir eficácia — se cada scan reescrevesse o protocolo, a IA trocaria ativos a cada foto e ninguém saberia o que funcionou. **Não "conserte" isso** achando que é bug. Consequência a conhecer: **usuárias legadas** (cadastro anterior ao fluxo atual) podem ter scan mas **nunca ter tido protocolo — nem, por consequência, recomendação —**, e um rescan não resolveria. Daí a **geração sob demanda** em **duas** telas, cada uma reusando `lib/generateProtocol.ts`/a Edge Function correspondente, só quando a usuária ABRE a tela: a **Rotina** gera o protocolo faltante (ver seção 6) e a de **Produtos** gera a recomendação (ver "Tela Recomendação de Produtos").

**Não confundir** com o retry de login do usuário no app: o guard de assinatura em `(app)/_layout.tsx` não depende de `scanSource`.

---

### 14. Consentimento de uso de IA — uma única vez por instalação (LGPD)

Antes de qualquer scan (rosto ou produto), o app exibe um modal de consentimento informando que a foto é processada por IA. Após aceite, o consentimento é salvo em `AsyncStorage` com a chave `"ai_consent_accepted"` (valor `"true"`) e o modal nunca mais aparece.

**⚠️ O consentimento vive nas TELAS DE CÂMERA — um único ponto de interceptação.** Antes ele era pedido *antes de navegar* (no `ScanModal` e nas duas telas de preparação), o que espalhava a regra por 3 lugares e deixou o scan de produto **sem** consentimento nenhum quando o modal saiu do fluxo. Hoje o portão está nas próprias câmeras:

- `app/(scan)/camera.tsx` — scan de rosto do **onboarding** (1 foto)
- `app/(scan)/camera-multi.tsx` — scan de rosto **dentro do app** (6 fotos)
- `app/(scan)/product-camera.tsx` — scan de produto

**Por que na câmera e não antes:** é o único ponto por onde toda foto obrigatoriamente passa. Qualquer caminho novo até o scan herda o consentimento de graça — não dá para esquecer de plugar.

**Componentes:**
- `hooks/useScanConsentGate.tsx` — o portão. Dispara `requestConsent` no mount e devolve `consentGate` (o JSX do modal) para a tela renderizar. **Recusar chama `router.back()`** — sem consentimento não há scan.
- `hooks/useAIConsent.ts` — `requestConsent(onGranted)`: verifica AsyncStorage; se já aceitou, chama `onGranted()` direto; se não, abre o modal e guarda a ação pendente em `pendingAction`
- `components/ui/AIConsentModal.tsx` — o backdrop **não fecha** o modal (consentimento explícito obrigatório); "Cancelar" fecha sem prosseguir para o scan

**Ao criar uma tela de câmera nova:** `const { consentGate } = useScanConsentGate()` e renderize `{consentGate}` na raiz. Não replique a lógica à mão.

> ⚠️ **Modal stacking no iOS:** `AIConsentModal` é um `<Modal>` nativo — se for aberto enquanto outro `<Modal>` nativo estiver na tela, o iOS silencia o segundo e o toque não faz nada. Isso **deixou de ser um problema** no fluxo atual (as câmeras não são Modal), mas continua valendo para qualquer integração futura do `AIConsentModal` dentro de um Modal: feche o primeiro e só dispare `requestConsent` depois da animação (~220ms).

> ⚠️ **Testar o consentimento exige reinstalar o app.** O aceite é gravado em `AsyncStorage` e vale para sempre; em aparelho já usado o modal simplesmente não aparece. Isso engana fácil e leva a concluir que a integração quebrou.

---

### 15. Guard de assinatura — Superwall + RevenueCat

O paywall é gerenciado pelo **Superwall** (`expo-superwall`). O `<SuperwallProvider>` está em `app/_layout.tsx` (raiz), logo abaixo do `<MixpanelProvider>` — acima de `GestureHandlerRootView` e `SafeAreaProvider`.

**API Key iOS:** `pk_4iUsZwW_-ME9WdK3IcXYp`  
**Placement identifier:** `paywall_onboarding`

O acesso ao app é verificado em 3 pontos de assinatura + 1 guard de nome, em ordem. Os guards de assinatura usam RevenueCat (`getCustomerInfo` + `isSubscribed`):

- `app/index.tsx` — ao abrir o app com sessão ativa → vai direto para `/(app)/home` (sem checar assinatura — delega para `AppLayout` evitar race condition com `loginRevenueCat`)
- `app/(onboarding)/_layout.tsx` — ao entrar no onboarding com sessão ativa → assinante já vai direto para home
- `app/(onboarding)/login.tsx` — `routeAfterLogin(userId)` após qualquer método de login (e-mail, Google, Apple) → **`await loginRevenueCat(userId)` ANTES** de `getCustomerInfo()` (ver race condition abaixo) → assinante: `/(app)/home`; não-assinante: `router.replace('/(onboarding)/paywall-soft')`
- **`app/(app)/_layout.tsx`** — guard definitivo de assinatura (**fail closed**): não-assinante, timeout ou erro → `router.replace('/(onboarding)/paywall-soft')`; o app **nunca renderiza** para não-assinantes (`setReady(true)` só é chamado após assinatura confirmada via `Promise.race` de 8s)

**Guard de nome em `app/(app)/_layout.tsx` (executa antes do guard de assinatura):** ao entrar no app com sessão ativa, o layout consulta `users.nome`. Se estiver vazio, redireciona para `/(onboarding)/nome` **independentemente do status de assinatura**. Isso cobre usuários existentes que nunca definiram nome. Só depois dessa verificação o fluxo de assinatura é avaliado.

**⚠️ Race condition crítica — loginRevenueCat vs getCustomerInfo:** `_layout.tsx` (raiz) chama `loginRevenueCat(userId)` de forma assíncrona (fire-and-forget). Se `getCustomerInfo()` for chamado ANTES de `loginRevenueCat` completar, o RevenueCat ainda estará em modo anônimo — e o usuário anônimo não tem assinatura, causando loop de paywall. **Solução:** aguardar `loginRevenueCat(userId)` (com await + try/catch) imediatamente antes de chamar `getCustomerInfo()`. Feito em `(app)/_layout.tsx`, em `paywall-soft.tsx` (quando há sessão ativa) **e em `login.tsx`** (`routeAfterLogin`).

> 🐛 **Bug real que essa race causou no login (corrigido — não reintroduzir):** `routeAfterLogin()` em `login.tsx` chamava `getCustomerInfo()` logo após `signInWithEmail`/`signInWithGoogle`/`signInWithApple`, **sem** logar o RevenueCat com o usuário recém-autenticado. O RC ainda estava anônimo → `isSubscribed` = `false` → **um usuário que JÁ TINHA conta e assinatura ativa era mandado para o `paywall-soft`**; e como `paywall-soft` tinha um bypass `__DEV__` que redirecionava direto para `signup.tsx`, o usuário existente caía na **tela de criar conta**. **Regra:** qualquer novo ponto do código que chame `getCustomerInfo()` logo após um login DEVE fazer `await loginRevenueCat(userId)` antes — o `userId` vem da sessão retornada pelo próprio método de login (`session.user?.id` / `data.user?.id`), não de `getSession()`.

> 🐛 **SEGUNDA causa do MESMO sintoma — o bypass `__DEV__` do `paywall-soft` (corrigido).** Consertar a race acima resolveu o caminho de **produção**, mas o sintoma continuou aparecendo em build de desenvolvimento, o que levou a acreditar que a correção anterior não tinha funcionado. Eram **dois bugs distintos com a mesma cara**. O bypass fazia `router.replace('/(onboarding)/signup')` **incondicionalmente** — sem consultar a sessão. A lógica correta ("já tem sessão → home; não tem → signup") existia em `handleAfterPaywall()`, mas o `return` do `if (__DEV__)` acontecia antes de chegar lá. **Correção:** o bypass agora faz `getSession()` e escolhe o destino. **Regra geral:** todo atalho de `__DEV__` que navega precisa respeitar o mesmo estado que o caminho de produção respeitaria — senão ele não é um atalho, é um fluxo paralelo que só você vê, e que mascara (ou inventa) bugs. Vale para os bypasses de `(onboarding)/_layout.tsx` e `(app)/_layout.tsx` também.
>
> ⚠️ **Ao diagnosticar "caí na tela errada depois do login", verifique SEMPRE em qual build você está.** O sintoma é idêntico nos dois casos, mas a causa e o arquivo são outros: em release é o RevenueCat (`login.tsx`), em dev é o bypass (`paywall-soft.tsx`).

**Tela `app/(onboarding)/nome.tsx`:** pergunta "Como você quer ser chamado?" com campo único de nome. Sem botão de voltar e sem opção de pular — a única saída é inserir um nome e apertar "Continuar". Usa `upsert` (não `update`) com `onConflict: 'id'` para garantir que a row é criada caso não exista. **Navega para `/(app)/home` somente se o save for bem-sucedido** — o `router.replace` está dentro do `try`, não no `finally`. Se falhar, exibe `Alert` e mantém o usuário na tela para tentar novamente. Isso previne o loop: save silencioso → navigate → layout recheca → nome vazio → redireciona de volta. Alcançada por dois caminhos:
1. Novos usuários: `paywall-soft.tsx` → `signup.tsx` → `router.push('/(onboarding)/nome')` diretamente (após criar conta)
2. Usuários existentes sem nome: `(app)/_layout.tsx` redireciona diretamente para `nome.tsx`

> ⚠️ **Bypass para desenvolvimento (`__DEV__`):** Todos os pontos acima têm um bypass condicional que é ativado automaticamente no simulador/Metro. Além disso, `app/(onboarding)/notifications.tsx` também tem bypass em `navigateToApp()` — vai direto para `/(onboarding)/nome` (não para `/(app)/home`) sem chamar RevenueCat:
> ```typescript
> if (__DEV__) {
>   // pula RevenueCat e Superwall — vai direto para o destino
>   setReady(true); // ou router.replace('/(onboarding)/nome')
>   return;
> }
> ```
> Em produção (`__DEV__ === false`) o comportamento é idêntico ao descrito acima. **Se o Superwall sumir no simulador, é esperado** — não é um bug.

O guard em `(app)/_layout.tsx` usa `Promise.race` com **timeout de 8s**: se `getCustomerInfo()` travar (rede lenta), o race resolve com `null` e o usuário é enviado para `paywall-soft`. `setReady(true)` só é chamado se a assinatura for confirmada dentro do prazo — **o app nunca renderiza com `null` de resultado**.

> **Cache de assinatura entre remounts:** o store Zustand tem o campo `subscriptionVerified: boolean`. Após a primeira verificação bem-sucedida do RevenueCat na sessão, esse flag é setado como `true`. Em remounts do `(app)/_layout.tsx` dentro da mesma sessão (ex: fluxo `nome.tsx` → `/(app)/home` causa unmount/remount do layout), o check do RevenueCat é pulado — vai direto para `setReady(true)`. Isso elimina a tela branca de até 8s que ocorria nesses remounts. O flag reseta automaticamente ao fechar o app — ⚠️ **e isso continua verdade mesmo depois que o store ganhou `persist`**: `subscriptionVerified` está deliberadamente **fora** da lista branca do `partialize` (ver "CACHE DE DADOS"), justamente para o RevenueCat ser reverificado a cada cold start. **Nunca adicionar esse campo ao `partialize`.**

**`usePlacement`** deve ser chamado em componentes descendentes do `SuperwallProvider`. Em `paywall-soft.tsx`, isso é garantido porque o provider está na raiz.

> ⚠️ **Import gotcha:** `expo-superwall` exporta apenas `SuperwallProvider`, hooks e tipos. Para usar a API de classe (`Superwall.shared.*`), importe de `expo-superwall/compat`:
> ```typescript
> import Superwall from 'expo-superwall/compat'; // ← compat, não expo-superwall
> ```
> `refreshConfiguration()` **não existe** no wrapper JS — o equivalente disponível é `Superwall.shared.preloadAllPaywalls()`.

**`CustomPurchaseControllerProvider` — obrigatório para integração Superwall + RevenueCat:**

O `CustomPurchaseControllerProvider` (também exportado de `expo-superwall`) envolve o conteúdo logo abaixo do `SuperwallProvider` em `app/_layout.tsx`. Ele intercepta eventos de compra/restauração do Superwall e os delega para o RevenueCat SDK.

**⚠️ Sem este provider, o Superwall processa compras via StoreKit diretamente** — o RevenueCat não é notificado. Quando `getCustomerInfo()` é chamado em seguida, retorna "não assinante" e o paywall reaparece em loop infinito.

O controller implementado:
```typescript
const superwallPurchaseController = {
  onPurchase: async ({ productId }) => {
    // Procura o package em TODAS as offerings, não só na atual (offerings.current).
    // O produto de cupom (br.com.niksai.app.anual.promo10) vive numa offering que
    // NÃO é a default (promo10); limitar a busca a offerings.current faria a compra
    // dele falhar em silêncio (Superwall acha que falhou, RC não é notificado → loop).
    const allPackages = Object.values(offerings.all).flatMap(o => o.availablePackages);
    const pkg = allPackages.find(p => p.product.identifier === productId);
    // Se não achar em NENHUMA offering, console.error com a lista de offerings/produtos
    // (falha real de config no RevenueCat) — nunca falha às cegas.
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    // Retorna 'purchased' se o entitlement 'premium' ficou ativo
  },
  onPurchaseRestore: async () => {
    const customerInfo = await Purchases.restorePurchases();
    // Retorna 'restored' se o entitlement 'premium' ficou ativo
  },
};
```

#### `paywall-soft.tsx` — gateway para o Superwall (sem UI própria)

`paywall-soft.tsx` **não é uma tela de paywall visual**. É um componente spinner (`ActivityIndicator`) que entrega o controle ao Superwall SDK. O Superwall exibe sua própria tela de paywall hospedada no dashboard — toda a UI, copy e design do paywall são configurados lá, não no código.

`plan-preview.tsx` navega para `paywall-soft.tsx`, que aciona o Superwall. `paywall-soft.tsx` registra callbacks para saber quando o usuário interagiu:

```typescript
const { registerPlacement } = usePlacement({
  onDismiss: async () => await handleAfterPaywall(),  // usuário fechou (assinou, restaurou ou dispensou)
  onSkip: async () => await handleAfterPaywall(),      // Superwall não exibiu (holdout, já assinante)
  onError: async () => registerPlacement({ placement: 'paywall_onboarding' }), // SDK falhou → reapresenta
});
```

`handleAfterPaywall()` verifica o RevenueCat: chama `getCustomerInfo()` primeiro (cache local). **Se o cache não mostrar assinatura**, faz fallback com `Purchases.restorePurchases()` (sincroniza com Apple) — isso cobre: (a) cache desatualizado pós-compra, (b) usuário anônimo RC comprou mas o RC foi trocado para o usuário identificado sem transferir a assinatura (fluxo paywall → signup), (c) `onPurchase` retornou 'failed' mas Apple processou o pagamento. Se assinante confirmada → seta `subscriptionVerified(true)` no store → navega para `/(onboarding)/signup` (nova usuária sem sessão) ou `/(app)/home` (usuária existente com sessão); não-assinante após ambas as tentativas → **reapresenta o paywall** (`registerPlacement` novamente). O usuário fica bloqueado em `paywall-soft` até assinar — não há saída sem assinatura.

**`signup.tsx` — `restorePurchases()` após `logIn()`:** após cada `Purchases.logIn(userId)` nos três métodos de autenticação (email, Google, Apple), é feito `await Purchases.restorePurchases()`. Isso garante que a assinatura comprada pelo usuário anônimo RC é transferida ao usuário RC identificado, mesmo que o usuário identificado já existisse no RevenueCat. Sem esse passo, em sessões subsequentes (após restart do app), `(app)/_layout.tsx` veria o usuário identificado sem assinatura → loop de paywall.

**Por que esta abordagem:** `registerPlacement` retorna uma `Promise<void>` que resolve **imediatamente** após registrar o placement com o SDK nativo — **não** após o paywall ser fechado. A navegação pós-paywall deve sempre acontecer nos callbacks `onDismiss`/`onSkip`/`onError`, nunca após `await registerPlacement`.

#### Sistema de cupons de influenciadora

Cada influenciadora tem um cupom próprio (o primeiro é `MAISENA10`). Quem digita um cupom válido passa a ver o **plano anual com desconto** (offering `promo10` no RevenueCat, produto `br.com.niksai.app.anual.promo10`). O objetivo é saber **qual influenciadora trouxe cada assinante**. Backend: Edge Functions `validar-cupom`, `atribuir-cupom` e o `revenuecat-webhook` (ver a tabela de Edge Functions); tabelas `cupons`/`cupom_aplicacoes` + view `cupom_desempenho` (ver "Tabelas criadas").

> ⚠️ **Fluxo delicado — o paywall vem ANTES do signup.** Quando a usuária digita o cupom, ela ainda **não tem sessão Supabase** e o RevenueCat está **anônimo**. Por isso a validação funciona sem autenticação e a identidade real (`user_id`) só é resolvida depois.

**1. Tela do cupom (`promo-cupom.tsx`).** O paywall do Superwall tem um botão "TENHO CUPOM" com a custom action `showPromoRedeem`. Em `paywall-soft.tsx`, `useSuperwallEvents({ onCustomPaywallAction })` recebe a ação, **fecha o paywall** (`Superwall.shared.dismiss()`) e faz `router.push('/(onboarding)/promo-cupom')` (não dá para sobrepor uma tela ao paywall nativo em Expo — tem que fechar e navegar). A tela valida com `validar-cupom` (fetch + `apikey`, nunca `supabase.functions.invoke`), mostra mensagem específica por motivo (`nao_existe`/`desativado`/`expirado`/`limite_atingido`), guarda o cupom em `appliedCoupon` no store e:
- **válido** → `setNextPlacement('paywall_cupom')` + `router.back()` (volta e mostra o paywall com desconto);
- **voltar (seta)** → `setNextPlacement('paywall_onboarding')` + `router.back()` (descarta, paywall normal).

**2. Supressão de USO ÚNICO da reapresentação (`lib/paywallFlow.ts`).** Ao fechar o paywall pelo botão de cupom, o `onDismiss` do `paywall-soft` normalmente **reapresentaria** o paywall (fail closed). Para não reapresentar SÓ nesse fechamento, `onCustomPaywallAction` chama `armSuppressReapresentar()` antes do `dismiss()`, e o `onDismiss` faz `if (consumeSuppressReapresentar()) return`. **É de uso único e em memória** (nunca persistido): consumido na primeira leitura, e se o app fechar / algo falhar no meio, some sozinho e o comportamento volta ao normal. Um flag preso em ligado seria uma brecha para escapar do paywall — por isso NUNCA persistir. `nextPlacement` (qual paywall reabrir ao voltar) segue a mesma regra: em memória, lido-e-resetado.

**3. Reapresentar o paywall certo ao voltar.** `paywall-soft` tem um `useFocusEffect` que **ignora o primeiro foco** (o registro inicial continua no `useEffect` original, intocado) e, ao REGANHAR o foco vindo da tela de cupom, registra `consumeNextPlacement() ?? 'paywall_onboarding'`.

**4. `onPurchase` busca em TODAS as offerings.** O produto de cupom vive numa offering que não é a default. O controller (código acima) procura o package em `offerings.all`, não em `offerings.current` — senão a compra do produto de cupom falharia em silêncio (loop de paywall pós-pagamento). Se o produto não existe em nenhuma offering, loga o cenário completo em vez de falhar às cegas.

**5. Atribuição (`user_id` + `converteu`).** Os dois lados marcam a conversão, de forma idempotente (o contador só sobe no `false→true` do trigger):
- **`revenuecat-webhook`** — caminho principal e confiável (sobrevive ao app fechar entre a compra e o signup). Marca `converteu` por `product_id` (o produto de cupom tem id próprio). Ver a linha do webhook na tabela de Edge Functions.
- **App (`atribuir-cupom` via `lib/couponAttribution.ts` → `attributeCouponIfAny(userId)`)** — liga o `user_id` **e** marca `converteu` (reforço para quando o id do RevenueCat muda entre aplicar e comprar, caso em que o webhook não acha a linha). Usa o `rc_app_user_id` **guardado** em `appliedCoupon` (não `getAppUserID()` atual), então **independe da ordem do `Purchases.logIn`**. Chamado em **3 pontos idempotentes**: `signup.tsx` (após `saveToSupabase`, que cria a linha em `users` exigida pela FK), `nome.tsx` (chokepoint de toda usuária nova com sessão ativa, inclusive signup por confirmação de e-mail) e `paywall-soft.tsx` (usuária que já tinha conta, reengajamento → home). **Fire-and-forget e engole erro**: atribuição falhando NUNCA trava o signup nem a entrada (a assinatura vale mais que a métrica).

> ⚠️ **Segurança — esta tela não pode virar rota de fuga do paywall.** O guard de assinatura de `(app)/_layout.tsx` **não foi alterado** (continua fail closed). A tela de cupom vive só em `(onboarding)` e **não tem nenhuma navegação para dentro do app** — as únicas saídas são paywall com desconto (válido) ou paywall normal (voltar). A supressão é de uso único e em memória. Quem não assinou não entra no app por nenhum caminho.

> ⚠️ **Como testar o paywall/cupom (não é trivial):** você precisa de um Apple ID **sem assinatura ativa** — senão o app corretamente detecta a assinatura e pula o paywall. **TestFlight não usa a "Conta de Sandbox" dos Ajustes** (essa é só pra build de dev do Xcode). O jeito confiável: `npx expo run:ios --device --configuration Release` (**Release obrigatório** — em Debug o `__DEV__` pula o paywall direto pro signup) + um **Sandbox Tester novo** que nunca comprou. 🐛 **Sintoma comum que NÃO é bug:** "cliquei no cupom e caí no signup em vez do paywall de desconto" = a conta já é assinante (o único caminho pro signup em produção está dentro de `if (isSubscribed)`; não-assinante volta pro paywall, nunca signup). Assinaturas de sandbox persistem e renovam sozinhas — qualquer compra de teste anterior deixa o entitlement ativo.

**Consulta de desempenho:** `select * from cupom_desempenho` no SQL editor do Supabase — aplicações, conversões e taxa por cupom.

**`paywall-detailed.tsx` — removido do projeto:**
Era o paywall customizado (planos mensal/anual, trial de 3 dias, integração RevenueCat direta) do fluxo anterior ao Superwall. Arquivo deletado — não existe mais no projeto.

---

### 16. Analytics — Mixpanel

**SDK:** `mixpanel-react-native` com `useNative=true` (usa o MixpanelSDK nativo iOS — obrigatório para build Xcode).

**Token:** lido de `process.env.EXPO_PUBLIC_MIXPANEL_TOKEN` (`.env` na raiz do projeto).

**Arquitetura:**
```
lib/mixpanel/
  mixpanelClient.ts       ← singleton Mixpanel + initMixpanel()
  MixpanelProvider.tsx    ← Context + useMixpanel() hook
  useScreenTracking.ts    ← Screen Viewed automático via usePathname()
```

**Hierarquia de providers em `app/_layout.tsx`:**
```
<MixpanelProvider>         ← camada mais externa
  <SuperwallProvider>
    <GestureHandlerRootView>
      <SafeAreaProvider>
        <AppShell>          ← chama useScreenTracking() + dispara app_opened no mount
          <Stack />
```

**Super properties registradas no init** (enviadas em todos os eventos automaticamente):
`platform`, `app_version`, `data_source: 'app'`

**`identify(userId)`** deve ser chamado imediatamente após qualquer autenticação bem-sucedida — antes de `saveToSupabase`. Sem isso, todos os eventos ficam vinculados a IDs anônimos do SDK. Implementado em `signup.tsx` e `login.tsx` para os três métodos (email, Google, Apple).

**Eventos instrumentados:**

| Evento | Arquivo | Propriedades |
|---|---|---|
| `app_opened` | `app/_layout.tsx` — `AppShell` mount | — |
| `Screen Viewed` | automático via `useScreenTracking` | `screen_name`, `pathname` |
| `onboarding_started` | `(onboarding)/_layout.tsx` | `onboarding_version`, `total_steps: 23` |
| `onboarding_step_viewed` | mount de cada tela do onboarding (steps 2–23) | `step_number`, `step_name`, `step_total: 23` |
| `onboarding_step_completed` | botão "Continuar" de cada tela | `step_number`, `step_name`, `step_total: 23` |
| `onboarding_completed` | ⚠️ **não disparado atualmente** — estava em `paywall-detailed.tsx` (deletado); mover para `paywall-soft.tsx` se necessário | `$duration` (calculado pelo SDK via `timeEvent`) |
| `paywall_viewed` | `paywall-soft.tsx` mount | `screen: 'soft'` |
| `plan_selected` | ⚠️ **não disparado atualmente** — estava em `paywall-detailed.tsx` (deletado) | `plan: 'mensal' \| 'anual'` |
| `purchase_initiated` | `lib/revenuecat.ts` antes do SDK de compra | `plan: 'mensal' \| 'anual'` |
| `purchase_completed` | `lib/revenuecat.ts` após compra bem-sucedida | `plan: 'mensal' \| 'anual'` |
| `purchase_failed` | `lib/revenuecat.ts` em erro de compra | `plan`, `error: string` |
| `purchase_restored` | `lib/revenuecat.ts` após restore | — |
| `user_logged_in` | `login.tsx` após qualquer login bem-sucedido | `method: 'email' \| 'google' \| 'apple'` |
| `scan_completed` | `(scan)/loading.tsx` após `analyze-skin` | `skin_score: number`, `skin_type: string` |
| `scan_failed` | `(scan)/loading.tsx` após esgotar 2 retries | `error: string` |
| `protocol_generated` | `lib/generateProtocol.ts` callback `onSuccess` | — |
| `protocol_failed` | `lib/generateProtocol.ts` callback `onFinally` em erro | `error: string` |
| `food_scan_completed` | `(scan)/food-report.tsx` após `analyze-food` | `meal_score: number`, `meal_label: string` |
| `food_scan_failed` | `(scan)/food-report.tsx` em erro | `error: string` |

**`onboarding_completed` — efeitos colaterais (⚠️ não disparado atualmente — estava em `paywall-detailed.tsx`, arquivo deletado; mover para `paywall-soft.tsx` quando necessário):**
```typescript
setUserProperties({ onboarding_completed: true, onboarding_completed_at: ISO })
registerSuperProperties({ onboarding_completed: true })
flush() // garante envio imediato
```

**`timeEvent("onboarding_completed")`** é chamado em `(onboarding)/_layout.tsx` assim que o usuário entra no fluxo — o SDK mede `$duration` automaticamente quando `track("onboarding_completed")` dispara no paywall.

**Padrão de uso nas telas:**
```typescript
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

const { track } = useMixpanel();
// Em CTAButton:
onPress={() => track('onboarding_step_completed', { step_number: N, step_name: 'Nome', step_total: 23 })}
```

> ⚠️ `useMixpanel()` só funciona em componentes React descendentes do `<MixpanelProvider>`. Usar o hook por padrão. **Exceção:** `lib/revenuecat.ts` importa `mixpanel` diretamente do `mixpanelClient` porque não é um componente React — qualquer outra função utilitária fora do contexto React deve seguir o mesmo padrão.

**⚠️ GOTCHA — In-App Purchase Capability:** Sem a capability ativada no Xcode, `getOfferings()` falha silenciosamente em builds de produção (`.catch` engole o erro → `pkg = null` → alerta "Produto não disponível"). No simulador não acontece. **Localização:** Xcode → Target NIKSAI → Signing & Capabilities → `+ Capability` → In-App Purchase

---

### 17. React Native iOS — `height` explícito quebra `TextInput multiline`

No iOS, definir `height` como valor fixo em um `TextInput` com `multiline={true}` causa comportamento incorreto: o cursor aparece deslocado no topo do campo e o texto digitado some da tela. Isso ocorre porque o iOS posiciona o cursor com base na altura declarada, não no conteúdo real.

**Regra:** em campos multiline, **nunca definir `height` explícito**. Usar apenas `maxHeight` para limitar o crescimento e deixar o React Native gerenciar a altura via crescimento natural.

```typescript
// ✅ Correto — cresce naturalmente, para no maxHeight
<TextInput
  multiline
  style={{ maxHeight: 80 }}
/>

// ❌ Errado — cursor some, texto invisível no iOS
<TextInput
  multiline
  style={{ height: inputHeight, maxHeight: 80 }}
/>
```

Quando o conteúdo ultrapassa `maxHeight`, o scroll interno do iOS entra automaticamente — não é necessário `scrollEnabled={false/true}` manual.

Para detectar se o campo já está em modo multiline (ex: mudar `borderRadius` ou `alignItems`), usar `onContentSizeChange` apenas para atualizar um estado booleano, sem usar o valor para definir `height`.

---

### 18. Tela de loading do onboarding — headline com `adjustsFontSizeToFit` em vez de 3 `<Text>` separados

O headline da tela de loading do **onboarding** (`loading.tsx`) é composto por prefixo em bold DEEP + palavra-destaque em PlayfairDisplay-Italic CORAL + "…".

> ⚠️ **Só a `loading.tsx` (onboarding) ainda usa esse headline.** As telas de loading de dentro do app — `loading-dentro-app.tsx` (pele) e o estado `loading` de `food-report.tsx` (refeição) — migraram para o design da `product-loading.tsx` (círculo + porcentagem central + frase rotativa Nunito) e **não têm mais headline Playfair** (ver seção 13). O padrão abaixo vale apenas para `loading.tsx`.

A abordagem anterior usava 3 `<Text>` separados em `flexDirection: 'row'`, com `flexShrink: 1` no prefixo. Em telas menores (iPhone 11, 375pt), o prefixo era truncado com "s..." pelo React Native antes da palavra-destaque aparecer.

**Por que não funciona com 3 Texts em row:** `adjustsFontSizeToFit` em textos individuais numa row não coordena o scaling entre eles. Com `flexShrink: 1` apenas no prefixo, o RN trunca o prefixo ao invés de reduzir a fonte.

**Estrutura correta:**
```tsx
<View style={{ width: '100%', alignItems: 'center', overflow: 'hidden' }}>
  <Text
    numberOfLines={1}
    adjustsFontSizeToFit={true}
    minimumFontScale={0.7}
    allowFontScaling={false}
    style={{ fontSize: 28, textAlign: 'center', ... }}
  >
    {prefix}{' '}
    <Text style={{ fontFamily: 'PlayfairDisplay-Italic', color: CORAL }}>
      {highlight}
    </Text>
    {'…'}
  </Text>
  {/* Shimmer como overlay absoluto — não wrapping só a palavra-destaque */}
  <Animated.View pointerEvents="none" style={{ position: 'absolute', ... }}>
    <LinearGradient ... />
  </Animated.View>
</View>
```

O `<View style={{ overflow: 'hidden' }}>` com `width: '100%'` é obrigatório — sem ele o `adjustsFontSizeToFit` não tem largura delimitada e não sabe quando ativar. O shimmer vira overlay absoluto sobre o container inteiro (não apenas sobre a palavra-destaque).

---

## FLUXO COMPLETO DO APP

```
→ [app aberto com sessão ativa] → spinner → verifica assinatura (RevenueCat) → assinante: home | não-assinante: paywall-soft
  (guard em (onboarding)/_layout.tsx também aplica a mesma lógica)

Welcome (index.tsx — 5 telas swipeáveis)
  → [botão "Começar"] Onboarding (24 telas) — setOnboardingField() em cada tela
    birthday → gender → pregnancy* → goal → goal-validation → concerns → skin-type
    → sun-exposure → hydration-sleep
    → skincare-routine → skincare-routine-detail* (se complement/prescribed)
    → allergies → allergies-detail* (se reaction)
    → goal-desire → social-proof
    → scan-prep → camera (setSkinImage) → loading (analyze-skin) → results
    → plan-preview → paywall-soft (Superwall) → signup (saveToSupabase + generateProtocol bg)
    → nome → notifications → /(app)/home

  (* = telas condicionais)

  → [botão "Entrar"] Login
    → E-mail + Senha / Google / Apple → verifica assinatura (RevenueCat)
    → assinante: home | não-assinante: paywall-soft

Fluxo de scan facial (dentro do app principal):
  botão "Escanear" da home (useFaceScan)
    → 1ª vez:      scan-prep-app (tutorial de 4 passos, uma-vez-só) → camera-multi → loading-dentro-app → /(app)/skin-result
    → depois disso: camera-multi (pula o tutorial) → loading-dentro-app → /(app)/skin-result

Fluxo de compartilhamento do Niks score (dentro do app principal):
  home → link "Compartilhar" + ícone de share (só aparece se houver scan)
  → /(share)/share-capture (colagem de 1–4 fotos) → /(share)/share-preview (adesivo + export)
  → share sheet nativo (expo-sharing) OU salvar na galeria (expo-media-library)

Fluxo de produto (dentro do app principal):
  "Escanear produto" (tela Recomendação de Produtos) → product-camera → product-loading → product-result

Fluxo de comida (dentro do app principal):
  card "Analisar o impacto da minha refeição na minha pele" (sugestão do NIKS Chat)
    → food-camera (setFoodImage) → food-report (analyze-food: loading + resultado embutidos)
  A ÚNICA entrada de UI é o card de refeição das sugestões do NIKS Chat (`niks-chat.tsx`) — vai
  DIRETO para a câmera (curto-circuita `handleSuggestionPress`, sem resposta de chat). Foi essa
  reconexão (Sessão 48) que trouxe o food scan de volta ao app; antes ele era inalcançável pela UI
  (ScanModal aposentado). ⚠️ `food-camera` NÃO monta o `useScanConsentGate` (rosto e produto montam)
  → a refeição chega na câmera sem o consentimento de IA. Decisão de ir direto; ver Sessão 48.
```

---

## ESTRUTURA DE ARQUIVOS

```
niks-ai/
├── app/
│   ├── _layout.tsx                ✅
│   ├── index.tsx                  ✅ Welcome — 5 telas swipeáveis (Screens 1–4 com PhoneMockup, Screen 5 com WelcomeOrb estático); check de auth antes de exibir o fluxo
│   ├── (onboarding)/
│   │   ├── _layout.tsx            ✅
│   │   ├── birthday.tsx           ✅
│   │   ├── gender.tsx             ✅ navega para pregnancy (Feminino) ou goal (outros)
│   │   ├── pregnancy.tsx          ✅ condicional — só para gênero Feminino; entre gender e goal
│   │   ├── goal.tsx               ✅ multi-select até 3 objetivos
│   │   ├── goal-validation.tsx    ✅ tela informativa — gráfico de potencial (sem interação, só Continuar)
│   │   ├── concerns.tsx           ✅
│   │   ├── skin-type.tsx          ✅
│   │   ├── sun-exposure.tsx       ✅
│   │   ├── hydration-sleep.tsx    ✅ → navega para skincare-routine
│   │   ├── skincare-routine.tsx   ✅ "Como está sua rotina de skincare hoje?" — 4 opções
│   │   ├── skincare-routine-detail.tsx ✅ condicional — descrição dos produtos usados/prescritos
│   │   ├── allergies.tsx          ✅ alergias/sensibilidades — navega para goal-desire
│   │   ├── allergies-detail.tsx   ✅ condicional — ativo/produto que causou reação — navega para goal-desire
│   │   ├── goal-desire.tsx        ✅ "Qual é o seu verdadeiro objetivo?" — 6 opções emocionais — navega para social-proof
│   │   ├── social-proof.tsx       ✅ "Com o NIKS, você vai conseguir 3x mais rápido" → navega direto para scan-prep (rate-us saiu do fluxo)
│   │   ├── plan-preview.tsx       ✅ "Sua rotina de skincare está pronta" → navega para paywall-soft
│   │   ├── paywall-soft.tsx       ✅ gateway para Superwall — spinner sem UI própria
│   │   ├── signup.tsx             ✅ criação de conta (e-mail/Google/Apple) → dispara generateProtocol em bg → navega para nome
│   │   ├── login.tsx              ✅ fluxo dois passos (e-mail/senha + Google/Apple)
│   │   ├── nome.tsx               ✅ "Como você quer ser chamada?" → salva users.nome → navega para notifications
│   │   └── notifications.tsx      ✅ pede permissão + salva push_token no Supabase → navega para /(app)/home
│   ├── (app)/
│   │   ├── _layout.tsx            ✅ Navbar do Figma (GlobalBottomBar): sparkles/lupa/logo-NIKS/chat/perfil, 80px, ícones nas posições exatas — sem FAB
│   │   ├── home.tsx               ✅ Réplica do Figma "Novo design": Niks score, foto, métricas 2×3, card de skincare, Para você, botão Escanear. Score/foto/6 métricas + card de skincare (rotina real) + **"Para você" (2 primeiros produtos recomendados, deep-link pro detalhe)** = **dados reais**
│   │   ├── recomendacao-produtos.tsx ✅ Recomendação por passo, **ligada aos dados reais** (`recomendacoes_produtos`→`produtos`, chips via `lib/concernLabels`, `expo-image`); abas Recomendados/Escaneados; deep-link da home abre detalhe. Ver "Tela Recomendação de Produtos"
│   │   ├── skin-result.tsx        ✅ resultado da análise facial no app principal (métricas reais, parallax hero)
│   │   ├── protocolo.tsx          ✅ Rotina (título exibido "Rotina de Skincare"; Nunito, temas Manhã/Noite: herói Manhã = logo tintada `#FF9D9D` / Noite = lua; cards expansíveis). **Dados reais** (rotina + dicas do `protocolos`/store) + Recomendações + **cerimônia re-portada da produção** (DM Serif, orb Skia). Ver seção 6
│   │   ├── niks-chat.tsx          ✅ Chat com a NIKS AI — dois estados: empty (boas-vindas) / active (conversa, réplica do Figma node 1:393); tema claro, sem modo noturno
│   │   ├── perfil.tsx             ✅ nome dinâmico, email, notificações, suporte, apagar conta
│   │   └── set-name.tsx           ✅ editar nome/sobrenome → salva em users.nome no Supabase
│   └── (scan)/
│       ├── scan-prep.tsx          ✅ preparação para o scan — versão do ONBOARDING (design antigo DEEP/CORAL+Playfair, barra de progresso). NÃO alterar
│       ├── scan-prep-app.tsx      ✅ tutorial de prep do scan — versão DENTRO DO APP (design novo: Nunito, branco, rosa #FF9D9D); CARROSSEL de 4 passos, mostrado UMA vez só (flag scanTutorialSeen) → camera-multi. Aberto pelo useFaceScan
│       ├── camera.tsx             ✅ scan de 1 foto — **só o ONBOARDING** → loading. Consentimento de IA (useScanConsentGate) + botão de galeria SÓ em __DEV__. ⚠️ o ramo scanSource==='app' é código morto (o app usa camera-multi)
│       ├── camera-multi.tsx       ✅ scan de 6 fotos (4 expressões + 2 perfis) — **DENTRO DO APP** → loading-dentro-app. Monta 2 colagens (ScanCollage) + manda 3 imagens à **analyze-skin-app** (função própria, não a do onboarding). Miniaturas empilhadas + tela de revisão com retake. Consentimento de IA. Ver "Scan de pele multi-foto (13b)"
│       ├── product-camera.tsx     ✅ câmera do scan de PRODUTO (aberta pela tela Recomendação de Produtos) → product-loading. Consentimento de IA (useScanConsentGate)
│       ├── product-loading.tsx    ✅ loading do scan de produto — chama a Edge Function `analisar-produto` → product-result
│       ├── product-result.tsx     ✅ resultado do scan de produto — **wrapper fino**: só liga store + navegação e renderiza `components/product/ProductAnalysis`. Ver "Feature: Escanear Produto"
│       ├── food-camera.tsx        ✅
│       ├── loading.tsx            ✅ loading do onboarding — inclui step "Montando seu protocolo"
│       ├── loading-dentro-app.tsx ✅ loading do app principal — não inclui step de protocolo
│       ├── rate-us.tsx            ⚠️ FORA DO FLUXO — nada navega para cá; requestAppReview() comentado (política Apple). Mantido para reaproveitar dentro do app
│       ├── results.tsx            ✅ "Relatório de Pele" no onboarding → navega para plan-preview
│       └── food-report.tsx        ✅
│   └── (share)/                   ✅ Feature "Compartilhar Niks score" — ver seção própria
│       ├── _layout.tsx            ✅ Stack headerShown:false (mesmo padrão do (scan))
│       ├── share-capture.tsx      ✅ colagem de 1–4 fotos: UMA CameraView reposicionada + galeria por célula + refazer
│       └── share-preview.tsx      ✅ colagem montada + adesivo arrastável/pinçável → export 1080×1920 → share/galeria
│   └── (foto)/                    ✅ Feature "Foto da home escolhida pela galeria" — ver seção própria
│       ├── _layout.tsx            ✅ Stack headerShown:false — grupo PRÓPRIO p/ a navbar global do (app) não cobrir a tela
│       └── ajustar-foto.tsx       ✅ enquadra a foto da galeria no círculo EXATO da home (pan+pinch) → crop quadrado → users.foto_home_url
├── components/
│   ├── onboarding/
│   │   ├── PhoneMockup.tsx        ✅ iPhone 15 Pro mockup — frame titanium LinearGradient, dynamic island, side buttons
│   │   └── WelcomeOrb.tsx         ✅ orb coral estático com halo (react-native-svg) — Screen 5 do Welcome
│   ├── ui/
│   │   ├── CTAButton.tsx          ✅
│   │   ├── BackButton.tsx         ✅
│   │   ├── ProgressBar.tsx        ✅
│   │   ├── OptionCard.tsx         ✅
│   │   ├── Pill.tsx               ✅
│   │   ├── IOSWheelPicker.tsx     ✅
│   │   ├── AIConsentModal.tsx     ✅ modal de consentimento de IA (LGPD) — uma única vez por instalação
│   │   └── NightSky.tsx           ✅ céu noturno animado (Reanimated v4 + Skia) — só Protocolo (modo Noite); niks-chat não usa mais
│   ├── layouts/
│   │   └── QuizLayout.tsx         ⚠️ não utilizado — nenhum arquivo importa este componente
│   ├── NiksSticker.tsx            ✅ adesivo CIRCULAR do Story (score + até **4** métricas; ≥4 fica denso). Componente PURO, escala a partir de `size` (130pt). Número da métrica pela **faixa do score** (`metricScoreColor`), não pelo semáforo; **anel + marca (`stickerColor`) seguem a manchete** (score, ou 1ª métrica se isolada). Métrica **isolada = réplica do adesivo de score** (número u52 + rótulo completo). ⚠️ Não importar direto: usar `NiksStickerView`
│   ├── NiksStickerCard.tsx        ✅ adesivo em CARD (4–6 métricas) — réplica do card de métricas da home + marca NIKS. Também PURO. Altura IMPOSTA por `lib/stickerCardLayout` (nunca auto-height, senão o clamp do worklet e o export divergem do preview). ⚠️ Não importar direto: usar `NiksStickerView`
│   ├── NiksStickerView.tsx        ✅ **despachante** — recebe um `StickerSpec` e escolhe a forma por `stickerShape()` (default: 0–3 métricas → círculo · 4–6 → card; respeita `spec.shape` quando o usuário força). Mantém a forma em sincronia com a proporção do clamp; decide o split de rótulo full-vs-short (`!solo`). Só ELE deve ser importado pelas telas
│   ├── share/                     ✅ bandeja de adesivos (ver "Feature: Compartilhar Niks score")
│   │   ├── StickerSheet.tsx       ✅ bottom sheet com 2 abas: "Sugestões" (14 presets) e "Montar o meu" (chips → as 128 combinações). Casca copiada do `ScanModal`. ⚠️ SEM react-native-gesture-handler dentro (Modal é outra janela no Android) → sem arrastar-para-fechar
│   │   └── StickerThumb.tsx       ✅ miniatura de um adesivo. ⚠️ Renderiza na largura canônica (130/312) e encolhe por `transform: scale` + `transformOrigin` — renderizar direto em ~90pt achataria os rótulos
│   ├── product/
│   │   └── ProductAnalysis.tsx    ✅ **FONTE ÚNICA do layout da análise de produto** (réplica do Figma node 136:126: número da compatibilidade + foto no anel + cards, tudo colorido pela faixa do score). Renderizado por DOIS consumidores: `app/(scan)/product-result.tsx` (fluxo do scan) e o modal da aba "Escaneados" de `recomendacao-produtos.tsx` (histórico). ⚠️ **Toda mudança de layout entra AQUI** — duplicar nos dois arquivos já causou o bug de o histórico ficar com o design antigo
│   └── scan/
│       ├── ScanCollage.tsx        ✅ **FONTE ÚNICA do layout das colagens** do scan multi-foto (Layout A 2×2 · Layout B 2 células), parametrizado por `width` → serve preview da revisão E view de export 2048px. Ver "Scan de pele multi-foto (13b)"
│       └── ScanModal.tsx          ⚠️ APOSENTADO — sem consumidores (mantido no repo caso o modal volte)
├── constants/colors.ts            ✅
├── constants/protocols.ts         ⚠️ órfão — `BASE_PROTOCOLS` não é mais importado por nenhuma tela (o `protocolo.tsx` antigo era o último consumidor; removido no redesign). A Edge Function `generate-protocol` também já ignorava `baseProtocol`. Candidato a deleção.
├── store/onboarding.ts            ✅
├── lib/supabase.ts                ✅
├── lib/generateProtocol.ts        ✅ utilitário fire-and-forget — encapsula chamada à Edge Function com retry (3x, 3s), salva no Supabase
├── lib/haptics.ts                 ✅ **FONTE ÚNICA do retorno tátil** (`haptics.tap/action/select/success/warning/error`). API por SIGNIFICADO, não por intensidade — trocar a escala do app inteiro é editar só este arquivo. ⚠️ Nunca chamar `expo-haptics` direto numa tela. Ver "HAPTICS"
├── lib/cache.ts                   ✅ cache stale-while-revalidate (`useCachedQuery`, `invalidateCache`, `clearAllCache`) — memória + AsyncStorage. É o que impede as telas de refazerem tudo a cada foco. Ver "CACHE DE DADOS"
├── lib/currentUser.ts             ✅ `getUserId()`/`useUserId()`/`resetUserId()` — id do usuário via sessão LOCAL. ⚠️ substitui `supabase.auth.getUser()` (que é ida à rede) em tudo que não seja operação sensível
├── lib/routineProgress.ts         ✅ progresso da rotina em AsyncStorage. getRoutinePeriodForNow/periodLabel/getCompletedSteps/markStepCompleted (ver seção 6). ⚠️ Era compartilhado com o card de skincare da home, que **saiu** (virou "Dica do dia") — hoje o único consumidor é a **cerimônia** (`protocolo.tsx`), e só de `markStepCompleted`. Os outros exports estão sem chamador; o módulo foi mantido de propósito
├── lib/dicas/catalogo.ts          ✅ **CONTEÚDO APROVADO — consumir, não editar.** 26 dicas (`CATALOGO_DICAS`, tipo `Dica`). ⚠️ A ORDEM DO ARRAY É A FILA e foi curada à mão (receitas intercaladas) — não reordenar/filtrar/personalizar; não indexar pelo campo `ordem` (use a posição). ⚠️ O campo `fonte` NUNCA é renderizado. Ver "Feature: Dica do dia"
├── lib/dicas/dicaDoDia.ts         ✅ mecânica da fila (`getDicaDoDia`, `dicaAt`) em AsyncStorage — avança por **dia de uso**, não de calendário; índice **só cresce** (o módulo do catálogo é aplicado só na exibição). Consumido pela home. Ver "Feature: Dica do dia"
├── lib/scoreTheme.ts              ✅ tema de cor por faixa de score 0–100 (`getScoreTheme`, `ScoreTheme`, `THEME_*`) — COMPARTILHADO por **3 consumidores**: home (sparkle/número/traço/gradiente/anel), navbar (logo central) e **`components/product/ProductAnalysis`** (número/anel/gradiente + títulos, ícones e chips dos cards). ⚠️ Na home/navbar a entrada é o **`skin_score`**; na análise de produto é a **`compatibilidade`** do produto — o resolvedor é o mesmo, só a métrica muda. Mexer aqui afeta as três telas. Ver "Tela Home → Lógica de cor por faixa de score"
├── lib/savedProducts.ts           ✅ produto salvo por passo da rotina em AsyncStorage (`normStepKey`, `saveProductForStep`) — o "Salvar na minha rotina" grava; a Rotina (`protocolo.tsx`) lê e mostra a foto no lugar do ícone do passo. Client-side, não sincroniza entre devices
├── lib/metricColor.ts             ✅ **FONTE ÚNICA da cor de métrica** (`metricColor` = semáforo, tipo `MetricKey`; + `metricScoreColor` = faixa do score). `metricColor`: **4 faixas ASSIMÉTRICAS** — positivas: `0–40` vermelho `#FF0000`, `41–59` laranja `#FF8A00`, `60–74` amarelo `#FFCC00`, `75–100` verde `#5EFF7E`; negativas (menor = melhor): `70–100` vermelho, `50–69` laranja, `20–49` amarelo, `0–19` verde. ⚠️ **NÃO colapsar em `good = positive ? v : 100−v` com uma régua só** — era assim antes e estava **errado** (Acne 60 daria vermelho; o correto é laranja). `metricScoreColor(v, positive)`: cor pela **faixa do score** (`getScoreTheme`), invertendo negativas — usada SÓ no adesivo em círculo (ver feature). O card usa `metricColor` (semáforo). Não duplicar em tela nenhuma
├── lib/metricDefs.ts              ✅ **FONTE ÚNICA das 6 métricas** (`METRIC_DEFS` com `key`/`label`/`short`/`positive`, `METRIC_BY_KEY`, `Metricas`, `availableKeys`, `hasMetrics`). Extraído da `home.tsx`, onde vivia sozinho, quando a bandeja de adesivos passou a precisar da mesma lista. `label` (com `\n`) é o rótulo da home e do card; `short` é o do adesivo circular, que reticencia nomes longos. `hasMetrics` = fonte única do "scan legado"
├── lib/stickerSpec.ts             ✅ `StickerSpec` (`showScore`/`keys`/**`shape?`**)/`StickerPose`/`StickerShape` + **`stickerShape()`** (default automático 0–3 círculo · 4–6 card, mas respeita `spec.shape` quando viável), `feasibleShapes`, `CIRCLE_MAX = 4`, `stickerAspect`, `stickerBaseFraction`, `specId` (inclui a forma), `normalizeSpec`, `resolveMetrics`. Puro. ⚠️ A regra de forma mora AQUI e não no componente porque o `clampPose` (worklet, UI thread) precisa da proporção **antes** de qualquer render
├── lib/stickerCardLayout.ts       ✅ geometria determinística do adesivo em card (`cardLayout` → `baseW`/`baseH`, `cellOrigin`). ⚠️ O card é OBRIGADO a aplicar `height: baseH * u` — altura vinda do conteúdo faria o rótulo de 2 linhas mudar a altura real e o export divergir do preview
├── lib/stickerPresets.ts          ✅ os **14 adesivos prontos** da aba "Sugestões" + `usablePresets(metricas)`, que poda chaves sem dado e deduplica por `specId` (num scan legado todos colapsam para "só o score")
├── lib/stickerFonts.ts            ✅ `useStickerFonts()` — UM mapa de fontes para os dois adesivos e as miniaturas (antes cada um tinha o seu, e já divergiam). A tela chama no topo → as ~14 miniaturas nascem com fonte pronta (o `useFonts` resolve o estado inicial de forma síncrona)
├── lib/concernLabels.ts           ✅ mapa código→rótulo PT dos concerns (`CONCERN_CODE_TO_LABEL`, `concernLabel`) — fonte única no app p/ as chips da recomendação; inverso do `CONCERN_LABEL_TO_CODE` da Edge Function `recomendar-produtos` + códigos do scan. Manter em sincronia
├── lib/notifications.ts           ✅ requestPushPermission() + savePushToken()
├── hooks/useAuth.ts               ✅
├── hooks/useAIConsent.ts          ✅ requestConsent() — AsyncStorage key: "ai_consent_accepted"
├── hooks/useScanConsentGate.tsx   ✅ portão de consentimento das TELAS DE CÂMERA (recusar → router.back())
├── hooks/useFaceScan.tsx          ✅ startFaceScan() — setScanSource('app') + desvia: scan-prep-app (1ª vez) ou camera-multi (se scanTutorialSeen)
├── assets/fonts/
│   ├── PlayfairDisplay-Regular.ttf   ✅ fonte principal
│   ├── PlayfairDisplay-Italic.ttf    ✅ títulos/destaques
│   ├── DMSerifDisplay-Regular.ttf    ✅ Cerimônia (ritual) da Rotina — re-portada da produção (seção 6)
│   ├── DMSerifDisplay-Italic.ttf     ✅ Cerimônia + cerimSkiaFont (numeral do orb) em protocolo.tsx
│   ├── CormorantGaramond-Regular.ttf ⚠️ não carregada via useFonts em nenhuma tela
│   ├── CormorantGaramond-Italic.ttf  ⚠️ carregada em plan-preview.tsx mas nenhum style usa fontFamily 'CormorantGaramond-Italic'
│   └── DMSans-MediumItalic.ttf       ⚠️ carregada em plan-preview.tsx mas nenhum style usa fontFamily 'DMSans-MediumItalic'
├── assets/trust-hands.png         ⚠️ não usado (trust.tsx foi deletado)
├── assets/welcome-video.mp4       ⚠️ não usado — nenhum arquivo referencia
├── lib/revenuecat.ts              ✅ initRevenueCat, getPackages, purchasePackage, restorePurchases, isSubscribed
├── lib/storeReview.ts             ⚠️ requestAppReview() via expo-store-review (id6760590018) — SEM USO ATIVO: único chamador (rate-us.tsx) foi removido do fluxo. Reusar dentro do app quando for reintroduzir avaliação
└── hooks/useSubscription.ts       ✅ useSubscription() — checa entitlement `premium` em tempo real
```

---

## VARIÁVEIS DE AMBIENTE (`.env`)

```env
EXPO_PUBLIC_SUPABASE_URL=https://utpljvwmeyeqwrfulbfr.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
EXPO_PUBLIC_MIXPANEL_TOKEN=<configurado>

# Ainda com placeholder:
EXPO_PUBLIC_REVENUECAT_IOS_KEY=
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=
```

---

## DEPENDÊNCIAS INSTALADAS

```
@supabase/supabase-js
@react-native-async-storage/async-storage
@react-native-google-signin/google-signin
zustand
expo-image-manipulator
expo-camera
expo-image-picker
expo-notifications
expo-audio          ← som de "check" da cerimônia em protocolo.tsx (useAudioPlayer + setAudioModeAsync playsInSilentMode). Ver seção 6
expo-store-review   ← popup nativo de avaliação — funciona apenas em TestFlight/produção; em dev cai no fallback da App Store
expo-image          ← ⚠️ INSTALADO MAS AINDA NÃO USADO. O app inteiro usa o <Image> padrão do react-native (que NÃO renderiza AVIF no iOS). Foi instalado para exibir as fotos de produto do Supabase (que virão em .avif/.webp) na tela de recomendação. É dependência nativa + config plugin → exige rebuild. Migrar a tela para `import { Image } from 'expo-image'` quando ligar os produtos reais
react-native-svg
expo-linear-gradient
lucide-react-native
react-native-reanimated
react-native-view-shot  ← **4.0.3** (NÃO a 5.x — o `expo install` fixa a compatível com o SDK 55). ✅ **Suporta New Architecture**: é TurboModule de verdade (`TurboModuleRegistry.getEnforcing`, `codegenConfig type: "modules"`, fontes iOS `.mm`), e o codegen do `pod install` gera `rnviewshotJSI.h` + `rnviewshot-generated.mm`. Não foi preciso o plano B com Skia (`makeImageSnapshot`)
expo-sharing            ← share sheet nativo do iOS (config plugin auto-adicionado pelo `expo install`)
expo-media-library      ← salvar a colagem na galeria. ⚠️ Já estava no package.json HÁ TEMPO, mas sem config plugin e sem nenhum import — só foi ligado de fato na feature de compartilhamento
```

---

## DESIGN SYSTEM — HOME SCREEN (Sessão 22)

### Tela Home (`app/(app)/home.tsx`)
**Réplica pixel-perfect do design Figma "Novo design app NIKS"** (file `0OySQA5EgG5RSj4QuMOXpJ`, frame `home` node `1:8`). Substituiu **por completo** o design anterior "Horizonte Reformulado" — **nada dele existe mais**: orb, céu noturno animado, ritual card, carrossel de scans, refeições, FAB, contexto temporal AM/PM/noite e o debug de 5 toques no "NIKS" foram todos removidos.

**✅ Ligada aos dados reais do último scan** (via `useFocusEffect` + `supabase.auth.getUser()` → `skin_scans` `select('foto_url, full_result').order('created_at', desc).limit(1).maybeSingle()`; refaz ao focar). Da linha mais recente: **Niks score** = `full_result.skin_score` (é o skin_score, **não** média das métricas); **6 métricas** = `full_result.metricas` (`qualidade_pele/atratividade/juventude/oleosidade/acne/linhas_expressao`, 0–100, `null` se a IA não avaliou — ⚠️ **ignorar a coluna `metricas` do topo do `skin_scans`**, que é legado `{acne,skin_age}`); **foto** = `users.foto_home_url ?? skin_scans.foto_url` (signed URLs de 1 ano, uso direto) — ⚠️ a foto que a usuária escolheu na galeria tem **precedência absoluta**; ver "Feature: Foto da home escolhida pela galeria". Tipado local (`FullResult`) — **não** mexeu no `ScanResult` do store. As 6 métricas aparecem **só na home** (não em `results.tsx`/`skin-result.tsx`, que leem do store). ⚠️ A home **não lê mais a tabela `protocolos`** — o card de skincare virou "Dica do dia" (item 6). A seção **"Para você" (item 7) também usa dados reais**: no mesmo `useFocusEffect`, busca `recomendacoes_produtos` da usuária, pega os **2 primeiros produtos** (o principal de cada passo, na ordem do JSON) e resolve `imagem_url` contra `produtos` num único select (`ExpoImage`). Toque num card → grava `productDetailTarget` no store e navega para `/recomendacao-produtos`, que **abre direto o detalhe daquele produto**. Sem recomendação salva ainda → a seção some (em vez de mostrar produtos falsos).

> **Estado vazio:** sem scan → Niks score e métricas mostram `—`, barras vazias, foto = placeholder (fundo `#F3F3F4` + ícone `ScanFace` coral); métrica `null` individual → aquele card mostra `—`. Nunca inventa número. O botão "Escanear" é o CTA.

> **🕰️ Estado LEGADO (usuária de versão anterior às 6 métricas):** quem escaneou **antes** do deploy das métricas tem `full_result.skin_score` mas **não tem** `full_result.metricas`. Nada quebra (todo consumo já é `metricas?.[k] ?? null`), mas o card viraria **6 travessões sem explicação** — o elemento central do design novo. **A própria ausência do campo é a flag** — não há coluna, migration nem backfill: `const legacyScan = skinScore != null && metricas == null` (distingue de quem **nunca** escaneou, `skinScore == null`, que já tem o placeholder da foto). Nesse estado o card mantém **exatamente a mesma altura e o mesmo overlap** (zero mudança de layout): as 6 métricas renderizam num wrapper `StyleSheet.absoluteFill` com **`opacity: 0.22`** (viram fantasma — mostram a FORMA do que ela desbloqueia) e um scrim `rgba(255,255,255,0.72)` sobreposto carrega o aviso: **"Aprimoramos a análise de pele. Faça um novo scan para desbloquear suas 6 novas métricas e ter uma análise mais precisa."** **Sem CTA próprio de propósito** — o botão "Escanear" já é fixo no rodapé; um segundo botão dentro do card seria redundante. O overlay é `pointerEvents="none"`. Assim que a usuária refaz o scan, `analyze-skin` grava `metricas` no novo `full_result` e o card se preenche sozinho — o aviso some sem nenhum código de migração. ⚠️ **Backfill rodando `analyze-skin` na foto salva foi descartado**: custa uma chamada de visão por usuária e a foto pode ter meses — "atratividade"/"oleosidade" de uma foto velha seriam simplesmente erradas. O rescan é melhor produto.

> **🎨 Lógica de cor por faixa de score (réplica das 4 variações do Figma):** a área do topo muda de cor conforme o `skin_score`, resolvido por `getScoreTheme(score)` → objeto `ScoreTheme`. Faixas (inclusivas no limite superior): **0–25 vermelho**, **26–50 laranja**, **51–75 amarelo**, **76–100 rosa** (sem scan → `null` → **rosa**, cor da marca). **5 elementos** trocam de cor por tema (todo o resto — card de métricas, card "Dica do dia", "Para você", botão Escanear, **e a navbar inteira, incluindo a logo central** — é **constante**): (1) **sparkle do topo** — asset `score-logo-{red/orange/yellow/pink}.png` (frames Figma home 25/50/75/100), **fundo transparente** (o `download_assets` vinha com fundo `#F9F9F9` opaco → removido por un-composite deixando só as 4 bolas + glow; a "estrela" central é o fundo entre as bolas, também transparente); (2) **número do score** — `#FD3A42` / `#FF9D47` / `#FEC343` / `#FF5EA8`; (3) **traço ondulado** — asset `score-underline-{cor}.png` (a cor bate com o número); (4) **gradiente de fundo** — branco no topo → `heroSoft`/`heroMed` do tema perto do card (ex.: rosa `#FFEFF6`/`#FFDEED`); (5) **anel da foto** — **`<Image>` do asset REAL do elipse do Figma** (node **1:319** "Ellipse 24"), `assets/home/ring-{red,orange,yellow,pink}.png`, sobreposto à foto. Baixei o asset do node 1:319 (`download_assets`), tirei o fundo `#F9F9F9` deixando o **centro transparente** (un-composite: `alpha = (bg−px)/(bg−ring)` no canal de maior separação, mantendo o RGB **exato** — redimensionar só o alpha, nunca o RGB, senão o LANCZOS altera a cor). Cores exatas do traço: red `#FBD4D4`, orange `#FBD4B1`, yellow `#FBE7BC`, pink `#FBBBD8` (traço uniforme, sem gradiente). Render: `width/height = RING_IMG = PHOTO·265.005/228` (o asset cobre o frame de 265; o círculo do anel dentro dele = 228 → vira PHOTO), centrado sobre a foto (traço centrado na borda, extravasando um pouco pra fora como no Figma; a base é coberta pelo card de métricas). ⚠️ **NÃO é borda sólida nem gradiente** — é o próprio elipse do Figma. Erro anterior: tentei gradiente (diagonal/vertical) achando que o anel escurecia embaixo, mas o "branco na base" era só o **card cobrindo os ~40px de baixo do anel** (card y=420, anel até y=460). **O sparkle do topo é 49px** (`LOGO = width·49/393`, Figma node 1:385) — não 28px. O resolvedor de tema vive em **`lib/scoreTheme.ts`**, hoje compartilhado entre a **home** e o **`product-result`** (que colore pela faixa da `compatibilidade`).

> ⚠️ **A navbar NÃO segue mais o score.** Existiu um 6º elemento — a **logo central da navbar**, que usava `getScoreTheme(skinScore).logo`. Isso foi **removido** a pedido do usuário: a navbar agora exibe **sempre a logo rosa padrão da marca** (`niks-logo.png` + `tintColor #FF9D9D`), fixa em qualquer score e em ambos os modos. O `(app)/_layout.tsx` não importa mais `getScoreTheme` nem lê `skinScore`. Ver "Tab Bar / Navbar". O campo `skinScore` do store continua sendo gravado pela home, mas **nenhum consumidor o usa hoje** — pode ser removido se nada novo depender dele.

**Estrutura** (`SafeAreaView` + `ScrollView`, `StyleSheet` inline — não NativeWind — para precisão de pixel), de cima para baixo:
1. `LinearGradient` branco→tom do tema atrás do score+foto (sutil; cor por faixa de score — ver "Lógica de cor" acima; stops `heroSoft`/`heroMed` em `locations [0, 0.5, 0.72, 0.82, 1]`)
2. **Niks score** — `skin_score` real (Nunito ExtraBold 72px, **cor = `theme.score` por faixa**) + "Niks score" (Nunito ExtraBold 30.5px, sempre `#121212`) + traço ondulado **colorido por tema** (asset `score-underline-{cor}.png`). ⚠️ Antes o número era `#121212` fixo — agora é colorido pelo tema.
3. **Foto circular** — **tocável**: abre a galeria e leva pra tela de ajuste (ver "Feature: Foto da home escolhida pela galeria"). Mostra a foto escolhida pela usuária (`users.foto_home_url`) e, **só enquanto ela não escolher nenhuma**, a foto do último scan (`foto_url`) — no círculo interno (`photoCircle`, `PHOTO`, `overflow:'hidden'`), com o **anel por tema como `<Image>` sobreposta** = o asset REAL do elipse do Figma (`assets/home/ring-{cor}.png`, node 1:319, centro transparente), renderizado em `RING_IMG = PHOTO·265.005/228` e centrado (traço centrado na borda da foto). ⚠️ Não é borda nem gradiente — é o próprio elipse do Figma. Ver "Lógica de cor → (5)". **Diâmetro da foto = 58% da largura** (`228/393` do Figma node 1:51); deslocada `+2.5px` do centro. `profile-photo.png` **não é mais usado**.
4. **Card de métricas** — branco, radius 16, **sobrepõe os 40px de baixo da foto** (`marginTop: -CARD_OVERLAP` + `zIndex`; a foto passa atrás do card). **Réplica pixel-perfect do node `1:63`**: as 6 métricas (`METRIC_DEFS`) são **posicionadas de forma ABSOLUTA** (não `flex`) nas coordenadas exatas do Figma, escaladas por `MS = (width−24)/374` — 3 colunas em `x = 21 / 149 / 277` × 2 linhas (`tops` label/valor/barra = `17/34.24/71.85` e `101/118.24/155.85`; label de 2 linhas "Linhas de\nexpressão" sobe para `top 91`). Cada métrica: label (Lato 12.536px), **valor real** (Exo 2 Bold 28.206px; `—` se `null`), barra (trilho `#F3F3F4` w76×h4.7 + preenchimento com **largura = `valor/100 × 76`** e **cor por semáforo `metricColor(v, positive)`**). **Cor = "bom/ruim pra pessoa", não valor cru** — **4 faixas**, em `metricColor(v, positive)`. Positivas (qualidade/atratividade/juventude): `0–40` vermelho `#FF0000`, `41–59` laranja `#FF8A00`, `60–74` amarelo `#FFCC00`, `75–100` verde `#5EFF7E`. Negativas (oleosidade/acne/linhas_expressao — quanto menor, melhor): `70–100` vermelho, `50–69` laranja, `20–49` amarelo, `0–19` verde. ⚠️ **AS DUAS RÉGUAS NÃO SÃO ESPELHO** — não reintroduzir o `good = positive ? v : 100−v` com uma régua só (era assim antes, e estava **errado**: cortava verde em `good≥67`, então Qualidade 68 e Acne 32 saíam **verdes** quando deveriam ser amarelas). A régua negativa é **mais exigente** para o verde (só abaixo de 20; no positivo o verde começa em 75). Contraexemplo: **Acne 60** → invertido daria `good=40` → vermelho na régua positiva, mas o correto é **laranja**. ⚠️ **`metricColor` NÃO vive mais aqui** — foi extraída para **`lib/metricColor.ts`** (fonte única), porque o adesivo do Story precisa pintar a mesma métrica com a mesma cor. Não reimplementar a regra em tela nenhuma. ⚠️ O label no Figma é **Lato SemiBold**, mas o pacote só tem Regular/Bold — ver Sistema de Fontes.
5. **Compartilhar = TOCAR NO CARD DE MÉTRICAS** → `/(share)/share-capture`. ⚠️ **O link "Compartilhar" que ficava embaixo do card NÃO EXISTE MAIS** (texto Nunito Bold 14 + ícone `Share` do lucide) — foi **removido a pedido do usuário**, e o próprio card virou o gatilho. Não reintroduzir o link. **Só dispara se houver scan** (`disabled={skinScore == null}`) — mesma condição que o link antigo tinha para renderizar.
   - **Como está montado:** um `TouchableOpacity` envolve o card **POR FORA** e carrega **só a posição** (`metricsCardTouch`: `marginHorizontal: 12` + `zIndex: 2`, e o `marginTop: -CARD_OVERLAP` inline); o `metricsCard` de dentro ficou só com o visual (fundo, borda, radius, `overflow: 'hidden'`). ⚠️ **Envolver por fora é obrigatório**, não estilo: o card tem `overflow: 'hidden'`, que já causou problema de toque no New Architecture neste projeto (mesmo motivo do `TouchableOpacity` da foto). O wrapper não introduz filho em fluxo normal, então **a grade absoluta do node 1:63 não se move**.
   - ⚠️ **Nunca colocar dentro do card de métricas um filho em FLUXO NORMAL**: ele é réplica pixel-perfect do node 1:63, com altura fixa (`187 × MS`) e as 6 métricas em posição **absoluta** a partir de `top: 0`; a grade ocupa de 17 a 160 dos 187, então um filho em fluxo desloca tudo e não sobra espaço vertical. **Um filho ABSOLUTO é seguro** — basta ancorá-lo em `bottom: 0` e somar a faixa dele à altura do card. É assim que o aviso do estado legado é renderizado (ver "Estado LEGADO" acima): `StyleSheet.absoluteFill`, sem tocar na altura nem nas coordenadas.
   - **Discoverability:** hoje **não há nenhuma affordance visual** de que o card é tocável (era o link que anunciava a ação). Se virar problema, o caminho seguro é um ícone `Share` **absoluto** no canto do card — nunca um filho em fluxo.
6. **Card "Dica do dia" (expansível)** — ⚠️ **substituiu o card de skincare** ("Skincare matinal/noturno" com os passos da rotina real e o progresso da cerimônia), que **saiu da home por completo** por ser redundante com a aba Rotina. A rotina, o progresso e a cerimônia continuam **intactos** em `protocolo.tsx`. O card reaproveita a **mesma casca visual** (branco, borda `#E3E3E6`, sombra suave, chip de ícone, chevron, expansão por `LayoutAnimation`) — só o ícone mudou (`Flower2` → `Lightbulb`) e o conteúdo. Depois foi **engordado** para ficar harmônico com o card de métricas logo acima (o antigo era franzino): padding interno `6/7` → **12**, chip `62` → **68**, radius `16` → **18**, título `16` → **17px**. ⚠️ A `marginHorizontal: 12` é a **mesma do card de métricas** — as duas caixas têm a mesma largura de propósito; mexer nela quebra o alinhamento da coluna da home. **Colapsado:** "Dica do Dia" + `titulo` (máx. 2 linhas — é o gancho). ⚠️ O "Dica do Dia" **não é um eyebrow** (etiqueta pequena em caixa alta com letter-spacing): é **a mesma tipografia do título** (Nunito ExtraBold 16, letter-spacing −0.5), só que em **rosa `#FF9D9D`** — faz parte do texto, numa linha acima do título. ⚠️ A frase é **escrita no card**, não lida do catálogo: lá o `eyebrow` é `'DICA DO DIA'` (caixa alta, uniforme nas 26) e a caixa correta na UI é "Dica do Dia" — que nenhum `textTransform` produz (`capitalize` maiusculiza o "do"). O campo `eyebrow` do catálogo hoje não é renderizado. **Expandido:** três seções tituladas — **INGREDIENTES** + **PREPARO** (numerado; só nas receitas) e **POR QUE FAZER** (o `corpo`; em todas as dicas). Ver "Feature: Dica do dia".
7. **"Para você"** (Nunito Bold 20px) + **2 cards dos primeiros produtos recomendados** (imagem real via `expo-image`, `TouchableOpacity` → deep-link pro detalhe; ver dados reais acima). Renderiza só quando há recomendação salva.
8. **Botão "Escanear"** — pílula **`#FF9D9D`** (rosa da Rotina, chapado + glow rosa; era o gradiente vermelho `#FF6661→#C02225`) + ícone `ScanFace` + texto branco. `onPress` → `startFaceScan()` do `useFaceScan` → vai **direto** para `scan-prep-app` (**único acesso ao scan de rosto** no app; não passa mais pelo `ScanModal`, que saiu do fluxo). **Fixo (`position: 'absolute'`), fora do `ScrollView`**, ancorado em `bottom: 108` (= 80px da navbar do `_layout.tsx` + respiro; era 92, afastado a pedido do usuário) → fica **sempre visível logo acima do menu inferior**, não rola com o conteúdo. Botão: `height 48`, `width 134`. Container com `pointerEvents="box-none"` (só o botão captura toque). O `paddingBottom` do `contentContainerStyle` é `186` para que o último item ("Para você") role totalmente sem ficar escondido atrás do botão + navbar.

**Assets** (todos em `assets/home/`, capturados/compostos direto do Figma): `niks-logo.png`, `score-underline.png`, `product-1.png`, `product-2.png`, e os ícones da navbar `nav-*.png`. (`profile-photo.png` continua no repo mas **não é mais usado** — a foto agora vem do scan real.) **Fontes:** `useFonts` com Nunito/Exo2/Lato dos pacotes `@expo-google-fonts` (ver Sistema de Fontes).

**Pendências (próximos passos desta tela):**
- ~~**Ligar aos dados reais**~~ — ✅ **FEITO** (score, 6 métricas, foto e "Para você" vêm do Supabase; ver "Ligada aos dados reais" acima). O bullet ficou aqui por engano contradizendo a própria seção.
- **Replicar a última tela do Figma** (`rotina`) com o mesmo rigor pixel-perfect. (`recomendacao-produtos` e `chat-niks` já implementadas.)

### Feature: Foto da home escolhida pela galeria

A usuária toca na **própria foto circular da home** → abre a galeria → enquadra a foto no círculo da home → ela vira a foto de perfil dela, **para sempre**.

**⚠️ A REGRA CENTRAL — precedência absoluta.** A partir do momento em que ela escolhe uma foto da galeria, **novos scans de pele NUNCA MAIS trocam a foto da home**. O scan continua atualizando o Niks score e as 6 métricas normalmente; só a foto fica congelada na escolha dela. A única forma de trocar é tocar na foto de novo e escolher outra da galeria. **Não existe caminho de volta pra foto do scan** — foi decisão explícita do usuário, não um esquecimento. Não "consertar" isso adicionando um botão de resetar.

A regra vive numa linha só, no `useFocusEffect` da home:
```ts
setFotoUrl(userRow?.foto_home_url ?? data?.foto_url ?? null);
```
Como `foto_url` é lido **só na home** (`app/(app)/home.tsx`), a feature não vaza pra nenhuma outra tela — `results`, `skin-result` e o histórico seguem mostrando a foto do scan, que é o correto (lá a foto é evidência da análise).

**Persistência:** coluna `users.foto_home_url` (ver "Colunas extras na tabela `users`"). Migration `supabase/migrations/20260718120000_add_foto_home_url_users.sql`. Vai pro banco — e não pro AsyncStorage — de propósito: a escolha precisa sobreviver a **reinstalar o app e trocar de celular**, coisa que nenhum cache local faz. (O store hoje **tem** `persist`, mas só para `skinScore`/`protocolResult` — ver "CACHE DE DADOS"; a foto continua sendo dado de servidor.)

**Tela de ajuste — `app/(foto)/ajustar-foto.tsx`** (grupo próprio com `_layout.tsx` de Stack sem header).
- ⚠️ **Grupo `(foto)` e não `(app)`**: o `(app)/_layout.tsx` renderiza a `GlobalBottomBar` absoluta em todas as suas telas, e a navbar cobriria a tela de ajuste.
- É um **mini-espelho da home**, não um cropper genérico: mesmo `LinearGradient` do tema, mesmo bloco de Niks score (sparkle + número + label + traço) e o círculo no **diâmetro exato da home** (`D = width·0.58`) com o mesmo anel (`RING_IMG = D·265.005/228`). O ponto da tela é ela ver o **formato real** — por isso `allowsEditing: false` no picker: o "Move and scale" nativo do iOS recorta **quadrado** e não mostra o círculo.
- **Gestos**: `Gesture.Pan()` + `Gesture.Pinch()` via `Gesture.Simultaneous`, padrão copiado de `app/(share)/share-preview.tsx`. `MIN_SCALE = 1` porque a escala **base** (`Math.max(D/iw, D/ih)`) já faz a imagem **cobrir** o círculo — nunca aparece buraco. `clampPose` (worklet) prende o pan em `±(exibido·escala − D)/2`, garantindo que o recorte não saia da imagem.
- **Recorte**: RN compõe `transform: [translateX, translateY, scale]` como `M = translate · scale`, então a translação está em **pontos de tela não escalados**. Daí `eff = base·scale`, `size = D/eff`, `originX = iw/2 − (D/2 + tx)/eff` (idem Y). ⚠️ **Não reordenar o array de transform** sem refazer essa conta.
- A saída é um JPEG **quadrado** de 1080px — cai direto no `photoCircle` da home com o `resizeMode="cover"` que já existia. **A home não sabe que essa tela existe.**
- **Upload:** reusa `uploadScanPhoto` de `store/onboarding.ts` (agora **exportado**, com 3º parâmetro `prefix`, default `''`). Mesmo bucket privado `scans`, path `${userId}/home_${Date.now()}.jpg`, signed URL de 1 ano. ⚠️ Esse helper já foi copiado inline em 3 lugares (`loading.tsx`, `loading-dentro-app.tsx`, `food-report.tsx`) — **não fazer a 4ª cópia**; importar.
- Erro no upload → `Alert` em PT e a tela **permanece aberta** (nada foi gravado), pra ela tentar de novo. Voltar sem confirmar não muda nada.
- A foto crua viaja pelo store (`homePhotoDraft`), **nunca por router params** (regra do projeto: o bridge do RN trunca). É só um hand-off; a verdade é a coluna no banco.
- Voltar da tela **não precisa de callback**: o `useFocusEffect` da home refaz a busca ao ganhar foco.

**Alvo de toque na home:** o `TouchableOpacity` envolve o View dimensionado **por fora** — o `photoCircle` tem `overflow: 'hidden'`, que já causou problema de toque no New Architecture neste projeto. ⚠️ O **card de métricas cobre os 40px de baixo da foto** (`marginTop: -CARD_OVERLAP`, `zIndex` maior — é assim no Figma), então essa faixa não recebe toque. Sobram ~188 dos 228px, o que basta. **Não "consertar" mexendo no zIndex** — a foto passaria por cima do card e quebraria o design.

**Pendência conhecida (não é regressão):** a signed URL vale 1 ano e a home **não tem repair de URL expirada** (não há `onError` na `<Image>`; o texto da seção 7 que diz que a home faz repair está **desatualizado** — esse código não existe). Isso já valia pra foto de scan. Como a foto da galeria é feita pra durar, o risco é maior aqui. Correção barata se virar problema: guardar também o **path** (`users.foto_home_path`) e re-assinar no `onError`.

### Feature: Dica do dia (card da home)

Uma dica por dia, numa **fila numerada** igual para todas as usuárias. Substituiu o card de skincare na home (item 6 da estrutura).

**Catálogo — `lib/dicas/catalogo.ts`** (26 dicas). Exporta `CATALOGO_DICAS: Dica[]` e o tipo `Dica` (`ordem`, `eyebrow`, `titulo`, `corpo`, `fonte`, e — só nas receitas — `ingredientes?: string[]`, `preparo?: string[]`). O **`eyebrow` é sempre `'DICA DO DIA'`** nas 26 (não existem mais categorias como "RECEITA"/"SHOT NIKS"/"SONO"), e o **`preparo` é uma lista de passos**, não prosa. Três regras **invioláveis**:
1. **O campo `fonte` NUNCA é renderizado** — é auditoria interna (as referências científicas de cada dica).
2. **A ordem do array É a fila, e foi curada à mão** (receitas intercaladas de propósito, temas parecidos afastados). **Não reordenar, agrupar, filtrar nem personalizar por perfil.** Consumir na ordem em que está.
3. **Dicas novas entram no fim.** O código **não indexa pelo campo `ordem`** — usa a posição no array.

**Mecânica — `lib/dicas/dicaDoDia.ts`** (AsyncStorage). Duas chaves: `dica_do_dia:index` (contador) e `dica_do_dia:last_day` (data da última virada). Ao focar a home, `getDicaDoDia()` compara o **dia civil de hoje** com a data gravada; se mudou, incrementa o índice e grava hoje. Segue o padrão de chave-por-dia do `lib/routineProgress.ts`, mas **sem o deslocamento de −4h de lá** (aquele existe para a sessão de skincare da noite cruzar a meia-noite; aqui o dia vira à meia-noite normal).
- ⚠️ **O contador é de DIAS DE USO, não de dias de calendário** — ele só anda quando a usuária abre o app num dia novo. Quem sumir uma semana volta na dica 3, não na 10: ninguém pula conteúdo por ter ficado inativa.
- ⚠️ **O índice guardado SÓ CRESCE** (0, 1, 2, …). A volta ao início do catálogo (módulo) é aplicada **só na exibição**, em `dicaAt(index)` — assim, ao adicionar a dica 27, quem já terminou a fila continua andando em vez de ficar preso no fim antigo. **Não normalizar o índice antes de gravar.**
- **Nunca card vazio:** o `useState` inicial já é `CATALOGO_DICAS[0]`, e qualquer falha de leitura cai na dica 1 (o `getDicaDoDia` não lança).

**Card** (em `home.tsx`): reaproveita a casca do antigo card de skincare — colapsado por padrão, expande no toque com o mesmo `LayoutAnimation` e o mesmo chevron. Ver o item 6 da estrutura da home.

**Anatomia fixa do card expandido** (a usuária sempre sabe onde procurar cada coisa): **INGREDIENTES** (bullets rosa) + **PREPARO** (lista **numerada** — 1, 2, 3 — porque receita se segue com a mão na massa e a pessoa precisa reencontrar onde parou) + **POR QUE FAZER** (o `corpo`). As duas primeiras só existem nas receitas; **"Por que fazer" aparece em TODAS as dicas** e sempre com o título — numa dica sem receita, o expandido é só essa seção.

### Tela Recomendação de Produtos (`app/(app)/recomendacao-produtos.tsx`)
**REFORMULADA para a identidade do "Novo design" do app** (cards brancos com a borda-assinatura `#E3E3E6` + sombra suave, fundo branco, Nunito — mesma linguagem de `home`/`protocolo`/`niks-chat`). **Deixou de ser a réplica estática do Figma node 1:273** (grid de cards + chips de filtro + botão "Escanear produto" flutuante — tudo isso foi removido). O layout agora é uma **lista de recomendação de produtos por passo da rotina**. Aberta pelo **ícone de produto (frasco)** da navbar (era a lupa — ver "Tab Bar / Navbar"). `S = width/393`; **não renderiza a navbar** (global no `_layout.tsx`).

**Estrutura** (fundo branco `#FFFFFF`, sem gradiente/bloom):
1. **Título da tela** — logo `niks-logo.png` **tintada `#FF9D9D`** + "Produtos" (Nunito **Medium** 24px, `#121212`, letter-spacing −0.24) centralizado + hairline inferior `rgba(18,18,18,0.06)`. É a **réplica exata do título** de um Figma de referência do usuário (`WMSYwjXzceT24CU8rvM1L4`, node `92:19`).
2. **Hero** — título "Os produtos certos pra você" (Nunito ExtraBold ~30) + subtítulo explicando que a seleção vem da rotina montada, produto por passo.
3. **Seções "Pela manhã" / "À noite"** — ícone sol (`#FF9D9D`) / lua + Nunito ExtraBold 20 (sem régua decorativa).
4. **Cards de produto** (card branco padrão do app: borda `#E3E3E6`, radius 20, sombra suave, `marginHorizontal 16`): rótulo do passo ("01 · Limpeza") + **foto em fundo neutro `#F4F4F4`** (não mais tints coloridos) + marca/nome/descrição + **alternativas** (linhas sunken `#F4F4F4`, **tocáveis** → abrem o detalhe da própria alternativa). Toque no card → **Modal de detalhe** (foto grande em fundo neutro, tags rosa `rgba(255,157,157,.16)`/`#FF9D9D`, descrição longa, **botão "Salvar na minha rotina" `#FF9D9D`** — a cor da Rotina).
5. **Estado vazio (`sem_produto`)** — card branco com ícone de erva + "Ainda sem um produto ideal" (para quando a Edge Function omite um passo por falta de produto elegível).

⚠️ **Bug de layout resolvido no caminho (Fabric):** `<Pressable style={({pressed})=>({...paddingHorizontal...})}>` (style em **função**) **não aplica o padding aos filhos** no New Architecture → os cards esticavam full-width, desalinhados. Trocado por **`TouchableOpacity` com style estático**. (Regra geral do app.)

**Dados:** consome **dados reais** — a aba "Recomendados" carrega `recomendacoes_produtos` da usuária logada (`supabase.from(...).select().eq('user_id', ...)`, **não** `functions.invoke`) e resolve `marca/nome/imagem_url/concerns` de **todos os `produto_id` num único `.in('id', ids)`** contra `produtos` (a tela só EXIBE; ordem e conteúdo vêm do JSON — `periodo` am/pm → seções Manhã/Noite, `am+pm` nas duas; principal em destaque, resto em Alternativas; `sem_produto` → card vazio). Estados loading/**generating**/empty/error/ready.

> **🕰️ Geração SOB DEMANDA (`generateOnDemand`) — usuária legada.** `recomendar-produtos` só é disparada por [lib/generateProtocol.ts](lib/generateProtocol.ts), que por sua vez **só é chamada de `signup.tsx`**. Logo, **quem se cadastrou antes da feature existir nunca teria recomendação** — e um rescan **não** resolve, porque o scan pelo app (`scanSource === 'app'`) passa por **`loading-dentro-app.tsx`** (⚠️ **não** `loading.tsx`, que é a do onboarding — ver decisão 13), que insere em `skin_scans` mas **não** regenera protocolo nem recomendação (isso é **intencional** — ver abaixo). Ficariam presas para sempre com a tela vazia e sem "Para você" na home. **Correção:** quando a tela carrega e a recomendação está vazia, ela **gera na hora**, uma única vez por montagem (ref `triedGenerate`), e recarrega. **Só dispara se a usuária CHEGAR nesta tela** — nunca em background, para não gastar IA com quem não abrir. Chamar é seguro sempre: a Edge Function é **auto-guardada** (`UNIQUE` em `user_id`) — se a linha já existir, devolve a existente sem regenerar. Três desfechos: **`sem-protocolo`** (nunca escaneou — nada de onde gerar, já que a função deriva as categorias dos passos da rotina salva) → `empty` com "faça seu primeiro scan"; **`ok`** → refetch → `ready`; **`falhou`** (rede/função caiu) → `error` com "Tentar de novo" (que **rearma** a trava). ⚠️ Falha de rede **nunca** cai em `empty`: dizer "faça seu primeiro scan" para quem já escaneou seria mentira. Durante a chamada, estado `generating` ("Montando sua recomendação" + spinner) — é uma chamada de IA, leva alguns segundos.

> ⚠️ **Um novo scan NÃO regenera a rotina — isso é intencional, não um bug.** Decisão do usuário: a pessoa precisa **testar a rotina por pelo menos ~30 dias** para medir eficácia. Se cada scan reescrevesse o protocolo, a IA ficaria trocando ativos a cada foto e a usuária nunca saberia o que funcionou. Portanto `loading-dentro-app.tsx` grava o novo `skin_scans` (score + as 6 métricas novas) e **deixa `protocolos` e `recomendacoes_produtos` congelados**. Não "conserte" isso. Fotos via **`expo-image`** (WebP/AVIF). **Chips (tags)** derivadas de `produtos.concerns` traduzidas por **`lib/concernLabels.ts`** (`CONCERN_CODE_TO_LABEL` — fonte única no app, inverso do `CONCERN_LABEL_TO_CODE` da Edge Function `recomendar-produtos` + os códigos derivados do scan; manter em sincronia). **Deep-link:** se o store tem `productDetailTarget` (vindo do "Para você" da home), abre o modal de detalhe do produto correspondente ao ficar pronto e limpa o alvo.

**Duas abas (topo, estilo manhã/noite do protocolo):** **"Recomendados"** (a lista por passo acima) e **"Escaneados"** (histórico de `product_scans` da usuária, recarregado a cada vez que a aba abre — ⚠️ **esta aba continua sem cache de propósito**: as URLs das fotos são assinadas e expiram em 1h, então precisam ser regeradas; ver "CACHE DE DADOS → o que NÃO cachear"). Cada card escaneado = **foto real** que ela tirou (URL assinada do bucket privado `product-scans`, `cover`) + data + marca/nome + **chip de veredito** (verde/âmbar/vermelho) + resumo; toque → modal de detalhe com a análise completa (mesmo layout do `product-result`). Ver "Feature: Escanear Produto" abaixo.

**Assets:** `assets/recomendacao/prod-{tube,neutrogena,pump,serum}.png` + `product-1/2.png`. Header reusa `assets/home/niks-logo.png` (tintada `#FF9D9D`).

**Roteamento:** glyph `rotina` (frasco de produto) → `/recomendacao-produtos`; registrada como `<Tabs.Screen name="recomendacao-produtos" />`. (⚠️ Era a lupa/`busca`, que saiu da navbar.)

### Feature: Escanear Produto (câmera → análise IA → resultado)

Fluxo completo de escanear um produto de skincare, tirar/escolher foto, receber o veredito da NIKS e guardar no histórico. Backend: Edge Function `analisar-produto` + tabela `product_scans` + bucket `product-scans` (ver seção SUPABASE).

**Entrada:** botão **"Escanear produto"** (fixo acima da navbar em `recomendacao-produtos`, mesmo tamanho/cor do "Escanear" da home) → `router.push('/(scan)/product-camera')`.

**Telas (todas em `app/(scan)/`, auto-registradas pelo `Stack` do `_layout`):**
- **`product-camera.tsx`** — réplica da câmera de comida (`food-camera.tsx`) adaptada p/ produto (rótulo "Escanear produto", ícone de scan+frasco, instrução "Posicione o produto no centro"). Captura/galeria → redimensiona p/ base64 → `setProductImage` → `router.push('/(scan)/product-loading')`.
- **`product-loading.tsx`** — **tela de carregamento própria da feature** (⚠️ **NÃO é mais a tela de loading padrão do app**: o design antigo — orb Skia + anel + checklist de steps + headlines rotativas com shimmer, herdado de `loading-dentro-app.tsx` — foi **substituído**). Novo design, a partir de uma referência do usuário, adaptado à identidade do app: **círculo grande com a porcentagem no centro** (Nunito ExtraBold 86px, `#1D3A44`, + `%` menor alinhado à base), **anel de progresso** em gradiente rosa `#FFC9C9`→`#FF9D9D` sobre trilho claro (`strokeDashoffset` animado — ver decisão 22), **disco branco flutuante** com sombra rosa + anel decorativo hairline + **halo pulsante**, fundo com véu rosa dissolvendo no branco, e uma **legenda rotativa** abaixo do círculo (`PHASES[]`, troca com fade conforme a % avança: "Lendo o rótulo…" → "Montando o veredito…"). Fontes **Nunito** (não Playfair). **A lógica foi preservada integralmente:** chama `analisar-produto` com o **token de sessão** (`getSession`/`refreshSession` só se <5 min p/ expirar — padrão do niks-chat) + header `apikey`; `clientScanId` estável via `useRef` (retry não duplica scan); avanço realista da % (desacelera perto de 99); **aviso de "alta demanda"** com countdown após 99%; **estado de erro** com retry. Sucesso → `setProductScanResult` → `router.replace('/(scan)/product-result')`.
- **`product-result.tsx`** — wrapper fino: lê o resultado/foto do store e renderiza **`components/product/ProductAnalysis.tsx`**, que é a **FONTE ÚNICA do layout da análise** — usado TAMBÉM pelo detalhe da aba "Escaneados" (`recomendacao-produtos.tsx`). ⚠️ **Nunca duplicar o layout nos dois arquivos** — foi exatamente esse o bug: a tela nova entrou só no `product-result` e o modal do histórico ficou renderizando o design antigo. Props: `{ result, photoUri, onClose, onRescan?, rescanLabel? }` (`photoUri` aceita data-URI do fluxo de scan **e** URL assinada do histórico). O layout é a **réplica do Figma "Novo design app NIKS" node `136:126`** (substituiu o layout antigo de foto-em-cima + seções de texto com títulos rosa). Estrutura, de cima pra baixo: **sparkle do tema** (49px) → **`compatibilidade` como número grande** (`75%`, Nunito ExtraBold 72px, cor do tema) → rótulo **"Compatibilidade de pele"** (Nunito ExtraBold 20px, `#121212`) → **foto que a usuária tirou dentro do anel colorido** (círculo da foto 217px / anel 228px, assets `ring-{cor}.png`) → **cards** (374×auto, radius 16, borda `#E3E3E6`, título em **Lato Black 16 na COR DO TEMA** + ícone lucide num chip 32×32 com wash da cor do tema + texto embaixo). Cards: **"O que significa?"** (`Sparkles` — marca/nome + chip de veredito + hairline + `resumo` em negrito + `explicacao`), "O que é" (`FlaskConical` → `o_que_faz`), "Na sua pele" (`ScanFace` → `resultado_esperado_para_voce`), **"Sobre a sua rotina"** (`Flower2` → `decisao_rotina`), "Fique de olho" (`TriangleAlert` → `avisos`), "Ativos detectados" (`Atom` → chips rosa). Os cards **sobem 28px sobre a foto** (mesmo overlap da home). **Desvios conscientes do Figma (pedido do usuário — o design chapado ficou "sem graça"):** título rosa em vez de preto; **ícone em chip** por card; **sombra suave** (o card do Figma é flat); **card da rotina em destaque** (fundo `#FFF7F7` + borda rosa — é a conclusão prática da tela); **avisos em linhas âmbar** (`#FFF8EC`) em vez de texto solto; **entrada animada** (fade + slide-up escalonado, `Animated.stagger` 70ms — os `Animated.Value` vivem na tela, não no card, pra não reiniciar a cada re-render); gap entre cards **16px** (o Figma tem 31 — apertado pra agrupar melhor com a sombra). Trata `status: 'precisa_foto'` e fallback sem resultado. Fechar (X flutuante) → `router.replace('/(app)/recomendacao-produtos')`.
  - **🎨 A tela muda de cor pela faixa da `compatibilidade`** — **mesma lógica e o MESMO resolvedor da home** (`getScoreTheme` de `lib/scoreTheme.ts`): 0–25 vermelho · 26–50 laranja · 51–75 amarelo · 76–100 rosa. Trocam de cor: sparkle (`theme.logo`), número (`theme.score`), anel da foto (`theme.ringImg`), gradiente de fundo (`heroSoft`/`heroMed`, mesmos stops `[0,0.5,0.72,0.82,1]` da home) **e também os TÍTULOS + ÍCONES + chips dos cards e o card de destaque da rotina** — tudo derivado de `theme.score` (o wash/fundo/borda saem de um helper `hexToRgba` local, alphas 0.14/0.05/0.32). A tela inteira fica numa cor só, em harmonia. **Única exceção: o botão "Escanear outro produto"**, que é o CTA da marca e fica **sempre rosa `#FF9D9D`** — mesma regra do botão "Escanear" da home, constante em todos os temas. Confirmado no Figma: o `Rectangle 9` do frame 136:126 tem **exatamente o mesmo gradiente** dos frames da home — por isso o tema é reusado, sem assets novos. **Sem `compatibilidade`** (scans antigos) → número vira `—` e o tema cai no **rosa** (`getScoreTheme(null)`), nunca "NaN%".
  - ✅ **O modal de detalhe da aba "Escaneados"** (em `recomendacao-produtos.tsx`) renderiza o **mesmo `ProductAnalysis`** — abrir um scan do histórico mostra exatamente a mesma tela do resultado (mesmo número, mesmo tema de cor, mesmos cards). A diferença é só a origem dos dados (`product_scans.resultado` + URL assinada da foto) e o `onClose`, que fecha o modal em vez de navegar.

**Store (`store/onboarding.ts`):** `productImageBase64`/`productImageMimeType` (+ `setProductImage`) e `productScanResult` (+ `setProductScanResult`) — imagem e resultado viajam pelo store (nunca por params). Resetados no `reset()`.

**"Salvar na minha rotina" → foto no passo do protocolo:** no detalhe de um produto **recomendado** (aba Recomendados), o botão salva a foto do produto em **`lib/savedProducts.ts`** (AsyncStorage, indexado por `normStepKey(nome do passo)`). Na tela de **Rotina (`protocolo.tsx`)**, cada passo com produto salvo mostra a **foto no lugar do ícone** (quadradinho 46×46, `cover`), recarregando via `useFocusEffect`. A chave casa porque o `passo` da recomendação = o `name` do passo da rotina (= `Step.title`). Persistência **client-side/por-dispositivo** (não sincroniza entre celulares — migrar p/ Supabase se precisar).

✅ **A aba Recomendados já está ligada à tabela `recomendacoes_produtos`** (não é mais mock) — ver "Tela Recomendação de Produtos".

> ✅ **Fotos reais via `expo-image` (resolvido):** as fotos de produto (`produtos.imagem_url`, `.webp` no bucket público `produtos`) são renderizadas com `import { Image as ExpoImage } from 'expo-image'` (`contentFit="contain"`), que suporta WebP/AVIF no iOS — o `<Image>` padrão do react-native **não** renderiza AVIF no iOS. Regra: fotos remotas de produto sempre via `expo-image`. (A logo local do header segue no `Image` do RN por causa do `tintColor`.)

### Feature: Compartilhar Niks score (colagem + adesivo → Story)

> ⚠️ **Estado: implementado, PENDENTE de validação no device.** O build nativo (deps + permissões) foi confirmado no iPhone físico. Mas **três pontos nunca foram vistos rodando** e devem ser conferidos antes de considerar a feature pronta — estão marcados com 🔍 abaixo.

A usuária monta uma colagem de **1 a 4 fotos** (estilo "Layout" do Instagram), escolhe **qual adesivo** vai por cima numa **bandeja estilo figurinhas do Instagram**, e exporta uma imagem **1080×1920** para Stories/WhatsApp/TikTok.

**Entrada:** **tocar no card de métricas da home** (item 5 da estrutura), só com scan feito. ⚠️ O link "Compartilhar" + ícone de share que ficava embaixo do card **foi removido a pedido do usuário** — o card é o único acesso hoje. Não reintroduzir o link.

**Telas (`app/(share)/`, `_layout.tsx` = `Stack headerShown:false`, igual ao `(scan)`):**

- **`share-capture.tsx`** — monta a colagem. Área **9:16 exata**, centrada, com grid 2×2.
  - **UMA única `CameraView`, SEMPRE montada**, reposicionada de forma absoluta sobre o quadrante ativo (ver decisão 26). Frontal, `mirror` (ver decisão 27).
  - Célula ativa começa na 1 e pula para a **próxima vazia** (1→2→3→4) a cada foto. Cheias as 4 → `active={false}` **pausa** a sessão sem desmontar.
  - Ícone de **galeria** por célula vazia (alvo de toque ≥44pt) → `expo-image-picker` preenche AQUELA célula.
  - **Refazer:** um toque numa célula cheia limpa a foto e traz a câmera **de volta pra ela** (sem menu/confirmação).
  - Fotos reduzidas a **1080px no maior lado** (`expo-image-manipulator`) — 4 fotos em resolução cheia estouram a memória.
  - `capturingRef` como mutex (decisão 25) e o índice-alvo é **congelado antes do `await`**: sem isso o `activeIndex` muda durante a captura e a foto cai na célula errada.
  - "Continuar" habilita com **≥1 foto** → grava `collagePhotos` no store → `share-preview`.

- **`share-preview.tsx`** — colagem final + adesivo + exportação.
  - **Layout adaptativo:** 1 = inteira · 2 = faixas empilhadas · 3 = larga em cima + duas embaixo · 4 = grid 2×2. Sempre `cover` (nunca esticada).
  - **Adesivo arrastável e pinçável** (`react-native-gesture-handler` + `reanimated`, `Gesture.Simultaneous`), preso dentro da colagem — o clamp **reprende ao crescer** no pinch, senão o adesivo furaria a borda ao ampliar.
  - **`<Collage>` é UM componente parametrizado por `width`, renderizado DUAS vezes** (preview 349pt e export 360pt). Não são duas implementações — é o que garante que a imagem exportada seja o que a usuária vê. A pose do adesivo é guardada em **coordenadas NORMALIZADAS** (`nx`/`ny`/`nW` como fração da colagem), e até o gap é convertido por fração; um gap em pt fixo sairia mais grosso na exportada.
  - "Compartilhar" (`expo-sharing`) e "Salvar na galeria" (`expo-media-library`, permissão pedida **no toque**). Guards `useRef` separados nos dois (decisão 25).
  - **A bandeja sobe sozinha** ~350ms depois do fetch do scan, **uma vez por sessão**; depois disso, só pela pílula "Trocar adesivo" (ícone `Sparkles`) abaixo do preview. ⚠️ **O gatilho é a pílula, NUNCA o adesivo** — ele já é alvo de `Gesture.Simultaneous` (pan+pinch) dentro de um container `overflow: 'hidden'`, e um `TouchableOpacity` competindo ali é a combinação que já quebrou toque neste projeto.
  - ⚠️ **Orçamento vertical inclui a pílula "Trocar adesivo" + o hint (`SUBCAP_BLOCK`).** A colagem é 9:16 (bem alta) e vive numa área `flex:1` **centrada**; se o bloco abaixo do preview não for descontado de `availH`, o `PREVIEW_H` fica grande demais e a colagem **transborda para cima, cobrindo o header** ("Seu Niks score"). Qualquer controle novo abaixo do preview tem de entrar nessa conta — foi um bug real desta tela.

#### A bandeja de adesivos (bottom sheet) — "todas as combinações"

6 métricas + Niks score = **128 combinações**; uma grade com 128 itens é inutilizável. A solução tem duas camadas, em `components/share/StickerSheet.tsx` (casca copiada do `ScanModal`):
- **Aba "Sugestões"** — grade de 2 colunas com os **14 presets** de `lib/stickerPresets.ts`, cada miniatura desenhada com os **números reais** da usuária.
- **Aba "Montar o meu"** — 7 chips liga/desliga (score + as 6 métricas) com preview ao vivo, alcançando as 128. Ao ligar a **4ª métrica o adesivo vira card sozinho** — a transição é a explicação, não há aviso nem bloqueio.

**Um adesivo por vez** — escolher substitui. "Atratividade + Juventude" é UM adesivo com as duas dentro, não dois adesivos soltos.

> ⚠️ **NADA de `react-native-gesture-handler` dentro do `<Modal>` da bandeja.** No Android o Modal é outra janela e não é coberto pelo `GestureHandlerRootView` do `app/_layout.tsx`. Consequência de projeto: a bandeja **não tem arrastar-para-fechar** (fecha por backdrop, X e "Usar adesivo"). O `ScrollView` do RN funciona normalmente.

> ⚠️ **Miniaturas: `transform: scale`, não `size` pequeno.** Cada `StickerThumb` renderiza o adesivo na largura de DESENHO canônica (130 no círculo, 312 no card) e encolhe com `transform: [{ scale }]` + `transformOrigin: 'top left'`. Renderizar direto em ~90pt achataria rótulos de 9pt para ~4pt com arredondamento sub-pixel; assim o layout de texto acontece em corpo normal e a miniatura fica **pixel-fiel** ao que ela vai receber.

**Estado no store:** `stickerSpec` (escolha atual) e `stickerSheetSeen`. ⚠️ **Nenhum dos dois no `partialize`** — é exatamente essa exclusão que implementa "sobe sozinha só na primeira vez da sessão", sem flag em AsyncStorage. Persistir `stickerSheetSeen` faria a bandeja nunca mais subir sozinha.

#### As duas formas de adesivo e a regra que as escolhe

| Métricas | Forma padrão (automática) | Componente |
|---|---|---|
| 0–3 | círculo | `components/NiksSticker.tsx` |
| 4–6 | card | `components/NiksStickerCard.tsx` |

**`stickerShape(spec)` (`lib/stickerSpec.ts`) é a FONTE ÚNICA dessa regra**, e `components/NiksStickerView.tsx` é o despachante — **nenhuma tela importa os dois componentes de adesivo direto**.

> **A forma é ESCOLHÍVEL na aba "Montar o meu"** (`StickerSpec.shape`). A tabela acima é só o *default* automático; o usuário pode forçar círculo ou card livremente, dentro do viável: **círculo até `CIRCLE_MAX = 4` métricas**, **card com ≥1 métrica**. `feasibleShapes(spec)` diz quais formas oferecer; `stickerShape` respeita `spec.shape` só quando viável e cai no automático caso contrário; `normalizeSpec` derruba uma forma que a poda tornou impossível. **`specId` inclui a forma resolvida** — círculo e card das mesmas métricas são adesivos distintos. O card **adapta o tamanho** às métricas (1 métrica → 1 coluna; 2–4 → 2 colunas; 5–6 → 3), e `stickerBaseFraction` deriva a largura do card da proporção para a altura nunca estourar a colagem.

> **🎨 Cor do número de uma métrica = FAIXA DO SCORE, não semáforo (só no círculo).** No adesivo em círculo, o número de uma métrica usa `metricScoreColor(value, positive)` (`lib/metricColor.ts`): a mesma régua de cor do Niks score (rosa 76–100 · amarelo 51–75 · laranja 26–50 · vermelho 0–25), aplicada à **própria nota**, então Atratividade 77 sai **rosa** igual ao score. Métricas **negativas** (oleosidade/acne/linhas) são **invertidas** (`100−value`) para manter "rosa = bom". ⚠️ **O CARD NÃO muda** — ele é réplica do card da home, mantém número **preto** + barra no **semáforo** (`metricColor`). Não unificar os dois: são coisas diferentes de propósito.
>
> O **ANEL e a marca** do círculo (`stickerColor` no `NiksSticker`) seguem a cor da **manchete**: o score (quando há score) ou a **1ª métrica** (adesivo de métrica isolada). Assim o adesivo de Oleosidade com o 42 amarelo tem **anel amarelo**, não rosa — número e adesivo na mesma cor. ⚠️ Não fixar o anel em `theme.score`.

> ⚠️ **Por que a regra mora num lib puro, e não no componente:** o `clampPose` de `share-preview` roda em **worklet (UI thread)** e precisa da **proporção do adesivo antes de qualquer render**. Se a altura viesse do conteúdo, o clamp e a imagem exportada divergiriam do preview. Por isso `lib/stickerCardLayout.ts` calcula `baseW`/`baseH` de forma determinística e o card é **obrigado** a aplicar `height: baseH * u` — **nunca auto-height**, e o rótulo de 2 linhas ("Linhas de\nexpressão") vive em caixa de altura fixa.

> ⚠️ **`normalizeSpec` não é opcional.** `stickerAspect` conta as chaves do spec, mas o adesivo só desenha as que têm número: uma chave sem dado faria o container reservar uma altura e o card desenhar outra → **export diferente do preview**. `share-preview` normaliza contra `availableKeys(metricas)` antes de qualquer conta.

> ⚠️ **Troca de adesivo RESETA a escala para 1** (preservando a posição). Não é estético: um card 312×268 herdando a escala 1.9 de um círculo estouraria a colagem. O clamp desse efeito usa os números **locais**, não `aspectSV.value` — ler o shared value recém-escrito dependeria da ordem de propagação JS→UI thread.

**`components/NiksSticker.tsx`** (círculo) — puro (props → desenho). Escala tudo a partir de `size` (desenhado p/ **130pt**). **Marca (logo tintada + "NIKS") obrigatória — não existe prop para desligá-la.** Variantes: só score · score + 1–4 métricas · sem score + métricas.
- ⚠️ **Métrica ISOLADA (`solo` = sem score, 1 métrica) é réplica EXATA do adesivo de score:** número gigante **u(52)** + rótulo **completo** ("Qualidade da pele"), centrado, em 2 linhas se preciso. Com 2+ métricas a manchete encolhe para u(30) e as demais viram linhas. **O split de rótulo mora no `NiksStickerView`** (`!solo` → passa `short` só quando NÃO é solo): o rótulo-manchete usa o nome **completo** (é largo, centrado); as **linhas** usam o **`short`** de `METRIC_DEFS` ("Linhas", "Qualidade"), senão reticenciam na corda estreita (largura útil `size − 30`, limitada pela **corda do círculo**, não pela caixa).
- ⚠️ **Legibilidade a 130pt:** na variante densa (score + 3–4 métricas) o rótulo "Niks score" é **omitido de propósito** — cortar hierarquia foi a forma de manter rótulos e valores legíveis em vez de espremer tudo. Com 4 métricas a flag `dense` encolhe fonte/gaps das linhas.

**`components/NiksStickerCard.tsx`** (card) — réplica do card de métricas da home (node 1:63): fundo branco, borda `#E3E3E6`, rótulo em Lato, valor em **Exo 2 Bold preto** (a cor vive na barra, não no número), trilho `#F3F3F4` com preenchimento por `metricColor`. Cabeçalho de score opcional + o **mesmo lockup de marca do círculo** no rodapé. `overflow: 'visible'` de propósito. Os dois adesivos pedidos explicitamente pelo usuário — **card completo COM score** e **card completo SEM score** — são só `{showScore: true|false, keys: [as 6]}`; **não existe campo `variant`**, seriam dois caminhos para o mesmo desenho.

**`lib/metricDefs.ts`** — `METRIC_DEFS` (chaves, `label`, `short`, `positive`), `Metricas`, `availableKeys`, `hasMetrics`. **Extraído da `home.tsx`**, onde vivia sozinho, quando a bandeja passou a precisar da mesma lista. Não redefinir em tela nenhuma. `hasMetrics` é a fonte única do **"scan legado"** (tem score, mas o `full_result` é anterior às 6 métricas): nesse caso a bandeja **não sobe sozinha**, e aberta pelo botão mostra só o preset do score + a mensagem "Aprimoramos a análise de pele". **Nunca fabricar zeros.**

**🔍 Pendências de validação no device:**
1. **Espelhamento da foto frontal.** Pela leitura do source nativo, `mirror` deve fazer a foto salva bater com o preview (decisão 27) — mas isso **nunca foi testado com um objeto assimétrico/texto**. Se sair espelhado, o ajuste é um `flip: Horizontal` no `expo-image-manipulator`.
2. **A imagem exportada.** A conta de resolução está conferida contra o source nativo (decisão 28), mas o **arquivo gerado nunca foi aberto**. Risco conhecido: o `drawViewHierarchyInRect` do iOS pode devolver **branco** para views fora da tela. A view de export usa o padrão consagrado (`left: -10000` + `collapsable={false}` — obrigatório, senão o RN achata a View e o `captureRef` não acha nada). **Se sair branco, o plano B é `useRenderInContext: true`**, que renderiza a layer tree direto e não depende da tela.
3. `share-preview` inteira nunca rodou no device.

---

### ScanModal (`components/scan/ScanModal.tsx`) — ⚠️ APOSENTADO, FORA DO FLUXO

> **Este componente não é mais usado por nenhuma tela.** O bottom sheet de escolha de tipo de scan foi removido do fluxo a pedido do usuário: o botão "Escanear" da home vai **direto** para o scan de rosto (`useFaceScan` → `scan-prep-app`) e o scan de produto ficou **só** na tela de Recomendação de Produtos. Junto com ele saíram `scanModalOpen`/`setScanModalOpen` do store e a renderização em `(app)/_layout.tsx`.
>
> **O arquivo continua no repo, sem consumidores**, caso o modal precise voltar — não foi deletado de propósito. A descrição abaixo é histórica; se for reativá-lo, note que a lógica de consentimento de IA que morava nele foi extraída para `hooks/useScanConsentGate.tsx` e hoje vive nas telas de câmera (seção 14).

Bottom sheet **claro no design novo** (Nunito, tokens `INK #121212`/`INK_MUTE`/`CARD_BD #E3E3E6`, rosa `CORAL #FF9D9D` + wash `rgba(255,157,157,0.14)`). Aberto por `setScanModalOpen(true)`. Header centralizado: eyebrow "NOVO SCAN" rosa + "Escolha o tipo de scan" (Nunito ExtraBold 26). **Dois cards** (ícone em chip 56×56 com wash rosa + título + subtítulo + chevron):
- **"Escanear produto"** (badge "mais usado") — ícone **`ScanProductIcon`** (SVG custom: moldura de scan com cantos + frasco no centro; o lucide não tem esse combinado). `handleScanProduct` → consentimento de IA → `router.push('/(scan)/product-camera')`. **Substituiu a antiga "Escanear refeição"** (o scan de comida sai do modal — `food-camera` continua existindo, só não é mais acessado por aqui).
- **"Escanear rosto"** (ícone `ScanFace` do lucide) — `handleScanFace` → `setScanSource('app')` + consentimento → `router.push('/(scan)/scan-prep-app')` (a tela de preparação do **design novo**).
- **Stacking de Modal no iOS:** `handleScanProduct`/`handleScanFace` chamam `onClose()` e só disparam `requestConsent` após ~220ms (ver ⚠️ Modal stacking). Animação `Animated.spring` slide-up.

### Tela de Resultado Facial — App (`app/(app)/skin-result.tsx`)
Tela dedicada acessada via "Ver resultado" na home. Usa `Animated.ScrollView` com efeito parallax — foto fixada atrás do scroll, conteúdo desliza por cima. Ver Decisão #14 para detalhes de arquitetura.

**Hero (dentro da foto, bottom-left/right — animados com o scroll via `overlayTranslateY`):**
- Ring de score SVG (bottom-left): gradiente verde `#34D399→#059669`, `strokeDashoffset` proporcional ao score
- Badges (bottom-right): tipo de pele + fotótipo Fitzpatrick; fundo `#fb7b6b`, texto branco

**Seções (de cima para baixo, dentro do card de conteúdo):**
1. **Headline + qualidade** — texto `headline` centralizado; linha "Qualidade da foto · Alta/Média/Baixa" e "Precisão · XX%"
2. **Objetivo Validado** — condicional (`goal_alignment`): card com borda esquerda colorida (verde=confirmado / âmbar=parcial / coral=divergente), badge + mensagem de 2 frases
3. **Análise por Região** — cards com thumbnail da foto (crop vertical por região), tag de issues, descrição clínica; se `region_insights` tiver entrada: separador + "→ benefit" em itálico coral
4. **Pigmentação** — condicional (`pigmentacao.present`): tipo + escala de intensidade (5 pontos) + insight
5. **O que fazer pela sua pele** — condicional (`action_recommendations`): lista numerada 1–4, números `#fb7b6b` (42px, bold), category label uppercase cinza, texto da instrução
6. **Condição Geral** — grid 2×2: Barreira, Hidratação, Oleosidade, Fotótipo
7. **Por onde começar** — fundo `#fb7b6b`: prioridade 01 e 02, números brancos opacity 0.9 + justificativa branca semi-transparente
8. **Pontos de Atenção + Pontos Fortes** — se `skin_strengths` existir: ScrollView horizontal com cards (ícone `lucide-react-native`, título, body); senão: lista `pontos_fortes` como fallback. Pontos de atenção (`pontos_fracos`) sempre como lista
9. **Ativos a evitar** — fundo `#FFF5F4`, lista de `contraindicacoes` formatados
10. **Fotótipo Detectado** — Fitzpatrick + descrição textual
11. **Disclaimer**

**Dados lidos do Zustand:** `selectedScan` (carrossel da home) com fallback para `scanResult`/`scanImageUri` (scan flow direto). `selectedScan` é limpo no `useEffect` de desmontagem.

### Tela NIKS Chat (`app/(app)/niks-chat.tsx`)
Chat com a NIKS AI (4ª aba "niks" do menu inferior). Redesenhada para o novo design (Nunito, tema claro, fundo branco). Tokens/regras de estilo na seção **REGRAS → Exceção `niks-chat.tsx`**; **lógica** (streaming XHR real, `sendMessage`, histórico, fotos, `niksChatMode`) na tabela da Edge Function `niks-chat` e na regra correspondente. **Toda a lógica é real** — o antigo streaming simulado (`NIKS_STREAM_TEXT`) e as mensagens ilustrativas hardcoded **não existem mais**.

**Dois estados controlados por `mode: 'empty' | 'active'`:**

**Estado `empty` (boas-vindas) — feito do zero, aprovado pelo usuário (não mexer sem pedido):**
- Hero: `AnimatedLogo` (a **logo** `niks-logo.png`, ~84px) com "respiro" (scale 1→1.04→1)
- Saudação `"Olá, {firstName}"` em Nunito ExtraBold 32px **toda coral** (`#F86B79`) + tagline `"como posso te ajudar hoje?"` (Nunito Medium, `#818181`)
- Divisor "SUGESTÕES" + 5 `SuggestionCard` (cards brancos borda `#E3E3E6`, ícone em círculo coral-tint, cascade de entrada) — tocar aciona `handleSuggestionPress`, **exceto o 2º card "Analisar o impacto da minha refeição na minha pele"** (ícone `meal` de talheres, `action: 'foodScan'` no array `SUGGESTIONS`) que **navega DIRETO para `/(scan)/food-camera`** — é a única entrada de UI do food scan (Sessão 48). Substituiu o antigo card "Esse produto vai funcionar pra mim?" (sua resposta em `PREDEFINED_RESPONSES` foi removida junto)
- Header: logo + **"NIKS"** (Nunito Bold 20), com ícone de histórico à direita (voltar oculto)

**Estado `active` (conversa) — réplica do Figma node `1:393` "chat-niks" (arquivo `0OySQA5EgG5RSj4QuMOXpJ`):**
- Header muda para logo + **"NIKS Chat"** (Nunito Medium 22); botão **voltar** à esquerda (volta para `empty` via `setNiksChatMode('empty')`); **sem** ícone de histórico
- Renderiza o array real `messages[]` (sem timestamp/divisor). Regras: `role==='user'` → `UserBubble` (+ `UserPhotoBubble` por foto); `assistant` streaming vazio → `TypingDots`; senão → `NiksMessage`
- **Balão da NIKS** (`NiksMessage`): **branco com borda `#E3E3E6`** + sombra sutil, radius 18, à esquerda, com **avatar = logo** (`NiksAvatar`, ~30px, node 1:408) no canto inferior. Texto Nunito Regular 14px `#111`. Caret piscante durante o streaming
- **Balão da usuária** (`UserBubble`): **cinza `#F3EEEE`** (`BUBBLE_BG`), radius 18, à direita, texto 14px `#111`
- **Foto da usuária** (`UserPhotoBubble`): imagem arredondada **radius 35**, ~222×207, à direita (node 1:423), sem rótulo
- `TypingDots`: 3 dots com pulse staggerado, dentro de um balão branco+borda (igual ao da NIKS)

**Desvios conscientes do Figma `1:393` (justificados — não são bugs):**
1. **Fundo branco** em vez do gradiente sutil do Figma — o usuário pediu explicitamente fundo branco
2. **Botão voltar mantido** no header (o Figma não tem, mas é necessário para sair da conversa)
3. **Badge "Aviso de Acne"** (node 1:435) **omitida** — é conteúdo contextual por-mensagem sem fonte de dados no backend; hardcodar violaria a regra "nunca hardcodar mensagens". Para reativar, seria preciso o `niks-chat` retornar um flag de alerta por mensagem
4. **Fonte das mensagens = Nunito** (o Figma mostra SF Pro/sistema, provável default não-setado) — mantido Nunito por consistência com o app
5. **Barra de input inalterada** (branca + botão enviar `RED_GRAD`) por ser compartilhada com o estado `empty` já aprovado (o Figma mostra um botão cinza)

**Estilo:** inline styles + tokens locais do novo design. Não usa `Colors` constants nem NativeWind.

---

### Tab Bar / Navbar (`app/(app)/_layout.tsx` — `GlobalBottomBar`)
Réplica do design **"Fixed bottom bar"** (`navbar-design/Navbar.dc.html`). **Substituiu a réplica anterior do node `1:27` do Figma** — os antigos ícones PNG (`assets/home/nav-*.png`, posicionados por coordenada absoluta e tintados) **não são mais usados**.
- **Barra**: branca, largura total, **flush na borda inferior** (`position:'absolute'`, `bottom: 0`), borda superior hairline `#f2e6e6` + sombra suave para cima. `paddingTop: 14`, `paddingBottom: Math.max(insets.bottom, 26)`, itens distribuídos com `flex: 1` (não coordenadas absolutas).
- **Ícones = glyphs SVG line desenhados em código** (componente `NavGlyph`, `viewBox 24`, `GLYPH_SIZE = 29`) — não são mais assets PNG. Exceção: a **logo central**, que é `<Image>`.
- **Mapeamento de rotas e ícones** (`NAV_ITEMS`, esquerda→direita):

  | Glyph | Ícone | Rota |
  |---|---|---|
  | `beauty` | **rosto/skincare** (preenchido, `viewBox 34`) | `/protocolo` |
  | `rotina` | frasco de produto (line) | `/recomendacao-produtos` |
  | `home` | **logo NIKS central** (49px, `<Image>`) | `/home` |
  | `niks` | balão de chat (line) + badge | `/niks-chat` |
  | `perfil` | pessoa (line) | `/perfil` |

  > ⚠️ **O ícone de lupa (`busca`) saiu da navbar.** O glyph continua definido em `NavGlyph` (sem uso) caso queira reaproveitar. Antes o mapa era: frasco→`/protocolo` · lupa→`/recomendacao-produtos`. Foi remapeado a pedido do usuário: o **novo ícone `beauty`** (rosto) representa melhor a Rotina, e o **frasco** representa melhor Produtos.
- **Cores**: ativo `#ff9d9d` (rosa padrão do app) / inativo `#8a8a93`, + **ponto `#ff9d9d` sob a aba ativa** (`dotSlot` de altura fixa — mantém todos os ícones alinhados) + **badge `#ff9d9d`** no ícone de chat. O glyph `beauty` é **preenchido** (`fill={color}`), os demais são **stroke** — todos recebem a mesma `color`, então o `beauty` fica rosa quando ativo automaticamente.
- **🌸 Logo central = SEMPRE a logo rosa padrão da marca.** É `assets/home/niks-logo.png` com **`tintColor: '#FF9D9D'`** — a mesma logo rosa do herói de `protocolo` e dos avatares do `niks-chat`. **Fixa: não muda com o Niks score e é idêntica nos dois modos (claro e noturno).** ⚠️ **Antes ela seguia o tema do score** (`getScoreTheme(skinScore).logo` → `score-logo-{cor}.png`); isso foi **removido** a pedido do usuário — a navbar deve sempre exibir a identidade da marca. O `_layout.tsx` não importa mais `getScoreTheme` nem lê `skinScore`. (O campo `logo` do `ScoreTheme` continua existindo e em uso pela **home** e pelo **`product-result`** — só a navbar deixou de consumi-lo.) ⚠️ **`tintColor` não repinta com fast-refresh** (o RN cacheia o bitmap tintado) — para ver mudança de cor de logo, faça **reload completo** do app.
- **Sem FAB de scan** — escanear é só pelo botão "Escanear" da home, que vai direto para o scan de rosto. ⚠️ O `ScanModal` **não é mais renderizado** em `_layout.tsx` (saiu do fluxo).
- **Modo claro/escuro (responde a `tabBarTheme`):** a `GlobalBottomBar` lê `tabBarTheme` do store.
  - **Claro** (padrão): fundo branco, ícone ativo `#ff9d9d` / inativo `#8a8a93`.
  - **Escuro**: fundo `#1A1F2E` + borda superior hairline `rgba(255,255,255,0.07)`, ícone ativo `#FF9D9D` / inativo `#8B93A8`.
  - **A logo central é a mesma nos dois modos** (rosa `#FF9D9D` — ver acima).

> ⚠️ **`niks-logo.png` teve o fundo removido:** o asset vinha com fundo `#F9F9F9` opaco (some sobre branco, mas aparecia como um quadrado visível sobre o gradiente rosa — ex.: hero do `niks-chat`). O fundo foi tornado transparente reconstruindo o canal alpha (desfazendo a composição do bloom sobre `#F9F9F9`), sobrando só as esferas vermelhas com bordas suaves. A aparência sobre fundo branco é preservada; usado em `home`/`recomendacao-produtos`/`niks-chat` e, **tintado `#FF9D9D`**, no ícone central da navbar (nos dois modos).
  - Quem seta dark: **só** `protocolo.tsx` (período Noite) via `useFocusEffect` resetando para light no blur (`niks-chat.tsx` perdeu o modo noturno e chama sempre `light`). (o `isDark` do `ScanModal` era controlado aqui também, mas o modal saiu do fluxo.)
- Visibilidade: `{tabBarVisible && <GlobalBottomBar />}`. Telas ocultas do `<Tabs>` (`href: null`): `set-name`, `skin-result`.

### Tela de Perfil (`app/(app)/perfil.tsx`)
Redesenhada com base no Figma Make `cFsFcVSjOMkTdHIJpHgSDk`. Layout (de cima para baixo):
1. **Top Bar** — "NIKS" (sem ícone de configurações)
2. **Profile Header Card** (clicável → `set-name.tsx`):
   - Avatar coral 60×60 com inicial do nome (ou `?` se não definido)
   - Badge Crown dourado + "Premium"
   - Nome do Supabase (`users.nome`) ou "Toque para definir" se vazio
   - Subtítulo "seu nome e usuário" + ChevronRight
3. **Seção "Assinatura"** — "Gerenciar assinatura" com ícone Crown coral
4. **Seção "Seu e-mail"** — card com dois itens: email (estático) + botão "Apagar minha conta" (ícone `Trash2` vermelho). `onPress` exibe Alert de confirmação; confirmado → `deleteAccount()` + `router.replace('/')`
5. **Seção "Notificações"** — "Ative as Notificações" — `onPress` chama `requestPushPermission()`: se já tem permissão, abre Ajustes via `Linking.openURL("app-settings:")`; se não tem, pede permissão e salva token via `savePushToken()`; se recusar, direciona para Ajustes
6. **Seção "Suporte"** — "Fale conosco" (Alert + mailto:suporte@niksai.com.br) + "Avaliar o app"
7. **Sair da conta** (vermelho, `signOut`) + versão

**Dados dinâmicos:** carregados via `useFocusEffect` + `supabase.auth.getUser()` a cada foco da aba.

### Tela Definir Nome (`app/(app)/set-name.tsx`)
Nova tela acessada ao tocar no Profile Header Card do perfil:
- Back button circular branco
- Título "Qual é o seu nome?" + subtítulo
- 2 `TextInput` com floating label animado: "Nome" e "Sobrenome"
- Pré-popula com o `users.nome` existente (split por primeiro espaço)
- Botão "Continuar" coral quando preenchido; salva `nome` concatenado em `users.nome` via `UPDATE`
- `paddingBottom` do botão = `useSafeAreaInsets().bottom + 80` para não ser coberto pela tab bar

### Tela de Protocolo / Rotina (`app/(app)/protocolo.tsx`)

> ⚠️ **Redesenhada — ver seção 6 (a fonte de verdade atual):** hoje é a "Rotina de Beleza" com **dados reais + cerimônia re-portada da produção**. Toda a descrição abaixo é do **design ANTIGO ("Quietude v3"), que não existe mais no código** — mantida só como referência de recuperação daquele design específico (o `streak`/checklist gamificado e o bottom-sheet de detalhe **não** voltaram; a cerimônia atual é a da produção, não a do Quietude v3). Código antigo no **histórico do git** (commit anterior à `newdesign`); referência de design em `design-export/niks-ai-ui/project/direction-quietude-v3-original.jsx`.

<details>
<summary>Design antigo (Quietude v3) — obsoleto, apenas histórico</summary>

1. **Masthead** — "NIKS" + data formatada (UTC-3); `paddingTop = insets.top + 20`
2. **Orb 132×132** — `Canvas` Skia com `Circle` + `RadialGradient` (AM coral / PM lua creme), highlight elíptico `BlurMask`, crateras no PM
3. **Toggle manhã/noite** — serif italic + SVG sol/lua; ativo com `borderBottomWidth` coral
4. **Título** — `"Manhã, N passos."` PlayfairDisplay-Italic 38px + score/duração abaixo
5. **Lista de passos** — barra accent, numeral romano, nome PlayfairDisplay, ingredient; `✓`/duração + chevron; `opacity 0.42` quando concluído
6. **CTA flutuante** — pill coral → abre a **Cerimônia**

- **Bottom sheet (detalhe):** `Animated.View` translateY spring; "Como aplicar" (`step.steps[]`/`instruction`), "Ativos", "Por que para você".
- **Cerimônia overlay (`ritualOpen`):** overlay `zIndex 60`, `setTabBarVisible(false)`; Skia orb 220 com anéis respiratórios, título DMSerifDisplay, CTA duplo, tela de celebração `CerimoniaCelebration` com 8 `Animated.Value` staggered.
- **Conclusão (AsyncStorage):** chaves `protocolo_check_YYYY-MM-DD_{morning|night}`, reset diário.
- **Streak:** `streak_days` incrementa quando manhã **E** noite estão 100% concluídas no mesmo dia (`last_protocol_completed_at` evita duplo incremento).

</details>

**Som:** `assets/sounds/check.mp3` carregado via `useAudioPlayer` de `expo-audio`. Tocado a cada item marcado junto com haptic.

---

### 17. Parallax hero em `skin-result.tsx` — foto fixa + scroll por cima

A tela `skin-result.tsx` usa `Animated.ScrollView` para criar efeito parallax: a foto do rosto fica fixada no fundo e o card de conteúdo desliza por cima dela ao rolar.

**Estrutura de camadas (zIndex):**
```
<View flex:1>
  <View position:absolute zIndex:0>          ← foto fixada no fundo
    <Image />
    <LinearGradient />                        ← gradiente inferior escuro
    <Animated.View translateY={overlayTranslateY} pointerEvents:"none">
      {/* ring SVG (bottom-left) + badges (bottom-right) */}
    </Animated.View>
  </View>
  <SafeAreaView position:absolute zIndex:10>  ← header flutuante (back button)
  <Animated.ScrollView zIndex:1 paddingTop:HERO_HEIGHT>
    <View borderTopRadius:24 overflow:hidden>  ← card de conteúdo cobre a foto
      {/* seções */}
    </View>
  </Animated.ScrollView>
</View>
```

**`overlayTranslateY`** — interpolação de `scrollY` que faz o ring e os badges parecerem subir junto com o conteúdo:
```typescript
const overlayTranslateY = scrollY.interpolate({
  inputRange: [0, HERO_HEIGHT],
  outputRange: [0, -HERO_HEIGHT],
  extrapolate: 'clamp',
});
```

**`HERO_HEIGHT = 380`** — controla altura da foto e o `paddingTop` do ScrollView. Se mudar um, mudar o outro.

**Ring de score** (`react-native-svg`): `strokeDasharray={207.3}` (circunferência de r=33), `strokeDashoffset={207.3 * (1 - score/100)}`, rotacionado -90° para começar no topo.

**`borderTopLeftRadius/RightRadius: 24`** no container do conteúdo cria o efeito de card pousando sobre a foto ao rolar. `overflow: 'hidden'` obrigatório no mesmo container.

---

### 18. ~~`HomeBottomBar` em `home.tsx` — tab bar + FAB como irmãos~~ (OBSOLETO)

> **Obsoleto desde o redesign do Figma.** A home nova **não tem** barra inferior própria nem FAB — a navbar é única, mora em `_layout.tsx` (`GlobalBottomBar`, ver seção "Tab Bar / Navbar"), e o scan é acionado pelo botão "Escanear" dentro da home.
>
> **Lição que permanece válida** (caso um FAB/overlay flutuante seja reintroduzido): em React Native, `zIndex` só funciona entre irmãos do mesmo pai. Um elemento em `_layout.tsx` (pai) sempre renderiza por cima de um elemento em `home.tsx` (filho dentro de `<Tabs>`), independente do `zIndex`. Um botão flutuante que precise ficar acima da navbar tem que ser **irmão da navbar** (no próprio `_layout.tsx`), não na tela filha.

### 19. `react-native-svg` — `fill="none"` obrigatório em `<Path>` stroke-only

Em browser SVG, `fill="none"` definido no elemento pai `<svg>` é herdado por todos os filhos. Em `react-native-svg` **essa herança não ocorre** — cada `<Path>` tem `fill` preto por padrão, independente do que está no `<Svg>` pai.

**Consequência prática:** qualquer `<Path>` que deveria ser apenas contorno (chevron, checkmark, seta, ícone de linha) aparece como uma forma preta preenchida no dispositivo — o mesmo código funciona no browser e quebra no app.

**Regra:** em todo `<Path>` stroke-only, sempre definir `fill="none"` diretamente no elemento `<Path>`, nunca confiar em herança do pai.

```tsx
// ❌ Funciona no browser, quebra no react-native-svg
<Svg viewBox="0 0 20 20" fill="none">
  <Path d="M4 10l4 4 8-8" stroke="#065F46" strokeWidth={2} />
</Svg>

// ✅ Correto para react-native-svg
<Svg viewBox="0 0 20 20">
  <Path d="M4 10l4 4 8-8" fill="none" stroke="#065F46" strokeWidth={2} />
</Svg>
```

Afeta todos os ícones de `food-report.tsx`: checkmarks em `HighlightRow`, ícones de atenção em `WatchOutRow`, chevrons em `CollapsibleSection` e `FoodCard`, seta da substitution card.

### 20. `overflow: 'hidden'` e shadow são mutuamente exclusivos na mesma `View`

Em CSS, `overflow: hidden` e `box-shadow` coexistem sem problema — a sombra renderiza fora do elemento normalmente. Em React Native (iOS e Android), **`overflow: 'hidden'` na mesma `View` que carrega as propriedades `shadow*` corta a sombra completamente**, tornando o card plano mesmo com valores corretos de sombra.

**Consequência prática:** cards com `borderRadius` + `overflow: 'hidden'` (para clipar conteúdo interno, ex: accordions) perdem toda a elevação visual. O mesmo código que parece elevado no design HTML fica completamente plano no app.

**Regra:** separar sempre em duas `View`s aninhadas:

```tsx
// ❌ Sombra clipada — card plano no device
<View style={{ borderRadius: 22, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10 }}>
  {/* conteúdo */}
</View>

// ✅ Sombra visível
<View style={{ borderRadius: 22, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
  {/* View externa: só sombra, sem overflow */}
  <View style={{ borderRadius: 22, borderWidth: 0.5, borderColor: 'rgba(43,39,36,0.06)', overflow: 'hidden' }}>
    {/* View interna: overflow hidden + borda, sem shadow */}
    {/* conteúdo */}
  </View>
</View>
```

Aplicado em `food-report.tsx` nos componentes `CollapsibleSection` e `FoodCard`. A `View` externa carrega a sombra; a `View` interna carrega o `overflow: 'hidden'` e a borda.

---

### 21. `expo-linear-gradient` — `'transparent'` cria bordas escuras em fundos brancos

No React Native, `'transparent'` interpola para `rgba(0,0,0,0)` (preto transparente), não para a cor do fundo. Em gradientes sobre fundo branco isso gera uma borda escura visível na extremidade do fade.

**Regra:** nunca usar `'transparent'` como stop em `expo-linear-gradient`. Usar a cor-alvo com alpha 0 explicitamente.

```tsx
// ❌ Cria borda escura — 'transparent' interpola para rgba(0,0,0,0)
<LinearGradient colors={['#FFFFFF', 'transparent']} />

// ✅ Fade suave — interpola corretamente entre branco e branco transparente
<LinearGradient colors={['#FFFFFF', 'rgba(255,255,255,0)']} />
```

Era aplicado em `rate-us.tsx` (tela fora do fluxo — ver seção do fluxo de onboarding). Aplicar em qualquer nova tela com carrossel sobre fundo branco.

---

### 22. Animação de `strokeDashoffset` em SVG — `Animated.createAnimatedComponent` + `useNativeDriver: false`

Para animar propriedades de elementos `react-native-svg` (ex: `strokeDashoffset` de um `Circle` para progress ring fluido), é preciso criar um componente animado via `Animated.createAnimatedComponent`. O módulo `react-native-svg` **não exporta** esse utilitário — deve-se usar o `Animated` do próprio React Native.

```tsx
// ✅ Correto
import Animated from 'react-native'; // ou desestruturar do import
import { Circle } from 'react-native-svg';
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ❌ Errado — react-native-svg não tem createAnimatedComponent
import { createAnimatedComponent } from 'react-native-svg';
```

**`useNativeDriver: false` é obrigatório** para animações de SVG — o native driver não suporta propriedades de elementos SVG (só suporta `transform` e `opacity` de Views nativas).

```tsx
const progressAnim = useRef(new Animated.Value(0)).current;

Animated.timing(progressAnim, {
  toValue: percentage,
  duration: 350,
  useNativeDriver: false, // ← obrigatório para strokeDashoffset
}).start();

const strokeDashoffset = progressAnim.interpolate({
  inputRange: [0, 100],
  outputRange: [CIRCUMFERENCE, 0],
});

<AnimatedCircle
  strokeDasharray={CIRCUMFERENCE}
  strokeDashoffset={strokeDashoffset}
  // ... demais props
/>
```

Aplicado em `(scan)/loading.tsx` para o ring de progresso da análise facial: `percentage` (estado que sobe em saltos irregulares) é animado via `Animated.Value` intermediário com `duration: 350ms`, eliminando o efeito de travamento visual.

---

### 23. Shimmer em texto colorido — simulação de `backgroundClip: text` com overlay branco

CSS `backgroundClip: text` não existe no React Native. A técnica para simular um shimmer sobre uma palavra colorida (ex: coral) é usar `overflow: 'hidden'` no container da palavra + um `LinearGradient` branco absoluto que desliza sobre ela.

**Por que branco e não a cor do texto:**
- Gradiente branco sobre fundo branco = branco (invisível) → sem artefatos de retângulo
- Gradiente branco sobre texto coral = coral clareado → shimmer visível
- Gradiente coral-transparent (mesmo hue, alpha 0) sobre fundo branco → ainda cria retângulo de cor translúcida sobre as lacunas entre letras

```tsx
<View style={{ overflow: 'hidden' }}>
  <Text style={{ color: CORAL }}>palavra</Text>
  <Animated.View
    pointerEvents="none"
    style={{
      position: 'absolute', top: 0, bottom: 0, left: 0,
      width: 400,
      transform: [{ translateX: shimmerTranslateX }],
    }}
  >
    <LinearGradient
      colors={[
        'rgba(255,255,255,0)',
        'rgba(255,255,255,0)',
        'rgba(255,255,255,0.78)',  // pico do shimmer
        'rgba(255,255,255,0)',
        'rgba(255,255,255,0)',
      ]}
      locations={[0, 0.35, 0.5, 0.65, 1]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      style={{ flex: 1 }}
    />
  </Animated.View>
</View>
```

`shimmerTranslateX` vai de `+200` a `-400` em loop (1500ms, `useNativeDriver: true`). A largura `400` garante que o gradiente cobre a palavra inteira mesmo em textos longos.

Aplicado em `(scan)/loading.tsx` na palavra destacada do título rotativo ("análise", "hidratação", "Score"…). Consultar também **Decisão 21** para o gotcha de `'transparent'` no `expo-linear-gradient`.

---

### 24. `overflow: 'hidden'` em pai de `ScrollView` bloqueia toque no New Architecture

No **New Architecture (Fabric)**, `overflow: 'hidden'` em uma `View` pai pode bloquear os eventos de toque para um `ScrollView` filho, tornando o scroll completamente inoperante — o conteúdo é exibido corretamente, mas nenhum gesto de arrasto é detectado. Na Old Architecture, `overflow` afetava apenas a renderização, nunca o hitbox. No Fabric, esse comportamento mudou.

**Sintoma típico:** o `ScrollView` renderiza os items normalmente, o usuário tenta rolar, o conteúdo não responde a nenhum gesto. `onScroll`, `onScrollEndDrag` e `onMomentumScrollEnd` nunca disparam.

**Regra:** nunca colocar `overflow: 'hidden'` em um `View` que é pai direto de um `ScrollView`. O próprio `ScrollView` já clipa seu conteúdo internamente — o `overflow: 'hidden'` externo é redundante e, no Fabric, destrutivo.

```tsx
// ❌ Bloqueia o toque no New Architecture
<View style={{ height: 300, overflow: 'hidden' }}>
  <ScrollView snapToInterval={60} decelerationRate="fast">
    {/* items */}
  </ScrollView>
</View>

// ✅ Correto — ScrollView clipa o próprio conteúdo
<View style={{ height: 300 }}>
  <ScrollView snapToInterval={60} decelerationRate="fast">
    {/* items */}
  </ScrollView>
</View>
```

**Corolário — scroll pickers com `decelerationRate="fast"` + `snapToInterval`:** o snap acontece tão rapidamente que `onMomentumScrollEnd` muitas vezes não dispara (não há momentum real). Sempre usar **ambos** `onScrollEndDrag` e `onMomentumScrollEnd` juntos para cobrir drags lentos e flicks rápidos.

Descoberto ao corrigir o scroll picker de idade em `birthday.tsx` (Sessão 30).

### 25. `useRef` como guard contra execução dupla em funções assíncronas críticas

`useState` tem lag de re-render: se o usuário toca um botão duas vezes muito rapidamente (antes do primeiro `setState` re-renderizar e desabilitar o botão), ambos os taps disparam a função. O mesmo vale para `useEffect` com `[]` — em React StrictMode (ativo por padrão no Expo dev client), o efeito é invocado duas vezes. Qualquer função assíncrona que persiste dados no banco é vulnerável a essas condições.

**Padrão correto — `useRef` como mutex:**
```typescript
const guardRef = useRef(false);

const doOnce = async () => {
  if (guardRef.current) return;   // já rodando — descarta
  guardRef.current = true;
  try {
    // ... chamada de API + insert no banco
  } catch (err) {
    guardRef.current = false;     // reseta só em erro, para permitir retry manual
    setError('...');
  }
};
```

**Por que `useRef` e não `useState`:** refs são síncronos — `guardRef.current = true` é visível imediatamente, sem aguardar re-render. `useState` só atualiza após o próximo ciclo de render, criando uma janela onde o guard ainda não está ativo.

**Onde este padrão é aplicado:**
- `app/(scan)/food-camera.tsx` — `navigatingRef` em `processAndNavigate`: impede que dois toques rápidos no botão de câmera resultem em dois `router.push('/(scan)/food-report')` simultâneos. O ref é resetado para `false` apenas em caso de erro no processamento da imagem.
- `app/(scan)/food-report.tsx` — `analyzingRef` em `analyzeFood`: impede que chamadas paralelas (StrictMode ou remount da tela) gerem múltiplos inserts em `food_scans`. O ref é resetado para `false` apenas em caso de erro, preservando o botão "Tentar novamente" funcional.

**Sintoma do bug sem o guard:** cada scan de refeição salvava 2–4 registros idênticos em `food_scans` com o mesmo `created_at`, aparecendo como duplicatas na seção "Hoje você comeu" da home.

---

### 26. `expo-camera` — mover UMA `CameraView` não reinicia a sessão (desmontar, sim)

Numa colagem, a tentação é montar/desmontar a `CameraView` ao trocar de quadrante. **Não faça:** remontar recria a sessão de captura do iOS e produz um flash/delay visível a cada foto.

**O caminho certo:** manter **uma única `CameraView` sempre montada** e só reposicioná-la (`position: 'absolute'`, trocando `left/top/width/height`). O nativo suporta isso explicitamente — em `CameraView.swift`:

```swift
previewLayer.videoGravity = .resizeAspectFill
previewLayer.needsDisplayOnBoundsChange = true
...
previewLayer.frame = self.bounds     // muda com os bounds
```

O preview é um `AVCaptureVideoPreviewLayer`: mudar os bounds **só redimensiona a camada**, a `session` não é recriada.

Para "desligar" a câmera sem pagar o custo da remontagem, use a prop **`active={false}`** — ela **pausa** a sessão mantendo a view montada.

Usado em `app/(share)/share-capture.tsx`.

---

### 27. `expo-camera` — `mirror` espelha só a FOTO, não o preview

A câmera frontal entrega a foto **espelhada em relação ao que a usuária vê**. A causa está no nativo, e saber disso evita "corrigir" no lugar errado (ex.: aplicar um flip que dupla o espelhamento).

- O **preview** (`AVCaptureVideoPreviewLayer`) **nunca** tem `isVideoMirrored`/`automaticallyAdjustsVideoMirroring` setado pelo expo-camera → fica no **default do iOS, que espelha a câmera frontal** (visão de espelho).
- A prop **`mirror`** age **só na connection da foto de saída** (`CameraPhotoCapture.swift`):

```swift
connection?.isVideoMirrored = captureDelegate?.presetCamera == .front &&
  ((captureDelegate?.mirror ?? false) || options.mirror)
```

**Consequência:** por padrão preview espelhado + saída não-espelhada = divergem. **`mirror={true}` na `CameraView`** espelha a saída e as duas passam a bater. **Não** é preciso flip no `expo-image-manipulator` — e aplicar os dois juntos volta a inverter.

> ⚠️ Deduzido do source nativo, **ainda não validado com texto/objeto assimétrico no device** — ver pendências da feature de compartilhamento.

---

### 28. `react-native-view-shot` — `width`/`height` são PONTOS, não pixels

Para exportar numa resolução-alvo (ex.: 1080×1920 de Stories), o instinto é `captureRef(ref, { width: 1080, height: 1920 })`. **Está errado** e gera uma imagem gigante. O nativo (`RNViewShot.mm`) faz:

```objc
CGSize size = [RCTConvert CGSize:options];        // width/height das options = PONTOS
if (size.width < 0.1) size = view.bounds.size;    // default: bounds da view
UIGraphicsBeginImageContextWithOptions(size, NO, 0);   // 0 = escala da TELA (@3x)
```

Ou seja: **pixels de saída = `size`(pt) × escalaDaTela**.
- `width: 1080` → 1080 **pontos** × 3 = **3240×5760 px**.
- Capturar a view do preview (349pt × 3 = 1047px) e escalar até 1080 → **borra**.

**A regra:** dimensione a **view** em pontos de forma que `pontos × escalaDaTela` dê os pixels desejados, e capture **sem** passar `width`/`height` (deixando o `size` cair no `bounds`):

```typescript
const PX = PixelRatio.get();     // 3 no iPhone deste projeto
const EXPORT_W = 1080 / PX;      // 360pt @3x · 540pt @2x
const EXPORT_H = 1920 / PX;      // 640pt @3x · 960pt @2x
// → bounds × PX = 1080×1920 px EXATOS, em qualquer densidade, sem reamostrar
await captureRef(exportRef, { format: 'jpg', quality: 0.95, result: 'tmpfile' });
```

Como a view é renderizada **nativamente** nesse tamanho (não ampliada), o texto sai **vetorialmente nítido**.

**Corolário — a view de export é uma SEGUNDA render, não a da tela.** Ela tem tamanho diferente do preview, então o layout **tem de ser o mesmo componente parametrizado por `width`**, com posições em **frações** (não em pt fixos). Duas implementações separadas divergem silenciosamente. E ela precisa de **`collapsable={false}`**: sem isso o RN achata a View e o `captureRef` não encontra nada para capturar.

Aplicado em `app/(share)/share-preview.tsx`.

---

### 29. `flexWrap` com folga ZERO quebra a linha (Fabric)

Um grid 2×2 feito com `flexWrap: 'wrap'` + `gap`, dando às células largura fixa `(W − gap)/2`, soma **exatamente** a largura do container — **folga zero**. Basta o Yoga discordar por um sub-pixel ao encaixar no grid de pixels (@3x) para a 2ª célula "não caber": o wrap quebra a linha, e as 4 células **empilham numa coluna só**, metade transbordando.

**Sintoma:** as células aparecem uma embaixo da outra, na metade esquerda; as de baixo são cortadas.

**Regra:** para grades de proporção fixa, **não dependa de `flexWrap`** — use linhas explícitas com `flex: 1`, que **dividem** o espaço em vez de testar se ele cabe:

```tsx
// ❌ folga zero — um sub-pixel e o wrap quebra a linha
<View style={{ width: W, flexDirection: 'row', flexWrap: 'wrap', gap }}>
  {cells.map(() => <View style={{ width: (W - gap) / 2, height: (H - gap) / 2 }} />)}
</View>

// ✅ o espaço é DIVIDIDO, não testado
{[0, 1].map(row => (
  <View style={{ flex: 1, flexDirection: 'row', marginTop: row ? gap : 0 }}>
    {[0, 1].map(col => <View style={{ flex: 1, marginLeft: col ? gap : 0 }} />)}
  </View>
))}
```

**Corolário — elemento flutuante sobre container de proporção travada:** num container 9:16 cuja **altura** é a restrição que manda, reservar altura no fluxo para um botão (ex.: o disparo da câmera) **encolhe a grade inteira** (349→296pt de largura). Um botão "flutuante" tem de ser `position: 'absolute'` de verdade — sem consumir altura.

Descoberto no grid da colagem (`app/(share)/share-capture.tsx`).

---

*Última atualização: Sessão 50 — Julho 2026 — **Polimento dos adesivos + bug de layout do preview.** Continuação da Sessão 49, com três decisões novas. **(1) Anel + marca do círculo seguem a MANCHETE** (`stickerColor` no `NiksSticker`): sem score, o adesivo de métrica isolada pinta o anel na cor da 1ª métrica — Oleosidade 42 amarela → **anel amarelo**, não mais o rosa fixo do score. **(2) Métrica isolada virou réplica EXATA do adesivo de score** — número gigante u(52) (era u(30)) + rótulo **completo** ("Qualidade da pele", não "Qualidade") e em negrito; o split full-vs-short de rótulo mora no `NiksStickerView` (`!solo`). **(3) Bug de layout consertado:** a pílula "Trocar adesivo" + hint não estavam no orçamento vertical (`SUBCAP_BLOCK`), então a colagem 9:16 transbordava e **cobria o header** — agora descontados de `availH`. Detalhes nas seções duráveis; ver "Feature: Compartilhar Niks score".*

*Sessão 49 — Julho 2026 — **Bandeja de adesivos: cor por faixa do score + formato escolhível.** Três mudanças a pedido do usuário, em cima da bandeja da Sessão 46. **(1) Adesivo de métrica isolada para cada uma das 6** (número gigante, estilo do "Niks score") na aba Sugestões — antes só existiam Atratividade e Qualidade soltas; agora Juventude, Oleosidade, Acne e Linhas também. **(2) Cor do número da métrica no CÍRCULO passou do semáforo para a FAIXA DO SCORE** (`metricScoreColor` em `lib/metricColor.ts`, via `getScoreTheme`): Atratividade 77 sai rosa igual ao score 84; métricas negativas (oleosidade/acne/linhas) são INVERTIDAS (`100−v`) para manter "rosa = bom". ⚠️ **O card NÃO mudou** — segue réplica da home (número preto + barra no semáforo `metricColor`). Decisão: unificar os dois seria errado. **(3) Formato círculo/card escolhível na aba "Montar o meu"** (`StickerSpec.shape`): o usuário força a forma, dentro do viável — **círculo até `CIRCLE_MAX = 4` métricas** (o `NiksSticker` subiu de 3 → 4, com fontes densas em 4 via flag `dense`), **card com ≥1 métrica** (ex.: 2 métricas em card). `feasibleShapes` diz quais oferecer; `normalizeSpec` derruba forma impossível após poda; `specId` passou a incluir a forma resolvida (círculo e card das mesmas métricas são adesivos distintos → o efeito de troca de `share-preview` re-clampa certo); `cardLayout` ganhou o caso de 1 coluna (1 métrica); `stickerBaseFraction` do card deriva a largura da proporção para a altura não estourar a colagem. ⚠️ **Verificar no device:** círculo com 4 métricas (score+4 é o mais denso) e card com poucas métricas. Ver "Feature: Compartilhar Niks score".*

*Sessão 48 — Julho 2026 — **O food scan voltou a ter entrada de UI — pelo NIKS Chat.** Desde que o `ScanModal` foi aposentado (Sessão 44), a Análise de Refeição existia (`food-camera` → `food-report`) mas **não havia como a usuária chegar até ela** pela interface — o botão "Escanear refeição" do modal era a última porta e foi embora. Agora o **2º card de sugestão do NIKS Chat** — antes "Esse produto vai funcionar pra mim?" — virou **"Analisar o impacto da minha refeição na minha pele"** (novo ícone `meal` de talheres em `SUGGESTION_ICONS`) e, ao ser tocado, **navega DIRETO para `/(scan)/food-camera`** em vez de disparar uma resposta de chat: o item ganhou `action: 'foodScan'` e o `.map` dos cards curto-circuita `handleSuggestionPress` para esse caso (`router.push`). O resto do fluxo já existia pronto — a câmera salva a foto no store (`setFoodImage`) e empurra para `food-report`, que tem o loading (`analyze-food`) e os resultados embutidos. Removida a resposta pré-definida do card de produto em `PREDEFINED_RESPONSES`, que ficou órfã (o ícone `product`, não). ⚠️ **Diferente do scan de rosto e de produto, `food-camera` NÃO monta o `useScanConsentGate`** — a refeição chega na câmera **sem o consentimento de IA**. Foi decisão de ir direto ("cair direto na câmera"); se a paridade com os outros scans for desejada, é só adicionar o `consentGate` lá. Ver "Tela NIKS Chat", "Fluxo de comida" e o parágrafo de entradas de scan.*

*Sessão 48 — Julho 2026 — **Scan de pele do app passou de 1 para 6 fotos.** Nova tela `app/(scan)/camera-multi.tsx` (só DENTRO do app; onboarding segue com 1 foto em `camera.tsx`): a usuária tira 6 fotos (neutra, sorrindo, surpresa, brava, perfil esq., perfil dir.), com pilha de miniaturas + badge no canto inferior esquerdo e tela de revisão com retake. As 6 são obrigatórias; ao completar, monta 2 colagens (novo componente único `components/scan/ScanCollage.tsx`, mesmo padrão do `Collage` do compartilhamento) e navega sozinha. **A decisão de engenharia não óbvia — a IA recebe 3 imagens, não 2:** a API de visão reduz tudo para ~768px no lado menor antes de tokenizar, então cada rosto de uma colagem 2×2 cairia a ~384px (metade do detalhe de hoje) — por isso o payload é `[neutra_alta, layoutA, layoutB]`, com a neutra sozinha recuperando a resolução dos achados finos. **A análise de pele virou DUAS Edge Functions** (decisão do usuário, tomada logo depois): `analyze-skin` voltou a ser só o onboarding (1 foto, prompt byte-a-byte idêntico ao de antes da feature) e `analyze-skin-app` é uma **cópia integral** com a lógica multi-foto (`imagesBase64: [neutra, layoutA, layoutB]` + `scanLayout:'expressions_v1'`) — separadas para a análise do app poder ficar mais pesada/cara (e um dia usar modelo melhor) **sem risco de regredir o funil do onboarding**. Mesmo schema de saída nas duas (alimentam a mesma UI). Store: `skinCollagesBase64` + setter atômico `setSkinScanImages` (nunca persistidos). **Sem `mirror`** de propósito (espelhar inverteria esquerda/direita nos achados clínicos). Validado por `curl` contra as duas funções em produção (onboarding 1 foto ok; no multi a IA citou a colagem de perfis e aplicou a regra de procedência) — **a TELA em si ainda não foi vista rodando no device** (risco: `captureRef` de view offscreen sair em branco). Ver "Scan de pele multi-foto (13b)".*

*Sessão 47 — Julho 2026 — **A prep do scan virou tutorial de 4 passos, mostrado uma vez só.** A tela única de dicas de `scan-prep-app.tsx` (5 dicas em lista, dentro do app) virou um **carrossel de 4 passos** — um conselho por slide, com foto e bolinhas de progresso —, reaproveitando o padrão de `FlatList` paginado de `app/index.tsx` retintado com os tokens do design novo (Nunito, branco, rosa `#FF9D9D`). Copy alinhada com o usuário: (1) lugar com boa iluminação natural — **sem** mandar ficar de frente pra janela, que estoura o rosto no contraluz e falseia a análise; (2) mesmo lugar e horário, de preferência parede branca; (3) tirar acessórios; (4) rosto limpo + cabelo preso. **A grande mudança de comportamento:** o tutorial é **uma-vez-só na vida** — novo flag `scanTutorialSeen` no store (**dentro do `partialize`**, ao contrário de `stickerSheetSeen`), gravado ao concluir; a partir daí o `useFaceScan` **pula a tela e leva o botão "Escanear" direto à `camera-multi`**. ⚠️ **Só é gravado se a pessoa CHEGAR ao último slide e tocar "Abrir câmera"** — sair pelo "X" no meio não conta como visto (decisão explícita). ⚠️ **Testar de novo exige reinstalar o app** (o flag é permanente, igual ao consentimento de IA). **Mídia:** os 4 slides hoje usam a MESMA foto (`assets/scan-tutorial/pessoa-scan.png`, gerada por IA, referenciada 4× para não pesar o bundle); `expo-image` anima `.gif` nativamente se um dia virarem GIFs — o "como trocar" está comentado no topo do próprio arquivo. `scan-prep.tsx` (onboarding, design antigo) **intocado**. Ver "Fluxo de scan facial", "Duas telas de preparação de scan" e "CACHE DE DADOS".*

*Sessão 46 — Julho 2026 — **Bandeja de adesivos no compartilhamento (estilo figurinhas do Instagram).** Antes só existia UM adesivo possível: `share-preview` passava `metrics={[]} showScore` **hardcoded** em dois lugares e a consulta lia o `skin_score` **descartando `full_result.metricas`** — as 6 métricas nunca chegavam ao adesivo. Agora, ao chegar em `share-preview`, sobe uma bandeja (uma vez por sessão; depois pela pílula "Trocar adesivo") com **duas abas**: "Sugestões" (14 presets desenhados com os números REAIS dela) e "Montar o meu" (7 chips → todas as **128** combinações de score + 6 métricas). **Um adesivo por vez** — escolher substitui. **(1) Segunda forma de adesivo:** o círculo só comporta 3 métricas, então nasceu `NiksStickerCard` (réplica do card de métricas da home + marca NIKS) para 4–6 — incluindo os dois pedidos pelo usuário, **card completo COM e SEM o Niks score**, que são só `{showScore: true|false, keys: [as 6]}` (**não existe campo `variant`**). `stickerShape()` em `lib/stickerSpec.ts` é a regra única, e `NiksStickerView` o despachante — nenhuma tela importa os adesivos direto. **(2) A regra de forma mora num lib PURO** porque o `clampPose` roda em worklet e precisa da proporção antes de qualquer render; por isso `lib/stickerCardLayout.ts` é determinístico e o card usa altura **imposta**, nunca auto-height. **(3) `pose.nSize` → `pose.nW`:** renomeado de propósito para forçar revisitar os call sites — o nome antigo assumia adesivo quadrado, e o card é retangular; o clamp agora prende os dois eixos separadamente. **(4) Troca de adesivo reseta a escala para 1** (preservando a posição): um card 312×268 herdando escala 1.9 de um círculo estouraria a colagem. **(5) `normalizeSpec` não é opcional** — chave sem dado faria o container reservar uma altura e o card desenhar outra, e o export sairia diferente do preview. **(6) `METRIC_DEFS` saiu da `home.tsx`** para `lib/metricDefs.ts` (+ campo `short` para o círculo, que reticencia rótulos longos) — a home ficou visualmente idêntica. **(7) Store:** `stickerSpec` + `stickerSheetSeen`, **os dois FORA do `partialize`** — é essa exclusão que implementa "sobe sozinha só na primeira vez da sessão", sem flag em AsyncStorage. **(8) Armadilhas:** sem RNGH dentro do `<Modal>` (no Android é outra janela → bandeja sem arrastar-para-fechar); miniaturas por `transform: scale` a partir da largura canônica, não `size` pequeno; o gatilho da bandeja é a pílula, **nunca o adesivo** (já é alvo de pan+pinch). ⚠️ **A feature continua com os 3 pontos PENDENTES de validação no device** — e esta mudança amplia a área de risco. Ver "Feature: Compartilhar Niks score".*

*Sessão 45 — Julho 2026 — **Compartilhar saiu do link e virou o card de métricas.** O link "Compartilhar" (texto Nunito Bold 14 + ícone `Share` do lucide) que ficava embaixo do card de métricas **foi REMOVIDO a pedido do usuário**; agora **tocar no card de métricas** é que abre `/(share)/share-capture`. **Não reintroduzir o link.** Continua valendo a condição antiga: só dispara com scan feito (`disabled={skinScore == null}` — antes era a condição de render do link). **Montagem:** um `TouchableOpacity` envolve o card **POR FORA** e carrega só a posição (novo style `metricsCardTouch` = `marginHorizontal: 12` + `zIndex: 2`, com o `marginTop: -CARD_OVERLAP` inline); o `metricsCard` ficou só com o visual (fundo/borda/radius/`overflow:'hidden'`). ⚠️ **Envolver por fora não é preferência de estilo, é necessidade** — o card tem `overflow: 'hidden'`, que já causou problema de toque no New Architecture neste projeto (mesma razão do `TouchableOpacity` da foto, Sessão 42); e como o wrapper não introduz filho em fluxo normal, **a grade absoluta do node 1:63 não se move**. Removidos junto: os styles `shareLink`/`shareLinkText`, o import `Share as ShareIcon` e a constante `S` (`width/393`), que ficou órfã — só o link a usava. ⚠️ **Discoverability:** o card não tem nenhuma affordance visual de que é tocável (era o link que anunciava a ação); se virar problema, o caminho seguro é um ícone `Share` **absoluto** no canto do card, nunca um filho em fluxo. Ver "Tela Home → item 5" e "Feature: Compartilhar Niks score → Entrada".*

*Sessão 44 — Julho 2026 — **ScanModal aposentado, consentimento movido para a câmera, galeria só em dev, e o 2º bug do login.** **(1) O bottom sheet de escolha de tipo de scan SAIU do fluxo.** O botão "Escanear" da home vai **direto** para `scan-prep-app` via o novo **`hooks/useFaceScan.tsx`** (`startFaceScan()`); o scan de produto ficou **só** na tela de Recomendação de Produtos. `scanModalOpen`/`setScanModalOpen` saíram do store e o `ScanModal` saiu do `(app)/_layout.tsx` — ⚠️ **o README mandava usar `setScanModalOpen(true)` em ~12 pontos, todos corrigidos**; o arquivo `ScanModal.tsx` continua no repo sem consumidores, caso o modal volte. O CTA "Escanear minha pele" do estado vazio da Rotina foi junto (o rótulo já prometia rosto). **(2) O consentimento de IA (LGPD) migrou para as TELAS DE CÂMERA** — novo **`hooks/useScanConsentGate.tsx`**, recusar chama `router.back()`. Antes ele era pedido *antes de navegar*, espalhado por 3 lugares (`ScanModal` + as 2 telas de preparação); com o modal fora, o scan de **produto** teria ficado **sem consentimento nenhum**. A câmera é o único ponto por onde toda foto passa, então caminhos novos herdam o portão de graça. ⚠️ **Testar exige reinstalar o app** (o aceite é permanente em AsyncStorage). **(3) O botão de galeria da câmera de PELE agora só existe em `__DEV__`** — em produção a análise exige foto tirada na hora; em dev é o único jeito de fornecer foto no simulador. Some sozinho no build de release: **nada a reverter antes de subir**. Produto e comida mantêm a galeria de propósito. **(4) 2º bug do login — MESMO sintoma, causa diferente.** Depois de corrigida a race do RevenueCat (Sessão anterior), logar numa conta existente **continuava** caindo na tela de criar conta — mas só em dev: o bypass `__DEV__` do `paywall-soft` fazia `replace('/signup')` **sem consultar a sessão**, e o `return` acontecia antes da lógica correta que já existia em `handleAfterPaywall()`. **Regra nova: todo atalho de `__DEV__` que navega precisa respeitar o mesmo estado que o caminho de produção** — senão é um fluxo paralelo que só você vê e que mascara bugs. ⚠️ **Ao diagnosticar "caí na tela errada após o login", cheque em qual build você está**: em release é o RevenueCat (`login.tsx`), em dev é o bypass (`paywall-soft.tsx`). Ver seções 14, "Fluxo de scan facial", "Guard de assinatura" e "ScanModal (APOSENTADO)".*

*Sessão 43 — Julho 2026 — **Cache de dados + haptics em todo botão.** Duas features de base, nenhuma visual. **(1) As telas pararam de "recarregar".** Causa: as 5 telas de `(app)` vivem num `Tabs` (montam uma vez, nunca desmontam), mas os `useFocusEffect` refaziam TODAS as consultas a cada troca de aba, sem guarda — home 4–5 round-trips por entrada, chat rebaixando a conversa inteira, perfil 2, rotina 2. Novo **`lib/cache.ts`** (`useCachedQuery`) implementa **stale-while-revalidate**: memória (render síncrono, sem piscar) + AsyncStorage (sobrevive a fechar o app); dado fresco → **zero rede**; dado velho → tela aparece com a versão antiga e revalida em silêncio, sem estado de loading. Falha de rede com dado em tela é invisível; sem dado vira `'error'`. Requisições com a mesma chave são deduplicadas. **(2) `persist` no store Zustand** — era 100% memória, por isso o cache da Rotina **nunca funcionava** depois de um restart. ⚠️ O `partialize` é **lista branca deliberada** (só `skinScore` e `protocolResult`): `subscriptionVerified` e `niksChatMode` PRECISAM resetar no cold start, e base64 de foto estoura o AsyncStorage. **(3) ⚠️ REGRA NOVA — escreveu no banco, invalide o cache** (`invalidateCache`): já coberto em novo scan, troca de foto da home, mudança de nome e mensagem nova no chat; **logout limpa tudo** (`clearAllCache` + `persist.clearStorage` + `resetUserId`), senão a próxima conta abriria vendo o score e a rotina da anterior. **(4) Novo `lib/currentUser.ts`** — `supabase.auth.getUser()` **é ida à rede** e estava no começo de quase todo bloco de fetch; `getUserId()` lê a sessão local. **(5) NÃO cachear** URL assinada do Storage (expira em 1h — a aba "Escaneados" segue sem cache de propósito) nem base64. **(6) Haptics em todo elemento clicável** — **161 chamadas em 46 arquivos**, via novo **`lib/haptics.ts`**. A API é por **significado, não intensidade** (`tap` 87× / `action` 47× / `select` 22× / `success` / `warning` / `error`), para a escala do app inteiro poder ser reajustada num arquivo só. Migrou também os 34 haptics antigos, que estavam copiados inline em 20 telas **todos com `Light`** — o "Continuar" tinha a mesma sensação de um link. ⚠️ `disabled` do RN já bloqueia o `onPress`, então o haptic dentro dele respeita o disabled de graça — **exceto** em botões com só `opacity` visual (o voltar do ritual precisou de guarda). ⚠️ Não pôr haptic em função que também roda em `useEffect` (o `analyzeFood` do food-report faria o aparelho vibrar sozinho ao abrir a tela). ⚠️ **Haptic não funciona no simulador, só em iPhone físico.** Ver as novas seções "HAPTICS" e "CACHE DE DADOS".*

*Sessão 42 — Julho 2026 — **Foto da home escolhida pela galeria.** A usuária agora **toca na própria foto circular da home** → galeria → tela de ajuste → aquela vira a foto de perfil dela. **(1) A REGRA CENTRAL — precedência absoluta:** depois da primeira escolha, **novos scans NUNCA MAIS trocam a foto da home** (score e as 6 métricas continuam atualizando normalmente; só a foto congela). A única forma de trocar é escolher outra da galeria — **não existe caminho de volta pra foto do scan**, foi decisão explícita do usuário; não adicionar botão de resetar. Cabe numa linha (`userRow?.foto_home_url ?? data?.foto_url ?? null`) porque `foto_url` é lido **só na home** — `results`/`skin-result`/histórico seguem mostrando a foto do scan, que lá é evidência da análise. **(2) Persistência: nova coluna `users.foto_home_url`** (migration `20260718120000`), **não** AsyncStorage — o store do app é puramente em memória, e a escolha precisa sobreviver a reinstalar/trocar de celular. *(⚠️ **superado na Sessão 43**: o store ganhou `persist`. A decisão de gravar no banco continua CERTA — nenhum cache local sobrevive a trocar de celular —, mas a justificativa "o store é em memória" não vale mais.)* **(3) Nova tela `app/(foto)/ajustar-foto.tsx`** em **grupo próprio** (não `(app)`, senão a `GlobalBottomBar` absoluta cobriria a tela): é um **mini-espelho da home** (mesmo gradiente, mesmo bloco de score, círculo no diâmetro EXATO `width·0.58` + o mesmo anel), com pan+pinch no padrão de `share-preview.tsx`. ⚠️ **`allowsEditing: false`** no picker de propósito — o "Move and scale" nativo do iOS recorta **quadrado** e não mostra o formato circular real, que é justamente o ponto da tela. `MIN_SCALE = 1` porque a escala base (`max(D/iw, D/ih)`) já **cobre** o círculo → nunca aparece buraco. **(4) Matemática do recorte:** RN compõe `transform: [translateX, translateY, scale]` como `M = translate · scale`, então a translação está em **pontos de tela não escalados** → `eff = base·scale`, `size = D/eff`, `originX = iw/2 − (D/2 + tx)/eff`. **Não reordenar o array de transform** sem refazer a conta. A saída é um JPEG **quadrado** de 1080 — cai direto no `resizeMode="cover"` que a home já tinha, então **a home não sabe que a tela existe**. **(5) `uploadScanPhoto` (store) virou EXPORTADO** e ganhou um 3º parâmetro `prefix` (default `''`, preserva o caminho histórico) — ⚠️ esse helper já estava copiado inline em 3 lugares; **não fazer a 4ª cópia**. **(6) Alvo de toque:** o `TouchableOpacity` envolve o View **por fora** (o `photoCircle` tem `overflow:'hidden'`, que já deu problema de toque no New Arch), e o card de métricas cobre os 40px de baixo da foto — essa faixa não recebe toque, **é esperado, não mexer no zIndex**. Ver "Feature: Foto da home escolhida pela galeria" e "Tela Home → item 3".*

*Sessão 41 — Julho 2026 — **Ícone do app + nome do app.** **(1) Nome: "NIKS AI" → `NIKS`** (o que aparece sob o ícone) — vive em **3 arquivos**: `app.json` (`expo.name`), `Info.plist` (`CFBundleDisplayName`), `strings.xml` (`app_name`). O `PRODUCT_NAME` do Xcode continua `NIKSAI` de propósito. ⚠️ **Motivo NOVO e grave para nunca rodar `expo prebuild --clean`:** com `name: "NIKS"`, o `--clean` regeneraria a pasta nativa como `ios/NIKS/` (não `ios/NIKSAI/`) e quebraria caminhos, `PRODUCT_NAME`, Podfile e pbxproj de uma vez — **soma-se** ao motivo já conhecido (apaga a capability In-App Purchase). **(2) Ícone novo: `assets/icon-niks.png`** — 1024×1024 RGB **opaco** (a Apple rejeita alpha); é a **logo INVERTIDA** (flor branca sobre fundo rosa `#FF9D9D`, 70% do canvas). O `assets/icon.png` antigo **não foi sobrescrito** (dá pra reverter). Como `ios/` já existe, o `app.json` **não propaga sozinho** → o PNG nativo (`AppIcon.appiconset/App-Icon-1024x1024@1x.png`, arquivo único de 1024) foi trocado à mão. **(3) A logo é VETOR no Figma** (nodes `101:97` = bloom base/`niks-logo.png`; `101:386` = rosa/`score-logo-pink.png`) — **usar o vetor para qualquer asset acima de ~200px**: ampliar o PNG de 196px serrilha a borda (visível na rosa, escondido na clara só por ela ser pálida). ⚠️ **GOTCHA CRÍTICO: o SVG da logo exige um fundo por trás** — uma elipse usa `mix-blend-mode: overlay`, e rasterizar sem backdrop quebra o blend (blob vermelho espúrio + densidade errada), o que leva à **conclusão errada de que o vetor do Figma é outra logo**. Esse erro foi cometido 2×. **(4) Correção do próprio README: os node IDs `1:*` do arquivo "Novo design app NIKS" estão MORTOS** (`1:8` retorna "not found") — o arquivo foi renumerado para `101:*`/`128:*`/`136:*`. Ver "SPLASH SCREEN + ÍCONE + NOME DO APP" e "Figma DESIGN → Vetor da logo".*

*Sessão 40 — Julho 2026 — **Card "Dica do dia" substitui o card de skincare na home.** **(1) O card de rotina SAIU da home por completo** (título por horário, contagem de passos/minutos, lista de passos e a leitura do progresso da cerimônia) — era redundante com a aba Rotina inteira na navbar. A home **não lê mais a tabela `protocolos`**. A Rotina e a cerimônia seguem **intactas** em `protocolo.tsx`; **`lib/routineProgress.ts` foi MANTIDO** (a cerimônia usa `markStepCompleted`) — só o uso na home saiu, e os demais exports ficaram sem chamador. **(2) Novo card "Dica do dia"** na mesma casca visual (depois engordado: padding 12, chip 68, radius 18, título 17px — mesma `marginHorizontal` do card de métricas). Colapsado: "Dica do Dia" + título (o gancho). Expandido, **anatomia fixa de 3 seções tituladas**: INGREDIENTES (bullets) + PREPARO (**numerado**) + **POR QUE FAZER** (aparece em TODA dica, receita ou não). **(3) Catálogo `lib/dicas/catalogo.ts`** (26 dicas, conteúdo aprovado — **consumir, não editar**): ⚠️ a **ordem do array É a fila** e foi curada à mão (não reordenar/filtrar/personalizar; não indexar pelo campo `ordem`); ⚠️ o campo **`fonte` NUNCA é renderizado**; o `eyebrow` é uniforme (`'DICA DO DIA'`) e hoje **não é lido** — a frase "Dica do Dia" é escrita no card (nenhum `textTransform` produz essa caixa). **(4) Mecânica `lib/dicas/dicaDoDia.ts`** (AsyncStorage): a fila anda por **dia de USO, não de calendário** (quem some uma semana volta na dica seguinte), e o índice **só cresce** — o módulo do catálogo é aplicado só na exibição (`dicaAt`), para o catálogo poder crescer sem prender quem já deu a volta. Nunca dá card vazio (falha de leitura → dica 1). Ver "Feature: Dica do dia" e "Tela Home → item 6".*

*Sessão 39 — Julho 2026 — **Feature "Compartilhar Niks score" (colagem + adesivo → Story 1080×1920).** **(1) Deps nativas:** `react-native-view-shot` **4.0.3** (✅ **New Architecture** — é TurboModule de verdade; o codegen do `pod install` gera `rnviewshotJSI.h`. **Não** foi preciso o plano B com Skia), `expo-sharing`, e o `expo-media-library` — que **já estava no package.json há tempo, mas sem config plugin e sem nenhum import** — agora ligado, com a permissão em PT. Build confirmado no device físico. **(2) Novo grupo `app/(share)/`:** `share-capture` (colagem de 1–4 fotos: UMA `CameraView` reposicionada, galeria por célula, refazer, downscale p/ 1080px) → `share-preview` (adesivo arrastável/pinçável + export + share/galeria). **(3) `components/NiksSticker.tsx`** — adesivo circular PURO; marca (logo + "NIKS") obrigatória. **(4) `lib/metricColor.ts`** — semáforo das métricas **EXTRAÍDO da `home.tsx`** (fonte única: a mesma métrica tem de ter a mesma cor na home e no Story). **(5) Store:** `collagePhotos`. **(6) Home:** botão "Compartilhar meu Niks score" (novo item 5 — **irmão** do card de métricas, nunca dentro dele). **(7) 4 decisões técnicas novas — 26** (mover uma `CameraView` NÃO reinicia a sessão; desmontar sim → use `active={false}`), **27** (`mirror` espelha só a FOTO de saída; o preview frontal já é espelhado pelo iOS), **28** (`captureRef` interpreta `width`/`height` em **PONTOS**, não pixels → a saída é `size × escalaDaTela`; para 1080×1920 use `EXPORT_W = 1080/PixelRatio.get()` e capture **sem** width/height), **29** (`flexWrap` com folga zero quebra a linha no Fabric). **(8) Correção de uma instrução ERRADA do próprio README:** use `expo prebuild` **SEM** `--clean` — o `--clean` regenera o `ios/` e apaga a capability **In-App Purchase** (não expressável no `app.json`), quebrando o RevenueCat em produção. ⚠️ **A feature tem 3 pontos PENDENTES de validação no device** (espelhamento da foto, arquivo exportado, `share-preview` inteira) — ver "Feature: Compartilhar Niks score".*

*Sessão 38 — Julho 2026 — **Score de compatibilidade + nova tela de resultado de produto.** **(1) Novo campo `compatibilidade` (0–100) na Edge Function `analisar-produto`** — é a expressão NUMÉRICA do `veredito` (Camada 1: o produto serve pra pele dela?) e SEMPRE cai na faixa dele (evitaria 0–35 · com_ressalva 40–70 · pode_usar 75–100); ⚠️ **não é voto na Camada 2** — compatibilidade alta + `manter_rotina` é combinação correta. Persistido sozinho no `product_scans.resultado` (jsonb) — **sem migration, sem backfill**; scans antigos não têm o campo → a tela mostra `—`, nunca "NaN%". **(2) Campo `resultado_esperado_geral` REMOVIDO** (redundante com o `o_que_faz`, que agora cobre o Momento 1 inteiro em 2–3 frases); scans antigos mantêm o campo no jsonb, a tela ignora. **(3) Tela de resultado do produto refeita** = réplica do Figma node **136:126** (sparkle + `compatibilidade` como número grande + "Compatibilidade de pele" + foto no anel + cards), com a **MESMA lógica de cor por faixa da home** (`getScoreTheme`) — só que a métrica é a compatibilidade, não o skin score. Título/ícone/chips dos cards e o card de destaque da rotina **também** seguem a cor do tema (a tela inteira fica numa cor só); o CTA de escanear segue rosa constante. **(4) Bug corrigido: o histórico mostrava o design antigo** — o modal da aba "Escaneados" era uma CÓPIA do layout. O layout virou **`components/product/ProductAnalysis.tsx`** (fonte única), usado pelo `product-result.tsx` e pelo modal. **Nunca duplicar esse layout de novo.** Ver "Feature: Escanear Produto", "Edge Functions → analisar-produto" e `lib/scoreTheme.ts` na árvore de arquivos.*

*Sessão 37 — Julho 2026 — **Recomendação real na home/protocolo, navbar corrigida e splash nova.** **(1) `recomendacao-produtos` ligada aos dados reais** (`recomendacoes_produtos`→`produtos` num único `.in()`; chips via novo **`lib/concernLabels.ts`**; fotos via `expo-image`; estados loading/empty/error). **(2) Home "Para você"** agora mostra os **2 primeiros produtos recomendados** (reais) e ao tocar abre o **detalhe do produto** (deep-link via novo store `productDetailTarget`). **(3) Protocolo:** link "Ver produto recomendado" no "Como fazer" → tela de produtos. **(4) Navbar:** a logo central passou a **seguir a cor do Niks score TAMBÉM no modo noturno** (bug: antes travava no vermelho `niks-logo-dark.png`, asset removido). **(5) ScanModal:** "Escanear refeição" → **"Escanear produto"** (ícone SVG custom moldura+frasco, → `product-camera`); "Escanear rosto" → nova **`scan-prep-app.tsx`** (versão in-app do scan-prep no design novo; onboarding `scan-prep.tsx` intacto). ⚠️ scan de comida ficou sem entrada de UI. **(6) Splash nova:** fundo branco + logo `niks-logo.png` rosa `#FF9D9D` (`assets/splash-niks.png`); ver nova seção "SPLASH SCREEN + GOTCHAS NATIVOS" (o `ios/` é gitignorado/regenerável; `expo run:ios` não re-roda prebuild se `ios/` existe; **não apagar `ios/build`** = codegen; limpar cache de launch do simulador). Ver "Tela Home", "Tela Recomendação de Produtos", "Tab Bar / Navbar", "ScanModal".*

*Sessão 36 — Julho 2026 — **Feature "Escanear Produto" (ponta a ponta).** Backend: Edge Function **`analisar-produto`** (visão `gpt-5.4-mini`, JWT verificado localmente, veredito estruturado — ⚠️ `veredito` e `decisao_rotina.tipo` são eixos INDEPENDENTES, `veredito` nunca é `manter_rotina`), tabela **`product_scans`** + bucket privado **`product-scans`** (migrations `20260710120000` tabela+bucket e `20260710130000` policy de SELECT em `storage.objects` — necessária p/ o app assinar a URL da foto client-side). App: telas em `app/(scan)/` **`product-camera`** (réplica da câmera de comida) → **`product-loading`** (tela de loading padrão do app, copy de produto) → **`product-result`** (foto que a usuária tirou em cima + análise embaixo; títulos de seção rosa negrito, veredito preto negrito). Nova aba **"Escaneados"** em `recomendacao-produtos` (histórico de `product_scans`, foto via URL assinada, mesmo visual dos cards + modal de detalhe). **"Salvar na minha rotina"** guarda a foto do produto (`lib/savedProducts.ts`, AsyncStorage por nome-de-passo) e a **foto substitui o ícone do passo** na Rotina (`protocolo.tsx`, `cover`). Store: `productImageBase64`/`productImageMimeType`/`productScanResult`. Ver "Feature: Escanear Produto", "Edge Functions" e "SUPABASE".*
*Sessão 35 — Julho 2026 — **(1) Feature "Recomendação de produtos reais"** (backend): tabela `recomendacoes_produtos` + Edge Function `recomendar-produtos` (gera 1×/1º scan, auto-guardada; `classifyStep` portado; gate de ingrediente nos séruns; corte de alérgeno; camada de IA) disparada por `lib/generateProtocol.ts` — ver Edge Functions/Tabelas. **(2) Tela `recomendacao-produtos.tsx` REFORMADA** para a identidade do app (cards brancos `#E3E3E6`+sombra; saíram chips/grid/botão-scan/tints); título "Produtos"+logo rosa (réplica do Figma node 92:19), seções "Pela manhã"/"À noite", tap→detalhe, alternativas clicáveis; dados ainda MOCK. **(3) COR PRIMÁRIA → rosa da Rotina `#FF9D9D`** (substituiu o vermelho `#FF6661→#C02225`/coral) em: Escanear (home), navbar ativo+badge, modal "Novo scan", chat (enviar, saudação, ícones, logos tintadas), "X passos" (home), tela de produtos. Ver "CORES OFICIAIS → cor primária" e "Tela Recomendação de Produtos". ⚠️ gotcha: `Pressable` style-função não aplica padding no Fabric (use `TouchableOpacity`); `Image tintColor` não repinta com fast-refresh (reload).*
*Sessão 34 — Julho 2026 — **Lógica de cor por faixa de Niks score na home + navbar** (0–25 vermelho · 26–50 laranja · 51–75 amarelo · 76–100 rosa): sparkle, número, traço, gradiente de fundo, **anel (asset REAL do elipse do Figma node 1:319, centro transparente)** e **logo central da navbar** mudam de cor; resolvedor em novo `lib/scoreTheme.ts` (compartilhado); `skinScore` no store. Sparkle do topo = 49px; logos com fundo transparente. **Rotina (`protocolo.tsx`):** título exibido → "Rotina de Skincare"; herói da **Manhã** = logo tintada `#FF9D9D` (não mais o sol; raios removidos), altura do herói condicional (Manhã s140 / Noite s200). **Botões de scan** (home + recomendação): afastados da navbar (`bottom 92→108`) e "Escanear produto" igualado ao "Escanear" da home (`s48`). Seta do botão enviar do chat → para cima. Ver "Tela Home", "Tab Bar / Navbar" e seção 6.*
*Sessão 33 — Julho 2026 — **`niks-chat.tsx` migrada para o novo design (Nunito, tema claro, sem modo noturno)**: fundo branco puro; hero e avatar da NIKS = a logo `niks-logo.png` (fundo removido → só as esferas vermelhas, transparente); estado `active` refeito como réplica do Figma node `1:393` (balão da NIKS branco+borda com avatar-logo, balão da usuária cinza `#F3EEEE`, foto radius 35, header "NIKS Chat"). `MiniOrb`/modo noturno/debug 5-toques/`NightSky` removidos da tela. Ver "Tela NIKS Chat" e a Exceção `niks-chat.tsx` nas REGRAS.*
*Sessão 32 — Julho 2026*
*Status: MVP — RevenueCat ✅; guard de assinatura completo (4 pontos de verificação + timeout 8s); gamificação do protocolo; avaliação nativa (expo-store-review); push notifications ✅; App Store ID: id6760590018. Schema `analyze-skin` expandido: `region_insights`, `goal_alignment`, `skin_strengths`, `action_recommendations`. `skin-result.tsx` com parallax (foto fixa, Animated.ScrollView, ring SVG + badges animados, card com borderRadius desliza por cima da foto). `home.tsx` reescrita com design Horizonte Reformulado: contexto temporal AM/PM/noite, HeroEditorial VAR 3, céu noturno animado, ritual card, FAB coral. Tab bar: labels atualizados para início/rotina/perfil; `ScanModal` redesenhado como ScanTypeSheet com prop `isDark`. Bug corrigido: `home.tsx` agora reseta `tabBarTheme` para `'light'` no blur do `useFocusEffect`. Decisão 20 adicionada: padrão de duas Views para shadow + overflow em React Native. `loading.tsx` redesenhada pixel-perfect (Q13 do design de referência): orb Skia com gradiente luminoso + inset shadow simulado + specular highlight, halo coral pulsante, shimmer PlayfairDisplay-Italic na palavra destacada (Decisões 22 e 23), ring progress e step opacities com animação fluida via Animated.Value intermediário. Bug de food scan duplicado corrigido (Decisão 25): `useRef` guard em `food-camera.tsx` e `food-report.tsx` previne inserts múltiplos no banco causados por double-tap ou double-mount do StrictMode. home + navbar redesenhadas como réplica ESTÁTICA do Figma "Novo design app NIKS" (supersede o "Horizonte Reformulado" citado acima) — home = Niks score/foto+anel/métricas 2×3/Cuidados diários/Para você/botão Escanear (dados hardcoded, falta ligar ao Supabase); navbar = 5 ícones reais do Figma, 80px, sem FAB; fontes Nunito/Exo2/Lato via `@expo-google-fonts`. Ver seções "Tela Home" e "Tab Bar / Navbar". tela de Rotina (`protocolo.tsx`) reescrita como réplica ESTÁTICA do design "Rotina de Beleza" (Nunito, temas Manhã/Noite com sol/lua, cards expansíveis inline; conteúdo hardcoded, dados reais pendentes). Removidos cerimônia/streak/gamificação/orb Skia. Ver seção 6. **Última mudança: home ligada aos dados reais** — Niks score (`skin_score`), 6 métricas visuais (`full_result.metricas`, cor por semáforo bom/ruim) e foto (anel recriado em código) vêm do último `skin_scans`; `analyze-skin` passou a retornar `metricas` (6 inteiros 0–100). As 6 métricas aparecem só na home. Ver "Tela Home". **Última mudança (Sessão 32): Rotina + card de skincare ligados aos dados reais e cerimônia re-portada.** `protocolo.tsx` deixou de ser estático: consome a rotina real (`protocolResult`/tabela `protocolos`) mapeada por `classifyStep`/`mapStep`, mostra a seção "Recomendações" (dicas via `parseCronograma`) e teve a **cerimônia (ritual) re-portada da produção** (DM Serif + orb Skia + celebração), aberta pelo "Iniciar rotina". O card da home ("Skincare matinal/noturno" por horário) usava a rotina real com o progresso sincronizado com a cerimônia via `lib/routineProgress.ts` — ⚠️ **esse card não existe mais na home** (virou "Dica do dia" na Sessão 40); a rotina e a cerimônia seguem intactas na aba Rotina. Header da Rotina (botão voltar) removido. Ver seções 6 e "Tela Home".*