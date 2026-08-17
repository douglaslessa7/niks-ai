// ─────────────────────────────────────────────────────────────────────────────
// Skeleton — bloco cinza que "pulsa" enquanto o conteúdo real ainda não chegou.
//
// POR QUE EXISTE: telas de (app) abrem a frio com `homeData == null` por um
// instante (sessão + leitura do cache no disco + rede). Sem isto, a home mostrava
// os placeholders VAZIOS (score "—", barras vazias) por ~3s — parecia quebrada.
// O skeleton comunica "carregando", não "vazio".
//
// Um único Animated.Value de opacidade em loop (nativo). Use `style` para dar
// tamanho/borda; a cor e o pulso já vêm prontos.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';

export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 750, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[{ backgroundColor: '#ECECEE', borderRadius: 8, opacity: pulse }, style]}
    />
  );
}
