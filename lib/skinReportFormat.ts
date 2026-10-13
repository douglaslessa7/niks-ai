// Rótulos legíveis dos campos da `analyze-skin` usados nos relatórios de pele
// (resultado do onboarding `(scan)/resultado-scan`, resultado do app
// `(app)/skin-result` e o relatório antigo `(scan)/results`). FONTE ÚNICA — antes
// cada tela tinha a sua cópia.

export const formatPriority = (text: string | null | undefined): string => {
  if (!text) return '';
  return text.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

export const formatContraindication = (value: string): string => {
  const map: Record<string, string> = {
    acido_glicolico_alta_concentracao: 'Ácido glicólico em alta concentração',
    retinoides_sem_preparo_de_barreira: 'Retinoides sem preparo de barreira',
    esfoliantes_fisicos: 'Esfoliantes físicos',
    esfoliantes_fisicos_agressivos: 'Esfoliantes físicos agressivos',
    'vitamina_c_pH_baixo_sem_adaptacao': 'Vitamina C em pH baixo sem adaptação',
    acidos_esfoliantes_alta_concentracao: 'Ácidos esfoliantes em alta concentração',
    acidos_esfoliantes_alta_concentracao_sem_preparo: 'Ácidos esfoliantes em alta concentração',
    produtos_com_alcool_alto: 'Produtos com álcool',
    produtos_com_alta_fragrancia: 'Produtos com fragrância',
    sabonetes_com_sulfatos_fortes: 'Sabonetes com sulfatos fortes',
  };
  return map[value] ?? value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

export const barrierLabel = (status?: string): string => {
  switch (status) {
    case 'integra': return 'Íntegra';
    case 'levemente_comprometida': return 'Atenção';
    case 'comprometida': return 'Comprometida';
    case 'severamente_comprometida': return 'Crítica';
    default: return status ?? '—';
  }
};

export const hydrationLabel = (h?: string): string => {
  switch (h) {
    case 'desidratada': return 'Desidratada';
    case 'normal': return 'Normal';
    case 'hidratada': return 'Boa';
    default: return h ?? '—';
  }
};

export const sebaceoLabel = (i?: string): string => {
  switch (i) {
    case 'nenhum': return 'Nenhuma';
    case 'leve': return 'Leve';
    case 'moderado': return 'Moderada';
    case 'intenso': return 'Intensa';
    default: return i ?? '—';
  }
};
