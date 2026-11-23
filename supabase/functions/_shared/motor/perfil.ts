// Motor da rotina v2 — monta o PerfilMotor a partir do scan + respostas do onboarding
// (ou da linha `users`, nas regenerações) + memórias do chat.

import type { AtivoId } from './ativos.ts'
import { doresDoScan, doresMarcadas } from './dores.ts'
import type { PerfilMotor } from './plano.ts'
import { ativosCortados, lerReacoes } from './reacoes.ts'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export const GRAVIDEZ = ['pregnant', 'breastfeeding', 'trying']

// Mesmo vocabulário do ALLERGEN_KEYWORDS de recomendar-produtos (na dúvida, corta).
const ALERGIA_PARA_ATIVOS: [string[], AtivoId[]][] = [
  // Depois dos termos em português, os mesmos em inglês (descrição escrita em inglês).
  [['aha', 'bha', 'salicilico', 'glicolico', 'mandelico', 'lactico', 'latico', 'esfoliante', 'peeling', 'acido', 'salicylic', 'glycolic', 'mandelic', 'lactic', 'exfoliant', 'exfoliat', 'peel', 'acid'], ['aha', 'pha', 'salicilico']],
  [['retino', 'tretinoina', 'retinal', 'adapaleno', 'vitamina a', 'tretinoin', 'adapalene', 'vitamin a'], ['retinoide']],
  [['vitamina c', 'vit c', 'ascorbico', 'vitamin c', 'ascorbic'], ['vitc_pura', 'vitc_derivado']],
  [['niacinamida', 'niacin', 'vitamina b3', 'vitamin b3'], ['niacinamida']],
  [['peroxido', 'benzoila', 'peroxide', 'benzoyl'], ['peroxido']],
  [['azelaico', 'azelaic'], ['azelaico']],
]

// 23/nov/2026: a reação vale para o INGREDIENTE marcado; a família só sai em reação forte
// ou termo genérico ("ácidos"). Regra em reacoes.ts. O mapa acima ficou só como referência.
export function alergiaCorta(descricao: unknown): AtivoId[] {
  return ativosCortados(lerReacoes(descricao))
}

const ISOTRETINOINA = /(isotretino|roacutan|roaccutane|acnova|ciscutan|absorica|accutane)/

export function tomaIsotretinoina(onboarding: any, memorias: { type?: string; value?: string }[] = []): boolean {
  // Do app vem 'sim'/'nao' (pergunta do onboarding); da linha `users`, true/false.
  if (onboarding?.isotretinoina === true || onboarding?.isotretinoina === 'sim') return true
  return memorias.some((m) => ISOTRETINOINA.test(norm(String(m?.value ?? ''))))
}

export function perfilMotor(scan: any, onboarding: any, memorias: { type?: string; value?: string }[] = []): PerfilMotor {
  const barreira = String(scan?.barrier_status ?? '')
  return {
    marcadas: doresMarcadas(onboarding?.concerns, onboarding?.dor_principal),
    doScan: doresDoScan(scan),
    gravida: GRAVIDEZ.includes(String(onboarding?.pregnancy_status ?? '')),
    isotretinoina: tomaIsotretinoina(onboarding, memorias),
    barreiraComprometida: barreira === 'comprometida' || barreira === 'severamente_comprometida',
    rosacea: scan?.rosacea?.present === true,
    alergiaCorta: alergiaCorta(onboarding?.allergy_description),
    amamentando: String(onboarding?.pregnancy_status ?? '') === 'breastfeeding',
  }
}
