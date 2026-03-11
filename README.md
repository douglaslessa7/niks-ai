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

**Monetização:** Freemium — R$8,90/semana, R$32,90/mês, R$339,90/ano via RevenueCat. Trial de 3 dias.

**Regulação importante:**
- Nunca usar a palavra "diagnóstico" — sempre "análise" ou "avaliação"
- Posicionamento 100% wellness, nunca médico
- LGPD: foto de rosto é dado biométrico — consentimento explícito obrigatório

---

## STACK (DECISÕES FINAIS — NÃO MUDAR)

| Camada | Tecnologia |
|---|---|
| Framework | Expo + React Native (managed workflow) |
| Estilo | NativeWind v4 + Tailwind CSS (sempre `className`, nunca `StyleSheet`) |
| Navegação | Expo Router v3 (`useRouter`, `router.push`, `router.back`) |
| Backend | Supabase (PostgreSQL + Edge Functions + Storage) |
| IA | Claude claude-sonnet-4-5 via Supabase Edge Functions |
| Pagamentos | RevenueCat |
| Analytics | Mixpanel |
| Camera | expo-camera + expo-image-picker |
| Estado global | Zustand (`useAppStore` em `store/onboarding.ts`) |

**Localização do projeto:** `~/Desktop/niks-ai/`

**Para rodar:**
```bash
cd ~/Desktop/niks-ai
npx expo run:ios
# ou sem rebuild nativo:
npx expo start --clear   # pressionar 's' depois 'i'
```

---

## REGRAS DE DESENVOLVIMENTO (NUNCA VIOLAR)

- **NativeWind (`className`)** para estilo — `StyleSheet.create()` só em último caso absoluto
- **Expo Router** para navegação — `useRouter()`, `router.push()`, `router.back()`
- **TypeScript** em tudo — nunca JavaScript puro
- **Nunca inventar cores** — usar sempre `constants/colors.ts`
- **NUNCA chamar API da Anthropic diretamente no app** — sempre via Supabase Edge Function
- **SafeAreaView** em todas as telas — respeitar notch e home indicator do iPhone
- **Portrait only** — nunca landscape
- **Max width 393px** — iPhone 14 Pro
- **Store usa `useAppStore`** (de `store/onboarding.ts`) — não `useOnboardingStore`
- **Imagens viajam pelo Zustand** — nunca via `router.push` params (truncamento no bridge do RN)
- **`fetch` direto** para Edge Functions grandes — `supabase.functions.invoke` trunca payloads

---

## COMO ACESSAR O FIGMA MAKE

### File ID
`XrX2xnE32aNLOaFw5ayPM0`

### Método correto (IMPORTANTE)
**NÃO use `get_metadata`** — retorna erro para arquivos Make.

**Use `get_design_context` com qualquer nodeId** para obter o índice de todos os arquivos. O retorno lista todos os Resource Links com os caminhos corretos.

### Paths corretos das telas
```
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/screens/Welcome.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/screens/Login.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/screens/Signup.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/screens/Home.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/screens/Protocolo.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/screens/Analise.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/screens/Evolucao.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/screens/Perfil.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/components/TabBar.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/routes.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/styles/theme.css
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/package.json
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

## SUPABASE

| Campo | Valor |
|---|---|
| Project URL | https://utpljvwmeyeqwrfulbfr.supabase.co |
| Anon Key | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0cGxqdndtZXllcXdyZnVsYmZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwOTc4MTUsImV4cCI6MjA4ODY3MzgxNX0.zFbYbO2LbjK1DZSK4JRkieWiD0JHnDRCMtkPU1kWaxI |
| Project Ref | utpljvwmeyeqwrfulbfr |
| Docker | NÃO necessário (deploy de functions funciona sem ele) |

### Tabelas criadas
- `users` — criada automaticamente no signup via trigger `handle_new_user()`
- `skin_scans` — histórico de análises de pele
- `food_scans` — histórico de análises de comida
- `protocolos` — rotina AM/PM gerada pelo `generate-protocol`
- `subscriptions` — sync RevenueCat

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
| `expected_timeline.*` | `dicas[1,2,3]` |

**Colunas extras na tabela `users`:**
```sql
genero text, idade int4, tipo_pele text,
concerns text[] DEFAULT '{}', objetivo text,
frequency text, sun_exposure text, hydration text,
sleep text, sunscreen text, birthday text
```

**Storage bucket:** `scans` — com policies de upload/leitura por `user_id`.

### Edge Functions deployadas

**Comando de deploy:**
```bash
supabase functions deploy <nome> --no-verify-jwt --project-ref utpljvwmeyeqwrfulbfr
```

| Função | Status | Entrada | Saída |
|---|---|---|---|
| `analyze-skin` | ✅ | `{ imageBase64, skinProfile: { skin_type, concerns } }` | `{ skin_score, skin_type_detected, headline, metrics, zones, top_concerns, positive_highlights, disclaimer }` |
| `analyze-food` | ✅ | `{ imageBase64, mimeType, skinProfile: { skin_type, concerns } }` | `{ meal_score, meal_summary, foods[], highlights, watch_out, science_note, disclaimer }` |
| `generate-protocol` | ✅ | `scanResult + onboardingData` | `{ morning[], night[], introduction_warnings, expected_timeline }` |

**Correções críticas já aplicadas no `analyze-food`:**
- `max_tokens` = **2048** (evita truncamento do JSON)
- Regex: `rawText.match(/\{[\s\S]*\}/)` (robusto a markdown extra)

### Autenticação
- **Google Sign In:** ✅ funcionando
  - iOS Client ID: `436683236946-36te4gp3c6eid9frheokli00j0pnocd4.apps.googleusercontent.com`
  - Skip nonce checks ativado no Supabase (obrigatório para iOS)
- **Apple Sign In:** 🟠 pendente — Apple Developer Program adquirido, configuração pendente (botão placeholder já existe em `signup.tsx` e `login.tsx`)
- **E-mail + Senha:** ✅ funcionando — `signInWithEmail` e `signUpWithEmail` em `hooks/useAuth.ts`
  - Confirmação de e-mail: **desativada** (fase de testes) — reativar no Supabase Dashboard em produção
  - ⚠️ Usuários criados com confirmação ativa ficam em estado "não confirmado" — confirmar manualmente no Dashboard ou deletar e recriar

---

## ESTADO DO STORE (`store/onboarding.ts`)

Exporta `useAppStore` (não `useOnboardingStore`).

**Tipos exportados:** `SkinMetric`, `ScanResult`, `ProtocolStep`, `ProtocolResult`, `OnboardingData`

**Campos de onboarding:** `genero`, `birthday`, `skin_type`, `concerns[]`, `frequency`, `sun_exposure`, `hydration`, `sleep`, `sunscreen`, `objetivo`

**Campos de imagem:**
- `foodImageBase64: string | null`
- `foodImageMimeType: string | null`
- `skinImageBase64: string | null`
- `skinImageUri: string | null`

**Campos de resultado:**
- `scanResult: ScanResult | null`
- `scanImageUri: string | null`
- `skinScanId: string | null` — ID do registro inserido em `skin_scans` (para linkar ao protocolo)
- `protocolResult: ProtocolResult | null` — protocolo gerado, cacheado em memória

**Métodos:**
- `setOnboardingField(field, value)`
- `setFoodImage(base64, mimeType)`
- `setSkinImage(base64, uri)`
- `setScanResult(result, imageUri)`
- `setProtocolResult(result)` — armazena protocolo gerado para uso na aba `(app)/protocolo.tsx`
- `saveToSupabase(userId)` — salva `users` + `skin_scans`; captura e armazena o `skinScanId` retornado

---

## DECISÕES TÉCNICAS IMPORTANTES

### 1. Zustand em vez de router params para imagens
Passar `imageBase64` via `router.push` corrompía imagens grandes (truncamento no bridge do RN).

**Padrão correto:**
```
food-camera.tsx → setFoodImage(base64, mimeType) → navega → food-report.tsx lê do store
camera.tsx → setSkinImage(base64, uri) → navega → loading.tsx lê do store
```

### 2. `fetch` direto em vez de `supabase.functions.invoke`
`supabase.functions.invoke` truncava payloads grandes. Usar `fetch` direto:

```typescript
const response = await fetch(
  'https://utpljvwmeyeqwrfulbfr.supabase.co/functions/v1/analyze-food',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
    },
    body: JSON.stringify({ imageBase64, mimeType, skinProfile }),
  }
)
```

### 3. Simulador iOS
Não tem câmera real. `camera.tsx` detecta via `Platform.OS === 'ios' && __DEV__` e mostra botão de galeria.

### 4. Imagem de comida
Redimensionada para 512px + compress 0.5 via `expo-image-manipulator` antes de salvar no store (~52KB).

### 5. Métricas borradas em results.tsx
Os scores de hidratação, oleosidade etc. são **intencionalmente** ocultados — só desbloqueados para assinantes (integração RevenueCat pendente).

### 6. Geração e cache do protocolo personalizado
O protocolo é gerado **uma única vez** na tela `protocol-loading` (logo após o signup) e salvo em dois lugares:
1. **Zustand store** (`protocolResult`) — para acesso imediato sem nova chamada à API
2. **Supabase `protocolos`** — para persistência entre sessões

A aba `(app)/protocolo.tsx` carrega na seguinte ordem de prioridade:
1. Store cache (se ainda estiver na sessão)
2. Supabase (busca o registro mais recente por `user_id`)
3. Fallback: chama `generate-protocol` novamente via `fetch` direto

**NUNCA usar `supabase.functions.invoke` para `generate-protocol`** — trunca payloads. Sempre `fetch` direto com Bearer token.

---

## STATUS DO PROJETO

### ✅ CONCLUÍDO

**Setup completo:** Expo, NativeWind v4, Expo Router, todas as dependências, app.json, variáveis de ambiente.

**Componentes base:**
- `components/ui/CTAButton.tsx`
- `components/ui/ProgressBar.tsx`
- `components/ui/BackButton.tsx`
- `components/ui/OptionCard.tsx`
- `components/ui/Pill.tsx`
- `components/ui/IOSWheelPicker.tsx`
- `components/layouts/QuizLayout.tsx`
- `components/scan/ScanModal.tsx`

**Telas — Onboarding (20 telas):**
`concerns` → `gender` → `birthday` → `skin-type` → `frequency` → `sun-exposure` → `hydration-sleep` → `sunscreen` → `social-proof` → `food-analysis` → `commitment` → `goal` → `final-loading` → `trust` → `plan-preview` → `signup` → `protocol-loading` → `paywall-soft` → `paywall-detailed` → `notifications`

**Tela de Login (acesso direto da Welcome):**
`login` — standalone, sem QuizLayout, acessada pelo botão "Entrar" na Welcome screen

**Telas — Scan flow (5 telas):**
`scan-prep` → `camera` → `loading` → `results` → `food-report`

**Telas — App principal (6 arquivos):**
`(app)/_layout.tsx` (tab bar com FAB laranja), `home.tsx`, `protocolo.tsx`, `analise.tsx`, `evolucao.tsx`, `perfil.tsx`

**Integrações:**
- `lib/supabase.ts` ✅
- `hooks/useAuth.ts` ✅
- `store/onboarding.ts` ✅
- Supabase Auth (Google Sign In) ✅
- Supabase Auth (E-mail + Senha) ✅
- Banco de dados + RLS + trigger ✅
- Edge Functions (analyze-skin, analyze-food, generate-protocol) ✅
- `app/(scan)/food-camera.tsx` ✅
- `app/(onboarding)/protocol-loading.tsx` ✅ — gera protocolo + salva em `protocolos`
- `(app)/protocolo.tsx` ✅ — carrega do cache/Supabase antes de regenerar

---

### ⏳ PENDENTE (em ordem de prioridade)

#### 🔴 1. Apple Sign In
- Apple Developer Program já adquirido
- Configurar no Xcode + Supabase Dashboard
- Botão placeholder já existe em `signup.tsx` e `login.tsx` — só falta conectar a lógica real

#### 🟡 2. RevenueCat — Paywall
- Instalar `react-native-purchases`
- Criar `lib/revenuecat.ts`
- Ativar paywall em `paywall-soft.tsx` e `paywall-detailed.tsx`
- Desbloquear métricas borradas em `results.tsx` para assinantes

#### 🟠 3. Mixpanel — Analytics
- Instalar `mixpanel-react-native`
- Criar `lib/mixpanel.ts`
- Eventos principais: `scan_started`, `scan_completed`, `paywall_shown`, `purchase_started`, `signup_completed`

#### 🟢 4. Melhorias futuras
- Salvar histórico completo nos `food_scans`
- Tela de histórico no perfil
- Push notifications com lembretes da rotina

---

## FLUXO COMPLETO DO APP

```
Welcome
  → [botão "Começar"] Onboarding (19 telas) — setOnboardingField() em cada tela
    → scan-prep → camera (setSkinImage) → loading (analyze-skin) → results
    → goal → plan-preview (skin_score real do store)
    → signup (Google / Apple / E-mail+Senha → saveToSupabase) → protocol-loading (generate-protocol → INSERT protocolos) → paywall-soft → paywall-detailed → notifications
    → App principal (tabs)

  → [botão "Entrar"] Login
    → E-mail + Senha: signInWithEmail → home
    → Google: signInWithGoogle → home
    → Apple: placeholder → home (configuração pendente)

Fluxo de comida (dentro do app principal):
  analise.tsx → food-camera (setFoodImage) → food-report (analyze-food) → protocolo (generate-protocol)
```

### Valores de progresso do onboarding (ProgressBar)

O scan flow é inserido entre `commitment` e `goal` — não no final do onboarding.

| Tela | Progress | Observação |
|---|---|---|
| concerns | 8% | |
| gender | 16% | |
| birthday | 24% | |
| skin-type | 32% | |
| frequency | 36% | |
| sun-exposure | 40% | |
| hydration-sleep | 44% | |
| sunscreen | 52% | |
| social-proof | 56% | |
| food-analysis | 60% | |
| commitment | 64% | |
| **→ SCAN FLOW ENTRA AQUI** | — | scan-prep → camera → loading → results |
| goal | 80% | |
| trust | 88% | |
| plan-preview | 92% | |
| signup | 96% | |
| protocol-loading | sem progress bar | gera e salva protocolo no Supabase |
| paywall-soft | sem progress bar | |
| paywall-detailed | sem progress bar | |
| notifications | sem progress bar | |

---

## ESTRUTURA DE ARQUIVOS

```
niks-ai/
├── app/
│   ├── _layout.tsx                ✅
│   ├── index.tsx                  ✅ Welcome
│   ├── (onboarding)/
│   │   ├── _layout.tsx            ✅
│   │   ├── concerns.tsx           ✅
│   │   ├── gender.tsx             ✅
│   │   ├── birthday.tsx           ✅
│   │   ├── skin-type.tsx          ✅
│   │   ├── frequency.tsx          ✅
│   │   ├── sun-exposure.tsx       ✅
│   │   ├── hydration-sleep.tsx    ✅
│   │   ├── sunscreen.tsx          ✅
│   │   ├── social-proof.tsx       ✅
│   │   ├── food-analysis.tsx      ✅
│   │   ├── commitment.tsx         ✅
│   │   ├── goal.tsx               ✅
│   │   ├── final-loading.tsx      ✅
│   │   ├── trust.tsx              ✅
│   │   ├── plan-preview.tsx       ✅
│   │   ├── signup.tsx             ✅ fluxo dois passos (e-mail/senha + Google/Apple)
│   │   ├── login.tsx              ✅ fluxo dois passos (e-mail/senha + Google/Apple)
│   │   ├── protocol-loading.tsx   ✅ gera protocolo + salva no Supabase
│   │   ├── paywall-soft.tsx       ✅
│   │   ├── paywall-detailed.tsx   ✅
│   │   └── notifications.tsx      ✅
│   ├── (app)/
│   │   ├── _layout.tsx            ✅ Tab bar com FAB laranja
│   │   ├── home.tsx               ✅
│   │   ├── protocolo.tsx          ✅
│   │   ├── analise.tsx            ✅
│   │   ├── evolucao.tsx           ✅
│   │   └── perfil.tsx             ✅
│   └── (scan)/
│       ├── scan-prep.tsx          ✅
│       ├── camera.tsx             ✅
│       ├── food-camera.tsx        ✅
│       ├── loading.tsx            ✅
│       ├── results.tsx            ✅
│       ├── food-report.tsx        ✅
│       └── protocolo.tsx          ✅
├── components/
│   ├── ui/
│   │   ├── CTAButton.tsx          ✅
│   │   ├── BackButton.tsx         ✅
│   │   ├── ProgressBar.tsx        ✅
│   │   ├── OptionCard.tsx         ✅
│   │   ├── Pill.tsx               ✅
│   │   └── IOSWheelPicker.tsx     ✅
│   ├── layouts/
│   │   └── QuizLayout.tsx         ✅
│   └── scan/
│       └── ScanModal.tsx          ✅
├── constants/colors.ts            ✅
├── store/onboarding.ts            ✅
├── lib/supabase.ts                ✅
├── hooks/useAuth.ts               ✅
├── lib/revenuecat.ts              ⏳
├── lib/mixpanel.ts                ⏳
└── hooks/useSubscription.ts       ⏳
```

---

## VARIÁVEIS DE AMBIENTE (`.env`)

```env
EXPO_PUBLIC_SUPABASE_URL=https://utpljvwmeyeqwrfulbfr.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Ainda com placeholder:
EXPO_PUBLIC_REVENUECAT_IOS_KEY=
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=
EXPO_PUBLIC_MIXPANEL_TOKEN=
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
react-native-svg
expo-linear-gradient
lucide-react-native
react-native-reanimated
```

---

*Última atualização: Sessão 5 — Março 2026*
*Status: MVP — todas as telas concluídas + geração e persistência do protocolo no Supabase. Apple Sign In + RevenueCat + Mixpanel pendentes*