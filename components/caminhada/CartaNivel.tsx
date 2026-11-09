// ─────────────────────────────────────────────────────────────────────────────
// Um nível na trilha da "Sua caminhada": desde 08/nov/2026 (pedido do produto) é SÓ a MEDALHA do
// nível (`components/medalhas`), sem a carta do design 68 em volta, na mesma área de 132 × 184.
// Aberta: medalha inteira (o último, NIKS, com o brilho pêssego atrás). Trancada: apagada e com
// o cadeado no meio. Toque na trancada = tremida (380 ms); quebrar = o cadeado se parte em três
// e um brilho passa pela medalha (design: unlockFx).
// ─────────────────────────────────────────────────────────────────────────────
import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import Medalha from '../medalhas/Medalha';
import { usePulsoMedalha } from '../medalhas/usePulsoMedalha';
import {
  CARD_H, CARD_W, EIO, EO, ICON_GLOW, PINK,
} from './geometria';

// A medalha (quadrado do desenho; o disco ocupa ~75% dele).
const MEDALHA = 150;
const eo = Easing.bezier(...EO);
const eio = Easing.bezier(...EIO);

// As camadas internas ficam DENTRO da borda de 1,5 pt (como no CSS e no Yoga): 129 × 181.
const IW = CARD_W - 3;
// Faixa de brilho: 40% da carta, de -160% a 380% da própria largura.
const SHEEN_W = IW * 0.4;

type Props = {
  n: number;
  locked: boolean;
  isCurrent: boolean;
  isIcon: boolean;
  left: number;
  top: number;
  rolando: SharedValue<boolean>;
  vph: number;
  /** Muda → tremida. */
  shakeKey: number;
  /** Muda → o cadeado quebra. */
  breakKey: number;
  rm: boolean;
  onTap?: () => void;
};

function CartaNivel({ n, locked, isCurrent, isIcon, left, top, rolando, vph, shakeKey, breakKey, rm, onTap }: Props) {
  const holoAberta = isIcon ? 0.9 : 0.55;
  const holoO = useSharedValue(locked ? (isIcon ? 0.3 : 0) : holoAberta);
  const mutedO = useSharedValue(locked ? (isIcon ? 0.45 : 1) : 0);
  const glareO = useSharedValue(locked ? 0 : 0.4);
  const lockP = useSharedValue(locked ? 0 : 1);      // 0 = inteiro, 1 = quebrado
  const lockO = useSharedValue(locked ? 1 : 0);
  const sheen = useSharedValue(0);
  const shake = useSharedValue(1);                    // progresso da tremida (1 = parada)
  const blink = useSharedValue(1);
  const bump = useSharedValue(1);

  // Estado de repouso sempre que trancada/aberta muda (a animação de quebra já deixou igual).
  useEffect(() => {
    holoO.set(locked ? (isIcon ? 0.3 : 0) : holoAberta);
    mutedO.set(locked ? (isIcon ? 0.45 : 1) : 0);
    glareO.set(locked ? 0 : 0.4);
    lockP.set(locked ? 0 : 1);
    lockO.set(locked ? 1 : 0);
  }, [locked, isIcon, holoAberta, holoO, mutedO, glareO, lockP, lockO]);

  // Tremida: translateX 0, -6/-1,5°, 5/1,2°, -3, 2, 0 em 380 ms (ease-out forte).
  useEffect(() => {
    if (!shakeKey) return;
    if (rm) {
      blink.set(1);
      blink.set(withTiming(0.6, { duration: 120 }, () => { blink.set(withTiming(1, { duration: 120 })); }));
      return;
    }
    shake.set(0);
    shake.set(withTiming(1, { duration: 380, easing: eo }));
  }, [shakeKey, rm, shake, blink]);

  // Quebra do cadeado (design: unlockFx).
  useEffect(() => {
    if (!breakKey) return;
    if (rm) {
      lockO.set(withTiming(0, { duration: 220, easing: Easing.ease }));
      mutedO.set(withTiming(0, { duration: 320, easing: Easing.ease }));
      return;
    }
    lockP.set(0);
    lockP.set(withTiming(1, { duration: 560, easing: eo }));
    mutedO.set(withDelay(120, withTiming(0, { duration: 560, easing: eo })));
    holoO.set(0);
    holoO.set(withDelay(200, withTiming(isIcon ? 0.9 : 0.55, { duration: 700, easing: eo })));
    glareO.set(withDelay(200, withTiming(0.4, { duration: 700, easing: eo })));
    sheen.set(0);
    sheen.set(withDelay(180, withTiming(1, { duration: 900, easing: eio })));
    bump.set(1);
    bump.set(withTiming(1.07, { duration: 217, easing: eo }, () => { bump.set(withTiming(1, { duration: 403, easing: eo })); }));
  }, [breakKey, rm, n, isIcon, lockP, lockO, mutedO, holoO, glareO, sheen, bump]);

  const cardSt = useAnimatedStyle(() => {
    const p = shake.get();
    const xs = [0, -6, 5, -3, 2, 0];
    const rs = [0, -1.5, 1.2, 0, 0, 0];
    const seg = Math.min(4, Math.floor(p * 5));
    const u = p * 5 - seg;
    const x = xs[seg] + (xs[seg + 1] - xs[seg]) * u;
    const r = rs[seg] + (rs[seg + 1] - rs[seg]) * u;
    return { opacity: blink.get(), transform: [{ translateX: x }, { rotate: `${r}deg` }, { scale: bump.get() }] };
  });
  const sheenSt = useAnimatedStyle(() => ({
    transform: [{ translateX: SHEEN_W * (-1.6 + 5.4 * sheen.get()) }, { skewX: '-18deg' }],
  }));
  const lockBgSt = useAnimatedStyle(() => ({ opacity: lockO.get() * (1 - lockP.get()), transform: [{ scale: 1 + 0.3 * Math.min(1, lockP.get() * 560 / 320) }] }));
  const shackleSt = useAnimatedStyle(() => {
    const p = Math.min(1, lockP.get() * 560 / 520);
    return { opacity: lockO.get() * (1 - p), transform: [{ translateX: 3 * p }, { translateY: -20 * p }, { rotate: `${-34 * p}deg` }] };
  });
  const bodyLSt = useAnimatedStyle(() => {
    const p = lockP.get();
    return { opacity: lockO.get() * (1 - p), transform: [{ translateX: -16 * p }, { translateY: 22 * p }, { rotate: `${-38 * p}deg` }] };
  });
  const bodyRSt = useAnimatedStyle(() => {
    const p = lockP.get();
    return { opacity: lockO.get() * (1 - p), transform: [{ translateX: 16 * p }, { translateY: 24 * p }, { rotate: `${36 * p}deg` }] };
  });

  // Só a MEDALHA, sem carta em volta (08/nov/2026, pedido do produto). Trancada: apagada e
  // com o cadeado no meio; aberta: inteira, com o brilho passando; a atual pulsa e pisca.
  const medalhaSt = useAnimatedStyle(() => ({ opacity: 1 - 0.6 * mutedO.get() }));
  const pulsoSt = usePulsoMedalha(isCurrent, rm, undefined, rolando);
  return (
    <Animated.View style={[{ position: 'absolute', left, top, width: CARD_W, height: CARD_H }, cardSt]}>
      <Pressable onPress={onTap} disabled={!onTap} style={StyleSheet.absoluteFill} accessibilityLabel={`Nível ${n}${locked ? ', trancado' : ''}`}>
        {isIcon && <View pointerEvents="none" style={[styles.iconGlow, { experimental_backgroundImage: ICON_GLOW }]} />}
        <View pointerEvents="none" style={styles.center}>
          <Medalha nivel={n} tamanho={MEDALHA} estilo={[pulsoSt, medalhaSt]} />
          {/* Recorte redondo custa caro em toda rolagem: só existe durante o brilho do desbloqueio. */}
          {breakKey > 0 && (
          <View style={styles.sheenMask}>
            <Animated.View style={[styles.sheen, { experimental_backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.7), rgba(255,255,255,0))' }, sheenSt]} />
          </View>
          )}
        </View>
        {locked && (
          <View pointerEvents="none" style={styles.lock}>
            <Animated.View style={[styles.lockBg, lockBgSt]} />
            <Animated.View style={[styles.shackle, shackleSt]}>
              <Svg width={12} height={9} viewBox="0 0 12 9" style={{ overflow: 'visible' }}>
                <Path d="M2 9V5.5a4 4 0 0 1 8 0V9" fill="none" stroke={PINK} strokeWidth={2} strokeLinecap="round" />
              </Svg>
            </Animated.View>
            <Animated.View style={[styles.bodyL, bodyLSt]} />
            <Animated.View style={[styles.bodyR, bodyRSt]} />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

export default memo(CartaNivel);

// O quadrado da medalha centrado na área de 132 × 184 que a carta ocupava (os nomes embaixo e
// a trilha continuam no mesmo lugar). O desenho tem as pétalas saindo para os lados.
const MED_L = CARD_W / 2 - MEDALHA / 2;
const MED_T = CARD_H / 2 - MEDALHA / 2;

const styles = StyleSheet.create({
  iconGlow: { position: 'absolute', left: MED_L - 10, top: MED_T - 10, width: MEDALHA + 20, height: MEDALHA + 20, borderRadius: (MEDALHA + 20) / 2 },
  center: { position: 'absolute', left: MED_L, top: MED_T, width: MEDALHA, height: MEDALHA },
  // O brilho passa só por dentro do disco da medalha (~75% do quadrado).
  sheenMask: {
    position: 'absolute', left: MEDALHA * 0.13, top: MEDALHA * 0.13, width: MEDALHA * 0.74, height: MEDALHA * 0.74,
    borderRadius: MEDALHA * 0.37, overflow: 'hidden',
  },
  sheen: { position: 'absolute', left: 0, top: -MEDALHA * 0.2, width: MEDALHA * 0.3, height: MEDALHA * 1.2 },
  lock: { position: 'absolute', left: CARD_W / 2 - 17, top: CARD_H / 2 - 17, width: 34, height: 34 },
  lockBg: {
    ...StyleSheet.absoluteFillObject, borderRadius: 17, backgroundColor: '#fff', borderWidth: 1.5, borderColor: PINK,
    boxShadow: '0px 4px 10px rgba(200,60,120,0.18)',
  },
  shackle: { position: 'absolute', left: 11, top: 7, width: 12, height: 9 },
  bodyL: { position: 'absolute', left: 9, top: 15, width: 8, height: 11, borderTopLeftRadius: 2.5, borderBottomLeftRadius: 2.5, backgroundColor: PINK },
  bodyR: { position: 'absolute', left: 17, top: 15, width: 8, height: 11, borderTopRightRadius: 2.5, borderBottomRightRadius: 2.5, backgroundColor: PINK },
});
