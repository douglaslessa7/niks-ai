import { create } from 'zustand'
import { supabase } from '../lib/supabase'

async function uploadScanPhoto(userId: string, base64: string): Promise<string> {
  const path = `${userId}/${Date.now()}.jpg`;
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
  // New schema fields
  acne?: SkinMetric
  skin_age?: number
  pontos_fortes?: string[]
  pontos_fracos?: string[]
  // Legacy fields (old stored scans)
  metrics?: Record<string, SkinMetric>
  top_concerns?: string[]
  positive_highlights?: string[]
  disclaimer: string
}

export type ProtocolStep = {
  id: number
  name: string
  ingredient: string
  instruction: string
  color: string
  waitTime?: string | null
  product_suggestions?: string[]
}

export type ProtocolResult = {
  morning: ProtocolStep[]
  night: ProtocolStep[]
  introduction_warnings: string | null
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
  birthday: string | null
  skin_type: string | null
  frequency: string | null
  sun_exposure: string | null
  hydration: string | null
  sleep: string | null
  sunscreen: string | null
  food_analysis: boolean | null
  commitment: string | null
  objetivo: string | null
}

type AppStore = {
  onboarding: OnboardingData
  setOnboardingField: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void
  scanResult: ScanResult | null
  scanImageUri: string | null
  setScanResult: (result: ScanResult, imageUri: string) => void
  foodImageBase64: string | null
  foodImageMimeType: string | null
  setFoodImage: (base64: string, mimeType: string) => void
  skinImageBase64: string | null
  skinImageUri: string | null
  setSkinImage: (base64: string, uri: string) => void
  skinScanId: string | null
  protocolResult: ProtocolResult | null
  setProtocolResult: (result: ProtocolResult) => void
  selectedScan: { result: ScanResult; imageUri: string } | null
  setSelectedScan: (scan: { result: ScanResult; imageUri: string } | null) => void
  selectedFoodResult: FoodReportResult | null
  setSelectedFoodResult: (result: FoodReportResult | null) => void
  saveToSupabase: (userId: string) => Promise<void>
  reset: () => void
}

const initialOnboarding: OnboardingData = {
  concerns: [],
  genero: null,
  birthday: null,
  skin_type: null,
  frequency: null,
  sun_exposure: null,
  hydration: null,
  sleep: null,
  sunscreen: null,
  food_analysis: null,
  commitment: null,
  objetivo: null,
}

export const useAppStore = create<AppStore>((set, get) => ({
  onboarding: initialOnboarding,
  scanResult: null,
  scanImageUri: null,
  foodImageBase64: null,
  foodImageMimeType: null,
  skinImageBase64: null,
  skinImageUri: null,
  skinScanId: null,
  protocolResult: null,
  selectedScan: null,
  selectedFoodResult: null,

  setOnboardingField: (key, value) =>
    set((state) => ({
      onboarding: { ...state.onboarding, [key]: value },
    })),

  setScanResult: (result, imageUri) =>
    set({ scanResult: result, scanImageUri: imageUri }),

  setFoodImage: (base64, mimeType) => {
    console.log('setFoodImage called, size KB:', Math.round((base64.length * 0.75) / 1024))
    set({ foodImageBase64: base64, foodImageMimeType: mimeType })
  },

  setSkinImage: (base64, uri) => set({ skinImageBase64: base64, skinImageUri: uri }),

  setProtocolResult: (result) => set({ protocolResult: result }),

  setSelectedScan: (scan) => set({ selectedScan: scan }),

  setSelectedFoodResult: (result) => set({ selectedFoodResult: result }),

  saveToSupabase: async (userId: string) => {
    const { onboarding, scanResult, scanImageUri, skinImageBase64 } = get()

    let idade: number | null = null
    if (onboarding.birthday) {
      const birth = new Date(onboarding.birthday)
      idade = new Date().getFullYear() - birth.getFullYear()
    }

    const { data: { user } } = await supabase.auth.getUser()

    const { error: userError } = await supabase
      .from('users')
      .upsert({
        id: userId,
        email: user?.email ?? '',
        genero: onboarding.genero,
        idade,
        tipo_pele: onboarding.skin_type,
        concerns: onboarding.concerns,
        objetivo: onboarding.objetivo,
        frequency: onboarding.frequency,
        sun_exposure: onboarding.sun_exposure,
        hydration: onboarding.hydration,
        sleep: onboarding.sleep,
        sunscreen: onboarding.sunscreen,
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

  reset: () => set({ onboarding: initialOnboarding, scanResult: null, scanImageUri: null, foodImageBase64: null, foodImageMimeType: null, skinImageBase64: null, skinImageUri: null, skinScanId: null, protocolResult: null, selectedScan: null, selectedFoodResult: null }),
}))