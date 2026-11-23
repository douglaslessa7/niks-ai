// Idioma do celular gravado na conta (`users.idioma`, etapa 3 da tradução, nov/2026), para o
// SERVIDOR mandar as notificações dele (lembretes, grupos, lote da rotina) no idioma dela.
// O app manda o idioma direto nas chamadas de IA; isto é só para o que o servidor envia sozinho.
//
// Uma vez por abertura, e só grava quando muda (o último valor gravado fica no aparelho, por
// conta). ⚠️ Antes da migration da coluna ir ao ar o update falha: erro engolido, nada vai
// para o cache (tenta de novo na próxima abertura), nunca em loop e nunca trava a tela.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { idioma } from './i18n';
import { supabase } from './supabase';
import { getUserId } from './currentUser';

let feitoNestaAbertura = false;

export async function gravarIdiomaNaConta(): Promise<void> {
  if (feitoNestaAbertura) return;
  feitoNestaAbertura = true;
  try {
    const uid = await getUserId();
    if (!uid) { feitoNestaAbertura = false; return; }
    const chave = `idioma_conta:${uid}`;
    let gravado: string | null = null;
    try { gravado = await AsyncStorage.getItem(chave); } catch {}
    if (gravado === idioma) return;
    const { error } = await supabase.from('users').update({ idioma }).eq('id', uid);
    if (error) return; // coluna ainda não existe, sem rede etc.: tenta na próxima abertura
    try { await AsyncStorage.setItem(chave, idioma); } catch {}
  } catch {
    // nunca derruba nada
  }
}
