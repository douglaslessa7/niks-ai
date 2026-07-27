// Mapa código de concern → rótulo PT — FONTE ÚNICA no lado do app.
//
// É o inverso do `CONCERN_LABEL_TO_CODE` da Edge Function `recomendar-produtos`
// (mesmos rótulos que o onboarding usa em app/(onboarding)/concerns.tsx), acrescido
// dos códigos derivados do scan por `scanConcernCodes` na mesma função — pois a coluna
// `produtos.concerns` pode conter esses (vermelhidao_rosacea / barreira_comprometida /
// cicatrizes). Mantenha consistente com aquela função: uma mudança lá deve refletir aqui.

export const CONCERN_CODE_TO_LABEL: Record<string, string> = {
  // onboarding (inverso de CONCERN_LABEL_TO_CODE)
  acne: 'Acne/espinhas',
  manchas: 'Manchas',
  cravos: 'Cravos',
  oleosidade: 'Oleosidade',
  rugas: 'Rugas',
  poros: 'Poros dilatados',
  ressecamento: 'Ressecamento',
  textura: 'Textura irregular',
  // derivados do scan (scanConcernCodes)
  vermelhidao_rosacea: 'Vermelhidão',
  barreira_comprometida: 'Barreira',
  cicatrizes: 'Cicatrizes',
}

// Rótulo PT de um código de concern. `undefined` para código desconhecido —
// o chamador deve omitir a chip (nunca exibir o código cru).
export function concernLabel(code: string): string | undefined {
  return CONCERN_CODE_TO_LABEL[code]
}
