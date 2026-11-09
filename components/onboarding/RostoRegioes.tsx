import { useEffect } from 'react';
import { Image, View, type ViewStyle, type StyleProp } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';

// FONTE ÚNICA do rosto 3D com as regiões das telas "NF 5 Mapa do rosto" e
// "NF 6 Reação · foco" do Claude Design ("NIKS Onboarding - novo fluxo.dc.html").
// As imagens são as do design (`assets/rosto/`), geradas a 1200 px a partir dos
// originais de 1792 × 2400 (mesmo enquadramento, 768 × 1029 no design). Todas têm o
// MESMO quadro: empilhadas, cada região cai no lugar certo do rosto. No design o
// rosto-base tem fundo branco com `mix-blend-mode: multiply`; aqui o branco virou
// transparência (o RN não tem multiply), para o brilho rosa da tela 6 aparecer atrás.
// O botão "Rosto todo" do design (e a imagem `regiao-rosto-todo.png`) saiu
// (03/nov/2026, pedido do produto): ela marca quantas regiões quiser.

// Sem a região dos olhos (03/nov/2026, pedido do produto): ela pintava o próprio olho
// e piscava junto na dica. Ficam as 4 que dá para tocar.
export type Regiao = 'testa' | 'nariz' | 'bochechas' | 'queixo';

/** Proporção das imagens (largura / altura). */
export const ROSTO_RATIO = 768 / 1029;

export const ROSTO_BASE = require('../../assets/onboarding/rosto/rosto-base.webp');
export const REGIAO_IMG: Record<Regiao, number> = {
  testa: require('../../assets/onboarding/rosto/regiao-testa.webp'),
  nariz: require('../../assets/onboarding/rosto/regiao-nariz.webp'),
  bochechas: require('../../assets/onboarding/rosto/regiao-bochechas.webp'),
  queixo: require('../../assets/onboarding/rosto/regiao-queixo.webp'),
};

const TODAS_IMG = [ROSTO_BASE, REGIAO_IMG.testa, REGIAO_IMG.nariz, REGIAO_IMG.bochechas, REGIAO_IMG.queixo];

/** Ordem de cima para baixo no rosto — é a ordem em que o foco é escrito. */
export const ORDEM: Regiao[] = ['testa', 'nariz', 'bochechas', 'queixo'];

// ⚠️ TEXTOS PROVISÓRIOS: no design eles vêm de um script ({{ focoNome }}, {{ focoSub }})
// que fica depois do corte de 256 KB da leitura do arquivo — não foram lidos. Só o
// exemplo da persona ("foco na testa") é do design. Confirmar com o produto.
const NOME: Record<Regiao, string> = {
  testa: 'testa', nariz: 'nariz', bochechas: 'bochechas', queixo: 'queixo',
};
const NA: Record<Regiao, string> = {
  testa: 'na testa', nariz: 'no nariz', bochechas: 'nas bochechas', queixo: 'no queixo',
};

/** "a" · "a e b" · "a, b e c". */
function lista(itens: string[]) {
  return itens.length < 2 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}
const TODAS = (focos: Regiao[]) => ORDEM.every((r) => focos.includes(r));

/** "testa" · "testa e nariz" · "testa, nariz e queixo"; com as 4, "o rosto todo"
 *  (título da tela 6: "Seu foco: …."). */
export function focoNome(focos: Regiao[]) {
  return TODAS(focos) ? 'o rosto todo' : lista(focos.map((f) => NOME[f]));
}
/** "na testa" · "na testa e no nariz"; com as 4, "em todo o rosto"
 *  (subtítulo: "Sua rotina terá um cuidado maior …."). */
export function focoSub(focos: Regiao[]) {
  return TODAS(focos) ? 'em todo o rosto' : lista(focos.map((f) => NA[f]));
}

// Brilho rosa das regiões acesas (`drop-shadow(0 0 14px rgba(255,94,168,.45))` no design):
// desde 08/nov/2026 vem EMBUTIDO nos PNGs das regiões (#FF5EA8 a 45%, desfoque gaussiano de
// 10 px no quadro de 1200 px ≈ o shadowRadius 7 de antes). Antes era `shadow*` do iOS em
// cada camada: 4 sombras sobre imagens grandes e transparentes, recalculadas a cada quadro
// enquanto a tela deslizava para entrar e enquanto a dica piscava — a entrada travava.
// Originais sem brilho: ~/Developer/niks-ai-backups/2026-11-08_rosto_regioes_sem_brilho/.
// Não volte a pôr sombra nessas imagens.

const FULL = { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' } as const;

// As imagens usam o `expo-image` (08/nov/2026), não o <Image> do React Native: o do RN não
// guarda na memória imagem decodificada acima de ~2 MB (o rosto tem ~8 MB decodificado), então
// cada tela decodificava de novo e o rosto chegava ~0,6 s depois da tela no iPhone. O
// expo-image guarda a imagem inteira decodificada na memória pela URL — por isso
// `allowDownscaling={false}` (com redução, a chave do cache muda com o tamanho e o
// pré-carregamento não serviria). `RostoPreload`, na tela ANTERIOR, decodifica as 5 antes.
const IMG_PROPS = { contentFit: 'fill', allowDownscaling: false, cachePolicy: 'memory-disk', transition: null } as const;

/** O rosto sem nada aceso, no quadro inteiro do pai. `onPronto`: a imagem carregou (ou falhou). */
export function RostoBase({ onPronto }: { onPronto?: () => void }) {
  return (
    <View pointerEvents="none" style={FULL}>
      <ExpoImage source={ROSTO_BASE} style={FULL} {...IMG_PROPS} onLoad={onPronto} onError={onPronto} />
    </View>
  );
}

/** Pré-carrega e DECODIFICA as 5 imagens do rosto na tela ANTERIOR ("o que te incomoda"), para
 *  o mapa já entrar com o rosto pronto (08/nov/2026, pedido do produto). Vai montado escondido
 *  (1 pt, opacidade 0) e, além disso, pede o `prefetch` para a memória. */
export function RostoPreload() {
  useEffect(() => {
    const uris = TODAS_IMG.map((src) => Image.resolveAssetSource(src)?.uri).filter(Boolean) as string[];
    ExpoImage.prefetch(uris, 'memory-disk').catch(() => {});
  }, []);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, opacity: 0, overflow: 'hidden' }}>
      {TODAS_IMG.map((src, i) => (
        <ExpoImage key={i} source={src} style={{ width: 1, height: 1 }} {...IMG_PROPS} />
      ))}
    </View>
  );
}

/** Uma região por cima do rosto, com o brilho rosa; a opacidade vem animada de fora. */
export function RegiaoCamada({ foco, style }: { foco: Regiao; style: StyleProp<AnimatedStyle<ViewStyle>> }) {
  return (
    <Animated.View pointerEvents="none" style={[FULL, style]}>
      <ExpoImage source={REGIAO_IMG[foco]} style={FULL} {...IMG_PROPS} />
    </Animated.View>
  );
}
