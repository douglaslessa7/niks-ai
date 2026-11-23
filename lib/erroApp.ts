// ─────────────────────────────────────────────────────────────────────────────
// Registro dos erros de tela (1.64): cada vez que um ErrorBoundary pega um erro, grava
// uma linha em `erros_app` (migration 20261223120000) — tela, mensagem, user_id, versão e
// build — para a gente ver o erro sem depender de e-mail de cliente.
//
// Regras: nunca lança (é chamado de dentro de um ErrorBoundary), não espera a rede, e manda
// no máximo 1 registro por erro por sessão do app (mesma tela + nome + mensagem). O banco
// confere o mesmo com um índice único em (sessao, assinatura) — se o app mandar de novo, o
// insert falha em silêncio. Teto de 20 erros diferentes por sessão.
// ─────────────────────────────────────────────────────────────────────────────
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { peekUserId } from './currentUser';

const TETO_POR_SESSAO = 20;

// Id desta abertura do app (some ao fechar). Hermes não tem `crypto.randomUUID`.
const SESSAO = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0;
  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

const enviados = new Set<string>();

/** `tela` = onde o boundary mora ('raiz', 'protocolo', 'home'…). */
export function registrarErroApp(tela: string, erro: unknown): void {
  try {
    const e = erro instanceof Error ? erro : new Error(String(erro));
    const nome = String(e.name || 'Error').slice(0, 100);
    const mensagem = String(e.message ?? '').slice(0, 1000);
    const chave = `${tela}|${nome}|${mensagem}`;
    if (enviados.has(chave) || enviados.size >= TETO_POR_SESSAO) return;
    enviados.add(chave);
    void supabase
      .from('erros_app')
      .insert({
        sessao: SESSAO,
        user_id: peekUserId(),
        tela: tela.slice(0, 100),
        nome,
        mensagem,
        stack: String(e.stack ?? '').slice(0, 4000) || null,
        versao: Constants.expoConfig?.version ?? Application.nativeApplicationVersion ?? null,
        build: Application.nativeBuildVersion ?? null,
        plataforma: Platform.OS,
      })
      .then(() => {}, () => {});
  } catch {
    // registrar o erro nunca pode virar outro erro
  }
}
