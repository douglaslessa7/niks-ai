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

## REGRAS DE DESENVOLVIMENTO (NUNCA VIOLAR)

- **NativeWind (`className`)** para estilo — `StyleSheet.create()` só em último caso absoluto
  - **Exceção — telas de perguntas do onboarding (design system NIKS):** Todas as telas da jornada de perguntas (`birthday` até `social-proof`, incluindo `skincare-routine`, `allergies`, `goal-desire`, `scan-prep`, `loading`, `results`, `plan-preview`) usam **inline styles + tokens locais** — sem NativeWind, sem `Colors` constants. Tokens padrão definidos no topo de cada arquivo: `CREAM = '#FFFFFF'` (fundo branco, sem LinearGradient), `DEEP = '#1D3A44'`, `CORAL = '#FB7B6B'`, `CORAL_DEEP = '#E5654F'`, `DEEP_SOFT = 'rgba(29,58,68,0.55)'`, `DEEP_HAIR = 'rgba(29,58,68,0.10)'`. Estrutura padrão: **QHeader** (botão voltar 40×40 branco semitransparente + barra de progresso na mesma linha horizontal — `TOTAL = 14`, steps de 1 a 14: `birthday=1`, `gender/pregnancy=2`, `goal=3`, `goal-validation=4`, `concerns=5`, `skin-type=6`, `sun-exposure=7`, `hydration-sleep=8`, `skincare-routine/detail=9`, `allergies/detail=10`, `goal-desire=11`, `social-proof=12`, `rate-us=13`, `scan-prep=14`), **QTitleBlock** (eyebrow coral uppercase + título bold DEEP com destaque em Playfair Italic coral + subtítulo DEEP_SOFT), **OptionCards** (pill `borderRadius: 100`, borda CORAL + glow shadow quando selected), **PrimaryButton** (`height: 60`, `borderRadius: 100`, bg CORAL, shadow coral). Novas telas de pergunta do onboarding devem seguir esse sistema — não o `QuizLayout`, não `LinearGradient`, não `Colors`.
  - **Exceção — telas de auth e utilitárias:** `login` e `paywall-soft` ainda usam inline styles + `Colors` constants com `LinearGradient` rosa→branco. Manter esse padrão ao editar essas telas.
  - **Exceção — `signup`, `nome` e `notifications`:** essas três telas migraram para o **design system NIKS** (inline styles + tokens locais `DEEP/CORAL/CORAL_DEEP/DEEP_SOFT/CREAM`, fundo branco puro `#FFFFFF`, sem `LinearGradient`, sem `Colors` constants). Ao editar, seguir o mesmo padrão das telas de pergunta do onboarding.
  - **Exceção — tela `niks-chat.tsx`:** usa **inline styles + tokens do design system NIKS** (não `Colors` constants, não NativeWind). Os tokens são constantes locais definidas no topo do arquivo (`CORAL = '#FB7B6B'`, `INK = '#2B2724'`, `INK_SOFT`, `INK_WHISPER`, `INK_HAIR`, `SURFACE_HAIR`). Fonte serif `PlayfairDisplay-Regular` para o corpo das mensagens NIKS e `PlayfairDisplay-Italic` para spans em itálico inline. O design de referência pixel-perfect está em `design_handoff_chat_screen/` — os dois estados definitivos são `ChatEmptyScreen` (`source/chat-screens.jsx`) e `ChatActiveScreenV23` (`source/chat-screens-v2.jsx`). Não aplicar o padrão onboarding (sem LinearGradient rosa, sem `Colors`) nessa tela.
    - **Modo noturno (`isDark`):** a tela tem dois temas — claro (padrão) e noturno. `isDark` é derivado de `debugMode` (override de debug) ou `autoNight` (detectado por `isNightTime()` no `useFocusEffect`). O estado real é `autoNight: boolean` + `debugMode: 'am' | 'pm' | null`; `isDark` é a expressão derivada `debugMode !== null ? (debugMode === 'pm') : autoNight`. Em modo noturno: fundo `LinearGradient` escuro (`#0F1420→#1A1F2E→#2A1F28`) + `<NightSky />` de estrelas/meteoros, e todos os tokens de cor mudam (`ink`, `inkSoft`, `inkHair`, etc.). O `MiniOrb` também muda para a paleta lunar (bege-acinzentado em vez de coral) **e adiciona 5 crateras de lua**, cujas posições são definidas em coordenadas relativas a um orb de referência de 132px (copiadas do orb do Protocolo) e escaladas via `size / 132` para qualquer tamanho. `setTabBarTheme('dark')` é chamado via `useFocusEffect` (que tem `isDark` como dependência) para escurecer o tab bar — inclusive quando o debug alterna o tema.
    - **`ChatInputBar` é `position: 'absolute'`** (não in-flow) dentro de um `View style={{ flex: 1 }}` que vive dentro do `KeyboardAvoidingView`. Isso é obrigatório: a tab bar customizada de `_layout.tsx` também é absoluta e cobre qualquer input in-flow. O KAV ainda levanta o input corretamente quando o teclado abre porque o View pai encolhe. **Nunca mover o ChatInputBar para o fluxo normal.**
    - **Campo de texto do `ChatInputBar` é `multiline`** e cresce linha a linha até o máximo de 4 linhas (estilo WhatsApp) usando apenas `maxHeight`. Não tem `height` explícito — ver decisão técnica 17.
    - **Dois estados: `mode: 'empty' | 'active'`.** No estado `active`, renderizar o array `messages[]` carregado do banco (tabela `coach_messages`, via `coach_conversations` do dia). Cada item do array é `{ id, role, content, isStreaming?, imageUris?: string[] }`. Suporta até 5 fotos por mensagem. Regras de render: `role === 'user'` → `UserBubble` (+ um `UserPhotoBubble` por item em `imageUris`, se houver); `role === 'assistant' && content === '' && isStreaming` → `TypingDots`; `role === 'assistant' && content !== ''` → `NiksMessage`. **Nunca hardcodar mensagens de conversa** — o design prototype tinha mensagens ilustrativas que foram implementadas como definitivas por engano; esse erro já foi corrigido.
    - **Persistência de modo entre navegações:** `niksChatMode: 'empty' | 'active'` no `useAppStore` controla o que o `useFocusEffect` faz ao ganhar foco. Default `'empty'` → cold start (app fechado/reaberto) sempre mostra a tela inicial. App backgroundado preserva o valor em memória → conversa ativa é restaurada ao voltar. `sendMessage`, `handleSuggestionPress` e `loadConversation` chamam `setNiksChatMode('active')`; o botão voltar chama `setNiksChatMode('empty')`. Esse estado está no store (não em `useRef` local) precisamente para sobreviver ao ciclo de vida do componente sem ser resetado por remounts, mas ser descartado no cold start junto com todo o store in-memory.
    - **Botão voltar:** oculto no estado `empty`; no estado `active` volta para `empty` chamando `setNiksChatMode('empty')` no store e resetando `messages[]` — **não** chama `router.back()`.
    - **Botão de histórico (topo direito):** abre painel flutuante com as últimas 5 conversas do usuário (`coach_conversations` ordenadas por `created_at desc`). Cada item exibe o título (primeiros 80 chars da primeira mensagem do usuário) e o tempo relativo da última mensagem (`Xm`, `Xh`, `Xd`, `Xmm`). Ao tocar em um item, carrega as mensagens daquela conversa e entra em modo `active`.
- **Expo Router** para navegação — `useRouter()`, `router.push()`, `router.back()`
- **TypeScript** em tudo — nunca JavaScript puro
- **Nunca inventar cores** — usar sempre `constants/colors.ts`
- **NUNCA chamar APIs de IA diretamente no app** — sempre via Supabase Edge Function
- **SafeAreaView** em todas as telas — respeitar notch e home indicator do iPhone
- **Portrait only** — nunca landscape
- **Max width 393px** — iPhone 14 Pro
- **Store usa `useAppStore`** (de `store/onboarding.ts`) — não `useOnboardingStore`
- **Para abrir o modal de scan a partir de qualquer tela**, usar `setScanModalOpen(true)` do store — o `ScanModal` e o `GlobalBottomBar` (tab pill + FAB) são renderizados em `_layout.tsx` e se aplicam a todas as abas. **Exceção:** o botão "Escanear refeição" dentro do card `RefeicoesSection` em `home.tsx` navega **diretamente** para `/(scan)/food-camera` via `requestConsent(() => { setSelectedFoodResult(null); router.push('/(scan)/food-camera') })` — bypassa o `ScanModal` intencionalmente para não obrigar o usuário a escolher entre refeição e rosto quando o contexto já é claro.
- **Imagens viajam pelo Zustand** — nunca via `router.push` params (truncamento no bridge do RN)
- **`fetch` direto** para Edge Functions grandes — `supabase.functions.invoke` trunca payloads

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

---

## SISTEMA DE FONTES

Todas as fontes são arquivos `.ttf` locais em `assets/fonts/` — **não há pacotes `@expo-google-fonts/`** (o pacote `@expo-google-fonts/lato` está instalado mas não é usado; `latoFont` aponta para `PlayfairDisplay-Regular`).

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
| `displayFont` | PlayfairDisplay-Italic | Títulos grandes (54px), subtítulos em destaque, nomes de itálico em `home`, `protocolo`, `ScanModal` |
| `displayFontReg` | PlayfairDisplay-Regular | Texto serif normal: próximo passo do ritual, "Prognóstico", "Introdução gradual", botão "Começar minha rotina", score e data nos cards de scan, score de refeição |
| `latoFont` | PlayfairDisplay-Regular | Alias de `displayFontReg` — usado em `ScanCard`, `RefeicoesSection`, `RitualCard` |
| `cerimFont` | DMSerifDisplay-Italic | Tela de celebração da Cerimônia em `protocolo.tsx` |
| `cerimFontReg` | DMSerifDisplay-Regular | Tela de celebração da Cerimônia (texto normal) |
| `cerimSkiaFont` | DMSerifDisplay-Italic via `useFont` | Numeral dentro do Canvas Skia — ver Decisão Técnica 9 |

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

> ⚠️ **Parsing de `dicas[4]` em `protocolo.tsx`:** o campo `introduction_schedule` pode vir em vários formatos dependendo do que a IA gerar. O regex de parsing suporta: `"Semana 1:"` (semana única), `"Semanas 1-2:"` ou `"Semanas 1–2:"` (intervalo, hífen ou en-dash), `"Nas semanas 3–4,"` (prefixo "Nas" + vírgula), `"A partir da semana 5:"` ou `"A partir da semana 5,"` (aberto, dois-pontos ou vírgula). Regex: `/(?:(?:Nas\s+)?Semanas?\s+([\d][\d\-–—]*\+?(?:\s+em diante)?)|A partir da semana\s+(\d+))\s*[,:]/gi`. Se o regex encontrar menos de 2 ocorrências, o texto é exibido inteiro como bloco único com label "Introdução gradual". Não alterar o formato do prompt sem verificar compatibilidade com esse regex.

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
streak_days int4 DEFAULT 0,         -- dias consecutivos com AMBAS as rotinas (manhã + noite) concluídas
last_protocol_completed_at timestamptz  -- última vez que o streak foi incrementado (evita duplo incremento no mesmo dia)
```

**Colunas extras na tabela `skin_scans`:**
```sql
full_result jsonb  -- objeto ScanResult completo retornado pela analyze-skin
```

**Colunas extras na tabela `food_scans`:**
```sql
meal_name text, meal_score int4, meal_label text, meal_summary text, image_url text,
full_result jsonb  -- objeto FoodAnalysisResult completo retornado pela analyze-food
```

**Storage buckets:**
- `scans` — **PRIVADO** — fotos de scan facial. Policies de upload/leitura por `user_id`. Sempre usar `createSignedUrl` (não `getPublicUrl`).
- `coach-images` — **PRIVADO** — fotos enviadas no chat com a NIKS. Path: `{userId}/{timestamp}.jpg`. URL assinada com TTL de 1 ano gerada por `niks-chat`.
- `skin-previews` — **PÚBLICO** — previews geradas pela `generate-skin-preview`. Usar `getPublicUrl` (não `createSignedUrl`). Path: `preview_{timestamp}.jpg`.

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
| `analyze-skin` | ✅ | `{ imageBase64, skinProfile: { skin_type, concerns, genero, idade, sun_exposure, hydration, sleep, objetivo } }` | Schema clínico completo — ver tipo `ScanResult` no store. Campos-chave: `skin_score`, `skin_type_detected`, `headline`, `acne`, `envelhecimento`, `pigmentacao`, `cicatrizes`, `rosacea`, `textura_poros`, `barrier_status`, `qualidade_foto`, `confianca_analise`, `prioridade_clinica`, `contraindicacoes`, `pontos_fortes: string[2]`, `pontos_fracos: string[3]`, `skin_strengths[2]`, `action_recommendations[4]`, `region_insights[]` (apenas regiões com condição relevante), `goal_alignment` (apenas se `objetivo` informado), `disclaimer` |
| `analyze-food` | ✅ | `{ imageBase64, mimeType, skinProfile: { skin_type, concerns } }` | `{ meal_score, meal_summary, foods[], highlights, watch_out, science_note, disclaimer }` |
| `generate-protocol` | ✅ | `{ scanResult, onboardingData }` | `{ morning[], night[], introduction_warnings, expected_timeline, introduction_schedule }` — cada item de `morning`/`night` contém: `id, name, ingredient, instruction, steps: string[], color, waitTime, product_suggestions`. **Não retorna `schedule`** — dias da semana vêm embutidos no campo `ingredient` como sufixo `(Seg/Qua/Sex)` e são parseados no cliente via `applySchedule` em `protocolo.tsx`. |
| `send-notifications` | ✅ | `{ type: 'morning_routine' \| 'night_routine' \| 'food_reminder', user_ids?: string[] }` | `{ sent: number, type }` — busca `push_token` dos usuários no Supabase e envia via Expo Push API |
| `revenuecat-webhook` | ✅ | POST do RevenueCat — header `Authorization: Bearer REVENUECAT_WEBHOOK_SECRET` | Retorna sempre HTTP 200. Faz UPSERT em `subscriptions` (`onConflict: 'user_id'`) com base no `app_user_id` (= `user_id` do Supabase). Trata: `INITIAL_PURCHASE`, `RENEWAL`, `TRIAL_STARTED`, `TRIAL_CONVERTED`, `TRIAL_CANCELLED`, `CANCELLATION`, `EXPIRATION`, `UNCANCELLATION`. **3 guardas defensivas, nesta ordem, cada uma retornando `{ ok: true, skipped: true }` (200) sem tocar no banco — não remover:** (1) **tipo de evento fora da lista tratada** (ex.: `TRANSFER`, que tem estrutura diferente e não traz `app_user_id` na raiz) → evita `Missing event fields`; (2) **`app_user_id` anônimo (`$RCAnonymousID:`) ou não-UUID** (compras antes da identificação no app) → evita `invalid input syntax for type uuid`; (3) **`user_id` inexistente em `users`** (verificado via `.maybeSingle()` antes do upsert) → evita violação da FK `subscriptions_user_id_fkey` de usuários que nunca completaram o cadastro. O 200 em todos os casos impede retry do RevenueCat. **Requer `UNIQUE (user_id)` em `subscriptions`** (ver schema da tabela acima) — sem ele o upsert falha com `42P10`. |
| `niks-chat` | ✅ | Header `Authorization: Bearer <session_token>` (JWT do usuário autenticado — **não** a ANON_KEY). O token é obtido em `sendMessage` chamando **sempre** `supabase.auth.refreshSession()` antes do XHR — não `getSession()`. O `refreshSession()` garante um token fresco independentemente de clock skew ou race conditions internas do cliente Supabase. Se `refreshSession` falhar, usa `getSession()` como fallback. Body: `{ conversationId, message?, images?: Array<{base64: string, mimeType: string}>, clientMessageId? }` — `message` e `images` são ambos opcionais, mas pelo menos um deve estar presente. `userId` **não vai no body** — é extraído internamente via verificação local do JWT (`verifyJWT` com `crypto.subtle`, suportando HS256 via `NIKS_JWT_SECRET` e ES256/RS256 via `SUPABASE_JWKS`). | Stream `text/plain; charset=utf-8` — resposta da NIKS em tempo real. Pós-stream via `waitUntil`: salva resposta em `coach_messages`; depois bifurca — se havia sugestão pendente (`context.pendingSuggestion`), chama `checkApprovalIntent` (detecta "sim"/"não" na mensagem do usuário via OpenAI e aplica/rejeita a sugestão); caso contrário, extrai memórias em `coach_memories` e detecta nova proposta em `coach_protocol_suggestions`. |
| `approve-coach-protocol-change` | ✅ | Header `Authorization: Bearer <session_token>` (JWT do usuário). Body: `{ suggestion_id, approved: boolean }`. `user_id` **não vai no body** — extraído do JWT. | `{ success: true, action: 'rejected' \| 'applied', protocol? }` — aplica ou rejeita manualmente uma proposta pendente em `coach_protocol_suggestions`. Se `approved: true`, modifica `rotina_am`/`rotina_pm` em `protocolos` (add/remove/pause com base em `proposed_changes`) e marca `status: 'applied'`. |
| `generate-skin-preview` | ✅ | `{ image: string }` — base64 da foto do rosto (com ou sem prefixo `data:image/...`) | `{ preview_url: string }` — URL pública da preview no bucket `skin-previews`. Chama **OpenAI Images Edit API** (`gpt-image-2`) — única função do projeto que usa OpenAI (não Gemini). Faz upload do resultado em `skin-previews`. Requer secret `OPENAI_API_KEY`. |

**Configuração do webhook no RevenueCat Dashboard:**
- RevenueCat Dashboard → Project → Integrations → Webhooks
- URL: `https://utpljvwmeyeqwrfulbfr.supabase.co/functions/v1/revenuecat-webhook`
- Authorization header: `Bearer <valor do secret REVENUECAT_WEBHOOK_SECRET>`

**Modelos de IA:**
- `analyze-skin`: **`gpt-5.4-mini` (OpenAI)** — `response_format: json_object`, `max_completion_tokens: 4096`, retry em HTTP 500/503
- `analyze-food`: `gemini-2.5-pro` (mais preciso para tarefas complexas)
- `generate-protocol`: **`gpt-4.1-mini` (OpenAI)** — `response_format: json_object`, `max_completion_tokens: 8192`, não usa streaming, retorna `text/plain; charset=utf-8` para compatibilidade com `response.text()` + `JSON.parse()` no cliente
- `niks-chat`: **`gpt-4.1-mini` (OpenAI)** — streaming principal + pós-stream via `waitUntil`: se havia sugestão pendente → 1 chamada não-streaming para `checkApprovalIntent`; caso contrário → 2 chamadas para `extractAndSave` + `checkForSuggestion`
- `generate-skin-preview`: **`gpt-image-2` via OpenAI Images Edit API**

Secret `GEMINI_API_KEY` configurado no Supabase Dashboard (Project Settings → Edge Functions → Secrets).

**Secrets necessários no Supabase Dashboard (Project Settings → Edge Functions → Secrets):**
- `GEMINI_API_KEY` — usado por `analyze-food`
- `OPENAI_API_KEY` — usado por `analyze-skin`, `generate-protocol`, `niks-chat` e `generate-skin-preview`
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
  - Deep link handler em `app/_layout.tsx` suporta dois fluxos: PKCE (`code=` → `exchangeCodeForSession`) e token-based (`access_token=` no fragmento `#` → `setSession`). O `onAuthStateChange` detecta a sessão e redireciona automaticamente — sem navegação manual necessária.

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
| 15 | `social-proof.tsx` | `(onboarding)` | "Com o NIKS, você vai conseguir 3x mais rápido" |
| 16 | `rate-us.tsx` | `(scan)` | "Avalie-nos" — reviews de usuárias em marquee + popup nativo de avaliação da App Store (`requestAppReview()`) → navega para `scan-prep` |
| 17 | `scan-prep.tsx` | `(scan)` | Preparação para o scan facial |
| 18 | `camera.tsx` | `(scan)` | Câmera — captura da foto |
| 19 | `loading.tsx` | `(scan)` | Loading da análise de pele (chama `analyze-skin`) |
| 20 | `results.tsx` | `(scan)` | "Relatório de Pele" — resultado completo do scan |
| 21 | `plan-preview.tsx` | `(onboarding)` | "Sua rotina de skincare está pronta" → navega para `paywall-soft` |
| 22 | `paywall-soft.tsx` | `(onboarding)` | Gateway para o Superwall (sem UI própria) — em `__DEV__` pula direto; após assinatura confirmada → navega para `signup` |
| 23 | `signup.tsx` | `(onboarding)` | Criação de conta (e-mail, Google ou Apple) → dispara geração do protocolo em background via `lib/generateProtocol.ts` (fire-and-forget) → navega para `nome` |
| 24 | `nome.tsx` | `(onboarding)` | "Como você quer ser chamada?" → salva em `users.nome` + navega para `notifications` |
| 25 | `notifications.tsx` | `(onboarding)` | Permissão de notificações push → navega para `/(app)/home` |

### Telas deletadas (não existem mais no projeto)

`frequency.tsx`, `sunscreen.tsx`, `food-analysis.tsx`, `trust.tsx`, `commitment.tsx`, `protocol-loading.tsx`, `final-loading.tsx`, `food-scan-intro.tsx`, `analise.tsx`, `evolucao.tsx`

---

## ESTADO DO STORE (`store/onboarding.ts`)

Exporta `useAppStore` (não `useOnboardingStore`).

**Tipos exportados:** `SkinMetric`, `ScanResult`, `ProtocolStep`, `ProtocolResult`, `OnboardingData`, `FoodReportResult`

**Tipo `ScanResult` (schema clínico expandido):**
```typescript
{
  // Campos obrigatórios (sempre presentes)
  skin_score: number                   // 0–100
  skin_type_detected: string           // mapeado automaticamente de skin_type_sebaceous pela Edge Function
  headline: string                     // frase específica descrevendo esta pele
  disclaimer: string

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

**Campos de contexto de scan:**
- `scanSource: 'onboarding' | 'app'` — controla o fluxo de navegação pós-scan; default `'onboarding'`

**Campos de resultado:**
- `scanResult: ScanResult | null`
- `scanImageUri: string | null`
- `skinScanId: string | null` — ID do registro inserido em `skin_scans` (para linkar ao protocolo)
- `protocolResult: ProtocolResult | null` — protocolo gerado, cacheado em memória
- `protocolGenerating: boolean` — `true` enquanto a geração do protocolo está rodando em background (disparada por `signup.tsx`); `protocolo.tsx` usa esse flag para exibir estado de espera em vez de tentar regenerar em paralelo
- `selectedScan: { result: ScanResult; imageUri: string } | null` — scan selecionado no carrossel da home; limpo automaticamente ao sair de `skin-result.tsx`
- `selectedFoodResult: FoodReportResult | null` — resultado salvo de food scan selecionado na home; exibido sem re-análise em `food-report.tsx`; limpo ao sair da tela ou iniciar novo scan
- `skinPreviewUrl: string | null` — URL pública da preview de pele melhorada gerada por `generate-skin-preview`; populada de forma assíncrona por `loading.tsx` (fire-and-forget — pode ainda ser `null` quando `results.tsx` monta)

**Métodos:**
- `setTabBarTheme(theme: 'light' | 'dark')` — alterna o tema visual do tab bar; chamado por `protocolo.tsx` e `niks-chat.tsx` via `useFocusEffect` (cada tela seta dark ao focar e reseta para light ao sair)
- `setTabBarVisible(visible: boolean)` — esconde/mostra o tab bar; útil em telas onde o tab bar não deve aparecer
- `setScanSource(source: 'onboarding' | 'app')` — chamado por `ScanModal.handleScanFace` antes de iniciar scan do app principal
- `setOnboardingField(field, value)`
- `setFoodImage(base64, mimeType)`
- `setSkinImage(base64, uri)`
- `setScanResult(result, imageUri)`
- `setProtocolResult(result)` — armazena protocolo gerado para uso na aba `(app)/protocolo.tsx`
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
Não tem câmera real. `camera.tsx` detecta via `Platform.OS === 'ios' && __DEV__` e mostra botão de galeria.

### 4. Imagem de comida
Redimensionada para 512px + compress 0.5 via `expo-image-manipulator` antes de salvar no store (~52KB).

### 5. `results.tsx` (onboarding) mostra análise completa — navegação de volta bloqueada
`app/(scan)/results.tsx` exibe o resultado completo do scan (mesma estrutura de `skin-result.tsx`: parallax hero, score ring, análise por região, condição geral, pontos fortes, etc.). As métricas **não** são mais borradas/bloqueadas — o usuário vê tudo no onboarding.

**Navegação de volta bloqueada intencionalmente:** ao chegar em `results.tsx`, o usuário não pode voltar. Motivo: `loading.tsx` usa `router.push` para chegar aqui — voltar retornaria o usuário à tela de loading, que é um beco sem saída. Implementado com dois mecanismos:
- `<Stack.Screen options={{ gestureEnabled: false }} />` — desabilita swipe-back no iOS
- `BackHandler.addEventListener('hardwareBackPress', () => true)` — bloqueia botão físico no Android

### 6. Geração e cache do protocolo personalizado
O protocolo é gerado em background logo após o usuário criar a conta, em `signup.tsx` (fire-and-forget via `lib/generateProtocol.ts`). Não há tela de loading dedicada para isso — a geração roda em segundo plano enquanto o usuário avança para `nome` e `notifications`. A função `generate-protocol` recebe `scanResult` e `onboardingData`. Salvo em dois lugares:
1. **Zustand store** (`protocolResult`) — para acesso imediato sem nova chamada à API
2. **Supabase `protocolos`** — para persistência entre sessões

**Detalhe crítico de closure em `signup.tsx`:** `skinScanId` é setado dentro de `saveToSupabase` (via `set({ skinScanId: ... })`). Para ler o valor correto logo depois, `startProtocolGeneration` usa `useAppStore.getState().skinScanId` — nunca a variável destrutarada do hook, que ainda estaria com o valor antigo (`null`) antes do próximo render.

**`lib/generateProtocol.ts`:** utilitário que encapsula a chamada à Edge Function com retry (até 3 tentativas, delay 3s, somente para 503/UNAVAILABLE), salva no Supabase e chama `onSuccess`/`onFinally` ao terminar.

A aba `(app)/protocolo.tsx` carrega na seguinte ordem de prioridade:
1. Store cache (se ainda estiver na sessão)
2. Supabase (busca o registro mais recente por `user_id`)
3. Se `protocolGenerating` for `true` → exibe estado `awaitingGeneration` ("Preparando seu protocolo...") e aguarda; quando o flag vira `false`, retenta automaticamente do passo 1
4. Fallback: regenera via Edge Function — só chega aqui se não há nada no store nem no Supabase e nenhuma geração está em andamento

**Por que o flag `protocolGenerating` é necessário:** sem ele, se o usuário abrisse a aba Rotina enquanto a geração em background ainda não terminou (passos 1 e 2 falham), `protocolo.tsx` dispararia uma segunda geração em paralelo — duas linhas na tabela `protocolos` e chamadas duplicadas ao Gemini.

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

### 8. Refs obrigatórias em callbacks assíncronas de animação (`protocolo.tsx`)

Qualquer valor de state (`useState`) capturado dentro de callbacks assíncronas — especialmente `Animated.timing().start(callback)` e `setTimeout` — é **estale**: reflete o valor do render em que a função foi criada, não o valor atual.

**Regra:** toda variável de state que é lida dentro de uma callback de animação ou setTimeout em `protocolo.tsx` **deve ter um ref espelho** atualizado por `useEffect`:

```typescript
const streakDaysRef = useRef(0);
useEffect(() => { streakDaysRef.current = streakDays; }, [streakDays]);
// Dentro da callback: usar streakDaysRef.current, nunca streakDays
```

Refs atualmente necessárias em `protocolo.tsx`: `checkedItemsRef`, `stepsRef`, `celebrationTriggeredRef`, `morningStepsRef`, `nightStepsRef`, `streakDaysRef`, `lastCompletedAtRef`.

---

### 9. Gradientes radiais — usar Skia, nunca `react-native-svg` `RadialGradient`

**`react-native-svg`'s `RadialGradient` não renderiza neste projeto** (versão 15.x) — o elemento fica invisível/transparente sem erro de compilação. Qualquer gradiente radial deve ser feito com `@shopify/react-native-skia`.

**Padrão correto — `Canvas + Circle + RadialGradient + vec`:**
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

**Onde este padrão é usado:**
- `protocolo.tsx` — orb da Cerimônia (132×132, daytime/nighttime colors)
- `app/(scan)/loading.tsx` — orb da análise de pele (140×140, skin-tone gradient)

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

### 11. Debug de modo dia/noite — 5 toques no texto "NIKS" (`home.tsx` e `niks-chat.tsx`)

Duas telas têm modo de debug que alterna entre AM (manhã) e PM (noite) para facilitar testes visuais em dispositivo físico. **Completamente invisível para o usuário final. Funciona em TestFlight (produção).**

**Como ativar:** tocar 5 vezes seguidas no texto "NIKS" dentro de 2 segundos. Ciclo: `auto → am → pm → auto`.

| Tela | Onde tocar |
|---|---|
| `app/(app)/home.tsx` | Texto "NIKS" no masthead (canto superior esquerdo) |
| `app/(app)/niks-chat.tsx` | Título "NIKS" no `ChatHeader` (centro do header, ao lado do orb dot) |

**Implementação (idêntica nas duas telas):**
- O texto "NIKS" é envolto em `<TouchableOpacity activeOpacity={1}>` — sem feedback visual
- Um `useRef` conta os toques; um `setTimeout` de 2s reseta o contador
- Estado `debugMode: 'am' | 'pm' | null` — em `home.tsx` substitui `new Date().getHours()` no cálculo do `ctx`; em `niks-chat.tsx` substitui `autoNight` no cálculo de `isDark`

**Por que não usar `__DEV__`:** mantido em produção intencionalmente para testar os dois estados visuais (fundo escuro/estrelas vs. fundo branco) num dispositivo físico sem build separado.

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
| App principal (`ScanModal`) | `scan-prep` (sem barra de progresso) → `camera` → `loading-dentro-app` → `/(app)/skin-result` |

**Duas telas de loading distintas — não consolidar:**
- `loading.tsx` — usada no onboarding. Inclui o step "Montando seu protocolo personalizado" (faz sentido, pois o protocolo será gerado logo depois).
- `loading-dentro-app.tsx` — usada no app principal (via FAB). **Não inclui** o step "Montando seu protocolo personalizado" (o protocolo já existe; mostrar esse step seria enganoso). Navega sempre para `/(app)/skin-result`.

**Como funciona:**
1. `ScanModal.handleScanFace` chama `setScanSource('app')` antes de navegar para `scan-prep`
2. `scan-prep.tsx` lê `scanSource`: se `'app'`, renderiza sem `QuizLayout` (sem barra de progresso do onboarding)
3. `camera.tsx` lê `scanSource` e navega: `'app'` → `loading-dentro-app`; `'onboarding'` → `loading`

**Por que `setSelectedScan(null)` é obrigatório em `loading-dentro-app.tsx`:** `skin-result.tsx` usa `selectedScan?.result ?? scanResult`. Se `selectedScan` ainda estiver populado de uma visualização anterior do carrossel da home, a tela mostra o scan antigo em vez do recém-feito.

**Não confundir** com o retry de login do usuário no app: o guard de assinatura em `(app)/_layout.tsx` não depende de `scanSource`.

---

### 14. Consentimento de uso de IA — uma única vez por instalação (LGPD)

Antes de qualquer scan (facial ou alimentar), o app exibe um modal de consentimento informando que a foto é processada pelo Google Gemini. Após aceite, o consentimento é salvo em `AsyncStorage` com a chave `"ai_consent_accepted"` (valor `"true"`) e o modal nunca mais aparece.

**Dois pontos de interceptação:**
- `app/(scan)/scan-prep.tsx` — cobre o onboarding (usuário nunca passa pelo ScanModal no primeiro scan)
- `components/scan/ScanModal.tsx` — cobre os scans do app principal (facial e alimentar)

**Componentes:**
- `hooks/useAIConsent.ts` — `requestConsent(onGranted)`: verifica AsyncStorage; se já aceitou, chama `onGranted()` direto; se não, abre o modal e guarda a ação pendente em `pendingAction`
- `components/ui/AIConsentModal.tsx` — o backdrop **não fecha** o modal (consentimento explícito obrigatório); "Cancelar" fecha sem prosseguir para o scan

**Atenção ao integrar em novas telas:** `CTAButton` executa `onPress` e `to` simultaneamente. Ao usar `requestConsent`, sempre remover o `to` e usar apenas `onPress` — senão a navegação dispara antes do consentimento.

> ⚠️ **Modal stacking no iOS:** `AIConsentModal` é um `<Modal>` nativo. Se for chamado enquanto outro `<Modal>` nativo estiver aberto (ex: o bottom sheet do `ScanModal`), o iOS silencia o segundo — o usuário clica e não acontece nada. **Solução aplicada em `ScanModal`:** `handleScanFood` e `handleScanFace` chamam `onClose()` primeiro e só disparam `requestConsent` após 200ms (tempo da animação de fechamento de 180ms). Qualquer nova integração de `AIConsentModal` dentro de um Modal deve seguir o mesmo padrão.

---

### 15. Guard de assinatura — Superwall + RevenueCat

O paywall é gerenciado pelo **Superwall** (`expo-superwall`). O `<SuperwallProvider>` está em `app/_layout.tsx` (raiz), logo abaixo do `<MixpanelProvider>` — acima de `GestureHandlerRootView` e `SafeAreaProvider`.

**API Key iOS:** `pk_4iUsZwW_-ME9WdK3IcXYp`  
**Placement identifier:** `paywall_onboarding`

O acesso ao app é verificado em 3 pontos de assinatura + 1 guard de nome, em ordem. Os guards de assinatura usam RevenueCat (`getCustomerInfo` + `isSubscribed`):

- `app/index.tsx` — ao abrir o app com sessão ativa → vai direto para `/(app)/home` (sem checar assinatura — delega para `AppLayout` evitar race condition com `loginRevenueCat`)
- `app/(onboarding)/_layout.tsx` — ao entrar no onboarding com sessão ativa → assinante já vai direto para home
- `app/(onboarding)/login.tsx` — `routeAfterLogin()` após qualquer método de login → não-assinante: `router.replace('/(onboarding)/paywall-soft')`
- **`app/(app)/_layout.tsx`** — guard definitivo de assinatura (**fail closed**): não-assinante, timeout ou erro → `router.replace('/(onboarding)/paywall-soft')`; o app **nunca renderiza** para não-assinantes (`setReady(true)` só é chamado após assinatura confirmada via `Promise.race` de 8s)

**Guard de nome em `app/(app)/_layout.tsx` (executa antes do guard de assinatura):** ao entrar no app com sessão ativa, o layout consulta `users.nome`. Se estiver vazio, redireciona para `/(onboarding)/nome` **independentemente do status de assinatura**. Isso cobre usuários existentes que nunca definiram nome. Só depois dessa verificação o fluxo de assinatura é avaliado.

**⚠️ Race condition crítica — loginRevenueCat vs getCustomerInfo:** `_layout.tsx` (raiz) chama `loginRevenueCat(userId)` de forma assíncrona (fire-and-forget). Se `getCustomerInfo()` for chamado ANTES de `loginRevenueCat` completar, o RevenueCat ainda estará em modo anônimo — e o usuário anônimo não tem assinatura, causando loop de paywall. **Solução:** `(app)/_layout.tsx` aguarda `loginRevenueCat(session.user.id)` (com await + try/catch) imediatamente antes de chamar `getCustomerInfo()`. O mesmo se aplica em `paywall-soft.tsx` quando há sessão ativa.

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

> **Cache de assinatura entre remounts:** o store Zustand tem o campo `subscriptionVerified: boolean`. Após a primeira verificação bem-sucedida do RevenueCat na sessão, esse flag é setado como `true`. Em remounts do `(app)/_layout.tsx` dentro da mesma sessão (ex: fluxo `nome.tsx` → `/(app)/home` causa unmount/remount do layout), o check do RevenueCat é pulado — vai direto para `setReady(true)`. Isso elimina a tela branca de até 8s que ocorria nesses remounts. O flag reseta automaticamente ao fechar o app (Zustand em memória, sem persistência).

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
    // Encontra o package no RevenueCat pelo productId
    const pkg = offerings.current?.availablePackages.find(p => p.product.identifier === productId);
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

### 18. Telas de loading — headline com `adjustsFontSizeToFit` em vez de 3 `<Text>` separados

O headline das telas de loading (`loading.tsx`, `loading-dentro-app.tsx`, `food-report.tsx`) é composto por prefixo em bold DEEP + palavra-destaque em PlayfairDisplay-Italic CORAL + "…".

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
    → goal-desire → social-proof → rate-us
    → scan-prep → camera (setSkinImage) → loading (analyze-skin) → results
    → plan-preview → paywall-soft (Superwall) → signup (saveToSupabase + generateProtocol bg)
    → nome → notifications → /(app)/home

  (* = telas condicionais)

  → [botão "Entrar"] Login
    → E-mail + Senha / Google / Apple → verifica assinatura (RevenueCat)
    → assinante: home | não-assinante: paywall-soft

Fluxo de scan facial (dentro do app principal):
  ScanModal → scan-prep → camera → loading-dentro-app → /(app)/skin-result

Fluxo de comida (dentro do app principal):
  Home (botão "Escanear refeição") ou ScanModal → food-camera (setFoodImage) → food-report (analyze-food)
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
│   │   ├── social-proof.tsx       ✅ "Com o NIKS, você vai conseguir 3x mais rápido" — ⚠️ linha 212 navega para rate-us em vez de scan-prep (pendente corrigir)
│   │   ├── plan-preview.tsx       ✅ "Sua rotina de skincare está pronta" → navega para paywall-soft
│   │   ├── paywall-soft.tsx       ✅ gateway para Superwall — spinner sem UI própria
│   │   ├── signup.tsx             ✅ criação de conta (e-mail/Google/Apple) → dispara generateProtocol em bg → navega para nome
│   │   ├── login.tsx              ✅ fluxo dois passos (e-mail/senha + Google/Apple)
│   │   ├── nome.tsx               ✅ "Como você quer ser chamada?" → salva users.nome → navega para notifications
│   │   └── notifications.tsx      ✅ pede permissão + salva push_token no Supabase → navega para /(app)/home
│   ├── (app)/
│   │   ├── _layout.tsx            ✅ Tab bar customizada: início/rotina/niks/perfil — oculta em /home (home usa HomeBottomBar própria)
│   │   ├── home.tsx               ✅ Design Horizonte Reformulado: hero editorial, contexto manhã/noite, ritual card, scans recentes, refeições, FAB coral
│   │   ├── skin-result.tsx        ✅ resultado da análise facial no app principal (métricas reais, parallax hero)
│   │   ├── protocolo.tsx          ✅ rotina AM/PM com Cerimônia, streak, Skia orb, som de check
│   │   ├── niks-chat.tsx          ✅ Chat com a NIKS AI — dois estados: empty / active; modo noturno (≥18h)
│   │   ├── perfil.tsx             ✅ nome dinâmico, email, notificações, suporte, apagar conta
│   │   └── set-name.tsx           ✅ editar nome/sobrenome → salva em users.nome no Supabase
│   └── (scan)/
│       ├── scan-prep.tsx          ✅ preparação para o scan (com barra de progresso no onboarding; sem no app principal)
│       ├── camera.tsx             ✅ → loading (onboarding) ou loading-dentro-app (app principal)
│       ├── food-camera.tsx        ✅
│       ├── loading.tsx            ✅ loading do onboarding — inclui step "Montando seu protocolo"
│       ├── loading-dentro-app.tsx ✅ loading do app principal — não inclui step de protocolo
│       ├── rate-us.tsx            ✅ "Avalie-nos" — reviews em marquee + requestAppReview() → navega para scan-prep (onboarding) ou skin-result (app)
│       ├── results.tsx            ✅ "Relatório de Pele" no onboarding → navega para plan-preview
│       └── food-report.tsx        ✅
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
│   │   └── NightSky.tsx           ✅ céu noturno animado (Reanimated v4 + Skia) — Protocolo e NIKS Chat modo noite
│   ├── layouts/
│   │   └── QuizLayout.tsx         ⚠️ não utilizado — nenhum arquivo importa este componente
│   └── scan/
│       └── ScanModal.tsx          ✅
├── constants/colors.ts            ✅
├── constants/protocols.ts         ⚠️ legado — `baseProtocol` é enviado pelo fallback de `protocolo.tsx` mas ignorado pela Edge Function `generate-protocol`
├── store/onboarding.ts            ✅
├── lib/supabase.ts                ✅
├── lib/generateProtocol.ts        ✅ utilitário fire-and-forget — encapsula chamada à Edge Function com retry (3x, 3s), salva no Supabase
├── lib/notifications.ts           ✅ requestPushPermission() + savePushToken()
├── hooks/useAuth.ts               ✅
├── hooks/useAIConsent.ts          ✅ requestConsent() — AsyncStorage key: "ai_consent_accepted"
├── assets/fonts/
│   ├── PlayfairDisplay-Regular.ttf   ✅ fonte principal
│   ├── PlayfairDisplay-Italic.ttf    ✅ títulos/destaques
│   ├── DMSerifDisplay-Regular.ttf    ✅ Cerimônia do protocolo
│   ├── DMSerifDisplay-Italic.ttf     ✅ Cerimônia + cerimSkiaFont (Canvas Skia)
│   ├── CormorantGaramond-Regular.ttf ⚠️ não carregada via useFonts em nenhuma tela
│   ├── CormorantGaramond-Italic.ttf  ⚠️ carregada em plan-preview.tsx mas nenhum style usa fontFamily 'CormorantGaramond-Italic'
│   └── DMSans-MediumItalic.ttf       ⚠️ carregada em plan-preview.tsx mas nenhum style usa fontFamily 'DMSans-MediumItalic'
├── assets/trust-hands.png         ⚠️ não usado (trust.tsx foi deletado)
├── assets/welcome-video.mp4       ⚠️ não usado — nenhum arquivo referencia
├── lib/revenuecat.ts              ✅ initRevenueCat, getPackages, purchasePackage, restorePurchases, isSubscribed
├── lib/storeReview.ts             ✅ requestAppReview() — popup nativo via expo-store-review (id6760590018)
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
expo-audio          ← som de check em protocolo.tsx (useAudioPlayer)
expo-store-review   ← popup nativo de avaliação — funciona apenas em TestFlight/produção; em dev cai no fallback da App Store
react-native-svg
expo-linear-gradient
lucide-react-native
react-native-reanimated
```

---

## DESIGN SYSTEM — HOME SCREEN (Sessão 22)

### Tela Home (`app/(app)/home.tsx`)
Reescrita com base no design **Horizonte Reformulado** (`design-export/design-reference/home-horizonte-reformulado.jsx`). O heroVariant aprovado é `'editorial'` (VAR 3).

**Sistema de contexto temporal (`getTimeContext`):**
- `5–12h` → `orbVariant: 'dawn'`, saudação "Bom dia" (`isDark = false`)
- `12–18h` → `orbVariant: 'dusk'`, saudação "Boa tarde" (`isDark = false`)
- `18–5h` → `orbVariant: 'night'`, saudação "Boa noite" (`isDark = true`)

O flag `isDark` controla: fundo gradient escuro, céu noturno animado, tema do `ScanModal` e `tabBarTheme` via `useAppStore.getState().setTabBarTheme(...)`.

**Nome do usuário:** buscado de `users.nome` (coluna Supabase). Fallback: `user_metadata.full_name` → `user_metadata.name` → `'você'`. Não usar `user_metadata` como fonte primária — o nome é salvo via `set-name.tsx` em `users.nome`.

**Componentes inline:**
1. **`HomeOrb`** — View circular com `LinearGradient`. Variante dawn (`#FFD6C8→#FB7B6B→#F4A57A`), dusk (`#FFAD88→#C96BAE→#8B5CF6`), night (`#2D3B6E→#1A2040→#4A2060`).
2. **`ReformuladoNightSky`** — Fundo animado (modo noite): 56 estrelas SVG fixas (`react-native-svg`) + 3 estrelas cadentes via Reanimated (`withRepeat + withSequence + withTiming + withDelay`).
3. **`HeroEditorial`** (VAR 3) — Orb absoluto `right: -110, top: 110, size: 320`. **Obrigatório `overflow: 'visible'` no container** para não clipar o orb. Masthead `"NIKS · {formatDateShort(today)}"` onde `formatDateShort` retorna `"28 abr · ter"` (dia + mês minúsculo + dia da semana abreviado, ex: `"28 abr · ter"`) + saudação 54px: "Olá," em `PlayfairDisplay-Italic`, nome em `PlayfairDisplay-Regular` (dois `<Text>` separados — React Native não suporta italic e regular dentro do mesmo `<Text>`, mesmo com `fontStyle`).
4. **`RitualCard`** — Estado em andamento: próximo passo + progress bar segmentada + CTA "Começar agora". Estado concluído: título "concluído." coral + todos os segmentos coral + CTA "Ver resumo". Ambos navegam para `/(app)/protocolo`.
5. **`ScansRecentes`** — `ScrollView` horizontal, `snapToInterval: 208`. Cada `ScanCard` (196px): foto, badge de score, delta de evolução, botão "Ver resultado". `ScanCard` é um componente separado (obrigatório — `useState` não pode estar dentro de `.map()`).
6. **`RefeicoesSección`** — Estado preenchido: lista de refeições do dia com score. Estado vazio: CTA coral "Escanear refeição".
7. **`FAB`** — Botão coral 68×68px (`position: 'absolute', right: 20, bottom: 102, zIndex: 30`) dentro de `home.tsx`. Abre `ScanModal`. Não é parte da tab bar.

**Data fetching:** Tudo dentro de um único `useFocusEffect` (`let active = true` + `return () => { active = false }`). Busca em sequência: `users.nome`, `food_scans` do dia (reset 2h30), últimos 5 `skin_scans` (com repair de `foto_url`), `protocolos` + `AsyncStorage` para estado do ritual.

**Estado do ritual (AsyncStorage):** Mesma chave e lógica de `protocolo.tsx` — `protocolo_check_YYYY-MM-DD_morning` / `_night`, com deslocamento de -3h para o "dia" do protocolo (`getProtocolDate()`). `ritualComplete = done >= total`.

### ScanModal (`components/scan/ScanModal.tsx`)
Redesenhado com visual **ScanTypeSheet** (Horizonte Reformulado). Aceita prop `isDark` (novo):
- Modo noite: `<NightSkyStatic />` (56 estrelas SVG fixas, sem cadentes) como fundo absoluto
- Header centralizado: eyebrow "NOVO SCAN" coral + título PlayfairDisplay 28px + divisor com ponto coral
- Dois cards com stripe esquerda coral 2px: "Scanear refeição" (badge "mais usado" italic serif) + "Scanear rosto"
- Lógica de navegação preservada integralmente (`useAIConsent`, `router.push`, `setScanSource`)
- Animação: `Animated.spring` slide-up (igual ao anterior)

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
Chat com a NIKS AI. Acessada pela 4ª aba "niks" do menu inferior. Design handoff pixel-perfect em `design_handoff_chat_screen/` — os dois estados definitivos são `ChatEmptyScreen` (`source/chat-screens.jsx`) e `ChatActiveScreenV23` (`source/chat-screens-v2.jsx`).

**Dois estados controlados por `mode: 'empty' | 'active'`:**

**Estado empty (boas-vindas):**
- `AnimatedMiniOrb` 68px centralizado com animação de "respiro" (scale 1→1.04→1, 4.8s, infinito via Reanimated)
- Eyebrow `"NIKS · SUA COACH DE PELE"` em 9px uppercase sans-serif
- Saudação `"olá, {firstName}."` em PlayfairDisplay-Italic 38px coral + subtítulo `"como posso te ajudar hoje?"` em PlayfairDisplay-Italic 17px
- 5 suggestion cards com cascade de entrada (opacity 0→1 + translateY 6→0, delay de 60ms por card) — tocar em qualquer card aciona `setMode('active')`
- `firstName` buscado de `users.nome` via `useFocusEffect` + `supabase.auth.getUser()` (mesmo padrão de `home.tsx`)

**Estado active (conversa em andamento):**
- Thread fixa com: timestamp `"HOJE · HH:MM"`, 2 mensagens NIKS, 1 bubble do usuário texto, 1 bubble do usuário foto (placeholder visual), indicador de digitação → resposta streamada
- Streaming simulado: 1.5s de `TypingDots` → texto completo exibido char-a-char a cada 28ms + ScrollView auto-scroll; caret piscante durante o streaming, desaparece ao concluir
- **⚠️ Não há integração real com IA** — o texto streamado é um placeholder estático (`NIKS_STREAM_TEXT`). A lógica real de chat precisa ser implementada quando o backend estiver pronto

**Componentes internos (não reutilizados em outras telas):**
- `MiniOrb` — SVG com `RadialGradient` dawn (circle at 35% 30%, stops `#FFEFE4→#F9C9B6→#E89178→#C86651`). IDs únicos por tamanho para evitar conflito de SVG: `mgOrbG_68`/`mgOrbG_28`
- `NiksMessage` — bubble com borda hairline coral 0.5px, `borderTopLeftRadius: 4` (canto de fala), restante 18px. Texto em PlayfairDisplay-Regular 15px. Suporta `<Text>` filhos para italic inline (e.g., nome do usuário em PlayfairDisplay-Italic coral)
- `UserBubble` — bubble coral sólido com `borderTopRightRadius: 4`
- `TypingDots` — 3 dots com pulse staggerado (delays 0/180/360ms) dentro de bubble hairline
- `SuggestionCard` — linha horizontal com ícone 32×32 + texto + chevron. Usa `TouchableOpacity` (não `Pressable`) para garantir `flexDirection: 'row'` correto no RN 0.83

**Estilo:** inline styles + tokens NIKS locais (`CORAL`, `INK`, `INK_SOFT`, `INK_WHISPER`, `INK_HAIR`, `SURFACE_HAIR`). Não usa `Colors` constants nem NativeWind.

---

### Tab Bar (`app/(app)/_layout.tsx`)
Redesenhada com base no Figma Make `cFsFcVSjOMkTdHIJpHgSDk`:
- **Container**: branco, `borderRadius: 20`, borda `#F0F0F0` (não mais pílula cinza)
- **4 tabs**: `Home` "início" · `Droplet` "rotina" · `Sparkles` "niks" · `User` "perfil" (labels em minúsculo)
- **Ativo**: coral `#FB7B6B` · **Inativo**: `#8A8A8E`
- **Ícone ativo**: SVG customizado sólido — `HomeFilled`, `DropletFilled`, `SparklesFilled`, `UserFilled` (lucide-react-native não tem variante filled; os quatro são componentes inline em `_layout.tsx` usando `react-native-svg`) com `fill={activeColor}`. **Ícone inativo**: lucide outline, tamanho 24, `strokeWidth: 1.5`
- Posicionamento: `bottom: 20 + insets.bottom` (`useSafeAreaInsets` obrigatório para não sobrepor o home indicator do iPhone), `left/right: 16`
- FAB laranja global removido da tab bar; a home screen tem seu próprio FAB coral (68×68px) interno à tela, não vinculado à tab bar
- Telas ocultas (`href: null`): `evolucao`, `set-name`, `skin-result`
- **Visibilidade controlada pelo store:** `tabBarVisible` (bool) — `{tabBarVisible && pathname !== '/home' && <CustomTabBar />}`. Usar `setTabBarVisible(false/true)` para esconder/mostrar em telas específicas. Exceção permanente: `/home` nunca exibe a `CustomTabBar` — a home tem sua própria barra inferior (`HomeBottomBar`).
- **Tema dark/light:** lê `tabBarTheme` do store. Dark: bg `rgba(26,31,46,0.85)`, borda `rgba(255,255,255,0.08)`, ativo `#F9A898`, inativo `rgba(255,255,255,0.45)`, sombra `0 4px 20px rgba(0,0,0,0.4)`. **Regra:** cada tela que seta `tabBarTheme` é responsável por resetar para `'light'` no cleanup do `useFocusEffect` — **obrigatório `useFocusEffect` (não `useEffect`)** porque tabs não desmontam ao trocar de aba. `protocolo.tsx` seta `'dark'` no modo noite e reseta no blur. `home.tsx` seta `'dark'` ou `'light'` conforme o horário e **também reseta para `'light'` no blur** (`return () => { active = false; setTabBarTheme('light'); }`) — sem esse reset, navegar da home noturna para perfil deixa a tab bar presa no modo escuro.

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

### Tela de Protocolo (`app/(app)/protocolo.tsx`)
Design editorial **Quietude v3** — referência: `design-export/niks-ai-ui/project/direction-quietude-v3-original.jsx`. Layout:

1. **Masthead** — "NIKS" (10px, letra-spacing 2.8) + data formatada (UTC-3) no canto direito; `paddingTop = insets.top + 20`
2. **Orb 132×132** — `Canvas` Skia com `Circle` + `RadialGradient`: AM coral (`['#FFE8DF','#F9C9B6','#E89178','#C86651']`), PM lua creme (`['#FFFFFF','#F4EEE4','#D8CDB8','#A89676']`). Highlight elíptico com `BlurMask blur=4`. PM: 5 círculos de cratera com `RadialGradient` escuro
3. **Toggle manhã/noite** — texto serif italic + inline SVG (sol: `SvgCircle` + 8 `SvgLine` raios; lua: `SvgPath` crescente). Ativo: `borderBottomWidth: 0.5` accent coral
4. **Título** — `"Manhã, N passos."` em PlayfairDisplay-Italic 38px, `letterSpacing: -0.95`. Score do último scan + duração total em 11px abaixo
5. **Lista de passos** — linha por passo: barra accent 2px à esquerda, numeral romano coral italic, nome 20px PlayfairDisplay, ingredient 11px `inkSoft`. Duração ou `✓` + chevron SVG à direita. `opacity: 0.42` quando concluído
6. **CTA flutuante** — `position: absolute, bottom: 120`, `borderRadius: 100`, bg accent coral, sombra coral 14px. Abre a **Cerimônia**

**Bottom sheet (detalhe do passo):** `Animated.View` com `transform: [{translateY: sheetSlide}]`; spring 320ms. Contém numeral romano + nome + botão X (bg `inkHair`, theme-aware), benefit quote (italic 17px), "Como aplicar" (usa `step.steps[]` se presente; fallback `instruction`), "Ativos", "Por que para você" com nome do passo e score. Backdrop: `Pressable` + `BlurView` (intensity 30 PM / 20 AM, tint dark/light) fecha o sheet.

**Cerimônia overlay (`ritualOpen`):** tela absoluta `zIndex: 60`. Ao abrir: `setTabBarVisible(false)`; ao fechar (X ou celebração): `setTabBarVisible(true)`. AM: Skia `Canvas` com dois `Group`+`RadialGradient` (um para o fundo, um para vinheta): fundo = `radial-gradient(ellipse at 50% 30%, colorA 0%, colorB 35%, colorC 100%)` — 5 conjuntos de cores cíclicos; vinheta = `radial-gradient(ellipse at 50% 110%, rgba(255,255,255,0.5) 0%, transparent 60%)`; ambos usam `Group transform=[{scaleY: ry/rx}]` para simular a elipse CSS em Skia (que só suporta gradiente circular). PM: `LinearGradient ['#0F1420','#1A1F2E','#2A1F28'] locations=[0, 0.45, 1]` + `<NightSky />`. Header: chip Fechar + chip modo (sol 8 raios/lua) + chip som. Barra de progresso: dots por passo. Orb 220×200 Skia com 2 anéis respiratórios via `Animated.loop` (`orbBreath1`, `orbBreath2`, offset 300ms). Numeral 84px serif inside orb. **Título** em `DMSerifDisplay` (não PlayfairDisplay): 1ª palavra italic + restante regular (ex: "Sérum Vitamina C"). **CTA duplo**: pill principal (`flex: 1`) com check circle coral + texto + chevron; pill prev 54×54 glass à esquerda (`opacity: 0.35` quando `ritualStep === 0`). Último passo → `ritualDone = true` → **tela de celebração** `CerimoniaCelebration`: PM = Skia `RadialGradient` `ellipse at 50% 30%` cores `['#1a2332','#0a1420','#050a12']` stops `[0, 0.6, 1]` (mesma técnica Group+scaleY); AM = `LinearGradient ['#FFF8F3','#FFEFE4']`. Skia orb 220×220 + anel + glow + craters (PM) + checkmark SVG sobreposto, 8 Animated.Values staggered (orb spring 900ms → eyebrow 400ms → título 550ms → subtexto 700ms → rodapé 850ms), CTA "voltar ao protocolo" → `setTabBarVisible(true); setRitualOpen(false); setRitualDone(false)`

**Sistema de tema:** `isPM = period === 'night'`; `ink`, `inkSoft`, `inkHair`, `inkWhisper` mudam entre claro e escuro. Fontes serif carregadas via `useFonts`: PlayfairDisplay-Regular/Italic + DMSerifDisplay-Regular/Italic

**Skin score:** buscado separadamente de `skin_scans` (`select('skin_score').order('created_at', desc).limit(1)`) e exibido no cabeçalho. Fallback ao `useAppStore().scanResult?.skin_score` se não houver registro

**Estado de conclusão (AsyncStorage):** chave `protocolo_check_YYYY-MM-DD_morning` e `protocolo_check_YYYY-MM-DD_night` — valor: JSON array de índices marcados. Reseta automaticamente no novo dia. Estado independente por período.

**Lógica de streak:** `streak_days` em `users` só é incrementado quando **manhã E noite** estão ambas 100% concluídas no mesmo dia. Usa `last_protocol_completed_at` para garantir que sobe apenas uma vez por dia.

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

### 18. `HomeBottomBar` em `home.tsx` — tab bar + FAB como irmãos (não em `_layout.tsx`)

A home screen tem sua própria barra inferior (`HomeBottomBar`) que combina tab bar e FAB como componentes irmãos dentro do mesmo `View`. Isso é obrigatório — **não mover o FAB de volta para `_layout.tsx`**.

**Motivo:** Em React Native, `zIndex` só funciona entre elementos dentro do mesmo contexto de empilhamento (mesmo pai). Se a tab bar fica em `_layout.tsx` (nível pai) e o FAB fica em `home.tsx` (nível filho dentro de `<Tabs>`), o elemento do pai sempre renderiza por cima do filho, independente dos valores de `zIndex`. O FAB ficaria permanentemente atrás da tab bar.

**Estrutura correta (`home.tsx`):**
```
<View flex:1>                    ← root da home screen
  {/* conteúdo da tela */}
  <HomeBottomBar>
    <View zIndex:20>             ← tab bar (ProtoTabBar)
    <TouchableOpacity zIndex:30> ← FAB coral (acima da tab bar)
  </HomeBottomBar>
</View>
```

**Irmãos sob o mesmo pai → `zIndex` funciona.** FAB em `zIndex: 30` > tab bar em `zIndex: 20` ✅

**Posicionamento:** Tab bar: `bottom: 20 + insets.bottom`. FAB: `bottom: 102 + insets.bottom, right: 20` (68×68px, `borderRadius: 34`).

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

Era aplicado em `rate-us.tsx` (tela pendente de deleção). Aplicar em qualquer nova tela com carrossel sobre fundo branco.

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

*Última atualização: Sessão 31 — Maio 2026*
*Status: MVP — RevenueCat ✅; guard de assinatura completo (4 pontos de verificação + timeout 8s); gamificação do protocolo; avaliação nativa (expo-store-review); push notifications ✅; App Store ID: id6760590018. Schema `analyze-skin` expandido: `region_insights`, `goal_alignment`, `skin_strengths`, `action_recommendations`. `skin-result.tsx` com parallax (foto fixa, Animated.ScrollView, ring SVG + badges animados, card com borderRadius desliza por cima da foto). `home.tsx` reescrita com design Horizonte Reformulado: contexto temporal AM/PM/noite, HeroEditorial VAR 3, céu noturno animado, ritual card, FAB coral. Tab bar: labels atualizados para início/rotina/perfil; `ScanModal` redesenhado como ScanTypeSheet com prop `isDark`. Bug corrigido: `home.tsx` agora reseta `tabBarTheme` para `'light'` no blur do `useFocusEffect`. Decisão 20 adicionada: padrão de duas Views para shadow + overflow em React Native. `loading.tsx` redesenhada pixel-perfect (Q13 do design de referência): orb Skia com gradiente luminoso + inset shadow simulado + specular highlight, halo coral pulsante, shimmer PlayfairDisplay-Italic na palavra destacada (Decisões 22 e 23), ring progress e step opacities com animação fluida via Animated.Value intermediário. Bug de food scan duplicado corrigido (Decisão 25): `useRef` guard em `food-camera.tsx` e `food-report.tsx` previne inserts múltiplos no banco causados por double-tap ou double-mount do StrictMode.*