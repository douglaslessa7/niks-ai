export const EVOLUTION_KEYWORDS: string[] = [
  'melhorei',
  'minha pele melhorou',
  'tô melhorando',
  'tô evoluindo',
  'evoluí',
  'score subiu',
  'score caiu',
  'score aumentou',
  'score diminuiu',
  'meu score',
  'piorei',
  'minha pele piorou',
  'tô piorando',
  'protocolo funcionou',
  'protocolo tá funcionando',
  'tá funcionando',
  'vale a pena continuar',
  'vale continuar',
  'tô vendo resultado',
  'tô vendo resultados',
  'tem resultado',
  'tem evolução',
  'evolução da minha pele',
  'comparar scans',
  'comparar análises',
  'desde o último scan',
  'progresso',
  'progressão',
]

export function detectEvolutionIntent(message: string): boolean {
  const normalized = message.toLowerCase()
  return EVOLUTION_KEYWORDS.some(keyword => normalized.includes(keyword))
}
