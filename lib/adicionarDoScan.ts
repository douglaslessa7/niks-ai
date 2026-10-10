// ─────────────────────────────────────────────────────────────────────────────
// "Adicionar à minha rotina" no resultado de um scan de produto avulso (plano da
// Rotina, Fase 8 — decisão 9). Usa a sugestão da análise (`decisao_rotina` do
// analisar-produto):
//   · adicionar  → passo NOVO com o produto, no período sugerido (am, pm ou os dois),
//     logo depois do passo indicado pela IA (`depois_do_passo_id`); sem indicação, pela
//     ordem natural das categorias (limpeza → tônico → sérum → olhos → hidratante →
//     protetor). Entra com os dias de uso sugeridos (`dias`, null = todo dia).
//   · substituir → o produto entra no passo que ele substitui (`substitui_passo_id`, ou
//     o passo de mesmo nome que `produto_substituivel`); sem achar, vira "adicionar".
// O produto vai também para a estante. A rotina inteira nunca é refeita.
// Devolve o texto do aviso ("Adicionado à sua rotina da manhã, depois do sérum") e o
// que é preciso para o "Desfazer" (volta exatamente ao que era).
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase';
import { findInColecao, removeFromColecao } from './colecao';
import { tipoPorTexto, normTexto, type TipoPasso } from './tipoPasso';
import { avisoDoProduto, paraEstante, reordenarPassos, type Periodo } from './minhaRotina';

// Leitura ENXUTA dos passos (sem as fotos assinadas da estante, que a tela usa e aqui
// só atrasariam o toque): o bastante para achar a posição, o passo trocado e o aviso.
type PassoLeve = {
  id: string; periodo: Periodo; nome: string | null; ingrediente: string | null;
  colecao: string | null; aviso_nivel: string; aviso_texto: string | null; produto: string | null;
};
async function passosLeves(userId: string): Promise<Record<Periodo, PassoLeve[]>> {
  const { data, error } = await supabase
    .from('minha_rotina_passos')
    .select('id, periodo, ordem, nome, ingrediente, colecao_item_id, aviso_nivel, aviso_texto, item:colecao_produtos(nome)')
    .eq('user_id', userId)
    .order('ordem', { ascending: true });
  if (error) throw error;
  const todos: PassoLeve[] = (data ?? []).map((r: any) => ({
    id: r.id, periodo: r.periodo, nome: r.nome ?? null, ingrediente: r.ingrediente ?? null,
    colecao: r.colecao_item_id ?? null, aviso_nivel: r.aviso_nivel ?? 'nenhum', aviso_texto: r.aviso_texto ?? null,
    produto: r.item?.nome ?? null,
  }));
  return { am: todos.filter((p) => p.periodo === 'am'), pm: todos.filter((p) => p.periodo === 'pm') };
}
const nomeDoPasso = (p: PassoLeve) => p.nome?.trim() || p.produto?.trim() || 'Passo';

export type DecisaoRotina = {
  tipo?: 'adicionar' | 'substituir' | 'manter_rotina' | string;
  passo?: string | null;
  periodo?: 'am' | 'pm' | 'am+pm' | null;
  dias?: string[] | null;
  produto_substituivel?: string | null;
  depois_do_passo_id?: string | null;
  substitui_passo_id?: string | null;
};

export type Desfazer = {
  criados: string[];                                  // passos novos (apagar)
  trocados: { id: string; colecao: string | null; aviso_nivel: string; aviso_texto: string | null }[];
  estanteNova: string | null;                         // item que entrou na estante agora
};

const ORDEM: Record<TipoPasso, number> = { limpeza: 1, tonico: 2, serum: 3, olhos: 4, hidratante: 5, protetor: 6 };
const rank = (t: TipoPasso | null) => (t ? ORDEM[t] : 3.5);
const tipoDela = (p: PassoLeve) => tipoPorTexto(nomeDoPasso(p)) ?? tipoPorTexto(p.ingrediente ?? '');
const norm = (s?: string | null) => normTexto(s ?? '').replace(/\s+/g, ' ').trim();

/** Onde o passo novo entra: depois do indicado pela IA; senão, pela ordem das categorias. */
function posicao(lista: PassoLeve[], tipoNovo: TipoPasso | null, depoisId: string | null | undefined): number {
  if (depoisId) {
    const k = lista.findIndex((p) => p.id === depoisId);
    if (k >= 0) return k + 1;
  }
  // Antes do PRIMEIRO passo de categoria posterior (ex.: hidratante entra antes do
  // protetor). Passo sem categoria reconhecível (criado por ela, ex.: "Máscara de LED")
  // não conta — senão o novo iria parar depois dele, até depois do protetor.
  const r = rank(tipoNovo);
  const k = lista.findIndex((p) => { const t = tipoDela(p); return t !== null && ORDEM[t] > r; });
  return k >= 0 ? k : lista.length;
}

/** O texto do aviso: "Adicionado à sua rotina da manhã, depois do sérum". */
function textoAviso(tipo: string, periodos: Periodo[], depois: PassoLeve | null, trocado: PassoLeve | null): string {
  const quando = periodos.length === 2 ? 'da manhã e da noite' : periodos[0] === 'am' ? 'da manhã' : 'da noite';
  if (tipo === 'substituir' && trocado) return `Trocado na sua rotina ${quando}: ${nomeDoPasso(trocado)}`;
  if (depois && periodos.length === 1) {
    const t = tipoDela(depois);
    const nome = t === 'serum' ? 'o sérum' : t === 'limpeza' ? 'a limpeza' : t === 'hidratante' ? 'o hidratante'
      : t === 'tonico' ? 'o tônico' : t === 'protetor' ? 'o protetor' : nomeDoPasso(depois).toLowerCase();
    const depoisDe = nome.startsWith('o ') ? `do ${nome.slice(2)}` : nome.startsWith('a ') ? `da ${nome.slice(2)}` : `de ${nome}`;
    return `Adicionado à sua rotina ${quando}, depois ${depoisDe}`;
  }
  return `Adicionado à sua rotina ${quando}`;
}

export async function adicionarDoScan(userId: string, scanId: string, d: DecisaoRotina): Promise<{ aviso: string; desfazer: Desfazer }> {
  const periodos: Periodo[] = d.periodo === 'am+pm' ? ['am', 'pm'] : d.periodo === 'pm' ? ['pm'] : ['am'];
  const dias = Array.isArray(d.dias) && d.dias.length ? d.dias : null;

  // Estante primeiro (para saber se o item é novo — o "Desfazer" tira só o que entrou agora).
  const { data: sc } = await supabase.from('product_scans').select('produto_nome, produto_marca, resultado').eq('id', scanId).maybeSingle();
  const jaNaEstante = await findInColecao(userId, {
    productScanId: scanId,
    nome: sc?.produto_nome ?? sc?.resultado?.produto?.nome ?? null,
    marca: sc?.produto_marca ?? sc?.resultado?.produto?.marca ?? null,
  });
  const colecaoId = await paraEstante(userId, { origem: 'escaneado', id: scanId });
  const aviso = await avisoDoProduto(userId, { origem: 'estante', id: colecaoId });
  const desfazer: Desfazer = { criados: [], trocados: [], estanteNova: jaNaEstante ? null : colecaoId };

  const rotina = await passosLeves(userId);
  const tipoNovo = tipoPorTexto(d.passo ?? '') ?? tipoPorTexto(sc?.resultado?.produto?.categoria ?? '') ?? tipoPorTexto(sc?.produto_nome ?? '');
  let depoisRef: PassoLeve | null = null;
  let trocadoRef: PassoLeve | null = null;
  let tipoFeito = d.tipo === 'substituir' ? 'substituir' : 'adicionar';

  for (const per of periodos) {
    const lista = rotina[per];

    // Substituir: o passo que ele troca.
    if (d.tipo === 'substituir') {
      const alvo = lista.find((p) => p.id === d.substitui_passo_id)
        ?? lista.find((p) => !!d.produto_substituivel && (norm(p.nome) === norm(d.produto_substituivel)
          || norm(nomeDoPasso(p)) === norm(d.produto_substituivel)));
      if (alvo) {
        desfazer.trocados.push({ id: alvo.id, colecao: alvo.colecao, aviso_nivel: alvo.aviso_nivel, aviso_texto: alvo.aviso_texto });
        const { error } = await supabase.from('minha_rotina_passos').update({
          colecao_item_id: colecaoId, product_scan_id: null, produto_catalogo_id: null,
          aviso_nivel: aviso.nivel, aviso_texto: aviso.texto, updated_at: new Date().toISOString(),
        }).eq('id', alvo.id);
        if (error) throw error;
        trocadoRef = alvo;
        continue;
      }
      tipoFeito = 'adicionar';
    }

    // Adicionar: passo novo na posição certa.
    const pos = posicao(lista, tipoNovo, d.depois_do_passo_id);
    if (pos > 0) depoisRef = lista[pos - 1];
    const { data: novo, error } = await supabase.from('minha_rotina_passos').insert({
      user_id: userId, periodo: per, ordem: lista.length + 1,
      nome: d.passo?.trim() || null, dias, origem: 'scan_avulso',
      colecao_item_id: colecaoId, aviso_nivel: aviso.nivel, aviso_texto: aviso.texto,
    }).select('id').single();
    if (error || !novo) throw error ?? new Error('passo não criado');
    desfazer.criados.push(novo.id);
    const ids = lista.map((p) => p.id);
    ids.splice(pos, 0, novo.id);
    await reordenarPassos(ids);
  }

  return { aviso: textoAviso(tipoFeito, periodos, depoisRef, trocadoRef), desfazer };
}

/** "Desfazer": apaga os passos criados, devolve os produtos trocados e tira da estante o que entrou agora. */
export async function desfazerAdicao(userId: string, d: Desfazer): Promise<void> {
  if (d.criados.length) {
    const { error } = await supabase.from('minha_rotina_passos').delete().in('id', d.criados);
    if (error) throw error;
    // Renumera (sem buraco na ordem).
    const r = await passosLeves(userId);
    await Promise.all([reordenarPassos(r.am.map((p) => p.id)), reordenarPassos(r.pm.map((p) => p.id))]);
  }
  for (const t of d.trocados) {
    await supabase.from('minha_rotina_passos').update({
      colecao_item_id: t.colecao, product_scan_id: null, produto_catalogo_id: null,
      aviso_nivel: t.colecao ? t.aviso_nivel : 'nenhum', aviso_texto: t.colecao ? t.aviso_texto : null,
      updated_at: new Date().toISOString(),
    }).eq('id', t.id);
  }
  if (d.estanteNova) await removeFromColecao(d.estanteNova).catch(() => {});
}
