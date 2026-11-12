// Toque nas notificações (ver lib/pushToque.ts) + o destino da CARTA MISTERIOSA e dos
// avisos do grupo (abrem a tela do grupo, `/(app)/grupo?id=`). Carta misteriosa:
// o estado do servidor entrega a Carta de volta ao abrir (idempotente: se a home já
// pediu, só devolve a mesma) e a tela de raspar abre direto nela. Sem carta (o limite
// bloqueou, ou ela já raspou), fica na home.
import { abrirComTrilha, irPara } from '../lib/navegar';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { registrarToque, useToquePush, type DadosPush } from '../lib/pushToque';
import { chaveEstado, estadoCartas } from '../lib/cartasServidor';
import { getUserId } from '../lib/currentUser';
import { writeCache } from '../lib/cache';
import { marcarConviteVisto, rotaConversaEspinha, useBalaoEspinha } from '../lib/espinhaAcompanhamento';

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
  // Avisos do grupo ("Ana fez check-in 📸", "Falta só você hoje 👀"): abre o grupo.
  useEffect(() => {
    const abrirGrupo = (d: DadosPush) => {
      // Com a trilha de antes por trás (Grupos › Seus grupos › grupo): o voltar e o gesto
      // levam para onde o botão levava (lib/navegar).
      if (typeof d.grupo_id === 'string') abrirComTrilha(['/grupos', '/seus-grupos', { pathname: '/grupo', params: { id: d.grupo_id } }]);
    };
    const a = registrarToque('grupo_checkin', abrirGrupo);
    const b = registrarToque('grupo_falta', abrirGrupo);
    return () => { a(); b(); };
  }, [router]);
  // Nova denúncia (só moderadoras recebem): abre a tela de revisão.
  useEffect(() => registrarToque('denuncia', () => { abrirComTrilha(['/home', '/revisao-denuncias']); }), [router]);
  // Retorno de 24 h da espinha: abre a conversa, com a pergunta da NIKS já lá.
  useEffect(() => registrarToque('espinha_retorno', (d) => {
    if (typeof d.conversation_id !== 'string') return;
    marcarConviteVisto(d.conversation_id);
    useBalaoEspinha.getState().fechar();
    // `irPara` (não `router.push`): se a carta estiver aberta, ela sai antes — de dentro dela,
    // o push empilhava o app de novo como folha (lib/navegar, 12/nov/2026).
    irPara(rotaConversaEspinha(d.conversation_id));
  }), [router]);
  return null;
}
