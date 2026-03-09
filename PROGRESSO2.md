# NIKS AI — PROGRESSO2.md

Última atualização: 2026-03-08

---

## STATUS GERAL

- **Fase atual:** TODAS AS TELAS CONCLUÍDAS ✅
- **Última tela finalizada:** `(app)/perfil.tsx`
- **Próxima tarefa:** Integração Supabase + Claude API (Fase 5)

---

## ARQUIVOS CRIADOS E CONCLUÍDOS

### Configuração do Projeto
- `package.json` — main: `expo-router/entry`, todas as deps instaladas
- `app.json` — nome "NIKS AI", bundle ID `com.niksai.app`, portrait only
- `babel.config.js` — NativeWind + Reanimated plugins
- `metro.config.js` — withNativeWind + global.css
- `tailwind.config.js` — cores niks-* customizadas
- `global.css` — @tailwind base/components/utilities
- `nativewind-env.d.ts` — referência de tipos NativeWind
- `.npmrc` — legacy-peer-deps=true
- `.env` / `.env.example` / `.gitignore`

### Constantes
- `constants/colors.ts` — todos os tokens de cor

### Root Layout
- `app/_layout.tsx` — SafeAreaProvider + Stack (headerShown: false)

### Componentes Base
- `components/ui/CTAButton.tsx` — botão preto full-width, rounded-[14px]
- `components/ui/ProgressBar.tsx` — Animated.Value, h-[4px] preto sobre h-[2px] cinza
- `components/ui/BackButton.tsx` — círculo #F5F5F7, ChevronLeft lucide-react-native
- `components/ui/OptionCard.tsx` — selecionado: bg-[#1A1A1A]/texto branco; prop subtitle
- `components/ui/Pill.tsx` — rounded-full, mesmas cores do OptionCard
- `components/ui/IOSWheelPicker.tsx` — ScrollView + snapToInterval=44 + LinearGradient fades
- `components/layouts/QuizLayout.tsx` — SafeAreaView + BackButton + ProgressBar + px-6
- `components/scan/ScanModal.tsx` — Modal RN com Animated, 2 cards (pele/alimento)
  - Props: `isOpen: boolean`, `onClose: () => void` (navegação interna via router)

### Tela Welcome
- `app/index.tsx` — BR badge, phone mockup, H1, CTAButton → /(onboarding)/concerns

### Onboarding (app/(onboarding)/)
- `_layout.tsx` — Stack sem header
- `concerns.tsx` ✅ — progresso 8%
- `gender.tsx` ✅ — progresso 16%
- `birthday.tsx` ✅ — progresso 24%
- `skin-type.tsx` ✅ — progresso 32%
- `frequency.tsx` ✅ — progresso 36%
- `sun-exposure.tsx` ✅ — progresso 40%
- `hydration-sleep.tsx` ✅ — progresso 44%
- `sunscreen.tsx` ✅ — progresso 52%
- `social-proof.tsx` ✅ — progresso 56%
- `food-analysis.tsx` ✅ — progresso 60%
- `commitment.tsx` ✅ — progresso 64%, → /(scan)/scan-prep
- `goal.tsx` ✅ — progresso 80%, → final-loading
- `final-loading.tsx` ✅ — SEM progress bar, 5 etapas, → trust
- `trust.tsx` ✅ — progresso 88%
- `plan-preview.tsx` ✅ — progresso 92%
- `signup.tsx` ✅ — progresso 96%, → paywall-soft
- `paywall-soft.tsx` ✅ — SEM progress bar, PhoneMockup rotacionado, CTA "Testar por R$0,00" → paywall-detailed
- `paywall-detailed.tsx` ✅ — SEM progress bar, timeline, cards mensal/anual → notifications
- `notifications.tsx` ✅ — SEM progress bar, Bell icon, → /(app)/home

### Scan Flow (app/(scan)/)
- `_layout.tsx` ✅ — Stack sem header
- `scan-prep.tsx` ✅ — progresso 68%, 3 instruções (Sun/Sparkles/User)
- `camera.tsx` ✅ — SEM progress bar, bg #1A1A1A, oval guide, corner brackets
- `loading.tsx` ✅ — SEM progress bar, LinearGradient na barra, 6 etapas → results
- `results.tsx` ✅ — progresso 76%, Score ring SVG r=70, card escuro #1E1E2E, locked cards → goal
- `food-report.tsx` ✅ — bg #F6F4EE, foodDatabase mockado, useLocalSearchParams

### App Principal (app/(app)/)
- `_layout.tsx` ✅ — Tabs Expo Router, CustomTabBar com pill + FAB #FB7B6B, ScanModal integrado
- `home.tsx` ✅ — Top bar (logo+streak+bell), calendário semanal, SkinScoreRing SVG, MetricBars, card de rotina, card food analysis com 3 itens → food-report
- `protocolo.tsx` ✅ — Toggle manhã/noite, step cards com checkbox interativo, barra de progresso, CTA "Marcar Rotina Completa"
- `analise.tsx` ✅ — 2 cards: "Escanear Pele" → scan-prep, "Escanear Refeição" (placeholder)
- `evolucao.tsx` ✅ — Score 82 + sparkline SVG, filtros de tempo, comparação visual, heatmap calendar, conquistas/badges horizontais
- `perfil.tsx` ✅ — Avatar "MA", stats row, 4 seções de configurações, botão sair, versão

---

## PRÓXIMAS TAREFAS (Fase 5 — Integrações)

1. `lib/supabase.ts` — createClient com AsyncStorage adapter
2. `lib/claude.ts` — invocar Edge Function `analyze-skin`
3. `lib/revenuecat.ts` — Purchases.configure + hook useSubscription
4. `lib/mixpanel.ts` — init + track events
5. `hooks/useAuth.ts` — auth state com Supabase
6. `hooks/useSkinScan.ts` — lógica de scan
7. `hooks/useSubscription.ts` — check entitlement

---

## PADRÕES DE CÓDIGO ADOTADOS

### Navegação
- Expo Router v3, grupos: `(onboarding)`, `(app)`, `(scan)`
- `useRouter().push('/(grupo)/tela')` — sempre com o grupo na rota
- `router.back()` para voltar
- Sem progress bar: Camera, Loading, FinalLoading, Paywalls, Notifications

### Estilos
- NativeWind v4 com `className` nos componentes RN
- `StyleSheet.create` APENAS para: shadow, transform, posicionamento absoluto complexo
- Cores de `constants/colors.ts` ou hex direto quando o token não existe

### Conversão Web → React Native
| Web | React Native |
|---|---|
| `div` | `View` |
| `button` | `TouchableOpacity activeOpacity={0.8}` |
| `span/p/h1` | `Text` |
| `Link to="/x"` | `useRouter().push('/(grupo)/x')` |
| `overflow-y-auto` | `ScrollView` |
| `blur-md` CSS | `style={{ opacity: 0.15 }}` (não existe blur nativo) |
| `document.createElement` | Remover; usar `StyleSheet.create` |
| `ImageWithFallback` | `Image` do RN com `source={{ uri }}` |
| `useLocation().state?.id` | `useLocalSearchParams()` |
| `recharts` | `react-native-svg` (Svg, Circle, Polyline) |
| `motion/framer` | `Animated` do React Native |

### Cores especiais (não estão em constants/colors.ts — usar hex direto)
- `#7CB69D` — verde de score/progresso (Figma Make)
- `#1D3A44` — teal escuro (= `Colors.tabActive`)
- `#1E1E2E` — fundo do dark card em results.tsx
- `#10B981` — verde do Score ring grande

### Estrutura das telas do App Principal (home/protocolo/analise/evolucao/perfil)
- `SafeAreaView` bg-[#F6F4EE] + `ScrollView` com `pb-24` (espaço para TabBar)
- TabBar é fixo no fundo via `(app)/_layout.tsx` — NÃO incluir TabBar dentro de cada tela
- Navegação para food-report: `router.push({ pathname: '/(scan)/food-report', params: { foodId } })`
- Navegação para scan: `router.push('/(scan)/scan-prep')`

---

## PROBLEMAS TÉCNICOS E DECISÕES

### 1. ScanModal — props corretas
`ScanModal` aceita apenas `isOpen` e `onClose`. A navegação para as rotas de scan é feita internamente pelo próprio componente via `useRouter()`.

### 2. expo-linear-gradient já instalado
Confirmado em `package.json`: `"expo-linear-gradient": "~55.0.8"`. Usado em `loading.tsx` para o gradiente vermelho→azul→cinza na barra de progresso.

### 3. Blur CSS não existe no React Native
O CSS `blur-md` do Figma Make foi substituído por `opacity: 0.15` nas métricas de Results para simular o efeito de conteúdo "bloqueado".

### 4. FoodReport usa useLocalSearchParams
No Figma Make web usava `useLocation().state?.foodId`. Em RN, a navegação passa parâmetro via `params: { foodId }` e a tela lê com `useLocalSearchParams<{ foodId: string }>()`.

### 5. TabBar customizado no (app)/_layout.tsx
Usa `tabBar` prop do componente `<Tabs>` do Expo Router. A tela `analise` tem `options={{ href: null }}` para ser oculta do tab bar mas ainda acessível via rota.

### 6. niksLogo não disponível como asset RN
O Figma Make usa `import niksLogo from '../../imports/niks_logo.svg'`. Em home.tsx, substituir por `<Text style={{ fontSize: 18, fontWeight: '800', color: '#1D3A44' }}>NIKS AI</Text>`.

---

## COMO ACESSAR O FIGMA MAKE NA PRÓXIMA CONVERSA

### File ID
`XrX2xnE32aNLOaFw5ayPM0`

### Método correto (IMPORTANTE)
**NÃO use `get_metadata`** — retorna erro para arquivos Make.

**Use `get_design_context` com qualquer nodeId** para obter o índice de todos os arquivos. O retorno lista todos os Resource Links com os caminhos corretos.

### Paths corretos das telas (formato que funciona)
```
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/screens/Home.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/screens/Protocolo.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/screens/Analise.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/screens/Evolucao.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/screens/Perfil.tsx
```

### Padrão de nomeação (CRÍTICO)
- Arquivos de tela: `NomeDaTela.tsx` (sem sufixo "Screen")
- ✅ Correto: `PaywallSoft.tsx`, `Home.tsx`, `Notifications.tsx`
- ❌ Errado: `PaywallSoftScreen.tsx`, `HomeScreen.tsx`

### Outros arquivos úteis
```
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/components/TabBar.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/routes.tsx
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/styles/theme.css
file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/package.json
```

### Fluxo recomendado ao iniciar uma nova conversa
1. Ler este arquivo `PROGRESSO2.md`
2. Chamar `ReadMcpResourceTool` diretamente com o path correto da tela
3. Converter o código web para React Native seguindo os padrões acima

---

## FLUXO COMPLETO DO APP (para referência)

```
index (welcome)
  └─► (onboarding)/concerns → gender → birthday → skin-type → frequency
      → sun-exposure → hydration-sleep → sunscreen → social-proof
      → food-analysis → commitment (64%)
          └─► (scan)/scan-prep (68%) → camera → loading → results (76%)
                  └─► (onboarding)/goal (80%) → final-loading → trust (88%)
                      → plan-preview (92%) → signup (96%)
                          └─► (onboarding)/paywall-soft → paywall-detailed
                              → notifications → (app)/home

(app)/home ←→ protocolo ←→ evolucao ←→ perfil
  └─► FAB → ScanModal → scan-prep (pele) ou food-analysis (comida)
  └─► food items → (scan)/food-report?foodId=x
```
