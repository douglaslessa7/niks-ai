// Toque nas notificações (ver lib/pushToque.ts) + o destino da CARTA MISTERIOSA:
// o estado do servidor entrega a Carta de volta ao abrir (idempotente: se a home já
// pediu, só devolve a mesma) e a tela de raspar abre direto nela. Sem carta (o limite
// bloqueou, ou ela já raspou), fica na home.
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { registrarToque, useToquePush } from '../lib/pushToque';
import { chaveEstado, estadoCartas } from '../lib/cartasServidor';
import { getUserId } from '../lib/currentUser';
import { writeCache } from '../lib/cache';

export default function ToquePush() {
  const router = useRouter();
  useToquePush();
  useEffect(() => registrarToque('carta_misteriosa', async () => {
    const e = await estadoCartas();
    const uid = await getUserId();
    if (uid) await writeCache(chaveEstado(uid), e);
    const id = e.carta_volta ?? e.a_raspar.find((c) => c.origem === 'volta')?.id;
    if (id) router.push(`/(carta)/carta?id=${id}` as any);
  }), [router]);
  return null;
}
