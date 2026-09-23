// ─────────────────────────────────────────────────────────────────────────────
// PRIMEIRO FLUXO DA MINHA COLEÇÃO — orquestração.
//
// O fluxo, uma vez por conta:
//   pop-up "você tem produtos de skincare em casa?"
//     → Sim: ela fotografa os produtos em sequência (fila, sem esperar análise)
//     → nos dois casos: scan de pele de DENTRO do app (camera-multi, 6 fotos)
//     → aqui: analisa a fila contra o scan NOVO, monta a Coleção e refaz a rotina
//
// ⚠️ POR QUE A FILA ESPERA O SCAN (ponto 1 da spec).
// A `analisar-produto` calcula a compatibilidade contra o ÚLTIMO `skin_scans` da
// usuária. No primeiro fluxo os produtos são fotografados ANTES do rosto, então
// analisar na hora mediria os produtos contra o scan do onboarding (1 foto) e
// exigiria recalcular tudo depois — o dobro de chamadas de visão por produto.
// Guardando as fotos e analisando DEPOIS do scan, cada produto custa UMA chamada
// e já nasce medido contra o retrato bom da pele. A espera não é da usuária: ela
// já está vendo o resultado do scan enquanto isto roda em background.
//
// ⚠️ Função de MÓDULO (não hook), pelo mesmo motivo do `regenerateProtocolInApp`:
// roda no event loop e sobrevive à navegação entre loading → resultado.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase';
import { useAppStore, ScanResult } from '../store/onboarding';
import { analisarProduto, novoClientScanId } from './analisarProduto';
import { adicionarDoScan, adicionarNaoIdentificado, colecaoCacheKey } from './colecao';
import { regenerateProtocolInApp } from './regenerateProtocolInApp';
import { recomendarProdutos } from './recomendarProdutos';
import { invalidateCache } from './cache';
// ⚠️ `mixpanel` direto (não o hook `useMixpanel`): isto é uma função de módulo,
// não um componente React. Mesma exceção documentada de `lib/revenuecat.ts`.
import { mixpanel } from './mixpanel/mixpanelClient';

/**
 * Teto de produtos por sessão do primeiro fluxo. Cada produto = 1 chamada de
 * visão da IA, e o risco nº 1 da feature é o abandono num fluxo longo (fotos dos
 * produtos + 6 fotos do rosto). 12 cobre uma prateleira real; ao bater o teto a
 * câmera avisa que dá para completar depois pela aba Minha Coleção.
 */
export const MAX_PRODUTOS_PRIMEIRO_FLUXO = 12;

// ── Gate: quem vê o primeiro fluxo ───────────────────────────────────────────
// Mesma arquitetura do tutorial da home (Sessão 64): a VERDADE é a coluna
// `users.colecao_onboarding_at`; o flag do store é só cache do aparelho, para o
// pop-up não piscar enquanto a resposta do servidor não chega. Flag local sozinho
// vazaria entre contas e sumiria na reinstalação.

/**
 * Esta CONTA ainda precisa passar pelo primeiro fluxo?
 * `undefined` do servidor (rede caiu) → responde `false`: é melhor não mostrar o
 * fluxo agora do que mostrá-lo a quem já passou.
 */
export async function precisaPrimeiroFluxo(userId: string): Promise<boolean> {
  if (useAppStore.getState().colecaoOnboardingDone) return false;
  const { data, error } = await supabase
    .from('users')
    .select('colecao_onboarding_at')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return false;
  if (data.colecao_onboarding_at) {
    useAppStore.getState().setColecaoOnboardingDone(true); // cacheia o "já passou"
    return false;
  }
  return true;
}

/** Marca no servidor + no cache local. Fire-and-forget: nunca trava a usuária. */
export async function marcarPrimeiroFluxoFeito(userId: string): Promise<void> {
  useAppStore.getState().setColecaoOnboardingDone(true);
  const { error } = await supabase
    .from('users')
    .update({ colecao_onboarding_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) {
    // Local já está marcado, então ela não repete o fluxo NESTE aparelho; em outro,
    // poderia ver uma vez a mais. Mesmo limite conhecido do tutorial da home.
    console.error('[colecaoFlow] marcador não gravado no servidor:', error);
  }
}

// ── Processamento da fila ────────────────────────────────────────────────────

export type ResultadoFila = { identificados: number; naoIdentificados: number };

/**
 * Analisa a fila de fotos de produto e monta a Coleção. SEQUENCIAL de propósito:
 * são chamadas de visão pesadas e o ganho de paralelizar não paga o risco de
 * rate limit no meio do primeiro contato da usuária com a feature.
 *
 * Três desfechos por foto:
 *   • `ok`            → já está em `product_scans` → vira item identificado;
 *   • `precisa_foto`  → a IA não leu o produto → item "Não identificado" com a
 *                       foto salva, para ela refazer pela Coleção;
 *   • erro de rede    → MESMO tratamento do `precisa_foto`. A foto não pode
 *                       simplesmente sumir: com o card lá, ela tenta de novo; sem
 *                       ele, o produto desaparece sem ninguém avisar.
 */
export async function processarFilaColecao(userId: string): Promise<ResultadoFila> {
  const fila = useAppStore.getState().colecaoQueue;
  const out: ResultadoFila = { identificados: 0, naoIdentificados: 0 };
  if (!fila || fila.length === 0) return out;

  // Esvazia ANTES de processar: se a tela remontar ou o fluxo for disparado duas
  // vezes, a mesma foto não vira duas chamadas de IA (e dois itens na Coleção).
  useAppStore.getState().setColecaoQueue([]);

  for (const foto of fila) {
    try {
      const analise = await analisarProduto({
        images: [{ base64: foto.base64, mimeType: foto.mimeType }],
        clientScanId: novoClientScanId('colecao'),
      });
      if (analise?.status === 'precisa_foto' || !analise?.scan_id) {
        await adicionarNaoIdentificado(userId, foto.base64, foto.mimeType);
        out.naoIdentificados += 1;
      } else {
        await adicionarDoScan(userId, analise.scan_id, analise);
        out.identificados += 1;
      }
    } catch (e) {
      console.warn('[colecaoFlow] análise de um produto da fila falhou:', e);
      try {
        await adicionarNaoIdentificado(userId, foto.base64, foto.mimeType);
        out.naoIdentificados += 1;
      } catch (e2) {
        console.error('[colecaoFlow] nem o item não identificado foi salvo:', e2);
      }
    }
  }

  invalidateCache(colecaoCacheKey(userId));
  // Quantos produtos por usuária, e quanto da fila a IA não conseguiu ler — é o
  // número que diz se o caminho de "não identificado" está virando lixo na Coleção.
  mixpanel.track('colecao_lote_analisado', {
    enfileirados: fila.length,
    identificados: out.identificados,
    nao_identificados: out.naoIdentificados,
  });
  return out;
}

/**
 * Fecha o primeiro fluxo, depois que o scan de pele foi salvo. Chamado pela
 * `loading-dentro-app` NO LUGAR do `regenerateProtocolInApp` direto — é o mesmo
 * caminho de regeneração de sempre, só que agora com a Coleção antes dele.
 *
 * Ordem (importa):
 *  1. fila → Coleção (precisa do scan novo já salvo, ver o cabeçalho do arquivo);
 *  2. regeneração da ROTINA (estrutura), que já encadeia a recomendação de
 *     produtos — e agora enxerga a Coleção;
 *  3. se a rotina não foi regenerada (já tinha sido antes) mas a Coleção mudou,
 *     refresca SÓ a recomendação: é exatamente a regra "depois do primeiro fluxo,
 *     só o produto do passo muda — nunca a rotina inteira";
 *  4. marca o primeiro fluxo como concluído nesta conta.
 */
export async function finalizarPrimeiroFluxo(
  userId: string,
  scanResult: ScanResult,
  skinScanId: string | null,
): Promise<void> {
  let mudouColecao = false;
  try {
    const r = await processarFilaColecao(userId);
    mudouColecao = r.identificados + r.naoIdentificados > 0;
  } catch (e) {
    console.warn('[colecaoFlow] fila falhou por completo:', e);
  }

  let regenerou: 'regenerado' | 'pulado' | 'falhou' = 'pulado';
  try {
    regenerou = await regenerateProtocolInApp(userId, scanResult, skinScanId);
  } catch (e) {
    console.warn('[colecaoFlow] regeneração falhou:', e);
    regenerou = 'falhou';
  }

  if (regenerou !== 'regenerado' && mudouColecao) {
    await recomendarProdutos({ userId, scanId: skinScanId, regenerate: true, preservarCatalogo: true });
    // ⚠️ Nada a invalidar aqui: `recomendacoes_produtos` NÃO tem chave de cache —
    // a tela de Produtos e o mapa de produtos da Rotina leem direto do banco, a cada
    // foco, de propósito (as fotos são URLs assinadas e expiram em 1h). O
    // `protocolo:${uid}`, que é cacheado, guarda a rotina em si — e ela não muda
    // quando só o produto do passo muda. Quem regenera a rotina (o
    // `regenerateProtocolInApp`, acima) já invalida esse cache por conta própria.
  }

  // ⚠️ O marcador de "esta conta já passou pelo primeiro fluxo" NÃO é gravado
  // aqui, e sim no momento em que ela RESPONDE ao pop-up (`useColecaoOnboarding`).
  // Marcar no fim pareceria mais correto, mas todo scan de 6 fotos passa por esta
  // função — inclusive o de quem nunca viu o pop-up porque o gate falhou por
  // rede. Marcar aqui esconderia o fluxo dessa pessoa para sempre.
  // Custo aceito: app morto entre a resposta e o fim do fluxo perde a fila de
  // fotos, e ela adiciona os produtos pela aba Minha Coleção — o mesmo caminho de
  // recuperação que a tela já oferece.
}
