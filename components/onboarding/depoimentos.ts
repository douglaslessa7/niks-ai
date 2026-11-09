// Depoimentos da tela "Comunidade" do onboarding (`app/(onboarding)/comunidade.tsx`).
//
// Depoimentos de usuárias enviados pelo produto em 04/nov/2026 (substituíram os textos de
// exemplo usados para testar o design). Texto exatamente como veio (as aspas são postas
// pelo card). ⚠️ As 5 estrelas de cada um são do design — o pedido não trouxe a nota de
// cada usuária; se ela deu outra nota, corrigir `estrelas`. Prova social e depoimento NÃO
// podem ser inventados (ver "Marcadores do design que NÃO foram ao ar" no README): ao
// trocar, nome como a pessoa autorizou, o texto dela sem edição de sentido e a nota que ela
// deu; se algum voltar a ser exemplo, ligar `DEPOIMENTOS_SAO_PROVISORIOS` de novo.
//
// Uma lista só: a tela mostra os itens na ordem daqui (pensada para 3). Avatar = a `foto`
// num círculo; sem foto, círculo rosa com a inicial do nome.
//
// Fotos (04/nov/2026, enviadas pelo produto na ordem dos depoimentos): recorte quadrado no
// rosto (macOS Vision), 240 × 240, em `assets/onboarding/depoimentos/`. ⚠️ Só podem ir ao
// ar se forem fotos DAS PRÓPRIAS usuárias, com autorização de uso. Foto gerada por IA ou de
// banco de imagens, junto de nome e depoimento, apresenta como cliente quem não existe —
// nesse caso, tirar a `foto` (volta a inicial).

import type { ImageSourcePropType } from 'react-native';

export type Depoimento = {
  nome: string;
  /** 1 a 5. */
  estrelas: number;
  texto: string;
  foto?: ImageSourcePropType;
};

export const DEPOIMENTOS_SAO_PROVISORIOS = false;

export const DEPOIMENTOS: Depoimento[] = [
  {
    nome: 'Camila Ribeiro',
    estrelas: 5,
    foto: require('../../assets/onboarding/depoimentos/camila.jpg'),
    texto: 'Fiz a primeira análise sem esperar muito e me surpreendi. Em duas semanas seguindo a rotina, meu Skin Score subiu e a oleosidade diminuiu.',
  },
  {
    nome: 'Julia Santana',
    estrelas: 5,
    foto: require('../../assets/onboarding/depoimentos/julia.jpg'),
    texto: 'O scanner de produto me salvou de comprar um sérum que não combinava com a minha pele. Agora eu checo tudo antes de ir na farmácia.',
  },
  {
    nome: 'Maria Clara',
    estrelas: 5,
    foto: require('../../assets/onboarding/depoimentos/maria-clara.jpg'),
    texto: 'Gosto de ver a evolução da pele semana a semana. Dá vontade de manter a rotina porque eu vejo o resultado no próprio app.',
  },
];
