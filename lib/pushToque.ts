// ─────────────────────────────────────────────────────────────────────────────
// Roteador ÚNICO do toque nas notificações (locais e do servidor). Antes cada tela
// lia `getLastNotificationResponseAsync` e limpava a resposta — quem montasse primeiro
// engolia o toque das outras. Agora só `useToquePush` (montado no layout do (app)) lê
// a resposta que abriu o app e as que chegam com ele aberto, mede `push_aberto` e
// despacha por `data.type` para quem se registrou (`registrarToque`):
//   · 'rotina_lote'      → components/rotina/AvisoLote.tsx (abre o resultado do lote)
//   · 'carta_misteriosa' → components/ToquePush.tsx (abre a Carta de volta para raspar)
//   · 'grupo_checkin' / 'grupo_falta' (avisos do grupo, servidor) → ToquePush abre o grupo
//   · 'espinha_retorno' (push de 24 h do acompanhamento) → ToquePush abre a conversa da espinha
//   · 'routine_reminder' → só a medição (abre o app, como sempre).
// Um toque de um tipo sem ninguém registrado ainda (ex.: o aviso do lote não monta
// durante o tutorial) fica guardado e é entregue quando o tipo se registrar.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { trackFora } from './mixpanel/MixpanelProvider';

export type DadosPush = { type?: string; [k: string]: unknown };
type Tratador = (dados: DadosPush) => void | Promise<void>;

const COM_TELA = new Set(['rotina_lote', 'carta_misteriosa', 'grupo_checkin', 'grupo_falta', 'espinha_retorno']);
const tratadores = new Map<string, Tratador>();
const pendentes = new Map<string, DadosPush>();
const tratados = new Set<string>();

function entregar(tipo: string, dados: DadosPush) {
  const t = tratadores.get(tipo);
  if (!t) { pendentes.set(tipo, dados); return; }
  pendentes.delete(tipo);
  Promise.resolve(t(dados)).catch((e) => console.warn('[pushToque] falha ao tratar', tipo, e));
}

function receber(r: Notifications.NotificationResponse | null) {
  if (!r || r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
  // A mesma resposta chega pelo "último toque" e pelo listener: trata uma vez só.
  const chave = `${r.notification.request.identifier}|${r.notification.date}`;
  if (tratados.has(chave)) return;
  tratados.add(chave);
  const dados = (r.notification.request.content.data ?? {}) as DadosPush;
  const tipo = typeof dados.type === 'string' ? dados.type : 'desconhecido';
  trackFora('push_aberto', { tipo, kind: dados.kind ?? null, dia: dados.day ?? dados.dia ?? null });
  if (COM_TELA.has(tipo)) entregar(tipo, dados);
}

/** Quem abre uma tela para um tipo de push. Devolve o "desregistrar". */
export function registrarToque(tipo: string, tratador: Tratador): () => void {
  tratadores.set(tipo, tratador);
  const p = pendentes.get(tipo);
  if (p) entregar(tipo, p);
  return () => { if (tratadores.get(tipo) === tratador) tratadores.delete(tipo); };
}

/** Lê o toque que abriu o app e escuta os seguintes. Montar UMA vez (layout do (app)). */
export function useToquePush() {
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then((r) => {
      receber(r);
      if (r) void Notifications.clearLastNotificationResponseAsync?.();
    }).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(receber);
    return () => sub.remove();
  }, []);
}
