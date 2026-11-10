import { Image, ImageSourcePropType, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { haptics } from '../../lib/haptics';
import { OB, ObHeader, ObPillButton, OB_BOTAO_H, ObScreen, useObFrame } from '../../components/onboarding/kit';
import { useObPassoVisto } from '../../components/onboarding/passo';
import { OB_STEPS } from '../../components/onboarding/kit';

// Onboarding — "Transformação real" (antes e depois), logo depois do objetivo ("Qual pele
// você quer ter?") e antes do gráfico "Sua evolução" (04/nov/2026, pedido do produto).
// RÉPLICA da tela "Transformação real" do Tapfit (print enviado no chat em 04/nov/2026,
// medido com o reconhecimento de texto do macOS e pelos pixels) na identidade do NIKS:
// fundo branco, tinta/cinza do kit e o botão rosa do kit no lugar do contorno escuro.
//   • "TRANSFORMAÇÃO REAL" pequeno e espaçado na linha do voltar (como "SUA EVOLUÇÃO").
//   • Título à esquerda, 2 linhas (quebra fixa como no Tapfit), 20 pt da lateral.
//   • Card das fotos: 20 pt das laterais, proporção 352,7 × 271 (a do Tapfit), cantos
//     de 14 (medidos), duas metades (antes | depois) com 2 pt de divisória branca no meio.
//   • Nome · cidade centrado, 13 pt abaixo do card; o aviso do Tapfit ("Com autorização.
//     Resultados individuais variam.", 12 pt) 13 pt abaixo. Sem o selo de verificado.
//   • O bloco (título → aviso) fica centrado entre o cabeçalho e o botão, 11 pt abaixo do
//     centro — no iPhone de 852 pt cai onde o Tapfit põe; no SE ele cabe sem rolagem.
// Sem passo no Mixpanel. "Continuar" → "Sua evolução".

/** Quem aparece na tela (04/nov/2026, enviado pelo produto). O PRODUTO CONFIRMOU: as duas
 *  fotos são da MESMA mulher (Larissa Cavalcante, Ribeirão Preto/SP), tiradas com alguns
 *  anos de diferença, numa transformação real, e há AUTORIZAÇÃO DE USO DA IMAGEM das duas.
 *  (Na revisão as duas pareceram de pessoas diferentes — olhos e cabelo de outra cor — e o
 *  produto reafirmou que é ela mesma; a veracidade e a autorização são responsabilidade do
 *  produto. Guardar a autorização por escrito.)
 *  Recortes de 528 × 816 em `assets/onboarding/transformacao/`, com o rosto do mesmo
 *  tamanho e na mesma altura nas duas (36% da altura do recorte, começando a 28% do topo):
 *  `antes.jpg` = 675 × 1043 a partir de (0, 110) da foto de 675 × 1200;
 *  `depois.jpg` = 881 × 1361 a partir de (179, 249) da foto de 1180 × 2114.
 *  (Um par anterior — em que uma foto saiu da outra — foi descartado.) */
const TRANSFORMACAO: {
  nome: string;
  cidade: string;
  antes: ImageSourcePropType | null;
  depois: ImageSourcePropType | null;
} = {
  nome: 'Larissa Cavalcante',
  cidade: 'Ribeirão Preto, SP',
  antes: require('../../assets/onboarding/transformacao/antes.jpg'),
  depois: require('../../assets/onboarding/transformacao/depois.jpg'),
};

const PROPORCAO = 352.7 / 271;   // largura ÷ altura do card do Tapfit

export default function Transformacao() {
  useObPassoVisto(OB_STEPS.transformacao, 'Transformação real');
  const router = useRouter();
  const { width: W } = useWindowDimensions();
  const { y, buttonBottom } = useObFrame();
  const cardH = (W - 40) / PROPORCAO;
  const t = TRANSFORMACAO;

  const continuar = () => {
    haptics.action();
    router.push('/(onboarding)/evolucao');
  };

  return (
    <ObScreen>
      <View style={{ position: 'absolute', left: 0, right: 0, top: y(100), bottom: buttonBottom + OB_BOTAO_H + 16, paddingTop: 22, justifyContent: 'center' }}>
        {/* 25/30 com as letras bem juntas, como no Tapfit: a 1ª linha mede ~222 pt (medido). */}
        <Text style={{ marginHorizontal: 20, fontSize: 25, lineHeight: 30, fontWeight: '700', letterSpacing: -1.35, color: OB.ink }}>
          {'Olha o antes e depois\ncom o NIKS.'}
        </Text>

        <View
          accessible
          accessibilityLabel={`Antes e depois de ${t.nome}`}
          style={{ marginTop: 16, marginHorizontal: 20, height: cardH, borderRadius: 14, overflow: 'hidden', flexDirection: 'row', gap: 2 }}
        >
          <Metade foto={t.antes} />
          <Metade foto={t.depois} />
        </View>

        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ marginTop: 13, marginHorizontal: 20, textAlign: 'center', fontSize: 17, lineHeight: 22 }}>
          <Text style={{ fontWeight: '600', color: OB.ink }}>{t.nome}</Text>
          <Text style={{ color: OB.sub }}>{`  ·  ${t.cidade}`}</Text>
        </Text>
        <Text style={{ marginTop: 13, marginHorizontal: 20, textAlign: 'center', fontSize: 12, lineHeight: 16, color: OB.sub }}>
          Com autorização. Resultados individuais variam.
        </Text>
      </View>

      <ObHeader onBack={() => router.back()} />
      <Text
        pointerEvents="none"
        style={{
          position: 'absolute', left: 0, right: 0, top: y(74), zIndex: 11, textAlign: 'center',
          fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 1.4, color: OB.sub,
        }}
      >
        TRANSFORMAÇÃO REAL
      </Text>
      <ObPillButton bottom={buttonBottom} onPress={continuar} />
    </ObScreen>
  );
}

/** Uma metade do card: a foto (`cover`) ou, sem foto, o cinza das opções. */
function Metade({ foto }: { foto: ImageSourcePropType | null }) {
  return (
    <View style={{ flex: 1, backgroundColor: OB.option, overflow: 'hidden' }}>
      {foto ? <Image source={foto} resizeMode="cover" style={{ width: '100%', height: '100%' }} /> : null}
    </View>
  );
}
