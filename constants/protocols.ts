// Templates base de protocolo de skincare por tipo de pele
// Estes templates servem como BASE para a IA personalizar conforme as métricas do scan

export type ProtocolStep = {
  id: number
  category: string
  name: string
  ingredient: string
  instruction: string
  waitTime: string | null
  product_suggestions: string[]
}

export type BaseProtocol = {
  morning: ProtocolStep[]
  night: ProtocolStep[]
}

export const BASE_PROTOCOLS: Record<string, BaseProtocol> = {

  // =============================================
  // PELE NORMAL — Manter e Prevenir
  // =============================================
  normal: {
    morning: [
      {
        id: 1,
        category: 'limpeza',
        name: 'Gel de limpeza suave',
        ingredient: 'Glicerina + Ceramidas',
        instruction: 'Massagear no rosto úmido por 30 segundos, enxaguar com água morna e secar com tapinhas',
        waitTime: null,
        product_suggestions: ['CeraVe Gel de Limpeza', 'Cetaphil Gentle Cleanser'],
      },
      {
        id: 2,
        category: 'serum',
        name: 'Sérum antioxidante',
        ingredient: 'Vitamina C 15%',
        instruction: 'Aplicar 3-4 gotas no rosto e pescoço — protege contra danos UV e ilumina a pele',
        waitTime: '1 min',
        product_suggestions: ['Principia VC-10 Sérum Vitamina C', 'Sallve Sérum Vitamina C'],
      },
      {
        id: 3,
        category: 'hidratante',
        name: 'Hidratante leve',
        ingredient: 'Ácido Hialurônico + Niacinamida + Ceramidas',
        instruction: 'Aplicar quantidade de uma moeda no rosto e pescoço para selar a hidratação',
        waitTime: '1 min',
        product_suggestions: ['CeraVe Loção Hidratante Facial', 'La Roche-Posay Toleriane Double Repair'],
      },
      {
        id: 4,
        category: 'protetor',
        name: 'Protetor solar FPS 50+',
        ingredient: 'Filtros UV amplo espectro',
        instruction: 'Aplicar generosamente (2 dedos de comprimento). Reaplicar a cada 2 horas ao ar livre',
        waitTime: null,
        product_suggestions: ['La Roche-Posay Anthelios XL-Protect FPS 60', 'ISDIN Fusion Water FPS 60'],
      },
    ],
    night: [
      {
        id: 1,
        category: 'limpeza',
        name: 'Gel de limpeza suave',
        ingredient: 'Glicerina + Ceramidas',
        instruction: 'Remover protetor solar, sujeira e poluição do dia. Dupla limpeza se usou maquiagem',
        waitTime: null,
        product_suggestions: ['CeraVe Gel de Limpeza', 'Cetaphil Gentle Cleanser'],
      },
      {
        id: 2,
        category: 'tratamento',
        name: 'Retinol',
        ingredient: 'Retinol 0,3%',
        instruction: 'Quantidade de uma ervilha na pele seca. Começar em noites alternadas e aumentar gradualmente',
        waitTime: '20 min',
        product_suggestions: ['Principia Rn-0,3 Retinol', 'Creamy Retinol 0,3%'],
      },
      {
        id: 3,
        category: 'hidratante',
        name: 'Hidratante noturno',
        ingredient: 'Ceramidas + Peptídeos + Ácido Hialurônico',
        instruction: 'Selar o retinol e apoiar reparação da barreira durante a noite',
        waitTime: null,
        product_suggestions: ['CeraVe Creme Hidratante', 'La Roche-Posay Cicaplast Baume B5+'],
      },
    ],
  },

  // =============================================
  // PELE SECA — Hidratar, Reparar e Selar
  // =============================================
  seca: {
    morning: [
      {
        id: 1,
        category: 'limpeza',
        name: 'Limpador cremoso',
        ingredient: 'Glicerina + Ceramidas + Extrato de Aveia',
        instruction: 'Splash com água morna ou pouco limpador cremoso. Nunca usar espuma. Secar com tapinhas suaves',
        waitTime: null,
        product_suggestions: ['CeraVe Hidratante de Limpeza', 'La Roche-Posay Toleriane Hidratante'],
      },
      {
        id: 2,
        category: 'serum',
        name: 'Sérum hidratante',
        ingredient: 'Ácido Hialurônico multi-peso + Pantenol',
        instruction: 'Aplicar 3-4 gotas na pele ÚMIDA — o ácido hialurônico precisa de água para funcionar',
        waitTime: '30 seg',
        product_suggestions: ['CeraVe Sérum Ácido Hialurônico', 'Vichy Minéral 89 Booster'],
      },
      {
        id: 3,
        category: 'hidratante',
        name: 'Creme barreira rico',
        ingredient: 'Ceramidas + Esqualano + Manteiga de Karité + Glicerina',
        instruction: 'Quantidade de uma moeda pressionada no rosto e pescoço — este é o passo mais importante para pele seca',
        waitTime: '1-2 min',
        product_suggestions: ['CeraVe Creme Hidratante', 'Bepantol Derma Creme Hidratante'],
      },
      {
        id: 4,
        category: 'protetor',
        name: 'Protetor solar FPS 50+ hidratante',
        ingredient: 'Filtros UV + Ácido Hialurônico',
        instruction: 'Aplicar generosamente. Escolher fórmula HIDRATANTE, nunca matificante',
        waitTime: null,
        product_suggestions: ['Vichy Capital Soleil UV-Age Daily', 'La Roche-Posay Anthelios Hydraox FPS 60'],
      },
    ],
    night: [
      {
        id: 1,
        category: 'limpeza',
        name: 'Dupla limpeza suave',
        ingredient: 'Óleo de Jojoba → Limpador cremoso com Glicerina',
        instruction: 'Massagear óleo no rosto seco por 60 seg para dissolver protetor, enxaguar, depois limpador cremoso',
        waitTime: null,
        product_suggestions: ['Bioderma Atoderm Huile de Douche + CeraVe Hidratante de Limpeza'],
      },
      {
        id: 2,
        category: 'tratamento',
        name: 'Retinol baixa dose',
        ingredient: 'Retinol 0,025-0,3% encapsulado',
        instruction: 'Usar apenas 2-3x por semana. Método sanduíche: hidratante → retinol → hidratante para proteger a barreira',
        waitTime: '5-10 min',
        product_suggestions: ['Principia Rn-0,3 Retinol', 'Creamy Retinol 0,3%'],
      },
      {
        id: 3,
        category: 'serum',
        name: 'Sérum reparador',
        ingredient: 'Ácido Hialurônico + Ceramidas + Peptídeos + Pantenol',
        instruction: 'Repõe umidade após retinol. Nas noites sem retinol, este é o passo principal de tratamento',
        waitTime: '30 seg',
        product_suggestions: ['Vichy Minéral 89 Booster', 'CeraVe Sérum Ácido Hialurônico'],
      },
      {
        id: 4,
        category: 'hidratante',
        name: 'Creme noturno rico',
        ingredient: 'Ceramidas (NP, AP, EOP) + Colesterol + Ácidos Graxos + Esqualano',
        instruction: 'Aplicação generosa — apoia reconstrução da barreira cutânea durante a noite',
        waitTime: null,
        product_suggestions: ['La Roche-Posay Cicaplast Baume B5+', 'CeraVe Creme Hidratante'],
      },
    ],
  },

  // =============================================
  // PELE OLEOSA — Controlar, Não Agredir
  // =============================================
  oleosa: {
    morning: [
      {
        id: 1,
        category: 'limpeza',
        name: 'Limpador espumante suave',
        ingredient: 'Ácido Salicílico 0,5-2% + Niacinamida',
        instruction: 'Molhar o rosto, massagear o limpador por 30 segundos, enxaguar e secar com tapinhas. Máximo 2x ao dia',
        waitTime: null,
        product_suggestions: ['La Roche-Posay Effaclar Gel Concentrado', 'CeraVe Gel de Limpeza para Pele Oleosa'],
      },
      {
        id: 2,
        category: 'serum',
        name: 'Sérum controle de oleosidade',
        ingredient: 'Niacinamida 10% + Zinco PCA',
        instruction: 'Aplicar 3-4 gotas no rosto e pescoço. Regula produção de sebo sem ressecar',
        waitTime: '1-2 min',
        product_suggestions: ['Principia NC-10 Niacinamida + Zinco', 'Creamy Sérum Niacinamida'],
      },
      {
        id: 3,
        category: 'hidratante',
        name: 'Hidratante gel leve',
        ingredient: 'Ceramidas + Ácido Hialurônico',
        instruction: 'SIM, pele oleosa PRECISA de hidratante. Usar quantidade de uma ervilha na pele úmida',
        waitTime: '1-2 min',
        product_suggestions: ['Neutrogena Hydro Boost Water Gel', 'Eucerin DermoPure Oil Control'],
      },
      {
        id: 4,
        category: 'protetor',
        name: 'Protetor solar matificante FPS 50+',
        ingredient: 'Óxido de Zinco + Sílica absorvedora de oleosidade',
        instruction: 'Aplicar generosamente. O zinco tem propriedades anti-inflamatórias e absorve oleosidade',
        waitTime: null,
        product_suggestions: ['La Roche-Posay Anthelios Airlicium FPS 70', 'Sallve Protetor Solar Toque Seco FPS 50'],
      },
    ],
    night: [
      {
        id: 1,
        category: 'limpeza',
        name: 'Limpador espumante suave',
        ingredient: 'Ácido Salicílico + Glicerina',
        instruction: 'Massagear por 60 segundos para remover protetor solar, oleosidade e sujeira do dia',
        waitTime: null,
        product_suggestions: ['La Roche-Posay Effaclar Gel Concentrado', 'CeraVe Gel de Limpeza para Pele Oleosa'],
      },
      {
        id: 2,
        category: 'tratamento',
        name: 'Tratamento ativo',
        ingredient: 'Ácido Salicílico 2% (Seg/Qua/Sex) OU Retinol 0,3% (Ter/Qui/Sáb). Domingo: descanso',
        instruction: 'Camada fina no rosto todo, evitar área dos olhos. Iniciantes: começar com 2x por semana',
        waitTime: '5-10 min',
        product_suggestions: ['Principia AL-7 Tônico Esfoliante', 'Principia Rn-0,3 Retinol'],
      },
      {
        id: 3,
        category: 'serum',
        name: 'Sérum reparador',
        ingredient: 'Niacinamida 5% + Ácido Hialurônico',
        instruction: 'Aplicar 3-4 gotas para acalmar, hidratar e restaurar barreira enquanto dorme',
        waitTime: '1-2 min',
        product_suggestions: ['Principia NC-10 Niacinamida + Zinco', 'CeraVe Sérum Ácido Hialurônico'],
      },
      {
        id: 4,
        category: 'hidratante',
        name: 'Hidratante noturno oil-free',
        ingredient: 'Ceramidas + Peptídeos + Pantenol',
        instruction: 'Quantidade de uma ervilha para selar os ativos e hidratar durante a noite. Sem óleos pesados',
        waitTime: null,
        product_suggestions: ['Neutrogena Hydro Boost Water Gel', 'CeraVe Loção Hidratante Facial'],
      },
    ],
  },

  // =============================================
  // PELE MISTA — Equilibrar as Zonas
  // =============================================
  mista: {
    morning: [
      {
        id: 1,
        category: 'limpeza',
        name: 'Gel de limpeza suave',
        ingredient: 'Glicerina + Ceramidas',
        instruction: 'Massagear no rosto úmido por 30 segundos, enxaguar com água morna. Não usar limpadores agressivos',
        waitTime: null,
        product_suggestions: ['Vichy Normaderm Gel de Limpeza Profunda', 'CeraVe Gel de Limpeza'],
      },
      {
        id: 2,
        category: 'tonico',
        name: 'Tônico equilibrante',
        ingredient: 'Niacinamida 5% + Ácido Hialurônico',
        instruction: 'Aplicar 2-3 gotas com os dedos. Focar na Zona-T (testa, nariz, queixo) para controle de oleosidade',
        waitTime: '30 seg',
        product_suggestions: ['Principia NC-10 Niacinamida + Zinco', 'Creamy Sérum Niacinamida'],
      },
      {
        id: 3,
        category: 'serum',
        name: 'Sérum antioxidante',
        ingredient: 'Vitamina C 15% + Vitamina E',
        instruction: 'Aplicar 4-5 gotas em todo o rosto e pescoço. Pressionar suavemente, não esfregar',
        waitTime: '1-2 min',
        product_suggestions: ['Principia VC-10 Sérum Vitamina C', 'Sallve Sérum Vitamina C'],
      },
      {
        id: 4,
        category: 'hidratante',
        name: 'Hidratante gel-creme',
        ingredient: 'Ácido Hialurônico + Ceramidas',
        instruction: 'Camada FINA na Zona-T, um pouco MAIS nas bochechas — aplicação por zona é o segredo',
        waitTime: '1 min',
        product_suggestions: ['La Roche-Posay Effaclar H Iso-Biome', 'CeraVe PM Loção Hidratante'],
      },
      {
        id: 5,
        category: 'protetor',
        name: 'Protetor solar FPS 50+ toque seco',
        ingredient: 'Filtros UV + Niacinamida',
        instruction: 'Aplicar generosamente. Escolher fórmula leve/gel-creme que não pese nas áreas oleosas',
        waitTime: null,
        product_suggestions: ['La Roche-Posay Anthelios Gel-Creme Toque Seco FPS 60', 'Sallve Protetor Solar Toque Seco FPS 50'],
      },
    ],
    night: [
      {
        id: 1,
        category: 'limpeza',
        name: 'Óleo de limpeza',
        ingredient: 'Óleo de Jojoba ou Girassol',
        instruction: 'Massagear no rosto seco por 60 segundos para dissolver protetor solar e maquiagem, depois enxaguar',
        waitTime: null,
        product_suggestions: ['Bioderma Atoderm Huile de Douche', 'Simple Óleo de Limpeza'],
      },
      {
        id: 2,
        category: 'limpeza',
        name: 'Gel de limpeza suave',
        ingredient: 'Glicerina + Ceramidas',
        instruction: 'Segunda limpeza para remover resíduos do óleo e garantir pele completamente limpa',
        waitTime: null,
        product_suggestions: ['Vichy Normaderm Gel de Limpeza', 'CeraVe Gel de Limpeza'],
      },
      {
        id: 3,
        category: 'tratamento',
        name: 'Tratamento ativo',
        ingredient: 'Ácido Salicílico 2% (Seg/Qua/Sex) OU Retinol 0,3-0,5% (Ter/Qui/Sáb). Domingo: descanso',
        instruction: 'BHA: focar na Zona-T e áreas congestionadas. Retinol: rosto todo evitando olhos',
        waitTime: '15-20 min',
        product_suggestions: ['Principia AL-7 Tônico Esfoliante', 'Creamy Retinol 0,3%'],
      },
      {
        id: 4,
        category: 'serum',
        name: 'Sérum hidratante',
        ingredient: 'Niacinamida 10% + Ácido Hialurônico',
        instruction: 'Aplicar 3-4 gotas pressionadas na pele. Quantidade extra nas bochechas secas',
        waitTime: '1 min',
        product_suggestions: ['Principia NC-10 Niacinamida + Zinco', 'CeraVe Sérum Ácido Hialurônico'],
      },
      {
        id: 5,
        category: 'hidratante',
        name: 'Hidratante noturno',
        ingredient: 'Ceramidas + Peptídeos + Esqualano',
        instruction: 'Camada mais GROSSA nas bochechas e laterais, mais FINA na Zona-T — espelhar as necessidades da sua pele',
        waitTime: null,
        product_suggestions: ['La Roche-Posay Cicaplast Baume B5+', 'CeraVe Creme Hidratante'],
      },
    ],
  },
}
