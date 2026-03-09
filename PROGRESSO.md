# NIKS AI — Progresso de Desenvolvimento

Última atualização: 2026-03-08

---

## STATUS GERAL

- **Fase atual:** Fase 3 — Telas de Onboarding (parcialmente concluída)
- **Última tela finalizada:** `signup.tsx`
- **Próxima tela a construir:** `paywall-soft.tsx`

---

## ARQUIVOS CRIADOS E CONCLUÍDOS

### Configuração do Projeto
- `package.json` — main entry: `expo-router/entry`, todas as deps instaladas
- `app.json` — nome "NIKS AI", bundle ID `com.niksai.app`, portrait only, permissões de câmera
- `babel.config.js` — NativeWind + Reanimated plugins
- `metro.config.js` — withNativeWind + global.css
- `tailwind.config.js` — cores niks-* customizadas
- `global.css` — @tailwind base/components/utilities
- `nativewind-env.d.ts` — referência de tipos NativeWind
- `.npmrc` — legacy-peer-deps=true (necessário por conflito react-dom 19.2.4 vs 19.2.0)
- `.env` — variáveis de ambiente (não comitar)
- `.env.example` — template de variáveis
- `.gitignore` — inclui .env

### Constantes
- `constants/colors.ts` — todos os tokens de cor do Figma Make

### Root Layout
- `app/_layout.tsx` — SafeAreaProvider + Stack (headerShown: false)

### Componentes Base (todos concluídos)
- `components/ui/CTAButton.tsx` — botão preto full-width, rounded-[14px], useRouter
- `components/ui/ProgressBar.tsx` — Animated.Value, h-[4px] preto sobre h-[2px] cinza
- `components/ui/BackButton.tsx` — círculo #F5F5F7, ChevronLeft de lucide-react-native
- `components/ui/OptionCard.tsx` — selecionado: bg-[#1A1A1A]/texto branco; prop subtitle
- `components/ui/Pill.tsx` — rounded-full, mesmas cores do OptionCard
- `components/ui/IOSWheelPicker.tsx` — ScrollView + snapToInterval=44 + LinearGradient fades
- `components/layouts/QuizLayout.tsx` — SafeAreaView + BackButton + ProgressBar + px-6
- `components/scan/ScanModal.tsx` — Modal RN com Animated (sem Framer Motion), 2 cards

### Telas — Welcome
- `app/index.tsx` — BR badge, phone mockup, H1, CTAButton → /(onboarding)/concerns

### Telas — Onboarding (app/(onboarding)/)
- `_layout.tsx` — Stack sem header
- `concerns.tsx` ✅ — progresso 8%, multi-select Pills, → gender
- `gender.tsx` ✅ — progresso 16%, 3 OptionCards, → birthday
- `birthday.tsx` ✅ — progresso 24%, IOSWheelPicker ×3 (dia/mês/ano), → skin-type
- `skin-type.tsx` ✅ — progresso 32%, 5 OptionCards com subtitle, → frequency
- `frequency.tsx` ✅ — progresso 36%, DotsIcon inline, → sun-exposure
- `sun-exposure.tsx` ✅ — progresso 40%, 4 OptionCards, → hydration-sleep
- `hydration-sleep.tsx` ✅ — progresso 44%, Chips horizontais ScrollView, → sunscreen
- `sunscreen.tsx` ✅ — progresso 52%, 4 OptionCards, → social-proof
- `social-proof.tsx` ✅ — progresso 56%, gráfico SVG (react-native-svg), → food-analysis
- `food-analysis.tsx` ✅ — progresso 60%, mock scan card, → commitment
- `commitment.tsx` ✅ — progresso 64%, "realista" em #FF9B8A, → /(scan)/scan-prep
- `goal.tsx` ✅ — progresso 80%, 5 OptionCards, → final-loading
- `final-loading.tsx` ✅ — SEM progress bar, contador 0→100% com checklist 5 etapas, → trust
- `trust.tsx` ✅ — progresso 88%, SVG illustration, Lock icon, privacy card, → plan-preview
- `plan-preview.tsx` ✅ — progresso 92%, Score ring (SVG), 4 features, → signup
- `signup.tsx` ✅ — progresso 96%, botões Apple e Google, → paywall-soft

---

## PRÓXIMAS TELAS A CONSTRUIR (em ordem)

### Onboarding — restantes
1. `paywall-soft.tsx` — SEM progress bar, headline + phone mockup + CTA "Testar por R$0,00"
2. `paywall-detailed.tsx` — SEM progress bar, timeline + planos mensal/anual
3. `notifications.tsx` — SEM progress bar, ícone Bell, botão "Ativar" → /(app)/home

### Scan Flow (app/(scan)/)
4. `_layout.tsx`
5. `scan-prep.tsx` — progresso 68%, 3 cards de instrução
6. `camera.tsx` — SEM progress bar, fundo #1A1A1A, guia oval, expo-camera
7. `loading.tsx` — SEM progress bar, contador + checklist 6 etapas, → results
8. `results.tsx` — progresso 76%, Score ring grande, métricas em grid, cards bloqueados
9. `food-report.tsx` — relatório de impacto alimentar

### App Principal (app/(app)/)
10. `_layout.tsx` — TabBar custom com FAB #FB7B6B
11. `home.tsx`
12. `protocolo.tsx`
13. `analise.tsx`
14. `evolucao.tsx`
15. `perfil.tsx`

### Integrações (Fase 5)
16. `lib/supabase.ts`
17. `lib/claude.ts`
18. `lib/revenuecat.ts`
19. `lib/mixpanel.ts`
20. `store/onboarding.ts`
21. `hooks/useAuth.ts`, `useSkinScan.ts`, `useSubscription.ts`

---

## PADRÕES DE CÓDIGO ADOTADOS

### Navegação
- Expo Router v3 com rotas em grupos: `(onboarding)`, `(app)`, `(scan)`
- `useRouter().push('/(grupo)/tela')` — sempre com o grupo na rota
- Sem progress bar: Camera, Loading, FinalLoading, Paywalls, Notifications
- `router.back()` para voltar (não `navigate(-1)`)

### Conversão Figma Make → React Native
| Web | React Native |
|---|---|
| `div` | `View` |
| `button` | `TouchableOpacity` (activeOpacity=0.8) |
| `span`/`p`/`h1` | `Text` |
| `lucide-react` | `lucide-react-native` |
| `motion/react` | `Animated` do React Native (ou Reanimated) |
| `recharts` | `react-native-svg` (Svg, Polyline, Circle, etc.) |
| `document.createElement` | Removido completamente |
| CSS `overflow-hidden` | `style={{ overflow: 'hidden' }}` |
| `pb-safe` | `useSafeAreaInsets()` |

### Estilo
- NativeWind v4 com `className` nos componentes RN
- Tailwind classes funcionam igual ao web para a maioria dos casos
- Cores hardcoded nos className quando específicas (ex: `bg-[#1A1A1A]`)
- `StyleSheet.create` usado APENAS quando NativeWind não suporta (ex: `shadowColor`, `transform` complexo)

### Componentes
- Props renomeadas: `onClick` → `onPress`, `children: string` mantido no Pill
- OptionCard ganhou prop `subtitle?: string` além do Figma Make original
- IOSWheelPicker: `width` mudou de string CSS (`"w-[100px]"`) para `number` (ex: `100`)

---

## PROBLEMAS TÉCNICOS E DECISÕES

### 1. Conflito de peer deps (react-dom 19.2.4 vs react 19.2.0)
**Problema:** `npx expo install` falha por conflito entre versões minor do React.
**Solução:** Criado `.npmrc` com `legacy-peer-deps=true`. Todos os `npm install` subsequentes usam esta flag automaticamente.

### 2. react-native-svg necessário para gráficos
**Problema:** Figma Make usa `recharts` (lib web), que não funciona em React Native.
**Solução:** Substituído por `react-native-svg` com `Svg`, `Polyline`, `Circle` nativos. Já incluído como dep do Expo (não requer instalação extra).

### 3. IOSWheelPicker — opacidade estática vs dinâmica
**Problema:** No web, a opacidade dos itens é calculada dinamicamente no scroll. Em RN, o `onScroll` não re-renderiza eficientemente.
**Solução:** Opacidade calculada com base no índice relativo ao `selectedValue` (prop estática). Atualiza corretamente após `onMomentumScrollEnd`.

### 4. ScanModal — Framer Motion não disponível em RN
**Problema:** Figma Make usa `AnimatePresence` e `motion` da lib `framer-motion`.
**Solução:** Substituído por `Modal` nativo do React Native + `Animated.timing`/`Animated.spring` para entrada/saída.

### 5. Arquivos App.tsx e index.ts do template original
**Status:** Ainda existem na raiz (`App.tsx`, `index.ts`). Expo Router ignora eles quando `"main": "expo-router/entry"` está definido no `package.json`. Podem ser deletados depois.

---

## FIGMA MCP — REFERÊNCIA

- **File ID:** `XrX2xnE32aNLOaFw5ayPM0`
- **Base URI:** `file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/screens/`
- **Componentes:** `file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/app/components/`
- **Estilos:** `file://figma/make/source/XrX2xnE32aNLOaFw5ayPM0/src/styles/`
- Sempre ler o arquivo Figma antes de construir cada tela
