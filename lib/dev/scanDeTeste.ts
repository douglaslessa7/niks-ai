import { Asset } from 'expo-asset';
import * as ImageManipulator from 'expo-image-manipulator';
import { useAppStore, type ScanResult } from '../../store/onboarding';
import { syncOnboardingPrefetch, usarScanDeTeste } from '../onboardingPrefetch';

// ── SÓ TESTE (__DEV__) — `// TEMP-PULAR-SCAN` ────────────────────────────────────
// "Pular scan" da preparação do scan do onboarding (`app/(scan)/scan-prep.tsx`): faz o que
// a câmera faz ao terminar (foto no store → pré-carregamento → "Analisando"), mas com uma
// foto de exemplo do app e um relatório PRONTO no lugar da IA (sem custo, nada salvo).
// O botão só existe com `__DEV__` (some sozinho em build de release). Para remover de vez:
// `grep -rn "TEMP-PULAR-SCAN" app lib` e apagar este arquivo.

/** Qual carta deve sair depois do "Analisando". */
export type CartaDeTeste = 'idade' | 'acne';

const FOTO = require('../../assets/scan-examples/neutra.jpg');

// Relatório de exemplo (formato da `analyze-skin`). A idade da pele entra na hora, a partir
// da idade que ela informou, para sair a carta escolhida.
const RELATORIO_BASE = {
  "acne": {
    "distribution": [],
    "insight": "Não observo lesões de acne ativas visíveis nesta foto. Os pontos aparentes no nariz parecem compatíveis com filamentos sebáceos, não comedões inflamatórios.",
    "lesion_type": null,
    "pattern": null,
    "present": false,
    "severity": "ausente",
    "severity_score": 0
  },
  "action_recommendations": [
    {
      "category": "Limpeza Diária",
      "text": "Use um gel de limpeza suave 1–2x ao dia para remover oleosidade sem agredir a barreira. Se sentir repuxamento, reduza a frequência ou escolha uma fórmula mais gentil."
    },
    {
      "category": "Prevenção de Cravos",
      "text": "Considere ácido salicílico 0,5–2% algumas noites por semana na zona T para desobstruir poros e reduzir formação de cravos. Introduza aos poucos para observar tolerância."
    },
    {
      "category": "Fotoproteção",
      "text": "Aplique protetor solar FPS 30–50 diariamente, mesmo com pouca exposição solar. Isso ajuda a manter o tom uniforme e previne manchas e envelhecimento precoce."
    },
    {
      "category": "Controle de Oleosidade",
      "text": "Se a zona T incomodar, use niacinamida 4–5% para modular brilho e ajudar na aparência dos poros. Ela costuma ser bem tolerada em peles sem irritação visível."
    }
  ],
  "area_periocular": "normal",
  "barrier_insight": "A pele mostra superfície uniforme, sem eritema difuso, sem descamação e sem sinais visíveis de irritação ou barreira comprometida.",
  "barrier_status": "integra",
  "brilho_sebaceo": {
    "intensity": "leve",
    "location": [
      "zona_t",
      "nariz"
    ]
  },
  "cicatrizes": {
    "location": [],
    "present": false,
    "severity": null,
    "type": null
  },
  "concerns_alignment": {
    "alinhamento": "parcial",
    "mensagem": "Suas preocupações fazem sentido: há leve oleosidade na zona T e poros/nariz discretamente evidentes. O protocolo vai focar em controlar o brilho e prevenir cravos, sem tratar acne ativa porque ela não aparece nesta foto.",
    "regioes_afetadas": [
      "nariz_zona_t"
    ]
  },
  "condicoes_secundarias": [],
  "confianca_analise": {
    "campos_incertos": [
      "skin_phototype",
      "textura_poros",
      "brilho_sebaceo",
      "pigmentacao"
    ],
    "nivel": "alta",
    "score": 82
  },
  "contraindicacoes": [
    "esfoliantes_fisicos"
  ],
  "disclaimer": "Esta é uma análise estética por IA, não substitui consulta dermatológica.",
  "envelhecimento": {
    "firmness_loss": "nenhuma",
    "lines_type": "nenhuma",
    "location": [],
    "present": false
  },
  "headline": "Pele clara com viço, sem acne visível e leve oleosidade facial",
  "metricas": {
    "acne": 6,
    "atratividade": 86,
    "juventude": 91,
    "linhas_expressao": 4,
    "oleosidade": 22,
    "qualidade_pele": 88
  },
  "pigmentacao": {
    "insight": "Não vejo hiperpigmentação relevante, melasma ou manchas pós-inflamatórias claras. Há apenas variações discretas de tonalidade usuais da foto e da iluminação.",
    "intensity_score": 1,
    "location": [],
    "present": false,
    "type": null
  },
  "pontos_fortes": [
    "Pele uniforme e íntegra",
    "Ausência de acne ativa"
  ],
  "pontos_fracos": [
    "Leve oleosidade na zona T",
    "Poros discretamente visíveis no nariz",
    "Possível filamento sebáceo na região nasal"
  ],
  "prioridade_clinica": {
    "justificativa": "Não vejo barreira comprometida nem acne inflamatória ativa. A prioridade prática é controlar a leve oleosidade da zona T e prevenir o aparecimento de cravos, já que isso é o que mais se relaciona com suas preocupações declaradas.",
    "primaria": "oleosidade leve e prevenção de comedões",
    "secundaria": null
  },
  "qualidade_foto": {
    "nivel": "media",
    "notas": "Boa nitidez e ângulo frontal favorável para avaliar a pele. A luz é quente e há leve filtro/suavização, o que pode reduzir a percepção de poros, vermelhidão e microtextura.",
    "score": 78
  },
  "region_insights": [
    {
      "benefit": "Controlar o sebo vai reduzir brilho e deixar os poros menos aparentes.",
      "consequence": "Essa área pode acumular sebo e evoluir para cravos se não houver controle regular.",
      "main_finding": "Leve oleosidade e poros visíveis",
      "region": "nariz_zona_t"
    }
  ],
  "rosacea": {
    "present": false,
    "subtype": null
  },
  "skin_hydration": "normal",
  "skin_phototype": "II",
  "skin_score": 90,
  "skin_strengths": [
    {
      "body": "Sua pele não mostra sinais visíveis de barreira comprometida. Isso permite introduzir ativos preventivos com menor risco de irritação, se usados de forma gradual.",
      "icon": "shield",
      "title": "Barreira Íntegra"
    },
    {
      "body": "A superfície da pele está homogênea e sem irregularidades importantes. Isso favorece respostas rápidas a controle de oleosidade e manutenção da aparência uniforme.",
      "icon": "sparkle",
      "title": "Textura Lisa"
    }
  ],
  "skin_type_detected": "normal",
  "skin_type_sebaceous": "normal",
  "textura_poros": {
    "insight": "Os poros estão discretamente visíveis sobretudo na zona T, mas a textura global permanece lisa e homogênea. Não noto queratose pilar nas bochechas laterais.",
    "pore_visibility": "levemente_dilatado",
    "texture": "lisa"
  }
};

export async function pularScanDeTeste(carta: CartaDeTeste) {
  if (!__DEV__) return;
  const st = useAppStore.getState();
  // Sem idade informada (abriu direto aqui), usa 28.
  const idade = Number(st.onboarding.birthday) || 28;
  if (!Number(st.onboarding.birthday)) st.setOnboardingField('birthday', String(idade));
  // Carta da idade: pele 6 anos MAIS VELHA. Carta da acne: pele 6 anos MAIS NOVA.
  const pele = carta === 'idade' ? idade + 6 : Math.max(16, idade - 6);
  const relatorio = {
    ...RELATORIO_BASE,
    skin_age: pele,
    envelhecimento: { ...RELATORIO_BASE.envelhecimento, skin_age: pele },
  } as unknown as ScanResult;

  const asset = Asset.fromModule(FOTO);
  await asset.downloadAsync();
  const foto = await ImageManipulator.manipulateAsync(asset.localUri ?? asset.uri, [], {
    compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true,
  });
  usarScanDeTeste({ uri: foto.uri, relatorio });
  useAppStore.setState({ cartaChegadaVista: false, etapaCartaOb: null }); // as cartas voltam a aparecer a cada teste
  st.setSkinImage(foto.base64 ?? '', foto.uri);
  syncOnboardingPrefetch();
}
