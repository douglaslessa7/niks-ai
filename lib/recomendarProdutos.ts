const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

// Chamada única à Edge Function `recomendar-produtos` — quem decide QUAL produto
// ocupa cada passo da rotina (catálogo `produtos` + Minha Coleção).
//
// Deploy com `--no-verify-jwt` e sem sessão: a função resolve tudo pelo `user_id`
// com service role. Por isso o header é a ANON_KEY (mesmo padrão do
// `lib/generateProtocol.ts`, de onde esta chamada foi extraída quando o fluxo da
// Coleção passou a precisar dela em um segundo lugar).
//
// ⚠️ `regenerate: true` é o que faz a função PULAR a guarda de "gera uma vez" e
// sobrescrever a linha. É o caminho de quando a Coleção muda: a estrutura da
// rotina continua a mesma, só o produto de cada passo é recalculado.
export async function recomendarProdutos({
  userId, scanId = null, regenerate = false, preservarCatalogo = false,
}: {
  userId: string;
  scanId?: string | null;
  regenerate?: boolean;
  /**
   * ⚠️ Use `true` sempre que o motivo da rechamada for a MINHA COLEÇÃO (ela
   * adicionou ou removeu um produto seu). Passos que já tinham escolha do
   * catálogo e não foram tocados mantêm exatamente o produto que já tinham.
   *
   * Sem isso, a camada de IA é re-rodada para todos os passos e — como o modelo
   * não é determinístico — adicionar UM produto trocaria em silêncio os
   * recomendados de passos sem relação nenhuma com ele. A regra do produto é
   * "só o produto do passo muda, nunca a rotina inteira".
   *
   * Deixe `false` quando a ROTINA mudou (regeneração do protocolo): aí os passos
   * são outros e tudo precisa ser escolhido de novo.
   */
  preservarCatalogo?: boolean;
}): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/recomendar-produtos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({
        user_id: userId, scan_id: scanId, regenerate,
        preservar_catalogo: preservarCatalogo,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[recomendarProdutos] HTTP', res.status, body.slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[recomendarProdutos] falhou (rede):', e);
    return false;
  }
}
