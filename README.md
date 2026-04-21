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
| IA | Gemini 3 Flash Preview (`analyze-skin`, `generate-protocol`) / Gemini 2.5 Pro (`analyze-food`) via Supabase Edge Functions |
| Pagamentos | RevenueCat (verificação de entitlement) + Superwall (apresentação do paywall) |
| Analytics | Mixpanel (`mixpanel-react-native`, `useNative=true`) — `lib/mixpanel/` |
| Camera | expo-camera + expo-image-picker |
| Vídeo | expo-video (`useVideoPlayer` + `VideoView`) — usado na tela Welcome |
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
  - **Exceção — telas redesenhadas:** `scan-prep`, `rate-us`, `trust`, `plan-preview`, `signup`, `login`, `skincare-routine`, `skincare-routine-detail`, `allergies`, `allergies-detail` e outras telas redesenhadas usam **inline styles + `Colors` constants** (não NativeWind). Padrão: `LinearGradient` rosa→branco como fundo, botão voltar circular `rgba(255,255,255,0.85)` com `ChevronLeft`, barra de progresso manual, botões pill `borderRadius: 100`, campos de texto com borda `Colors.scanBtn` ao focar. Novas telas do onboarding devem seguir esse padrão, não o `QuizLayout`.
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
| `expected_timeline.two_weeks` | `dicas[1]` |
| `expected_timeline.one_month` | `dicas[2]` |
| `expected_timeline.three_months` | `dicas[3]` |
| `introduction_schedule` | `dicas[4]` |

> ⚠️ O array `dicas` usa índices fixos (nunca push condicional). `protocol-loading.tsx` monta o array com posições garantidas — se um campo for null, salva null na posição. Isso garante que `dicas[4]` seja sempre `introduction_schedule`.

**Colunas extras na tabela `users`:**
```sql
genero text, idade int4, tipo_pele text,
concerns text[] DEFAULT '{}', objetivo text,
frequency text, sun_exposure text, hydration text,
sleep text, sunscreen text, birthday text,
pregnancy_status text,              -- 'none' | 'pregnant' | 'breastfeeding' | 'trying' — só coletado para gênero Feminino
skincare_routine_type text,         -- 'zero' | 'complement' | 'prescribed' | 'unsure'
skincare_routine_description text,  -- texto livre (só coletado para complement/prescribed)
allergy_type text,                  -- 'none' | 'sensitive' | 'reaction'
allergy_description text,           -- texto livre (só coletado para reaction)
push_token text,                    -- token Expo Push Notifications (salvo na tela notifications.tsx)
streak_days int4 DEFAULT 0,         -- dias consecutivos com AMBAS as rotinas (manhã + noite) concluídas
last_protocol_completed_at timestamptz  -- última vez que o streak foi incrementado (evita duplo incremento no mesmo dia)
```

Migration aplicada:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_days int4 DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_protocol_completed_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pregnancy_status text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS skincare_routine_type text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS skincare_routine_description text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS allergy_type text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS allergy_description text;
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
| `analyze-skin` | ✅ | `{ imageBase64, skinProfile: { skin_type, concerns, genero, idade, sun_exposure, hydration, sleep, sunscreen, objetivo } }` | Schema clínico completo — ver tipo `ScanResult` no store. Campos-chave: `skin_score`, `skin_type_detected`, `headline`, `acne`, `envelhecimento`, `pigmentacao`, `cicatrizes`, `rosacea`, `textura_poros`, `barrier_status`, `qualidade_foto`, `confianca_analise`, `prioridade_clinica`, `contraindicacoes`, `pontos_fortes: string[2]`, `pontos_fracos: string[3]`, `skin_strengths[2]`, `action_recommendations[4]`, `region_insights[]` (apenas regiões com condição relevante), `goal_alignment` (apenas se `objetivo` informado), `disclaimer` |
| `analyze-food` | ✅ | `{ imageBase64, mimeType, skinProfile: { skin_type, concerns } }` | `{ meal_score, meal_summary, foods[], highlights, watch_out, science_note, disclaimer }` |
| `generate-protocol` | ✅ | `{ scanResult, onboardingData }` | `{ morning[], night[], introduction_warnings, expected_timeline, introduction_schedule }` — cada item de `morning`/`night` contém: `id, name, ingredient, instruction, steps: string[], color, waitTime, product_suggestions`. **Não retorna `schedule`** — dias da semana vêm embutidos no campo `ingredient` como sufixo `(Seg/Qua/Sex)` e são parseados no cliente via `applySchedule` em `protocolo.tsx`. |
| `send-notifications` | ✅ | `{ type: 'morning_routine' \| 'night_routine' \| 'food_reminder', user_ids?: string[] }` | `{ sent: number, type }` — busca `push_token` dos usuários no Supabase e envia via Expo Push API |
| `revenuecat-webhook` | ✅ | POST do RevenueCat — header `Authorization: Bearer REVENUECAT_WEBHOOK_SECRET` | Retorna sempre HTTP 200. Faz UPSERT em `subscriptions` com base no `app_user_id` (= `user_id` do Supabase). Trata: `INITIAL_PURCHASE`, `RENEWAL`, `TRIAL_STARTED`, `TRIAL_CONVERTED`, `TRIAL_CANCELLED`, `CANCELLATION`, `EXPIRATION`, `UNCANCELLATION` |

**Configuração do webhook no RevenueCat Dashboard:**
- RevenueCat Dashboard → Project → Integrations → Webhooks
- URL: `https://utpljvwmeyeqwrfulbfr.supabase.co/functions/v1/revenuecat-webhook`
- Authorization header: `Bearer <valor do secret REVENUECAT_WEBHOOK_SECRET>`

**Modelos de IA:**
- `analyze-skin`: `gemini-3-flash-preview` (mais rápido, custo menor)
- `analyze-food`: `gemini-2.5-pro` (mais preciso para tarefas complexas)
- `generate-protocol`: `gemini-3-flash-preview`

Secret `GEMINI_API_KEY` configurado no Supabase Dashboard (Project Settings → Edge Functions → Secrets).

**Secrets necessários no Supabase Dashboard (Project Settings → Edge Functions → Secrets):**
- `GEMINI_API_KEY` — usado por `analyze-skin`, `analyze-food`, `generate-protocol`
- `REVENUECAT_WEBHOOK_SECRET` — usado por `revenuecat-webhook` para validar o header `Authorization`

**Configuração Gemini nas Edge Functions:**
- `maxOutputTokens`: 4096 para `analyze-skin`; 4096 para `analyze-food`; 8192 para `generate-protocol`
- `system_instruction` separa o system prompt do user message (equivalente ao `system` do Claude)
- Imagens enviadas via `inlineData: { mimeType, data: base64 }` (não via URL)
- `safetySettings` com `BLOCK_NONE` em todas as categorias — obrigatório em **todas as funções de análise de imagem** (`analyze-skin` e `analyze-food`), senão o Gemini bloqueia a requisição e não retorna `candidates`, causando crash
- JSON parsing: tenta extrair bloco ` ```json ``` ` primeiro, depois fallback para `\{[\s\S]*\}` — Gemini pode retornar markdown em vez de JSON puro
- Deploy com `--no-verify-jwt` — obrigatório, senão retorna `Invalid JWT`
- **Retry interno de Gemini 503 em `analyze-skin` e `analyze-food`:** o Gemini retorna 503 `UNAVAILABLE` com frequência sob alta demanda. Ambas as Edge Functions têm loop de **3 tentativas** com **3s de espera** entre elas antes de retornar erro ao app — não remover esse loop.
- `generate-protocol` gera o protocolo **do zero** com um system prompt dermatológico clínico extenso (hierarquia clínica, regras cronobiológicas, incompatibilidades, adaptações por fotótipo). Não usa mais `BASE_PROTOCOLS` nem recebe `baseProtocol` — o campo é ignorado se enviado
- **`generate-protocol` usa SSE streaming (`streamGenerateContent?alt=sse`)** para evitar o IDLE_TIMEOUT de 150s da Supabase Edge Runtime — se a geração demorar mais que 150s sem tráfego de dados, a Supabase encerra a conexão. A função transmite os chunks SSE do Gemini em tempo real como `text/plain; charset=utf-8`. No cliente (`protocol-loading.tsx`), a resposta é lida com `response.text()` seguido de `JSON.parse()` — **nunca usar `response.json()` aqui**, pois o Content-Type não é `application/json`. O retry em 503 também foi refatorado para verificar `resp.ok` antes de ler o body, evitando consumir o stream em caso de erro.

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

**Campos de onboarding:** `genero`, `pregnancy_status`, `birthday`, `skin_type`, `concerns[]`, `frequency`, `sun_exposure`, `hydration`, `sleep`, `sunscreen`, `objetivo`, `skincare_routine_type`, `skincare_routine_description`, `allergy_type`, `allergy_description`

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
- `selectedScan: { result: ScanResult; imageUri: string } | null` — scan selecionado no carrossel da home; limpo automaticamente ao sair de `skin-result.tsx`
- `selectedFoodResult: FoodReportResult | null` — resultado salvo de food scan selecionado na home; exibido sem re-análise em `food-report.tsx`; limpo ao sair da tela ou iniciar novo scan

**Métodos:**
- `setTabBarTheme(theme: 'light' | 'dark')` — alterna o tema visual do tab bar; chamado por `protocolo.tsx` via `useFocusEffect`
- `setTabBarVisible(visible: boolean)` — esconde/mostra o tab bar; útil em telas onde o tab bar não deve aparecer
- `setScanSource(source: 'onboarding' | 'app')` — chamado por `ScanModal.handleScanFace` antes de iniciar scan do app principal
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
| `analyze-skin` | `fetch` direto + anon key hardcoded | payload contém imageBase64 grande; `getSession()` pode retornar `undefined` → `"Bearer undefined"` → 401 instantâneo |
| `analyze-food` | `fetch` direto + anon key hardcoded | payload contém imageBase64 grande; `getSession()` pode retornar `undefined` → `"Bearer undefined"` → 401 instantâneo |
| `generate-protocol` | `fetch` direto + anon key hardcoded | `supabase.functions.invoke` causa 401 pós-signup (sessão não está pronta no cliente) |

**NUNCA usar `supabase.functions.invoke` para nenhuma das três funções acima.** Para `analyze-skin` e `analyze-food`, trunca o base64. Para `analyze-food` e `generate-protocol`, usar `getSession()` para obter o token é frágil — se a sessão não estiver pronta, o header fica `"Bearer undefined"` e o API gateway rejeita com 401 imediatamente. As funções foram deployadas com `--no-verify-jwt`, então o anon key hardcoded é suficiente e elimina essa classe de erro.

Exemplo para `generate-protocol` (`fetch` direto com anon key):
```typescript
const response = await fetch(
  'https://utpljvwmeyeqwrfulbfr.supabase.co/functions/v1/generate-protocol',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0cGxqdndtZXllcXdyZnVsYmZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwOTc4MTUsImV4cCI6MjA4ODY3MzgxNX0.zFbYbO2LbjK1DZSK4JRkieWiD0JHnDRCMtkPU1kWaxI`,
      'apikey': `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0cGxqdndtZXllcXdyZnVsYmZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwOTc4MTUsImV4cCI6MjA4ODY3MzgxNX0.zFbYbO2LbjK1DZSK4JRkieWiD0JHnDRCMtkPU1kWaxI`,
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

**Navegação de volta bloqueada intencionalmente:** ao chegar em `results.tsx`, o usuário não pode voltar. Motivo: `rate-us.tsx` usa `router.replace` para chegar aqui, mas a tela de `loading.tsx` ainda estaria no stack — voltar travaria o usuário lá. Implementado com dois mecanismos:
- `<Stack.Screen options={{ gestureEnabled: false }} />` — desabilita swipe-back no iOS
- `BackHandler.addEventListener('hardwareBackPress', () => true)` — bloqueia botão físico no Android

### 6. Geração e cache do protocolo personalizado
O protocolo é gerado **uma única vez** na tela `protocol-loading` (logo após o signup). A função `generate-protocol` recebe `scanResult` e `onboardingData` — não recebe mais `baseProtocol` (a função determina o template base internamente com base em `skin_type_detected`). Salvo em dois lugares:
1. **Zustand store** (`protocolResult`) — para acesso imediato sem nova chamada à API
2. **Supabase `protocolos`** — para persistência entre sessões

A aba `(app)/protocolo.tsx` carrega na seguinte ordem de prioridade:
1. Store cache (se ainda estiver na sessão)
2. Supabase (busca o registro mais recente por `user_id`)
3. Fallback: chama `generate-protocol` novamente via `fetch` direto (com JWT manual) — envia `baseProtocol` derivado de `constants/protocols.ts` + `scanResult` + `onboardingData`

**Fallback de `scanResult` em `protocol-loading.tsx`:** se `scanResult` estiver null no store ao montar (pode ocorrer em edge cases pós-signup), a tela busca automaticamente o scan mais recente do usuário em `skin_scans` via Supabase (`.order('created_at', { ascending: false }).limit(1)`) e popula o store antes de gerar o protocolo. Só aborta se o Supabase também não retornar nada.

**Retry automático em `protocol-loading.tsx`:** a chamada ao `generate-protocol` tenta até **3 vezes** com delay de 3s entre tentativas, mas **somente** para erros HTTP 503 ou mensagens `UNAVAILABLE`/`high demand` (sobrecarga do Gemini). Para outros erros, falha imediatamente. Durante a espera, o status text muda para "Estamos finalizando sua análise, aguarde um momento...". Outros tipos de erro não fazem retry — falham na primeira tentativa.

**Erro e retry manual em `protocol-loading.tsx`:** se todas as tentativas falharem, a tela exibe um estado de erro inline (não `Alert`) com botão "Tentar novamente". Ao tocar, o retry **reseta o fluxo inteiro** — percentage, currentStep, apiDone, statusText e retryCount voltam ao estado inicial, reiniciando a barra de progresso do zero. Isso é intencional: o usuário vê o progresso completo novamente em vez de uma barra travada.

**Erro em `app/(scan)/loading.tsx`:** equivalente — erros após 2 retries exibem estado inline (sem `Alert`) com botão que chama `router.back()`, levando o usuário de volta à câmera para tirar uma nova foto.

### 8. Storage bucket `scans` é PRIVADO — usar `createSignedUrl`

O bucket `scans` é privado. `getPublicUrl()` retorna uma URL que responde 403. **Sempre usar `createSignedUrl(path, 31536000)`** (TTL de 1 ano) para gerar a URL que vai para `foto_url` no banco.

```typescript
const { data: signed } = await supabase.storage.from('scans').createSignedUrl(path, 31536000);
fotoUrl = signed?.signedUrl ?? supabase.storage.from('scans').getPublicUrl(path).data.publicUrl;
```

Isso se aplica em: `store/onboarding.ts` (`uploadScanPhoto`), `app/(scan)/loading.tsx`, e `app/(app)/home.tsx` (repair de foto do onboarding).

---

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

### 15. Numeral do orb da Cerimônia — `SkiaText` dentro do Canvas, não React Native `Text`

O numeral (`01`–`0N`) exibido dentro do orb na overlay da Cerimônia é renderizado com `SkiaText` + `useFont` do `@shopify/react-native-skia`, **não** como `<Text>` nativo do React Native.

**Por quê:** quando um `<Text>` nativo é posicionado como irmão de um `<Canvas>` Skia, o pipeline GPU do Skia composita na camada acima do layout nativo. Para glifos específicos do DM Serif Display Italic (especialmente "2" e "3" a 84pt), isso faz os dígitos aparecerem cortados. O problema **não afeta todos os dígitos** — depende do bounding box óptico do glifo.

**Padrão aplicado em `protocolo.tsx`:**
```typescript
const cerimSkiaFont = useFont(require('../../assets/fonts/DMSerifDisplay-Italic.ttf'), 84);

// Dentro do Canvas 200×200 (círculo cx=100, cy=100):
const skiaTextW = cerimSkiaFont?.measureText(text).width ?? 95;
const skiaCapH = Math.abs(cerimSkiaFont?.getMetrics().capHeight ?? 84 * 0.70);

<SkiaText
  x={(200 - skiaTextW) / 2}  // centraliza horizontalmente via measureText
  y={100 + skiaCapH / 2}      // baseline = centro do orb + metade da cap height
  text={text}
  font={cerimSkiaFont}
  color={...}
/>
```

**Regra geral:** se precisar renderizar texto sobre um `Canvas` Skia na mesma hierarquia de layout, preferir `SkiaText` dentro do Canvas a um `<Text>` nativo irmão.

---

### 16. Dias da semana em steps do protocolo — parsing client-side do `ingredient`

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

### 13. Contexto de scan: app vs onboarding (`scanSource`)

O scan facial é iniciado de dois lugares distintos e segue fluxos diferentes:

| Origem | Fluxo |
|---|---|
| Onboarding (primeiro scan) | `scan-prep` (com barra de progresso) → `camera` → `loading` → `rate-us` → `results` (onboarding) |
| App principal (`ScanModal`) | `scan-prep` (sem barra de progresso) → `camera` → `loading` → `/(app)/skin-result` (direto, pula rate-us) |

**Como funciona:**
1. `ScanModal.handleScanFace` chama `setScanSource('app')` antes de navegar para `scan-prep`
2. `scan-prep.tsx` lê `scanSource`: se `'app'`, renderiza sem `QuizLayout` (sem barra de progresso do onboarding)
3. `loading.tsx` lê `scanSource` após análise concluída: se `'app'`, chama `setSelectedScan(null)` + `router.replace('/(app)/skin-result')`; se `'onboarding'`, segue para `/(scan)/rate-us`

**Por que `setSelectedScan(null)` é obrigatório em `loading.tsx`:** `skin-result.tsx` usa `selectedScan?.result ?? scanResult`. Se `selectedScan` ainda estiver populado de uma visualização anterior do carrossel da home, a tela mostra o scan antigo em vez do recém-feito.

**Não confundir** com o retry de login do usuário no app: o guard de assinatura em `(app)/_layout.tsx` não depende de `scanSource`.

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

> ⚠️ **Modal stacking no iOS:** `AIConsentModal` é um `<Modal>` nativo. Se for chamado enquanto outro `<Modal>` nativo estiver aberto (ex: o bottom sheet do `ScanModal`), o iOS silencia o segundo — o usuário clica e não acontece nada. **Solução aplicada em `ScanModal`:** `handleScanFood` e `handleScanFace` chamam `onClose()` primeiro e só disparam `requestConsent` após 200ms (tempo da animação de fechamento de 180ms). Qualquer nova integração de `AIConsentModal` dentro de um Modal deve seguir o mesmo padrão.

---

### 11. Guard de assinatura — Superwall + RevenueCat

O paywall é gerenciado pelo **Superwall** (`expo-superwall`). O `<SuperwallProvider>` está em `app/_layout.tsx` (raiz), logo abaixo do `<MixpanelProvider>` — acima de `GestureHandlerRootView` e `SafeAreaProvider`.

**API Key iOS:** `pk_4iUsZwW_-ME9WdK3IcXYp`  
**Placement identifier:** `paywall_onboarding`

O acesso ao app é verificado em 5 pontos, em ordem. Em todos eles, o RevenueCat (`getCustomerInfo` + `isSubscribed`) determina se o usuário tem acesso:

- `app/index.tsx` — ao abrir o app com sessão ativa → não-assinante: `registerPlacement` direto
- `app/(onboarding)/_layout.tsx` — ao entrar no onboarding com sessão ativa → assinante já vai direto para home
- `app/(onboarding)/login.tsx` — `routeAfterLogin()` após qualquer método de login → não-assinante: `registerPlacement` direto
- `app/(onboarding)/protocol-loading.tsx` — ao concluir geração do protocolo → aciona `registerPlacement` antes de navegar para `notifications`
- **`app/(app)/_layout.tsx`** — guard definitivo: não-assinante aciona `registerPlacement`; assinante: `setReady(true)` → tabs renderizam

> ⚠️ **Bypass para desenvolvimento (`__DEV__`):** Todos os pontos acima têm um bypass condicional que é ativado automaticamente no simulador/Metro. Além disso, `app/(onboarding)/notifications.tsx` também tem bypass em `navigateToApp()` — vai direto para `/(app)/home` sem chamar RevenueCat (sem esse bypass, a tela de notificações esperava 8s pelo timeout do RevenueCat antes de avançar para o paywall):
> ```typescript
> if (__DEV__) {
>   // pula RevenueCat e Superwall — vai direto para o destino
>   setReady(true); // ou router.replace('/(app)/home')
>   return;
> }
> ```
> Em produção (`__DEV__ === false`) o comportamento é idêntico ao descrito acima. **Se o Superwall sumir no simulador, é esperado** — não é um bug.

O guard em `(app)/_layout.tsx` tem um **timeout de 8s**: se `getCustomerInfo()` travar (rede lenta), o timer dispara e aciona o Superwall. `setReady(true)` é chamado **antes** de `registerPlacement` em todos os caminhos — o Superwall aparece como overlay sobre as tabs em vez de bloquear o render com `null`.

**`usePlacement`** deve ser chamado em componentes descendentes do `SuperwallProvider`. Em `(app)/_layout.tsx`, isso é garantido porque o provider está na raiz.

> ⚠️ **Import gotcha:** `expo-superwall` exporta apenas `SuperwallProvider`, hooks e tipos. Para usar a API de classe (`Superwall.shared.*`), importe de `expo-superwall/compat`:
> ```typescript
> import Superwall from 'expo-superwall/compat'; // ← compat, não expo-superwall
> ```
> `refreshConfiguration()` **não existe** no wrapper JS — o equivalente disponível é `Superwall.shared.preloadAllPaywalls()`.

#### `paywall-soft.tsx` — gateway para o Superwall (sem UI própria)

`paywall-soft.tsx` **não é uma tela de paywall visual**. É um componente spinner (`ActivityIndicator`) que entrega o controle ao Superwall SDK. O Superwall exibe sua própria tela de paywall hospedada no dashboard — toda a UI, copy e design do paywall são configurados lá, não no código.

`protocol-loading.tsx` chama `registerPlacement` ao terminar, o que aciona o Superwall. `paywall-soft.tsx` registra callbacks para saber quando o usuário interagiu:

```typescript
const { registerPlacement } = usePlacement({
  onDismiss: async () => await navigateToApp(),  // usuário fechou (assinou, restaurou ou dispensou)
  onSkip: async () => await navigateToApp(),      // Superwall não exibiu (holdout, já assinante)
  onError: async () => router.replace('/(app)/home'),
});
```

`navigateToApp()` verifica o RevenueCat: assinante → `/(app)/home`; não-assinante → `/(onboarding)/paywall-soft` (o guard de `(app)/_layout.tsx` barra na sequência).

**Por que esta abordagem:** `registerPlacement` retorna uma `Promise<void>` que resolve **imediatamente** após registrar o placement com o SDK nativo — **não** após o paywall ser fechado. A navegação pós-paywall deve sempre acontecer nos callbacks `onDismiss`/`onSkip`/`onError`, nunca após `await registerPlacement`.

**`paywall-detailed.tsx` — dead code (não está no fluxo ativo):**
Arquivo com UI customizada de paywall (planos mensal/anual, trial de 3 dias, integração RevenueCat direta). Era o paywall antes do Superwall ser integrado. Nenhuma tela navega para ela atualmente. Mantida no projeto como fallback caso o Superwall seja removido.

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
| `onboarding_completed` | `paywall-detailed.tsx` mount (dead code — dispara caso a tela seja reativada) | `$duration` (calculado pelo SDK via `timeEvent`) |
| `paywall_viewed` | `paywall-soft.tsx` mount | `screen: 'soft'` |
| `plan_selected` | toque nos cards de plano em `paywall-detailed.tsx` (dead code) | `plan: 'mensal' \| 'anual'` |
| `purchase_initiated` | `lib/revenuecat.ts` antes do SDK de compra | `plan: 'mensal' \| 'anual'` |
| `purchase_completed` | `lib/revenuecat.ts` após compra bem-sucedida | `plan: 'mensal' \| 'anual'` |
| `purchase_failed` | `lib/revenuecat.ts` em erro de compra | `plan`, `error: string` |
| `purchase_restored` | `lib/revenuecat.ts` após restore | — |
| `user_logged_in` | `login.tsx` após qualquer login bem-sucedido | `method: 'email' \| 'google' \| 'apple'` |
| `scan_completed` | `(scan)/loading.tsx` após `analyze-skin` | `skin_score: number`, `skin_type: string` |
| `scan_failed` | `(scan)/loading.tsx` após esgotar 2 retries | `error: string` |
| `protocol_generated` | `protocol-loading.tsx` após `generate-protocol` | — |
| `protocol_failed` | `protocol-loading.tsx` em erro | `error: string` |
| `food_scan_completed` | `(scan)/food-report.tsx` após `analyze-food` | `meal_score: number`, `meal_label: string` |
| `food_scan_failed` | `(scan)/food-report.tsx` em erro | `error: string` |

**`onboarding_completed` — efeitos colaterais (em `paywall-detailed.tsx` mount — dead code; mover para `paywall-soft.tsx` se o Superwall for removido):**
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
- `components/scan/ScanModal.tsx` — intercepta ambos os cards com `useAIConsent` antes de navegar; sem cooldown (scan de rosto sempre disponível)
- `components/ui/AIConsentModal.tsx` — modal de consentimento de uso de IA (LGPD); bottom sheet animado com `Animated.spring`; backdrop não fecha o modal; link inline para Política de Privacidade
- `components/ui/NightSky.tsx` — céu noturno animado: 119 estrelas em 3 camadas (FAR/MID/NEAR) com twinkle assimétrico e deriva via Reanimated v4; nebulosas via Skia `Canvas`+`Oval`+`RadialGradient` (cor→transparente em 65%)+`BlurMask` com canvas padded para blur não clipar nas bordas; 3 estrelas cadentes com `LinearGradient`; renderizado no modo noite da tela Protocolo


**Telas — Onboarding (24 telas):**
`concerns` → `gender` → `pregnancy`\* → `birthday` → `skin-type` → `frequency` → `sun-exposure` → `hydration-sleep` → `sunscreen` → `social-proof` → `food-analysis` → `goal` → `trust` → `plan-preview` → `signup` → `skincare-routine` → `skincare-routine-detail`\* → `allergies` → `allergies-detail`\* → `protocol-loading` → `paywall-soft` → `notifications`

> \* Telas condicionais: `pregnancy` só para gênero Feminino; `skincare-routine-detail` só para `complement`/`prescribed`; `allergies-detail` só para `reaction`.

> ⚠️ `final-loading.tsx` existe no projeto mas está **fora do fluxo** — `goal.tsx` navega diretamente para `trust`. A tela não faz nenhum processamento real (era animação pura de 3.8s). Não remover o arquivo; apenas não está na rota ativa.

> ⚠️ `paywall-detailed.tsx` existe no projeto mas está **fora do fluxo** — é dead code do fluxo anterior ao Superwall. Nenhuma tela navega para ela. Não remover; o arquivo contém a lógica de compra RevenueCat direta caso o Superwall seja retirado no futuro.

**Tela de Login (acesso direto da Welcome):**
`login` — standalone, acessada pelo botão "Entrar" na Welcome screen. Mesmo padrão visual do `signup.tsx`: `LinearGradient` rosa→branco, botão voltar circular, campos com borda `Colors.scanBtn` ao focar, botões pill. Sem barra de progresso (não é etapa do onboarding).

**Telas — Scan flow (7 telas):**
`scan-prep` → `camera` → `loading` → `rate-us` → `results` → `food-scan-intro` → `food-camera` → `food-report`

**`food-report.tsx` — modo duplo:**
- **Nova análise** (`selectedFoodResult === null`): chama `analyze-food`, salva resultado em `food_scans` (incluindo `full_result` jsonb + foto no Storage), exibe resultado
- **Visualização salva** (`selectedFoodResult !== null`): exibe `full_result` do store instantaneamente, sem chamada à IA; botão "Voltar para tela inicial" (coral, ArrowLeft) via `router.replace`

**Telas — App principal (8 arquivos):**
`(app)/_layout.tsx` (tab bar sem FAB), `home.tsx`, `skin-result.tsx` (resultado da análise facial in-app — exibe o schema clínico completo: acne, barreira cutânea, pigmentação, textura/poros, oleosidade, envelhecimento, área periocular, fotótipo Fitzpatrick, condições secundárias, prioridade clínica e contraindicações; todos os campos novos são opcionais para compatibilidade com scans antigos), `protocolo.tsx`, `analise.tsx`, `evolucao.tsx` (oculta), `perfil.tsx`, `set-name.tsx` (definir nome do usuário)

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
- RevenueCat ✅ — `lib/revenuecat.ts` + `hooks/useSubscription.ts`; entitlement `premium`; produtos `br.com.niksai.app.mensal.notrial` e `br.com.niksai.app.anual.notrial`; offering `default` configurado no Dashboard

**⚠️ GOTCHA — In-App Purchase Capability:** Sem a capability ativada no Xcode, `getOfferings()` falha silenciosamente em builds de produção (`.catch` engole o erro → `pkg = null` → alerta "Produto não disponível"). No simulador não acontece. **Localização:** Xcode → Target NIKSAI → Signing & Capabilities → `+ Capability` → In-App Purchase

---

## FLUXO COMPLETO DO APP

```
→ [app aberto com sessão ativa] → spinner → verifica assinatura (RevenueCat) → assinante: home | não-assinante: paywall-soft (guard em (onboarding)/_layout.tsx também aplica a mesma lógica)

Welcome
  → [botão "Começar"] Onboarding (19 telas) — setOnboardingField() em cada tela
    → goal → scan-prep → camera (setSkinImage) → loading (analyze-skin) → rate-us → results → trust → plan-preview (skin_score real do store)
    → signup (Google / Apple / E-mail+Senha → saveToSupabase) → skincare-routine → skincare-routine-detail* (se complement/prescribed) → allergies → allergies-detail* (se reaction) → protocol-loading (generate-protocol → INSERT protocolos) → paywall-soft (Superwall) → notifications

    → App principal (tabs)

  → [botão "Entrar"] Login
    → E-mail + Senha / Google / Apple → verifica assinatura (RevenueCat) → assinante: home | não-assinante: paywall-soft

Fluxo de comida (dentro do app principal):
  analise.tsx → food-camera (setFoodImage) → food-report (analyze-food) → protocolo (generate-protocol)
```

### Valores de progresso do onboarding (ProgressBar)

O scan flow é inserido entre `goal` e `trust` — `goal` é respondido **antes** do scan.

| Tela | Progress | Observação |
|---|---|---|
| concerns | 8% | |
| gender | 16% | |
| pregnancy | 20% | Condicional — só exibida se gênero = Feminino |
| birthday | 24% | |
| skin-type | 32% | |
| frequency | 36% | |
| sun-exposure | 40% | |
| hydration-sleep | 44% | |
| sunscreen | 52% | |
| social-proof | 56% | |
| food-analysis | 60% | |
| ~~commitment~~ | ~~64%~~ | ⚠️ dead code — `food-analysis` navega direto para `goal` |
| goal | 80% | ⚠️ valor deve ser ajustado para ~68% (antes do scan); navega para `scan-prep` |
| **→ SCAN FLOW ENTRA AQUI** | — | scan-prep → camera → loading → rate-us → results |
| trust | 88% | |
| plan-preview | 92% | |
| signup | 96% | |
| skincare-routine | 88% | Após signup — coleta rotina atual de skincare |
| skincare-routine-detail | 90% | Condicional — só se `skincare_routine_type` = `complement` ou `prescribed` |
| allergies | 92% | |
| allergies-detail | 94% | Condicional — só se `allergy_type` = `reaction` |
| protocol-loading | sem progress bar | gera e salva protocolo no Supabase |
| paywall-soft | sem progress bar | entrega controle ao Superwall SDK — sem UI própria |
| notifications | sem progress bar | |

---

## ESTRUTURA DE ARQUIVOS

```
niks-ai/
├── app/
│   ├── _layout.tsx                ✅
│   ├── index.tsx                  ✅ Welcome (vídeo em loop — assets/welcome-video.mp4)
│   ├── (onboarding)/
│   │   ├── _layout.tsx            ✅
│   │   ├── concerns.tsx           ✅
│   │   ├── gender.tsx             ✅ navega para pregnancy (Feminino) ou birthday (outros)
│   │   ├── pregnancy.tsx          ✅ condicional — só para gênero Feminino; entre gender e birthday
│   │   ├── birthday.tsx           ✅
│   │   ├── skin-type.tsx          ✅
│   │   ├── frequency.tsx          ✅
│   │   ├── sun-exposure.tsx       ✅
│   │   ├── hydration-sleep.tsx    ✅
│   │   ├── sunscreen.tsx          ✅
│   │   ├── social-proof.tsx       ✅
│   │   ├── food-analysis.tsx      ✅
│   │   ├── commitment.tsx         ⚠️ dead code — food-analysis navega direto para goal
│   │   ├── goal.tsx               ✅
│   │   ├── final-loading.tsx      ✅
│   │   ├── trust.tsx              ✅
│   │   ├── plan-preview.tsx       ✅
│   │   ├── signup.tsx             ✅ fluxo dois passos (e-mail/senha + Google/Apple)
│   │   ├── login.tsx              ✅ fluxo dois passos (e-mail/senha + Google/Apple)
│   │   ├── skincare-routine.tsx   ✅ após signup — tipo de rotina atual (4 opções)
│   │   ├── skincare-routine-detail.tsx ✅ condicional — descrição dos produtos usados/prescritos
│   │   ├── allergies.tsx          ✅ alergias/sensibilidades (3 opções)
│   │   ├── allergies-detail.tsx   ✅ condicional — descrição do ativo/produto que causou reação
│   │   ├── protocol-loading.tsx   ✅ gera protocolo + salva no Supabase
│   │   ├── paywall-soft.tsx       ✅ gateway para Superwall — spinner sem UI própria
│   │   ├── paywall-detailed.tsx   ⚠️ dead code — UI customizada do fluxo pré-Superwall, fora da rota ativa
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
│   │   ├── AIConsentModal.tsx     ✅ modal de consentimento de IA (LGPD) — uma única vez por instalação
│   │   └── NightSky.tsx           ✅ céu noturno animado (Reanimated v4 + Skia) — modo noite do Protocolo
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
├── assets/fonts/                  ✅ Playfair Display (variável, `[wght].ttf` + Italic) e DM Serif Display — registradas em `app.json` `"fonts"[]` para bundling + carregadas via `useFonts` em `protocolo.tsx`
├── assets/trust-hands.png         ⚠️ não usado — trust.tsx usa o componente SVG DoubleHeart inline (substituiu esta imagem)
├── lib/revenuecat.ts              ✅ initRevenueCat, getPackages, purchasePackage, restorePurchases, isSubscribed
├── lib/storeReview.ts             ✅ requestAppReview() — popup nativo via expo-store-review com fallback para App Store (id6760590018)
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
- Card **"Scanear Rosto"** (Camera coral + chevron) — sempre disponível, sem cooldown
- Botão **"Cancelar"** (card branco)
- Animação: `Animated.spring` translateY (slide up)

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

### Tab Bar (`app/(app)/_layout.tsx`)
Redesenhada com base no Figma Make `cFsFcVSjOMkTdHIJpHgSDk`:
- **Container**: branco, `borderRadius: 20`, borda `#F0F0F0` (não mais pílula cinza)
- **3 tabs**: `Scan` "scanear" · `Droplet` "protocolo" · `User` "perfil" (labels em minúsculo)
- **Ativo**: coral `#FB7B6B` · **Inativo**: `#8A8A8E`
- **Ícone**: tamanho 24, `strokeWidth: 1.5`, sem `fill`
- Posicionamento: `bottom: 20` (fixo, sem `useSafeAreaInsets`), `left/right: 16`
- FAB laranja (`+`) **removido definitivamente**
- Telas ocultas (`href: null`): `evolucao`, `set-name`, `skin-result`
- **Visibilidade controlada pelo store:** `tabBarVisible` (bool) — `{tabBarVisible && <CustomTabBar />}`. Usar `setTabBarVisible(false/true)` para esconder/mostrar em telas específicas.
- **Tema dark/light (modo noite do Protocolo):** lê `tabBarTheme` do store. Dark: bg `rgba(26,31,46,0.85)`, borda `rgba(255,255,255,0.08)`, ativo `#F9A898`, inativo `rgba(255,255,255,0.45)`, sombra `0 4px 20px rgba(0,0,0,0.4)`. `protocolo.tsx` usa `useFocusEffect` para setar `'dark'` ao ganhar foco no modo noite e resetar para `'light'` ao perder foco — **obrigatório `useFocusEffect` (não `useEffect`)** porque tabs não desmontam ao trocar de aba.

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

### 14. Parallax hero em `skin-result.tsx` — foto fixa + scroll por cima

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

*Última atualização: Sessão 21 — Abril 2026*
*Status: MVP — RevenueCat ✅; guard de assinatura completo (4 pontos de verificação + timeout 8s); gamificação do protocolo; avaliação nativa (expo-store-review); push notifications ✅; App Store ID: id6760590018. Schema `analyze-skin` expandido: `region_insights`, `goal_alignment`, `skin_strengths`, `action_recommendations`. `skin-result.tsx` com parallax (foto fixa, Animated.ScrollView, ring SVG + badges animados, card com borderRadius desliza por cima da foto).*