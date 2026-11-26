// ─────────────────────────────────────────────────────────────────────────────
// Fluxo pós-compra v2 (25–26/nov/2026). É O fluxo depois da compra confirmada (paywall-soft) e
// depois da ex-convidada assinar (components/trava/AvisoCadeado). Design: design-handoff/pos-compra-v2/. Ela monta a rotina com os produtos
// que já tem em casa e ganha NIKS Points por cada ação real.
//
//   pc-boas-vindas → pc-criar-rotina → (scan)/pc-camera → pc-gerando → pc-rotina-pronta →
//   pc-foto → pc-projecao → bv-pacto (a de sempre) → pc-recompensa → pc-sequencia →
//   pc-tudo-pronto → pc-exclusivos → cadastro
//   ("Não tenho produtos agora" pula a câmera; as telas de rotina mostram a rotina BASE.)
//
// As telas antigas (bv-entrou … bv-nivel, menos a bv-pacto) ficam no app nesta build, sem uso,
// para voltar atrás fácil; saem depois (docs/pendencias-pos-compra-v2.md).
//
// Regras (decisão do produto, 26/nov/2026):
//   1. A rotina BASE (da análise da pele) sempre existe, como sempre foi.
//   2. Escaneou aqui → esse scan SUBSTITUI o que a aba Rotina pede no 1º acesso: a rotina final
//      é montada com os produtos pelo mesmo processo da Rotina, e a Rotina não pede de novo.
//      As fotos ficam numa fila no aparelho até o envio dar certo (lib/filaProdutosCasa.ts).
//   3. "Não tenho produtos agora" → fica só com a rotina base; a aba Rotina pergunta de novo
//      (escanear / não tenho / depois), como sempre.
//
// NIKS Points: SÓ no aparelho por enquanto (decisão do produto). +20 por foto tirada, no
// máximo 10 fotos pontuadas (+200). Nada disso vai para o banco.
// ─────────────────────────────────────────────────────────────────────────────
import { create } from 'zustand';
import type { ProdutoLote } from './loteProdutos';
import { descartarFila, guardarNaFila } from './filaProdutosCasa';

export const PONTOS_POR_FOTO = 20;
export const FOTOS_PONTUADAS_MAX = 10;
/** Os pontos que a tela "Pacto selado" já dava (creditados no servidor depois do cadastro). */
export const PONTOS_BOAS_VINDAS = 100;

type Estado = {
  /** Este pós-compra está rodando no fluxo v2 (marcado na 1ª tela; a bv-entrou desmarca). */
  ativo: boolean;
  /** Fotos tiradas na câmera (para os pontos). */
  fotos: number;
  /** "Não tenho produtos agora". */
  semProdutos: boolean;
  /** Quantos produtos foram guardados na fila (lib/filaProdutosCasa.ts) para o lote. */
  qtdProdutos: number;
};

export const usePosCompraV2 = create<Estado>(() => ({ ativo: false, fotos: 0, semProdutos: false, qtdProdutos: 0 }));

/** 1ª tela do fluxo novo: começa do zero. */
export function comecarPosCompraV2() {
  usePosCompraV2.setState({ ativo: true, fotos: 0, semProdutos: false, qtdProdutos: 0 });
}

/** Fluxo de sempre (bv-entrou): garante que nada do v2 vale. */
export function sairDoPosCompraV2() {
  if (usePosCompraV2.getState().ativo) usePosCompraV2.setState({ ativo: false });
}

export function pontosDosProdutos(fotos: number): number {
  return Math.min(Math.max(0, fotos), FOTOS_PONTUADAS_MAX) * PONTOS_POR_FOTO;
}

/** Total da tela "Pacto selado": o que ela fez + os pontos que a tela já dava. */
export function pontosDoPacto(): number {
  const s = usePosCompraV2.getState();
  return PONTOS_BOAS_VINDAS + (s.ativo ? pontosDosProdutos(s.fotos) : 0);
}

export function registrarFotoPosCompra() {
  usePosCompraV2.setState((s) => ({ fotos: s.fotos + 1 }));
}

/**
 * "Não tenho produtos agora": só PULA a montagem neste momento (ela pode estar longe dos
 * produtos). NÃO grava nada na conta — em especial, não marca `users.rotina_intro_status`.
 * Por isso, na 1ª abertura da Rotina, o tutorial pergunta de novo, com as três opções de
 * sempre; só o "Não tenho produtos" de lá confirma que ela não tem (decisão do produto,
 * 25/nov/2026). Não "corrigir" gravando algo aqui.
 */
export function escolherSemProdutos() {
  usePosCompraV2.setState({ semProdutos: true, fotos: 0, qtdProdutos: 0 });
  void descartarFila();
}

/** "Concluir" na câmera: as imagens vão para a fila do aparelho (lib/filaProdutosCasa.ts), que
 *  sobrevive a fechar o app e só é apagada depois do envio do lote (ou em 7 dias). */
export async function guardarProdutosDeCasa(lote: ProdutoLote[]): Promise<void> {
  const qtd = await guardarNaFila(lote);
  if (!qtd && lote.length) throw new Error('não guardou nenhum produto');
  usePosCompraV2.setState({ qtdProdutos: qtd, semProdutos: false });
}

/** Conta salva: zera o que é desta compra (a fila segue até o envio dar certo). */
export function limparPosCompraV2() {
  usePosCompraV2.setState({ fotos: 0, semProdutos: false, qtdProdutos: 0 });
}
