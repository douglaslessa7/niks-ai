import { OnboardingData, ScanResult } from '../store/onboarding';

// Remonta o OnboardingData a partir da linha `users` (reverso do saveToSupabase).
// Extraído verbatim do generateOnDemand (protocolo.tsx) — fonte única, reusado pela
// Rotina e pela regeneração in-app. `skin_type` nunca vazio: declarado OU o detectado
// pelo scan (o chamador garante um scan aproveitável).
export function buildOnboardingDataFromUserRow(urow: any, scanResult: ScanResult): OnboardingData {
  return {
    concerns: Array.isArray(urow?.concerns) ? (urow.concerns as string[]) : [],
    genero: urow?.genero ?? null,
    pregnancy_status: urow?.pregnancy_status ?? null,
    birthday: urow?.birthday ?? null,
    skin_type: urow?.tipo_pele ?? scanResult.skin_type_detected ?? null,
    sun_exposure: urow?.sun_exposure ?? null,
    hydration: urow?.hydration ?? null,
    sleep: urow?.sleep ?? null,
    commitment: null,      // não é persistido em `users`
    goal_desire: null,     // não é persistido em `users`
    skincare_routine_type: urow?.skincare_routine_type ?? null,
    skincare_routine_description: urow?.skincare_routine_description ?? null,
    allergy_type: urow?.allergy_type ?? null,
    allergy_description: urow?.allergy_description ?? null,
  };
}
