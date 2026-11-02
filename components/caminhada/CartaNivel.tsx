// ─────────────────────────────────────────────────────────────────────────────
// Carta de um nível na trilha da "Sua caminhada" (design 68, 132 × 184).
// Aberta: degradê rosa/lilás (Ícone: pêssego/dourado), reflexo holográfico que muda
// com a rolagem e brilho. Trancada: véu claro por cima e o cadeado. Toque na trancada
// = tremida (380 ms); quebrar = o cadeado se parte em três (design: unlockFx).
// ─────────────────────────────────────────────────────────────────────────────
import { memo, useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import Padrao from './Padrao';
import {
  CARD_BG, CARD_H, CARD_W, EIO, EO, GLARE, HOLO, ICON_BG, ICON_GLOW, MUTED_BG, PINK, cardCY,
} from './geometria';

const LOGO = require('../../assets/home/score-logo-pink.png');
const eo = Easing.bezier(...EO);
const eio = Easing.bezier(...EIO);

// As camadas internas ficam DENTRO da borda de 1,5 pt (como no CSS e no Yoga): 129 × 181.
const IW = CARD_W - 3;
const IH = CARD_H - 3;
// Faixa de brilho: 40% da carta, de -160% a 380% da própria largura.
const SHEEN_W = IW * 0.4;
// Reflexo: camada 260% do tamanho da carta, posicionada como o background-position do CSS.
const HOLO_W = IW * 2.6;
const HOLO_H = IH * 2.6;

type Props = {
  n: number;
  locked: boolean;
  isCurrent: boolean;
  isIcon: boolean;
  left: number;
  top: number;
  scrollY: SharedValue<number>;
  vph: number;
  /** Muda → tremida. */
  shakeKey: number;
  /** Muda → o cadeado quebra. */
  breakKey: number;
  rm: boolean;
  onTap?: () => void;
};

function CartaNivel({ n, locked, isCurrent, isIcon, left, top, scrollY, vph, shakeKey, breakKey, rm, onTap }: Props) {
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
    holoO.set(withDelay(200, withTiming(n === 11 ? 0.9 : 0.55, { duration: 700, easing: eo })));
    glareO.set(withDelay(200, withTiming(0.4, { duration: 700, easing: eo })));
    sheen.set(0);
    sheen.set(withDelay(180, withTiming(1, { duration: 900, easing: eio })));
    bump.set(1);
    bump.set(withTiming(1.07, { duration: 217, easing: eo }, () => { bump.set(withTiming(1, { duration: 403, easing: eo })); }));
  }, [breakKey, rm, n, lockP, lockO, mutedO, holoO, glareO, sheen, bump]);

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
  const holoSt = useAnimatedStyle(() => {
    // background-position do design: 50% + d·0,09 / 50% + d·0,16, com d = distância do
    // centro da carta ao centro da janela.
    const d = cardCY(n) - scrollY.get() - vph / 2;
    const px = (50 + d * 0.09) / 100;
    const py = (50 + d * 0.16) / 100;
    return {
      opacity: holoO.get(),
      transform: [{ translateX: (IW - HOLO_W) * px }, { translateY: (IH - HOLO_H) * py }],
    };
  }, [n, vph]);
  const mutedSt = useAnimatedStyle(() => ({ opacity: mutedO.get() }));
  const glareSt = useAnimatedStyle(() => ({ opacity: glareO.get() }));
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

  const bg = isIcon ? ICON_BG : CARD_BG;
  const border = isIcon ? '#E7B67C' : 'rgba(255,255,255,0.95)';
  const inner = isIcon ? 'rgba(255,236,205,0.95)' : 'rgba(255,255,255,0.95)';
  const shadow = locked
    ? '0px 4px 12px rgba(200,60,120,0.08)'
    : isIcon ? '0px 12px 30px rgba(220,150,90,0.30)' : '0px 10px 24px rgba(200,60,120,0.18)';

  return (
    <Animated.View style={[{ position: 'absolute', left, top, width: CARD_W, height: CARD_H }, cardSt]}>
      <Pressable onPress={onTap} disabled={!onTap} style={StyleSheet.absoluteFill} accessibilityLabel={`Nível ${n}${locked ? ', trancado' : ''}`}>
        {isIcon && <View pointerEvents="none" style={[styles.iconGlow, { experimental_backgroundImage: ICON_GLOW }]} />}
        {isCurrent && <View pointerEvents="none" style={styles.currentRing} />}
        <View style={[StyleSheet.absoluteFill, { borderRadius: 14, boxShadow: shadow }]}>
          <View style={[styles.body, { experimental_backgroundImage: bg, borderColor: border }]}>
            <View style={[styles.inner, { borderColor: inner }]} />
            <View style={styles.pattern}><Padrao w={IW - 26} h={IH - 26} tile={16} opacity={0.22} /></View>
            <Animated.View pointerEvents="none" style={[styles.holo, { experimental_backgroundImage: HOLO }, holoSt]} />
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { experimental_backgroundImage: GLARE }, glareSt]} />
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { experimental_backgroundImage: MUTED_BG }, mutedSt]} />
            <View style={styles.center}><Image source={LOGO} style={{ width: 46, height: 47 }} /></View>
            <View style={styles.num}><Text style={styles.numText}>{n}</Text></View>
            <Animated.View pointerEvents="none" style={[styles.sheen, { experimental_backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.85), rgba(255,255,255,0))' }, sheenSt]} />
          </View>
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

const styles = StyleSheet.create({
  iconGlow: { position: 'absolute', left: -30, top: -30, right: -30, bottom: -30, borderRadius: 44 },
  currentRing: {
    position: 'absolute', left: -6, top: -6, right: -6, bottom: -6, borderRadius: 20,
    borderWidth: 2, borderColor: PINK, boxShadow: '0px 0px 0px 5px rgba(255,94,168,0.14)',
  },
  body: { ...StyleSheet.absoluteFillObject, borderRadius: 14, overflow: 'hidden', borderWidth: 1.5 },
  inner: { position: 'absolute', left: 6, top: 6, right: 6, bottom: 6, borderRadius: 9, borderWidth: 1 },
  pattern: { position: 'absolute', left: 13, top: 13 },
  holo: { position: 'absolute', left: 0, top: 0, width: HOLO_W, height: HOLO_H, mixBlendMode: 'overlay' },
  center: {
    position: 'absolute', left: IW / 2 - 37, top: IH * 0.46 - 37, width: 74, height: 74, borderRadius: 37,
    backgroundColor: 'rgba(255,255,255,0.66)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center', justifyContent: 'center',
  },
  num: {
    position: 'absolute', left: 9, top: 9, minWidth: 22, height: 22, paddingHorizontal: 6,
    borderRadius: 100, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  numText: { color: PINK, fontSize: 11, fontWeight: '700' },
  sheen: { position: 'absolute', left: 0, top: -IH * 0.3, width: SHEEN_W, height: IH * 1.6 },
  lock: { position: 'absolute', left: CARD_W / 2 - 17, top: 98, width: 34, height: 34 },
  lockBg: {
    ...StyleSheet.absoluteFillObject, borderRadius: 17, backgroundColor: '#fff', borderWidth: 1.5, borderColor: PINK,
    boxShadow: '0px 4px 10px rgba(200,60,120,0.18)',
  },
  shackle: { position: 'absolute', left: 11, top: 7, width: 12, height: 9 },
  bodyL: { position: 'absolute', left: 9, top: 15, width: 8, height: 11, borderTopLeftRadius: 2.5, borderBottomLeftRadius: 2.5, backgroundColor: PINK },
  bodyR: { position: 'absolute', left: 17, top: 15, width: 8, height: 11, borderTopRightRadius: 2.5, borderBottomRightRadius: 2.5, backgroundColor: PINK },
});
