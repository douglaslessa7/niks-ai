import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import type { StickerSpec } from '../lib/stickerSpec'

/**
 * Sobe um JPEG (base64) para o bucket privado `scans` e devolve uma signed URL de 1 ano.
 *
 * `prefix` distingue a origem dentro da pasta do usuário (ex.: `'home_'` para a foto de
 * perfil escolhida na galeria). O default `''` preserva o caminho histórico dos scans.
 */
export async function uploadScanPhoto(userId: string, base64: string, prefix = ''): Promise<string> {
  const path = `${userId}/${prefix}${Date.now()}.jpg`;
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const { error } = await supabase.storage
    .from('scans')
    .upload(path, bytes.buffer, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  // Signed URL com 1 ano de validade (bucket privado)
  const { data: signed } = await supabase.storage
    .from('scans')
    .createSignedUrl(path, 31536000);
  if (signed?.signedUrl) return signed.signedUrl;
  // Fallback para bucket público
  return supabase.storage.from('scans').getPublicUrl(path).data.publicUrl;
}

export type SkinMetric = {
  score: number
  label: string
  insight: string
}

export type ScanResult = {
  skin_score: number
  skin_type_detected: string
  headline: string
  disclaimer: string

  // Campos de análise expandida (novo schema)
  skin_type_sebaceous?: 'seca' | 'oleosa' | 'mista' | 'normal'
  skin_phototype?: 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI'
  skin_hydration?: 'desidratada' | 'normal' | 'hidratada'
  barrier_status?: 'integra' | 'levemente_comprometida' | 'comprometida' | 'severamente_comprometida'
  barrier_insight?: string
  acne?: {
    present?: boolean
    lesion_type?: string | null
    severity?: string
    severity_score?: number
    distribution?: string[]
    pattern?: string | null
    score?: number
    label?: string
    insight?: string
  }
  cicatrizes?: {
    present: boolean
    type: string | null
    severity: string | null
    location: string[]
  }
  pigmentacao?: {
    present: boolean
    type: string | null
    location: string[]
    intensity_score: number
    insight: string
  }
  rosacea?: {
    present: boolean
    subtype: string | null
  }
  textura_poros?: {
    pore_visibility: string
    texture: string
    insight: string
  }
  brilho_sebaceo?: {
    intensity: string
    location: string[]
  }
  envelhecimento?: {
    present: boolean
    lines_type: string
    location: string[]
    firmness_loss: string
    skin_age?: number
  }
  area_periocular?: string
  condicoes_secundarias?: string[]
  qualidade_foto?: {
    score: number
    nivel: 'baixa' | 'media' | 'alta'
    notas: string
  }
  confianca_analise?: {
    score: number
    nivel: 'baixa' | 'media' | 'alta'
    campos_incertos: string[]
  }
  prioridade_clinica?: {
    primaria: string
    secundaria: string | null
    justificativa: string
  }
  contraindicacoes?: string[]

  // Campos de UI (mantidos para compatibilidade)
  skin_age?: number
  pontos_fortes?: string[]
  pontos_fracos?: string[]
  skin_strengths?: Array<{
    title: string
    icon: 'shield' | 'drop' | 'sparkle' | 'leaf' | 'sun'
    body: string
  }>
  action_recommendations?: Array<{
    category: string
    text: string
  }>
  region_insights?: Array<{
    region: 'testa' | 'nariz_zona_t' | 'bochechas' | 'queixo_mandibula' | 'area_periocular'
    main_finding: string
    consequence: string
    benefit: string
  }>
  // Card "Suas preocupações" na tela de resultado: a IA conecta os concerns
  // declarados no onboarding com os achados do scan (antes era sobre `objetivo`,
  // removido na Sessão 54; virou `concerns_alignment` na Sessão 55).
  concerns_alignment?: {
    alinhamento: 'confirmado' | 'parcial' | 'divergente'
    regioes_afetadas: string[]
    mensagem: string
  }

  // Legacy fields (scans antigos armazenados)
  metrics?: Record<string, SkinMetric>
  top_concerns?: string[]
  positive_highlights?: string[]
}

export type ProtocolStep = {
  id: number
  name: string
  ingredient: string
  instruction: string
  steps?: string[]
  color: string
  waitTime?: string | null
  product_suggestions?: string[]
  schedule?: { label: string }
}

export type ProtocolResult = {
  morning: ProtocolStep[]
  night: ProtocolStep[]
  dicas?: string[]
  introduction_warnings: string | null
  introduction_schedule?: string | null
  expected_timeline: {
    two_weeks: string
    one_month: string
    three_months: string
  }
}

export type FoodReportResult = {
  meal_name: string;
  meal_score: number;
  meal_label: string;
  meal_summary: string;
  foods: Array<{
    name: string;
    impact: 'positivo' | 'neutro' | 'negativo';
    evidence: string;
    mechanism: string;
    relevance_to_skin: string;
    substitution: string | null;
  }>;
  highlights: string[];
  watch_out: string[];
  science_note: string;
  disclaimer: string;
}

export type OnboardingData = {
  concerns: string[]
  genero: string | null
  pregnancy_status?: 'none' | 'pregnant' | 'breastfeeding' | 'trying' | null
  birthday: string | null
  skin_type: string | null
  sun_exposure: string | null
  hydration: string | null
  sleep: string | null
  commitment: string | null
  goal_desire?: string | null
  skincare_routine_type?: 'zero' | 'complement' | 'prescribed' | 'unsure' | null
  skincare_routine_description?: string | null
  allergy_type?: 'none' | 'sensitive' | 'reaction' | null
  allergy_description?: string | null
}

type AppStore = {
  tabBarTheme: 'light' | 'dark'
  setTabBarTheme: (theme: 'light' | 'dark') => void
  // Niks score do último scan — usado para o tema de cor da home E da logo central da navbar
  skinScore: number | null
  setSkinScore: (score: number | null) => void
  tabBarVisible: boolean
  setTabBarVisible: (visible: boolean) => void
  // produto_id cujo detalhe deve abrir ao entrar em recomendacao-produtos (deep-link da home)
  productDetailTarget: string | null
  setProductDetailTarget: (id: string | null) => void
  subscriptionVerified: boolean
  setSubscriptionVerified: (v: boolean) => void

  // Cupom de influenciadora aplicado no paywall. Aplicado ANTES do signup, quando a
  // usuária ainda não tem sessão — por isso é guardado localmente (persistido, ver
  // partialize) para depois ser ligado ao user_id no cadastro. `rcAppUserId` é o id do
  // RevenueCat usado na validação, guardado para casar a aplicação exata em cupom_aplicacoes.
  appliedCoupon: { codigo: string; rcAppUserId: string } | null
  setAppliedCoupon: (c: { codigo: string; rcAppUserId: string } | null) => void
  // Nome escolhido na tela "Como você quer ser chamada?", capturada AGORA no início
  // do onboarding — antes do signup, quando ainda NÃO há sessão. Guardado localmente
  // (persistido, ver partialize) até o cadastro, onde `saveToSupabase` o grava em
  // `users.nome`. Mesmo ciclo de vida do `appliedCoupon`.
  pendingName: string | null
  setPendingName: (name: string | null) => void
  // Tutorial de preparação do scan (scan-prep-app) — mostrado UMA vez só na vida.
  // Persistido (ver partialize): depois de visto, o botão "Escanear" vai direto à câmera.
  scanTutorialSeen: boolean
  setScanTutorialSeen: (v: boolean) => void
  onboarding: OnboardingData
  setOnboardingField: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void
  scanSource: 'onboarding' | 'app'
  setScanSource: (source: 'onboarding' | 'app') => void
  scanResult: ScanResult | null
  scanImageUri: string | null
  setScanResult: (result: ScanResult, imageUri: string) => void
  foodImageBase64: string | null
  foodImageMimeType: string | null
  setFoodImage: (base64: string, mimeType: string) => void
  productImageBase64: string | null
  productImageMimeType: string | null
  setProductImage: (base64: string, mimeType: string) => void
  productScanResult: any | null
  setProductScanResult: (result: any | null) => void
  // Colagem do Story (feature Compartilhar): URIs das fotos, na ordem das células.
  // Viajam pelo store, nunca por router params (truncam no bridge do RN).
  collagePhotos: string[]
  setCollagePhotos: (uris: string[]) => void
  // Adesivo escolhido na bandeja de `share-preview`. `null` = ainda não escolheu →
  // a tela cai no padrão (só o Niks score). Guardado no store, e não em state local,
  // para sobreviver ao vai-e-vem entre `share-capture` e `share-preview`.
  stickerSpec: StickerSpec | null
  setStickerSpec: (spec: StickerSpec | null) => void
  // Se a bandeja já subiu sozinha nesta sessão. ⚠️ NÃO persistir (ver `partialize`):
  // é exatamente a lista branca que faz a bandeja voltar a subir no cold start.
  stickerSheetSeen: boolean
  setStickerSheetSeen: (v: boolean) => void
  // Foto crua recém-escolhida na galeria, a caminho da tela de ajuste (`(foto)/ajustar-foto`).
  // Mesma regra da colagem: viaja pelo store, nunca por router params. É só um hand-off —
  // a foto definitiva é persistida em `users.foto_home_url`.
  homePhotoDraft: { uri: string; width: number; height: number } | null
  setHomePhotoDraft: (d: { uri: string; width: number; height: number } | null) => void
  skinImageBase64: string | null
  skinImageUri: string | null
  setSkinImage: (base64: string, uri: string) => void
  // Scan multi-foto (só dentro do app): as 3 imagens que vão para a IA, em base64,
  // na ordem [neutra_alta, layoutA (2×2 de expressões), layoutB (2 perfis)].
  // Vazio no scan de 1 foto do onboarding — é isso que `loading-dentro-app` usa para
  // decidir entre o payload multi e o payload single.
  // ⚠️ NUNCA persistir (ver o `partialize` no fim do arquivo): ~1 MB de base64.
  skinCollagesBase64: string[]
  // Setter ATÔMICO do scan multi-foto. Existe para não haver um render intermediário
  // com a foto neutra nova ao lado das colagens do scan anterior.
  setSkinScanImages: (neutral: { base64: string; uri: string }, collages: string[]) => void
  skinScanId: string | null
  protocolResult: ProtocolResult | null
  setProtocolResult: (result: ProtocolResult) => void
  protocolGenerating: boolean
  setProtocolGenerating: (v: boolean) => void
  // Regeneração do protocolo no 1º scan in-app: roda em background. Ambos EM MEMÓRIA
  // (fora do partialize): guard de "já rodando nesta sessão" + promessa do modal.
  regenInFlight: boolean
  setRegenInFlight: (v: boolean) => void
  routineUpdatingNotice: boolean
  setRoutineUpdatingNotice: (v: boolean) => void
  selectedScan: { result: ScanResult; imageUri: string } | null
  setSelectedScan: (scan: { result: ScanResult; imageUri: string } | null) => void
  selectedFoodResult: FoodReportResult | null
  setSelectedFoodResult: (result: FoodReportResult | null) => void
  selectedFoodImageUrl: string | null
  setSelectedFoodImageUrl: (url: string | null) => void
  niksChatMode: 'empty' | 'active'
  setNiksChatMode: (mode: 'empty' | 'active') => void
  skinPreviewUrl: string | null
  setSkinPreviewUrl: (url: string | null) => void
  saveToSupabase: (userId: string) => Promise<void>
  reset: () => void
}

const initialOnboarding: OnboardingData = {
  concerns: [],
  genero: null,
  pregnancy_status: null,
  birthday: null,
  skin_type: null,
  sun_exposure: null,
  hydration: null,
  sleep: null,
  commitment: null,
  goal_desire: null,
  skincare_routine_type: null,
  skincare_routine_description: null,
  allergy_type: null,
  allergy_description: null,
}

export const useAppStore = create<AppStore>()(persist((set, get) => ({
  tabBarTheme: 'light',
  setTabBarTheme: (theme) => set({ tabBarTheme: theme }),
  skinScore: null,
  setSkinScore: (score) => set({ skinScore: score }),
  tabBarVisible: true,
  setTabBarVisible: (visible) => set({ tabBarVisible: visible }),

  productDetailTarget: null,
  setProductDetailTarget: (id) => set({ productDetailTarget: id }),
  subscriptionVerified: false,
  setSubscriptionVerified: (v) => set({ subscriptionVerified: v }),

  appliedCoupon: null,
  setAppliedCoupon: (c) => set({ appliedCoupon: c }),
  pendingName: null,
  setPendingName: (name) => set({ pendingName: name }),
  scanTutorialSeen: false,
  setScanTutorialSeen: (v) => set({ scanTutorialSeen: v }),
  onboarding: initialOnboarding,
  scanSource: 'onboarding',
  scanResult: null,
  scanImageUri: null,
  foodImageBase64: null,
  foodImageMimeType: null,
  productImageBase64: null,
  productImageMimeType: null,
  productScanResult: null,
  skinImageBase64: null,
  skinImageUri: null,
  skinCollagesBase64: [],
  skinScanId: null,
  protocolResult: null,
  protocolGenerating: false,
  selectedScan: null,
  selectedFoodResult: null,
  selectedFoodImageUrl: null,

  setScanSource: (source) => set({ scanSource: source }),

  setOnboardingField: (key, value) =>
    set((state) => ({
      onboarding: { ...state.onboarding, [key]: value },
    })),

  setScanResult: (result, imageUri) =>
    set({ scanResult: result, scanImageUri: imageUri }),

  setProductImage: (base64, mimeType) => {
    console.log('setProductImage called, size KB:', Math.round((base64.length * 0.75) / 1024))
    set({ productImageBase64: base64, productImageMimeType: mimeType })
  },

  setProductScanResult: (result) => set({ productScanResult: result }),

  collagePhotos: [],
  setCollagePhotos: (uris) => set({ collagePhotos: uris }),
  stickerSpec: null,
  setStickerSpec: (spec) => set({ stickerSpec: spec }),
  stickerSheetSeen: false,
  setStickerSheetSeen: (v) => set({ stickerSheetSeen: v }),
  homePhotoDraft: null,
  setHomePhotoDraft: (d) => set({ homePhotoDraft: d }),

  setFoodImage: (base64, mimeType) => {
    console.log('setFoodImage called, size KB:', Math.round((base64.length * 0.75) / 1024))
    set({ foodImageBase64: base64, foodImageMimeType: mimeType })
  },

  // Caminho de 1 foto (onboarding e galeria em __DEV__). LIMPA as colagens de propósito:
  // sem isso, um scan de 1 foto feito depois de um scan multi reenviaria à IA as
  // colagens antigas junto com a foto nova.
  setSkinImage: (base64, uri) => set({ skinImageBase64: base64, skinImageUri: uri, skinCollagesBase64: [] }),
  setSkinScanImages: (neutral, collages) =>
    set({ skinImageBase64: neutral.base64, skinImageUri: neutral.uri, skinCollagesBase64: collages }),

  setProtocolResult: (result) => set({ protocolResult: result }),
  setProtocolGenerating: (v) => set({ protocolGenerating: v }),
  regenInFlight: false,
  setRegenInFlight: (v) => set({ regenInFlight: v }),
  routineUpdatingNotice: false,
  setRoutineUpdatingNotice: (v) => set({ routineUpdatingNotice: v }),

  setSelectedScan: (scan) => set({ selectedScan: scan }),

  setSelectedFoodResult: (result) => set({ selectedFoodResult: result }),

  setSelectedFoodImageUrl: (url) => set({ selectedFoodImageUrl: url }),

  niksChatMode: 'empty',
  setNiksChatMode: (mode) => set({ niksChatMode: mode }),
  skinPreviewUrl: null,
  setSkinPreviewUrl: (url) => set({ skinPreviewUrl: url }),

  saveToSupabase: async (userId: string) => {
    const { onboarding, scanResult, scanImageUri, skinImageBase64, pendingName } = get()

    let idade: number | null = null
    if (onboarding.birthday) {
      const asNum = Number(onboarding.birthday)
      if (!isNaN(asNum) && asNum > 0 && asNum < 120) {
        idade = asNum
      } else {
        const birth = new Date(onboarding.birthday)
        if (!isNaN(birth.getTime())) {
          idade = new Date().getFullYear() - birth.getFullYear()
        }
      }
    }

    const { data: { user } } = await supabase.auth.getUser()

    const { error: userError } = await supabase
      .from('users')
      .upsert({
        id: userId,
        email: user?.email ?? '',
        // Nome capturado no início do onboarding (tela "Como você quer ser chamada?").
        // `|| null` para não sobrescrever um nome existente com string vazia.
        nome: pendingName?.trim() || null,
        genero: onboarding.genero,
        pregnancy_status: onboarding.pregnancy_status ?? null,
        skincare_routine_type: onboarding.skincare_routine_type ?? null,
        skincare_routine_description: onboarding.skincare_routine_description ?? null,
        allergy_type: onboarding.allergy_type ?? null,
        allergy_description: onboarding.allergy_description ?? null,
        idade,
        tipo_pele: onboarding.skin_type,
        concerns: onboarding.concerns,
        sun_exposure: onboarding.sun_exposure,
        hydration: onboarding.hydration,
        sleep: onboarding.sleep,
        birthday: onboarding.birthday,
      })

    if (userError) throw userError

    if (scanResult) {
      let fotoUrl = scanImageUri ?? '';
      if (skinImageBase64) {
        try { fotoUrl = await uploadScanPhoto(userId, skinImageBase64); }
        catch (e) { console.warn('Photo upload failed, using local URI', e); }
      }

      const { data: scanData, error: scanError } = await supabase
        .from('skin_scans')
        .insert({
          user_id: userId,
          foto_url: fotoUrl,
          skin_score: scanResult.skin_score,
          tipo_pele: scanResult.skin_type_detected,
          metricas: scanResult.acne ? { acne: scanResult.acne, skin_age: scanResult.skin_age } : scanResult.metrics,
          areas_atencao: scanResult.pontos_fracos ?? scanResult.top_concerns,
          resumo: scanResult.headline,
          full_result: scanResult,
        })
        .select('id')
        .single()

      if (scanError) throw scanError
      if (scanData?.id) set({ skinScanId: scanData.id })
    }
  },

  reset: () => set({ onboarding: initialOnboarding, scanResult: null, scanImageUri: null, foodImageBase64: null, foodImageMimeType: null, productImageBase64: null, productImageMimeType: null, productScanResult: null, collagePhotos: [], stickerSpec: null, stickerSheetSeen: false, homePhotoDraft: null, skinImageBase64: null, skinImageUri: null, skinCollagesBase64: [], skinScanId: null, protocolResult: null, selectedScan: null, selectedFoodResult: null, selectedFoodImageUrl: null }),
}), {
  // ── Persistência em disco (AsyncStorage) ──────────────────────────────────
  // O store era 100% em memória, então TODO cache dele morria ao fechar o app —
  // por isso o cache do protocolo em `protocolo.tsx` nunca funcionava na prática:
  // depois de qualquer restart ele caía direto no fallback do Supabase.
  name: 'niks-app-store',
  storage: createJSONStorage(() => AsyncStorage),

  // ⚠️ LISTA BRANCA DELIBERADA — só persistir o que é pequeno e seguro.
  // Fora de propósito, e NÃO adicionar sem pensar:
  //   • `subscriptionVerified` — precisa voltar a `false` no cold start para o
  //     RevenueCat ser reverificado (ver decisão 16 do README);
  //   • `niksChatMode` — o README exige que o cold start caia em 'empty';
  //   • `*ImageBase64` / `*ImageUri` / `collagePhotos` / `homePhotoDraft` /
  //     `skinCollagesBase64` — base64 de foto estoura o AsyncStorage (as 3 imagens
  //     do scan multi-foto somam ~1 MB sozinhas); são hand-offs entre telas, de
  //     vida curta, que não fazem sentido sobreviver ao app;
  //   • `onboarding` — o fluxo tem `reset()` próprio;
  //   • `stickerSpec` / `stickerSheetSeen` — é ESTA exclusão que implementa a regra
  //     "a bandeja de adesivos só sobe sozinha na primeira vez da sessão": os dois
  //     morrem no cold start, sem precisar de flag nova em AsyncStorage. Persistir
  //     `stickerSheetSeen` faria a bandeja nunca mais subir sozinha — bug silencioso.
  partialize: (s) => ({
    skinScore: s.skinScore,       // tema de cor da home e da navbar, na hora
    protocolResult: s.protocolResult, // a Rotina abre instantânea, sem rede
    scanTutorialSeen: s.scanTutorialSeen, // tutorial de prep é uma-vez-só, para sempre
    appliedCoupon: s.appliedCoupon, // cupom aplicado antes do signup — precisa sobreviver até o cadastro
    pendingName: s.pendingName, // nome capturado antes do signup — sobrevive até o cadastro
  }),
}))