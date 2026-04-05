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
| IA | Gemini 2.5 Pro via Supabase Edge Functions |
| Pagamentos | RevenueCat (verificação de entitlement) + Superwall (apresentação do paywall) |
| Analytics | Mixpanel (`mixpanel-react-native`, `useNative=true`) — `lib/mixpanel/` |
| Camera | expo-camera + expo-image-picker |
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
- **Expo Router** para navegação — `useRouter()`, `router.push()`, `router.back()`
- **TypeScript** em tudo — nunca JavaScript puro
- **Nunca inventar cores** — usar sempre `constants/colors.ts`
- **NUNCA chamar APIs de IA diretamente no app** — sempre via Supabase Edge Function
- **SafeAreaView** em todas as telas — respeitar notch e home indicator do iPhone
- **Portrait only** — nunca landscape
- **Max width 393px** — iPhone 14 Pro
- **Store usa `useAppStore`** (de `store/onboarding.ts`) — não `useOnboardingStore`
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
| Onboarding quiz screens design | `kcw7wez680I06tnIMm1ZEz` | Trust, PlanPreview, Goal, Results (onboarding) e outras telas do quiz |
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
  2. git commit -m "fix: confirmação de e-mail, crash analyze-skin e erros de TypeScript. Implementa fluxo completo de confirmação de e-mail (tela de espera + reenvio + deep link handler PKCE/token-based) e corrige crash em produção na analyze-skin adicionando safetySettings BLOCK_NONE e guard para candidates undefined. Corrige erros de TypeScript pré-existentes em useSubscription, notifications e tsconfig, e adiciona retry silencioso de até 2x no fluxo de scan antes de exibir erro ao usuário."
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
Migration aplicada manualmente via SQL Editor do Supabase Dashboard:
```sql
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS rc_original_app_user_id text,
  ADD COLUMN IF NOT EXISTS trial_end_date timestamptz,
  ADD COLUMN IF NOT EXISTS end_date timestamptz,
  ADD COLUMN IF NOT EXISTS start_date timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status);
```

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
sleep text, sunscreen text, birthday text,
push_token text,             -- token Expo Push Notifications (salvo na tela notifications.tsx)
streak_days int4 DEFAULT 0,  -- dias consecutivos com AMBAS as rotinas (manhã + noite) concluídas
last_protocol_completed_at timestamptz  -- última vez que o streak foi incrementado (evita duplo incremento no mesmo dia)
```

Migration aplicada:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_days int4 DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_protocol_completed_at timestamptz;
```

**Colunas extras na tabela `skin_scans`:**
```sql
full_result jsonb  -- objeto ScanResult completo retornado pela analyze-skin
```
Migration aplicada: `ALTER TABLE skin_scans ADD COLUMN IF NOT EXISTS full_result jsonb;` 

**Colunas extras na tabela `food_scans`:**
```sql
meal_name text, meal_score int4, meal_label text, meal_summary text, image_url text,
full_result jsonb  -- objeto FoodAnalysisResult completo retornado pela analyze-food
```
Migration aplicada: `ALTER TABLE food_scans ADD COLUMN IF NOT EXISTS full_result jsonb;`

**Storage bucket:** `scans` — **PRIVADO** — com policies de upload/leitura por `user_id`.

### Edge Functions deployadas

**Comando de deploy:**
```bash
supabase functions deploy <nome> --no-verify-jwt --project-ref utpljvwmeyeqwrfulbfr
```

| Função | Status | Entrada | Saída |
|---|---|---|---|
| `analyze-skin` | ✅ | `{ imageBase64, skinProfile: { skin_type, concerns } }` | `{ skin_score, skin_type_detected, headline, acne: { score, label, insight }, skin_age, pontos_fortes: string[2], pontos_fracos: string[3], disclaimer }` |
| `analyze-food` | ✅ | `{ imageBase64, mimeType, skinProfile: { skin_type, concerns } }` | `{ meal_score, meal_summary, foods[], highlights, watch_out, science_note, disclaimer }` |
| `generate-protocol` | ✅ | `{ baseProtocol?, scanResult, onboardingData }` — `baseProtocol` **opcional**: se omitido, a função usa os protocolos base embutidos em si mesma com base no `skin_type_detected` | `{ morning[], night[], introduction_warnings, expected_timeline }` |
| `send-notifications` | ✅ | `{ type: 'morning_routine' \| 'night_routine' \| 'scan_available' \| 'food_reminder', user_ids?: string[] }` | `{ sent: number, type }` — busca `push_token` dos usuários no Supabase e envia via Expo Push API. `scan_available` filtra automaticamente usuários cujo último scan foi há 7+ dias |
| `revenuecat-webhook` | ✅ | POST do RevenueCat — header `Authorization: Bearer REVENUECAT_WEBHOOK_SECRET` | Retorna sempre HTTP 200. Faz UPSERT em `subscriptions` com base no `app_user_id` (= `user_id` do Supabase). Trata: `INITIAL_PURCHASE`, `RENEWAL`, `TRIAL_STARTED`, `TRIAL_CONVERTED`, `TRIAL_CANCELLED`, `CANCELLATION`, `EXPIRATION`, `UNCANCELLATION` |

**Configuração do webhook no RevenueCat Dashboard:**
- RevenueCat Dashboard → Project → Integrations → Webhooks
- URL: `https://utpljvwmeyeqwrfulbfr.supabase.co/functions/v1/revenuecat-webhook`
- Authorization header: `Bearer <valor do secret REVENUECAT_WEBHOOK_SECRET>`

**Modelo de IA:** `gemini-2.5-pro-preview-03-25` — secret `GEMINI_API_KEY` configurado no Supabase Dashboard (Project Settings → Edge Functions → Secrets).

**Secrets necessários no Supabase Dashboard (Project Settings → Edge Functions → Secrets):**
- `GEMINI_API_KEY` — usado por `analyze-skin`, `analyze-food`, `generate-protocol`
- `REVENUECAT_WEBHOOK_SECRET` — usado por `revenuecat-webhook` para validar o header `Authorization`

**Configuração Gemini nas Edge Functions:**
- `maxOutputTokens`: 2048 para `analyze-skin`; 4096 para `analyze-food`; 8192 para `generate-protocol`
- `system_instruction` separa o system prompt do user message (equivalente ao `system` do Claude)
- Imagens enviadas via `inlineData: { mimeType, data: base64 }` (não via URL)
- `safetySettings` com `BLOCK_NONE` em todas as categorias — obrigatório em **todas as funções de análise de imagem** (`analyze-skin` e `analyze-food`), senão o Gemini bloqueia a requisição e não retorna `candidates`, causando crash
- JSON parsing: tenta extrair bloco ` ```json ``` ` primeiro, depois fallback para `\{[\s\S]*\}` — Gemini pode retornar markdown em vez de JSON puro
- Deploy com `--no-verify-jwt` — obrigatório, senão retorna `Invalid JWT`
- `generate-protocol` tem os protocolos base (`BASE_PROTOCOLS` para os 4 tipos de pele) embutidos diretamente na Edge Function — `baseProtocol` no body é opcional; se omitido, a função seleciona o protocolo correto pelo `skin_type_detected`. A IA ajusta o protocolo, não cria do zero

### Push Notifications (`pg_cron`)

3 jobs agendados no Supabase via `pg_cron` + `pg_net`. Todos chamam a Edge Function `send-notifications`:

| Job | Schedule (UTC) | Horário Brasília | Comportamento |
|---|---|---|---|
| `morning-routine` | `0 10 * * *` | Todo dia às 7h | Envia para todos os usuários com `push_token` |
| `night-routine` | `0 0 * * *` | Todo dia às 21h | Envia para todos os usuários com `push_token` |
| `scan-available` | `0 13 * * *` | Todo dia às 10h | Envia apenas para usuários cujo último scan foi há 7+ dias |

**⚠️ Pendência:** `push_token` real só é gerado após build no TestFlight/produção. O entitlement `aps-environment: production` está configurado no `app.json`.

### Autenticação
- **Google Sign In:** ✅ funcionando
  - iOS Client ID: `436683236946-36te4gp3c6eid9frheokli00j0pnocd4.apps.googleusercontent.com`
  - Skip nonce checks ativado no Supabase (obrigatório para iOS)
- **Apple Sign In:** ✅ funcionando — `signInWithApple` em `hooks/useAuth.ts` (com nonce via `expo-crypto`); `signup.tsx` e `login.tsx` conectados
  - Team ID: `FZRSWCG9BR` | Key ID: `CM6P7WPAP2`
  - ⚠️ **JWT secret key expira em setembro/2026** — regenerar com o script do README e atualizar no Supabase Dashboard (Authentication → Providers → Apple → Secret Key)
- **Exclusão de conta:** `deleteAccount` em `hooks/useAuth.ts` — chama `supabase.rpc('delete_user')` + signOut do Google + `supabase.auth.signOut()`. Requer a SQL function `delete_user()` deployada no Supabase.
- **E-mail + Senha:** ✅ funcionando — `signInWithEmail` e `signUpWithEmail` em `hooks/useAuth.ts`
  - Confirmação de e-mail: infraestrutura implementada e pronta. Atualmente **desativada** no Supabase Dashboard — ativar quando aprovado na App Store.
  - `emailRedirectTo: 'niks-ai://auth/confirm'` — configurado no `signUp` de `app/(onboarding)/signup.tsx`. O scheme `niks-ai` está em `app.json`.
  - Deep link handler em `app/_layout.tsx` suporta dois fluxos: PKCE (`code=` → `exchangeCodeForSession`) e token-based (`access_token=` no fragmento `#` → `setSession`). O `onAuthStateChange` detecta a sessão e redireciona automaticamente — sem navegação manual necessária.

---

## ESTADO DO STORE (`store/onboarding.ts`)

Exporta `useAppStore` (não `useOnboardingStore`).

**Tipos exportados:** `SkinMetric`, `ScanResult`, `ProtocolStep`, `ProtocolResult`, `OnboardingData`, `FoodReportResult`

**Tipo `ScanResult` (schema atual — Sessão 11):**
```typescript
{
  skin_score: number
  skin_type_detected: 'seca' | 'oleosa' | 'mista' | 'normal'
  headline: string
  acne: SkinMetric          // { score, label, insight }
  skin_age: number          // idade aparente da pele em anos
  pontos_fortes: string[]   // 2 destaques positivos
  pontos_fracos: string[]   // 3 áreas de atenção
  disclaimer: string
  // ATENÇÃO: scans antigos têm 'metrics', 'top_concerns', 'positive_highlights' — usar ?. ao acessar
}
```

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
- `selectedScan: { result: ScanResult; imageUri: string } | null` — scan selecionado no carrossel da home; limpo automaticamente ao sair de `skin-result.tsx`
- `selectedFoodResult: FoodReportResult | null` — resultado salvo de food scan selecionado na home; exibido sem re-análise em `food-report.tsx`; limpo ao sair da tela ou iniciar novo scan

**Métodos:**
- `setOnboardingField(field, value)`
- `setFoodImage(base64, mimeType)`
- `setSkinImage(base64, uri)`
- `setScanResult(result, imageUri)`
- `setProtocolResult(result)` — armazena protocolo gerado para uso na aba `(app)/protocolo.tsx`
- `setSelectedScan(scan | null)` — define qual scan do carrossel abrir em `skin-result.tsx`
- `setSelectedFoodResult(result | null)` — define/limpa o food scan selecionado para visualização em `food-report.tsx`
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
| `analyze-skin` | `fetch` direto | payload contém imageBase64 grande |
| `analyze-food` | `fetch` direto | payload contém imageBase64 grande |
| `generate-protocol` | `supabase.functions.invoke` ✅ | funciona após deploy com `--no-verify-jwt` |

**NUNCA usar `supabase.functions.invoke` para `analyze-skin` e `analyze-food`** — trunca o base64 da imagem. Para `generate-protocol`, o `supabase.functions.invoke` é preferido pois gerencia o JWT automaticamente.

Exemplo para funções com imagem (`fetch` direto):
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

Exemplo para `generate-protocol` (`supabase.functions.invoke`):
```typescript
const { data, error } = await supabase.functions.invoke('generate-protocol', {
  body: { baseProtocol, scanResult, onboardingData },
});
```

### 3. Simulador iOS
Não tem câmera real. `camera.tsx` detecta via `Platform.OS === 'ios' && __DEV__` e mostra botão de galeria.

### 4. Imagem de comida
Redimensionada para 512px + compress 0.5 via `expo-image-manipulator` antes de salvar no store (~52KB).

### 5. Métricas borradas em results.tsx
Os scores de hidratação, oleosidade etc. são **intencionalmente** ocultados — só desbloqueados para assinantes (integração RevenueCat pendente).

### 6. Geração e cache do protocolo personalizado
O protocolo é gerado **uma única vez** na tela `protocol-loading` (logo após o signup) usando um **template base** de `constants/protocols.ts` que a IA ajusta conforme o scan. Salvo em dois lugares:
1. **Zustand store** (`protocolResult`) — para acesso imediato sem nova chamada à API
2. **Supabase `protocolos`** — para persistência entre sessões

A aba `(app)/protocolo.tsx` carrega na seguinte ordem de prioridade:
1. Store cache (se ainda estiver na sessão)
2. Supabase (busca o registro mais recente por `user_id`)
3. Fallback: chama `generate-protocol` novamente via `fetch` direto (com JWT manual) — envia `baseProtocol` derivado de `constants/protocols.ts` + `scanResult` + `onboardingData`

### 8. Storage bucket `scans` é PRIVADO — usar `createSignedUrl`

O bucket `scans` é privado. `getPublicUrl()` retorna uma URL que responde 403. **Sempre usar `createSignedUrl(path, 31536000)`** (TTL de 1 ano) para gerar a URL que vai para `foto_url` no banco.

```typescript
const { data: signed } = await supabase.storage.from('scans').createSignedUrl(path, 31536000);
fotoUrl = signed?.signedUrl ?? supabase.storage.from('scans').getPublicUrl(path).data.publicUrl;
```

Isso se aplica em: `store/onboarding.ts` (`uploadScanPhoto`), `app/(scan)/loading.tsx`, e `app/(app)/home.tsx` (repair de foto do onboarding).

---

### 7. Cooldown de 7 dias para scan de rosto
O botão "Scanear Rosto" no `ScanModal` consulta `skin_scans` (campo `created_at`) para calcular quanto tempo falta desde o último scan do usuário. A lógica vive inteiramente no frontend — nenhuma coluna extra no Supabase foi necessária.

**Régua de exibição:**
- > 48h restantes → "próxima análise em X dias"
- ≤ 48h restantes → "próxima análise em Xh"
- 0 → disponível normalmente

Quando bloqueado: card acinzentado, ícone `Lock` (lucide-react-native), `onPress` desabilitado. A contagem é individual por usuário pois usa o `created_at` do próprio registro.

**Import:** usar caminho relativo `../../lib/supabase` — o alias `@/` não resolve dentro de `components/scan/`.

---

### 10. Refs obrigatórias em callbacks assíncronas de animação (`protocolo.tsx`)

Qualquer valor de state (`useState`) capturado dentro de callbacks assíncronas — especialmente `Animated.timing().start(callback)` e `setTimeout` — é **estale**: reflete o valor do render em que a função foi criada, não o valor atual.

**Regra:** toda variável de state que é lida dentro de uma callback de animação ou setTimeout em `protocolo.tsx` **deve ter um ref espelho** atualizado por `useEffect`:

```typescript
const streakDaysRef = useRef(0);
useEffect(() => { streakDaysRef.current = streakDays; }, [streakDays]);
// Dentro da callback: usar streakDaysRef.current, nunca streakDays
```

Refs atualmente necessárias em `protocolo.tsx`: `checkedItemsRef`, `stepsRef`, `celebrationTriggeredRef`, `morningStepsRef`, `nightStepsRef`, `streakDaysRef`, `lastCompletedAtRef`.

---

### 9. Consentimento de uso de IA — uma única vez por instalação (LGPD)

Antes de qualquer scan (facial ou alimentar), o app exibe um modal de consentimento informando que a foto é processada pelo Google Gemini. Após aceite, o consentimento é salvo em `AsyncStorage` com a chave `"ai_consent_accepted"` (valor `"true"`) e o modal nunca mais aparece.

**Dois pontos de interceptação:**
- `app/(scan)/scan-prep.tsx` — cobre o onboarding (usuário nunca passa pelo ScanModal no primeiro scan)
- `components/scan/ScanModal.tsx` — cobre os scans do app principal (facial e alimentar)

**Componentes:**
- `hooks/useAIConsent.ts` — `requestConsent(onGranted)`: verifica AsyncStorage; se já aceitou, chama `onGranted()` direto; se não, abre o modal e guarda a ação pendente em `pendingAction`
- `components/ui/AIConsentModal.tsx` — o backdrop **não fecha** o modal (consentimento explícito obrigatório); "Cancelar" fecha sem prosseguir para o scan

**Atenção ao integrar em novas telas:** `CTAButton` executa `onPress` e `to` simultaneamente. Ao usar `requestConsent`, sempre remover o `to` e usar apenas `onPress` — senão a navegação dispara antes do consentimento.

---

### 11. Guard de assinatura — Superwall + RevenueCat

O paywall é gerenciado pelo **Superwall** (`expo-superwall`). O `<SuperwallProvider>` está em `app/_layout.tsx` (raiz), logo abaixo do `<MixpanelProvider>` — acima de `GestureHandlerRootView` e `SafeAreaProvider`.

**API Key iOS:** `pk_4iUsZwW_-ME9WdK3IcXYp`  
**Placement identifier:** `paywall_onboarding`

O acesso ao app é verificado em 3 pontos, em ordem. Em todos eles, o RevenueCat (`getCustomerInfo` + `isSubscribed`) determina se o usuário tem acesso:

- `app/index.tsx` — ao abrir o app com sessão ativa → não-assinante: `registerPlacement` direto
- `app/(onboarding)/login.tsx` — `routeAfterLogin()` após qualquer método de login → não-assinante: `registerPlacement` direto
- **`app/(app)/_layout.tsx`** — guard definitivo: não-assinante aciona `registerPlacement`; assinante: `setReady(true)` → tabs renderizam

O guard em `(app)/_layout.tsx` tem um **timeout de 8s**: se `getCustomerInfo()` travar (rede lenta), o timer dispara e aciona o Superwall. `setReady(true)` é chamado **antes** de `registerPlacement` em todos os caminhos — o Superwall aparece como overlay sobre as tabs em vez de bloquear o render com `null`.

**`usePlacement`** deve ser chamado em componentes descendentes do `SuperwallProvider`. Em `(app)/_layout.tsx`, isso é garantido porque o provider está na raiz.

#### `paywall-soft.tsx` — tela dedicada para paywall pós-onboarding

Ao final do onboarding (`notifications.tsx`), o Superwall **não** é acionado diretamente. Em vez disso, `notifications.tsx` navega para `app/(onboarding)/paywall-soft.tsx`, que chama `registerPlacement` com callbacks:

```typescript
const { registerPlacement } = usePlacement({
  onDismiss: async () => await navigateToApp(),  // usuário fechou (assinou, restaurou ou dispensou)
  onSkip: async () => await navigateToApp(),      // Superwall não exibiu (holdout, já assinante)
  onError: async () => router.replace('/(app)/home'),
});
```

**Por que esta abordagem:** `registerPlacement` retorna uma `Promise<void>` que resolve **imediatamente** após registrar o placement com o SDK nativo — **não** após o paywall ser fechado. Fazer `await registerPlacement(...)` e depois navegar resulta em navegação antes da interação do usuário. A navegação pós-paywall deve sempre acontecer nos callbacks `onDismiss`/`onSkip`/`onError`.

---

### 12. Analytics — Mixpanel

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
        <AppShell>          ← chama useScreenTracking()
          <Stack />
```

**Super properties registradas no init** (enviadas em todos os eventos automaticamente):
`platform`, `app_version`, `data_source: 'app'`

**Eventos do onboarding:**

| Evento | Onde dispara | Propriedades |
|---|---|---|
| `onboarding_started` | `(onboarding)/_layout.tsx` — ao confirmar que usuário está no fluxo | `onboarding_version: '1.0'`, `total_steps: 23` |
| `onboarding_step_completed` | Botão "Continuar" / navegação de cada tela | `step_number`, `step_name`, `step_total: 23` |
| `onboarding_completed` | `paywall-detailed.tsx` — no mount | `$duration` calculado automaticamente pelo SDK |
| `Screen Viewed` | Toda mudança de rota (automático via `useScreenTracking`) | `screen_name`, `pathname` |

**`onboarding_completed` — efeitos colaterais (também em `paywall-detailed.tsx` mount):**
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

> ⚠️ `useMixpanel()` só funciona em componentes descendentes do `<MixpanelProvider>` (toda a árvore do app, pois está na raiz). Nunca usar `mixpanel` diretamente do `mixpanelClient` fora do contexto React — usar sempre o hook.

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
- `components/scan/ScanModal.tsx` — cooldown de 7 dias para scan de rosto (consulta `skin_scans` no Supabase; exibe contagem regressiva em dias ou horas; bloqueia navegação quando indisponível); intercepta ambos os cards com `useAIConsent` antes de navegar
- `components/ui/AIConsentModal.tsx` — modal de consentimento de uso de IA (LGPD); bottom sheet animado com `Animated.spring`; backdrop não fecha o modal; link inline para Política de Privacidade


**Telas — Onboarding (20 telas):**
`concerns` → `gender` → `birthday` → `skin-type` → `frequency` → `sun-exposure` → `hydration-sleep` → `sunscreen` → `social-proof` → `food-analysis` → `commitment` → `goal` → `final-loading` → `trust` → `plan-preview` → `signup` → `protocol-loading` → `paywall-soft` → `paywall-detailed` → `notifications`

**Tela de Login (acesso direto da Welcome):**
`login` — standalone, sem QuizLayout, acessada pelo botão "Entrar" na Welcome screen

**Telas — Scan flow (7 telas):**
`scan-prep` → `camera` → `loading` → `rate-us` → `results` → `food-scan-intro` → `food-camera` → `food-report`

**`food-report.tsx` — modo duplo:**
- **Nova análise** (`selectedFoodResult === null`): chama `analyze-food`, salva resultado em `food_scans` (incluindo `full_result` jsonb + foto no Storage), exibe resultado
- **Visualização salva** (`selectedFoodResult !== null`): exibe `full_result` do store instantaneamente, sem chamada à IA; botão "Voltar para tela inicial" (coral, ArrowLeft) via `router.replace`

**Telas — App principal (8 arquivos):**
`(app)/_layout.tsx` (tab bar sem FAB), `home.tsx`, `skin-result.tsx` (resultado da análise facial in-app), `protocolo.tsx`, `analise.tsx`, `evolucao.tsx` (oculta), `perfil.tsx`, `set-name.tsx` (definir nome do usuário)

**Integrações:**
- `lib/supabase.ts` ✅
- `hooks/useAuth.ts` ✅
- `store/onboarding.ts` ✅
- Supabase Auth (Google Sign In) ✅
- Supabase Auth (E-mail + Senha) ✅
- Banco de dados + RLS + trigger ✅
- Edge Functions (analyze-skin, analyze-food, generate-protocol, send-notifications) ✅
- `app/(scan)/food-camera.tsx` ✅
- `app/(onboarding)/protocol-loading.tsx` ✅ — gera protocolo + salva em `protocolos`
- `(app)/protocolo.tsx` ✅ — carrega do cache/Supabase antes de regenerar
- Push Notifications ✅ — `lib/notifications.ts` + `notifications.tsx` + Edge Function `send-notifications` + 3 jobs `pg_cron`
- RevenueCat ✅ — `lib/revenuecat.ts` + `hooks/useSubscription.ts`; entitlement `premium`; produtos `br.com.niksai.app.mensal` e `br.com.niksai.app.anual`; offering `default` configurado no Dashboard

**⚠️ GOTCHA — In-App Purchase Capability:** Sem a capability ativada no Xcode, `getOfferings()` falha silenciosamente em builds de produção (`.catch` engole o erro → `pkg = null` → alerta "Produto não disponível"). No simulador não acontece. **Localização:** Xcode → Target NIKSAI → Signing & Capabilities → `+ Capability` → In-App Purchase

---

## FLUXO COMPLETO DO APP

```
→ [app aberto com sessão ativa] → spinner → verifica assinatura (RevenueCat) → assinante: home | não-assinante: paywall-soft (guard em (onboarding)/_layout.tsx também aplica a mesma lógica)

Welcome
  → [botão "Começar"] Onboarding (19 telas) — setOnboardingField() em cada tela
    → scan-prep → camera (setSkinImage) → loading (analyze-skin) → rate-us → results
    → goal → plan-preview (skin_score real do store)
    → signup (Google / Apple / E-mail+Senha → saveToSupabase) → protocol-loading (generate-protocol → INSERT protocolos) → paywall-soft → paywall-detailed → notifications
    → App principal (tabs)

  → [botão "Entrar"] Login
    → E-mail + Senha / Google / Apple → verifica assinatura (RevenueCat) → assinante: home | não-assinante: paywall-soft

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
│   │   └── notifications.tsx      ✅ pede permissão + salva push_token no Supabase
│   ├── (app)/
│   │   ├── _layout.tsx            ✅ Tab bar: scanear/protocolo/perfil (sem FAB, sem evolução)
│   │   ├── home.tsx               ✅ Novo design: Hoje + Scanear + Skin Card; "Ver resultado" → skin-result
│   │   ├── skin-result.tsx        ✅ Tela de resultado da análise facial (in-app, métricas reais)
│   │   ├── protocolo.tsx          ✅
│   │   ├── analise.tsx            ✅
│   │   ├── evolucao.tsx           🚫 oculta (href: null) — removida da tab bar
│   │   ├── perfil.tsx             ✅ redesenhado (Figma cFsFcVSjOMkTdHIJpHgSDk): nome dinâmico, email, notificações, suporte
│   │   └── set-name.tsx           ✅ definir nome/sobrenome → salva em users.nome no Supabase
│   └── (scan)/
│       ├── scan-prep.tsx          ✅
│       ├── camera.tsx             ✅
│       ├── food-camera.tsx        ✅
│       ├── loading.tsx            ✅
│       ├── rate-us.tsx            ✅ tela de avaliação (entre loading e results)
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
│   │   ├── IOSWheelPicker.tsx     ✅
│   │   └── AIConsentModal.tsx     ✅ modal de consentimento de IA (LGPD) — uma única vez por instalação
│   ├── layouts/
│   │   └── QuizLayout.tsx         ✅
│   └── scan/
│       └── ScanModal.tsx          ✅
├── constants/colors.ts            ✅
├── constants/protocols.ts         ✅ templates base por tipo de pele (normal/seca/oleosa/mista) — IA ajusta
├── store/onboarding.ts            ✅
├── lib/supabase.ts                ✅
├── lib/notifications.ts           ✅ requestPushPermission() + savePushToken() — requer Apple Developer Program para token real
├── hooks/useAuth.ts               ✅
├── hooks/useAIConsent.ts          ✅ requestConsent(), handleAccept/Decline — AsyncStorage key: "ai_consent_accepted"
├── assets/trust-hands.png         ✅ ilustração de palmas (Figma Make kcw7wez680I06tnIMm1ZEz)
├── lib/revenuecat.ts              ✅ initRevenueCat, getPackages, purchasePackage, restorePurchases, isSubscribed
├── lib/storeReview.ts             ✅ requestAppReview() — popup nativo via expo-store-review com fallback para App Store (id6760590018)
└── hooks/useSubscription.ts       ✅ useSubscription() — checa entitlement `premium` em tempo real
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
expo-notifications
expo-audio          ← som de check em protocolo.tsx (useAudioPlayer)
expo-store-review   ← popup nativo de avaliação — funciona apenas em TestFlight/produção; em dev cai no fallback da App Store
react-native-svg
expo-linear-gradient
lucide-react-native
react-native-reanimated
```

---

## DESIGN SYSTEM — HOME SCREEN (Sessão 6)

### Tela Home (`app/(app)/home.tsx`)
Redesenhada com base no Figma Make `sxih7FXdLGWu1lKovpOjIa`. Layout (de cima para baixo):
1. **Top Bar** — Logo NIKS AI (sem ícone de configurações)
2. **Seção "Hoje"** — Cards de refeições reais do Supabase (`food_scans`, filtrado por dia com reset às 2h30); empty state com ilustração de cards empilhados quando não há refeições. Ao clicar: carrega `full_result` do banco → abre `food-report.tsx` instantaneamente sem chamar a IA
3. **Botão "Scanear"** — Full-width coral (`#FB7B6B`), abre `ScanModal`
4. **Carrossel de Scans** — `FlatList` horizontal com os últimos 5 scans do usuário (buscados via `useFocusEffect` da tabela `skin_scans`). Cada slide: foto (280px, gradient overlay), data, badge com score, dots de paginação dinâmicos, botão "Ver resultado". Estado vazio: card cinza "Nenhuma análise ainda".

### ScanModal (`components/scan/ScanModal.tsx`)
Redesenhado com base no Figma Make `sxih7FXdLGWu1lKovpOjIa`. Bottom sheet vertical com:
- Handle + Título "Escolha o tipo de scan" + Subtítulo
- Card **"Scanear Alimento"** (Utensils coral + badge verde "⭐ MAIS USADO" + chevron)
- Card **"Scanear Rosto"** (Camera coral + chevron) — bloqueado durante cooldown (ícone `Lock` lucide)
- Botão **"Cancelar"** (card branco)
- Animação: `Animated.spring` translateY (slide up)

### Tela de Resultado Facial — App (`app/(app)/skin-result.tsx`)
Tela dedicada acessada via "Ver resultado" na home (substitui o redirecionamento para a tela de onboarding). Estrutura:
1. **Header** — back button circular + título "Análise Facial"
2. **Card Hero** — foto do rosto (280px, `resizeMode="cover"`), badge coral com skin score, tipo de pele + mini score ring no rodapé
3. **Headline da IA** — card branco com ícone `Sparkles` coral + texto `headline`
4. **Métricas detalhadas** — 6 `MetricCard` empilhados: ponto colorido + nome, score real (`XX/100`) na cor da métrica, barra de progresso colorida, insight gerado pela IA
5. **Principais preocupações** — card branco com `AlertTriangle` amarelo + lista de `top_concerns`
6. **Pontos positivos** — card branco com `CheckCircle` verde + lista de `positive_highlights`
7. **Disclaimer** — texto pequeno cinza com ícone `Info`

**Dados lidos do Zustand:** `selectedScan` (quando aberto via carrossel) com fallback para `scanResult`/`scanImageUri` (quando aberto direto do scan flow). `selectedScan` é limpo no `useEffect` de desmontagem.
**Métricas:** exibidas com scores reais (sem blur) — esta tela é exclusiva do app, não do onboarding

### Tab Bar (`app/(app)/_layout.tsx`)
Redesenhada com base no Figma Make `cFsFcVSjOMkTdHIJpHgSDk`:
- **Container**: branco, `borderRadius: 20`, borda `#F0F0F0` (não mais pílula cinza)
- **3 tabs**: `Scan` "scanear" · `Droplet` "protocolo" · `User` "perfil" (labels em minúsculo)
- **Ativo**: coral `#FB7B6B` · **Inativo**: `#8A8A8E`
- **Ícone**: tamanho 28, `strokeWidth: 1.5`, sem `fill`
- FAB laranja (`+`) **removido definitivamente**
- Telas ocultas (`href: null`): `evolucao`, `set-name`, `skin-result`

### Tela de Perfil (`app/(app)/perfil.tsx`)
Redesenhada com base no Figma Make `cFsFcVSjOMkTdHIJpHgSDk`. Layout (de cima para baixo):
1. **Top Bar** — "NIKS AI" (sem ícone de configurações)
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
Redesenhada com base no Figma Make `gZ5sSJErlJ3lcBTaqzwgjN` (Sessão 12). Layout:
1. **Header** — "Seu Protocolo" (28px, font-800, `#1D3A44`)
2. **Tab Toggle** — 2 botões pill com `Sun`/`Moon` (48px). Ativo: coral `#FB7B6B` sólido; Inativo: outline `#1D3A44`
3. **Barra de progresso** — texto "X de Y passos concluídos" + barra coral animada (`Animated.timing`, 400ms)
4. **Cards de passo** — card branco `borderRadius: 16`, borda `#F0F0F0`:
   - Círculo numerado 40×40 (coral manhã / `#1D3A44` noite) + nome + tag de dias opcional + ingredient + instruction
   - Checkbox circular 24×24 no canto superior direito (vazio quando pendente; verde `#4CAF50` + ícone `Check` quando marcado)
   - Ao marcar: círculo esquerdo anima para verde, card anima para `#E8F5E9`, haptic medium + som (`assets/sounds/check.mp3` via `expo-audio`), depois card sai com animação de opacidade + scaleY
   - Botão "Ver passo a passo" (`#F0F9F5`, texto `#7CB69D`, ícone `Info`)
5. **Seção "Concluídos hoje"** — colapsável (começa fechada); itens esmaecidos com risco no texto; toque desmarca o item
6. **Card de celebração** — aparece ao concluir todos os passos do período; verde `#E8F5E9`, borda `#4CAF50`, ícone `CheckCircle`; mostra streak se ambas as rotinas do dia estiverem concluídas
7. **Modal "Ver passo a passo"** — `Modal` nativo (`transparent + animationType: 'slide'`), handle + instrução dividida em sub-passos numerados + botão "Entendi" coral
8. **Nota de Observação** (aba noite) — card `#FDFDFD` exibindo `protocol.introduction_warnings`

**Estado de conclusão (AsyncStorage):** chave `protocolo_check_YYYY-MM-DD_morning` e `protocolo_check_YYYY-MM-DD_night` — valor: JSON array de índices marcados. Reseta automaticamente no novo dia. Estado independente por período.

**Lógica de streak:** `streak_days` em `users` só é incrementado quando **manhã E noite** estão ambas 100% concluídas no mesmo dia. Usa `last_protocol_completed_at` para garantir que sobe apenas uma vez por dia. Streak exibido somente se `bothCompleted === true`.

**Som:** `assets/sounds/check.mp3` carregado via `useAudioPlayer` de `expo-audio`. Tocado a cada item marcado junto com o haptic.

**Tag de dias da semana:** helper `getDayTag(step)` detecta padrões de dias em `ingredient` (ex: `(Seg/Qua/Sex)`) e `waitTime` via regex. Se detectado, exibe badge coral `#FFF5F4` ao lado do nome. `isTimeWait()` separa tempos reais (ex: "5 min") de schedules de dias para exibição correta.

**Overflow prevention:** `flex: 1, minWidth: 0` no container + `flexWrap: 'wrap'` na linha nome+tag + `flexShrink: 1` em todos os `Text` — nenhum texto gerado pela IA vaza fora do card branco.

---

*Última atualização: Sessão 18 — Março 2026*
*Status: MVP — RevenueCat ✅; guard de assinatura completo (4 pontos de verificação + timeout 8s); gamificação do protocolo; avaliação nativa (expo-store-review); push notifications ✅; App Store ID: id6760590018.*