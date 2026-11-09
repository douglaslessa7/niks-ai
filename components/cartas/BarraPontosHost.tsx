import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import PacotePontos from './PacotePontos';
import { registrarBarraPontos, type GanhoBarra } from '../../lib/pontosAnimacao';
import { chaveEstado, estadoCartas, type EstadoCartas, type NivelTabela } from '../../lib/cartasServidor';
import { peekCache } from '../../lib/cache';
import { peekUserId } from '../../lib/currentUser';

// ─────────────────────────────────────────────────────────────────────────────
// A barra de nível animada no topo da tela para os NIKS Points ganhos SEM carta (regras
// novas, 05/nov/2026): o mesmo cabeçalho do pacote de pontos da tela de raspar (nível,
// título, "X / teto" e a barra piso→teto), sem as mini cartas. Montado uma vez no layout
// raiz, por cima de todas as telas e sem receber toque. Quem pede é lib/pontosAnimacao
// (`ganhouPontos` / `soltarPontos`). Um ganho de cada vez: entra, enche (~1 s), fica um
// instante e some (220 ms). A tabela de níveis vem do estado das cartas em cache.
// ─────────────────────────────────────────────────────────────────────────────

type Tabela = { niveis: NivelTabela[]; icone: { passo: number; incremento: number } };
type Atual = GanhoBarra & Tabela & { k: number };

async function tabelaDeNiveis(): Promise<Tabela | null> {
  const uid = peekUserId();
  const cache = uid ? peekCache<EstadoCartas>(chaveEstado(uid))?.data : null;
  const e = cache?.niveis?.length && cache.icone ? cache : await estadoCartas().catch(() => null);
  return e?.niveis?.length && e.icone ? { niveis: e.niveis, icone: e.icone } : null;
}

export default function BarraPontosHost() {
  const insets = useSafeAreaInsets();
  const rm = useReducedMotion();
  const [atual, setAtual] = useState<Atual | null>(null);
  const fila = useRef<GanhoBarra[]>([]);
  const ocupado = useRef(false);
  const vez = useRef(0);
  const o = useSharedValue(0);

  const proximo = useCallback(async () => {
    if (ocupado.current) return;
    const g = fila.current.shift();
    if (!g) return;
    ocupado.current = true;
    const tab = await tabelaDeNiveis();
    if (!tab) { ocupado.current = false; void proximo(); return; }
    vez.current += 1;
    setAtual({ ...g, ...tab, k: vez.current });
    o.set(withTiming(1, { duration: rm ? 160 : 200 }));
  }, [o, rm]);

  useEffect(() => registrarBarraPontos((g) => { fila.current.push(g); void proximo(); }), [proximo]);

  const acabou = () => {
    ocupado.current = false;
    setAtual(null);
    void proximo();
  };
  const fim = () => {
    // Fica um instante cheia e some.
    setTimeout(() => {
      o.set(withTiming(0, { duration: 220 }, (ok) => { if (ok) scheduleOnRN(acabou); }));
    }, 900);
  };

  const st = useAnimatedStyle(() => ({ opacity: o.get() }));
  if (!atual) return null;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999 }, st]}>
      <PacotePontos
        key={atual.k}
        semCartas
        de={atual.de}
        para={atual.para}
        niveis={atual.niveis}
        icone={atual.icone}
        origem={{ x: 0, y: 0 }}
        topo={insets.top + 8}
        rm={rm}
        onFim={fim}
      />
    </Animated.View>
  );
}
