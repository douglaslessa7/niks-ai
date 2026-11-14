// ─────────────────────────────────────────────────────────────────────────────
// A foto de perfil com a MOLDURA da medalha atual dela (design NiksMolduras, seção 2a:
// "1. Molduras no perfil" e "2. Avatar de lista"). São 5 molduras, uma por MATERIAL
// (Bronze, Prata, Ouro, Diamante, NIKS): as etapas 1/2/3 aparecem só na medalha, nunca aqui.
// `pequena` (padrão até 100 pt) = a versão do avatar de lista: anel mais grosso, só a flor
// principal e uma folha. Posição e zoom da foto: os do design (`FOTO_NA_MOLDURA`, scale 1.14).
// `tamanho` é o da MOLDURA inteira; a foto ocupa ~57% do lado, no centro.
// ─────────────────────────────────────────────────────────────────────────────
import { memo } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { FOTO_NA_MOLDURA } from '../../lib/medalhas';

// A moldura em IMAGEM (12/nov/2026), como a `Medalha`: o SVG ao vivo (`molduraSvg`) criava de 44
// a 329 elementos nativos por foto e travava a entrada do Ranking e da Jornada do grupo.
// Imagens geradas do mesmo desenho (resvg): pequena 360 px, grande 720 px.
// ⚠️ Mudou o desenho em `lib/medalhas.ts`? Gere de novo as imagens de `assets/molduras/`.
const MOLDURAS: Record<string, number> = {
  'bronze:p': require('../../assets/molduras/bronze-pequena.webp'),
  'bronze:g': require('../../assets/molduras/bronze-grande.webp'),
  'prata:p': require('../../assets/molduras/prata-pequena.webp'),
  'prata:g': require('../../assets/molduras/prata-grande.webp'),
  'ouro:p': require('../../assets/molduras/ouro-pequena.webp'),
  'ouro:g': require('../../assets/molduras/ouro-grande.webp'),
  'diamante:p': require('../../assets/molduras/diamante-pequena.webp'),
  'diamante:g': require('../../assets/molduras/diamante-grande.webp'),
  'rosa:p': require('../../assets/molduras/rosa-pequena.webp'),
  'rosa:g': require('../../assets/molduras/rosa-grande.webp'),
};
export const IMAGENS_MOLDURA = Object.values(MOLDURAS);
import { medalhaDoNivel } from '../../lib/niveis';

type Props = {
  nivel: number;
  foto: string | null | undefined;
  /** Sem foto, mostra a inicial deste nome. */
  nome?: string | null;
  tamanho: number;
  pequena?: boolean;
  /** Fundo do círculo sem foto (o design usa #F4F4F4). */
  vazio?: string;
  /** Foto apagada e meio cinza (no card do grupo: quem ainda não fez o check-in hoje). */
  apagada?: boolean;
  style?: StyleProp<ViewStyle>;
};

function FotoComMoldura({ nivel, foto, nome, tamanho, pequena, vazio = '#F4F4F4', apagada, style }: Props) {
  const p = pequena ?? tamanho <= 100;
  const { material } = medalhaDoNivel(nivel);
  const g = p ? FOTO_NA_MOLDURA.pequena : FOTO_NA_MOLDURA.grande;
  const lado = tamanho * g.lado;
  const inicial = Array.from((nome ?? '').trim())[0]?.toLocaleUpperCase('pt-BR') ?? '';
  return (
    <View style={[{ width: tamanho, height: tamanho }, style]}>
      <View style={{
        position: 'absolute', left: tamanho * g.inicio, top: tamanho * g.inicio, width: lado, height: lado,
        borderRadius: lado / 2, overflow: 'hidden', backgroundColor: vazio,
        opacity: apagada ? 0.5 : 1, isolation: 'isolate',
      }}>
        {/* ⚠️ Foto BORRADA ao abrir a aba Grupos / o Perfil (bug do iPhone, 12/nov/2026, reproduzido
            no simulador): a foto ampliava com `transform: [{ scale: 1.14 }]` dentro do círculo que
            corta (overflow + borderRadius). Com a entrada da tela escalando o conjunto (`Salta`,
            0,86 → 1), o iOS desenhava a foto numa camada fora da tela em resolução reduzida e ela
            ficava borrada até a animação acabar (~0,6 s). Agora a foto é MAIOR de verdade (114%,
            centrada em −7%), sem transform — mesmo enquadramento, nítida em todos os quadros.
            Não troque de volta por `transform: scale`. */}
        {/* expo-image com cache em memória e disco (12/nov/2026): o `Image` do RN baixava a
            foto de novo a cada montagem (o Supabase não manda Cache-Control). A URL da foto
            de perfil é fixa (`users.foto_home_url`, assinada uma vez), então ela é a chave. */}
        {foto ? <Image source={{ uri: foto }} cachePolicy="memory-disk" allowDownscaling={false} contentFit="cover" style={{ position: 'absolute', width: '114%', height: '114%', left: '-7%', top: '-7%' }} /> : !!inicial && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text allowFontScaling={false} style={{ fontSize: lado * 0.46, fontWeight: '700', color: '#E0447F' }}>{inicial}</Text>
          </View>
        )}
        {apagada && <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#808080', opacity: 0.7, mixBlendMode: 'saturation' }} />}
      </View>
      <Image source={MOLDURAS[`${material}:${p ? 'p' : 'g'}`]} cachePolicy="memory" transition={0} contentFit="contain" style={{ position: 'absolute', left: 0, top: 0, width: tamanho, height: tamanho }} />
    </View>
  );
}

export default memo(FotoComMoldura);
