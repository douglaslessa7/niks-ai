import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export type SkinMetric = {
  score: number
  label: string
  insight: string
}

export type ScanResult = {
  skin_score: number
  skin_type_detected: string
  headline: string
  metrics: {
    hydration: SkinMetric
    oiliness: SkinMetric
    acne: SkinMetric
    dark_spots: SkinMetric
    texture: SkinMetric
    sensitivity: SkinMetric
  }
  zones: Record<string, { concern: string; severity: string }>
  top_concerns: string[]
  positive_highlights: string[]
  disclaimer: string
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

  saveToSupabase: async (userId: string) => {
    const { onboarding, scanResult, scanImageUri } = get()

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
      const { error: scanError } = await supabase.from('skin_scans').insert({
        user_id: userId,
        foto_url: scanImageUri ?? '',
        skin_score: scanResult.skin_score,
        tipo_pele: scanResult.skin_type_detected,
        metricas: scanResult.metrics,
        areas_atencao: scanResult.top_concerns,
        resumo: scanResult.headline,
      })

      if (scanError) throw scanError
    }
  },

  reset: () => set({ onboarding: initialOnboarding, scanResult: null, scanImageUri: null, foodImageBase64: null, foodImageMimeType: null, skinImageBase64: null, skinImageUri: null }),
}))