// ─────────────────────────────────────────────────────────────────────────────
// Conta de teste (12/nov/2026, build 1.62 (2); servidor: migration 20261207120000).
// Contas da tabela `contas_teste` (no banco) fazem tudo a qualquer hora e quantas vezes
// quiserem: skincare fora do horário e repetido, check-ins repetidos, scan de rosto sem os
// 7 dias, "Montar minha rotina" mais de uma vez por dia, recortes sem o teto da sessão e a
// dica do dia a cada abertura. Quem decide é o SERVIDOR, pela conta (vale no TestFlight e na
// loja): `estado_cartas_v2` devolve `conta_teste`. Colocar/tirar uma conta = insert/delete
// na tabela, sem build nova. O sinal fica guardado por conta no aparelho, para valer já na
// abertura seguinte, antes de o estado chegar.
// ─────────────────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { peekUserId, useUserId } from './currentUser';

const CHAVE = (uid: string) => `conta_teste:${uid}`;
const porConta = new Map<string, boolean>();
const ouvintes = new Set<() => void>();

/** Gravado quando o estado da conta chega do servidor (`lib/cartasServidor`). */
export function definirContaTeste(uid: string | null, valor: boolean | undefined) {
  if (!uid || typeof valor !== 'boolean') return;
  if (porConta.get(uid) === valor) return;
  porConta.set(uid, valor);
  void AsyncStorage.setItem(CHAVE(uid), valor ? '1' : '0').catch(() => {});
  ouvintes.forEach((f) => f());
}

/** Lê o sinal guardado no aparelho (na abertura do app). */
export async function carregarContaTeste(uid: string | null): Promise<void> {
  if (!uid || porConta.has(uid)) return;
  const v = await AsyncStorage.getItem(CHAVE(uid)).catch(() => null);
  if (v === '1' || v === '0') definirContaTeste(uid, v === '1');
}

/** A conta logada é de teste? (síncrono; false enquanto não se sabe). */
export function ehContaTeste(uid: string | null = peekUserId()): boolean {
  return !!uid && porConta.get(uid) === true;
}

export function useContaTeste(): boolean {
  const uid = useUserId();
  const [, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    ouvintes.add(f);
    void carregarContaTeste(uid ?? null);
    return () => { ouvintes.delete(f); };
  }, [uid]);
  return ehContaTeste(uid ?? null);
}
