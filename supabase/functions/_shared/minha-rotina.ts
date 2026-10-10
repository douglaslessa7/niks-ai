// ─────────────────────────────────────────────────────────────────────────────
// A "Minha rotina" (tabela `minha_rotina_passos`) no formato de passo que o chat, a
// análise de produto e a camada de mudanças (`protocol-write.ts`) já usam
// ({ id, name, ingredient, instruction }) — plano da Rotina, Fase 8.
//
// QUEM TEM Minha rotina: `users.minha_rotina_criada_em` preenchido (só a build nova cria
// a cópia). Para quem NÃO tem — inclusive quem ainda usa o app das lojas — tudo
// continua na rotina ideal (`protocolos`), exatamente como antes.
//
// Cada passo mapeado carrega `_rowId` (o id do registro). `applyProposal` mantém os
// passos que não toca (mesmo objeto) e cria os novos sem `_rowId` — é assim que
// `gravarMudanca` sabe o que manter, apagar ou criar.
// ─────────────────────────────────────────────────────────────────────────────

import { classifyStep, detectTargetActive } from './protocol-write.ts'

export type PassoMinha = {
  id: number
  _rowId?: string
  name: string
  ingredient: string
  instruction: string
  produto?: string | null
  dias?: string[] | null
  [k: string]: unknown
}

export async function temMinhaRotina(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.from('users').select('minha_rotina_criada_em').eq('id', userId).maybeSingle()
  return !!data?.minha_rotina_criada_em
}

/** Minha rotina no formato de protocolo: { rotina_am, rotina_pm }, na ordem. */
export async function lerMinhaRotina(supabase: any, userId: string): Promise<{ rotina_am: PassoMinha[]; rotina_pm: PassoMinha[] }> {
  const { data, error } = await supabase
    .from('minha_rotina_passos')
    .select('id, periodo, ordem, nome, ingrediente, instrucao, dias, colecao_item_id, aviso_nivel, aviso_texto, produto_estante:colecao_produtos(nome, marca)')
    .eq('user_id', userId)
    .order('ordem', { ascending: true })
  if (error) throw error
  const mapa = (rows: any[]) => rows.map((r, i): PassoMinha => {
    const prod = r.produto_estante ? [r.produto_estante.marca, r.produto_estante.nome].filter(Boolean).join(' ') : null
    const dias = Array.isArray(r.dias) && r.dias.length ? r.dias : null
    // O produto e os dias entram no texto do ingrediente: é o que a IA e os detectores
    // de ativo/categoria (classifyStep/detectTargetActive) leem.
    const ingrediente = [r.ingrediente, prod ? `produto: ${prod}` : null].filter(Boolean).join(' · ')
    return {
      id: i + 1,
      _rowId: r.id,
      name: r.nome ?? prod ?? 'Passo',
      ingredient: dias ? `${ingrediente} (${dias.join('/')})` : ingrediente,
      instruction: r.instrucao ?? '',
      produto: prod,
      dias,
      // Para a troca do período inteiro manter o produto de um passo equivalente.
      _colecao: r.colecao_item_id ?? null,
      _aviso: { nivel: r.aviso_nivel ?? 'nenhum', texto: r.aviso_texto ?? null },
    }
  })
  const rows = data ?? []
  return { rotina_am: mapa(rows.filter((r: any) => r.periodo === 'am')), rotina_pm: mapa(rows.filter((r: any) => r.periodo === 'pm')) }
}

// 'Sab' (camada de mudanças) → 'Sáb' (app); só os 7 dias, na ordem.
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
function diasApp(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const k = (x: unknown) => String(x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().slice(0, 3)
  const pedidos = new Set(v.map(k))
  const ok = DIAS.filter((d) => pedidos.has(k(d)))
  return ok.length && ok.length < 7 ? ok : null
}

// Passo novo equivale a um antigo? Mesma categoria E (mesmo ativo conhecido, ou mesmo
// nome). Usado só na troca do período inteiro, para não perder o produto escolhido.
const normNome = (x: unknown) => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
function equivalente(novo: any, velho: PassoMinha): boolean {
  if (normNome(novo.name) === normNome(velho.name)) return true
  const cn = classifyStep(String(novo.name ?? ''), String(novo._raw?.ingredient ?? novo.ingredient ?? '')).category
  const cv = classifyStep(String(velho.name ?? ''), String(velho.ingredient ?? '')).category
  if (cn !== cv || cn === 'Cuidado') return false
  const an = detectTargetActive(String(novo.name ?? ''), String(novo._raw?.ingredient ?? novo.ingredient ?? ''))
  const av = detectTargetActive(String(velho.name ?? ''), String(velho.ingredient ?? ''))
  if (an.kind === 'known' || av.kind === 'known') return an.kind === 'known' && av.kind === 'known' && an.label === av.label
  return true // limpeza/hidratante/protetor sem ativo: mesma categoria basta
}

/**
 * Grava na Minha rotina o resultado de `applyProposal` sobre `lerMinhaRotina`, só no
 * período da mudança: apaga o que saiu, cria o que entrou (origem 'chat') e renumera.
 * Passo criado vem sem produto — exceto na troca do período inteiro, em que herda o
 * produto (e o aviso) de um passo antigo equivalente.
 */
export async function gravarMudanca(
  supabase: any, userId: string,
  antes: { rotina_am: PassoMinha[]; rotina_pm: PassoMinha[] },
  depois: { rotina_am: any[]; rotina_pm: any[] },
  changes: { period: 'am' | 'pm'; action?: string; ingredient: string; schedule_days?: string[] | null },
): Promise<void> {
  const per = changes.period
  const velhos = per === 'am' ? antes.rotina_am : antes.rotina_pm
  const novos = per === 'am' ? depois.rotina_am : depois.rotina_pm
  const ficam = new Set(novos.map((s) => s._rowId).filter(Boolean))

  const sair = velhos.filter((s) => s._rowId && !ficam.has(s._rowId)).map((s) => s._rowId!)
  if (sair.length) {
    const { error } = await supabase.from('minha_rotina_passos').delete().in('id', sair).eq('user_id', userId)
    if (error) throw error
  }

  const agora = new Date().toISOString()
  const herdaveis = changes.action === 'replace_period' ? [...velhos] : []
  for (let i = 0; i < novos.length; i++) {
    const s = novos[i]
    if (s._rowId) {
      const { error } = await supabase.from('minha_rotina_passos').update({ ordem: i + 1, updated_at: agora }).eq('id', s._rowId).eq('user_id', userId)
      if (error) throw error
    } else {
      const k = herdaveis.findIndex((v) => v._colecao && equivalente(s, v))
      const herda = k >= 0 ? herdaveis.splice(k, 1)[0] : null
      const aviso = herda?._aviso as { nivel: string; texto: string | null } | undefined
      const { error } = await supabase.from('minha_rotina_passos').insert({
        user_id: userId, periodo: per, ordem: i + 1,
        nome: s.name ?? null,
        ingrediente: (s._raw?.ingredient ?? changes.ingredient) || null,
        instrucao: s.instruction ?? null,
        dias: diasApp(s._raw ? s._raw.schedule_days : changes.schedule_days),
        origem: 'chat',
        colecao_item_id: herda?._colecao ?? null,
        aviso_nivel: herda && aviso ? aviso.nivel : 'nenhum',
        aviso_texto: herda && aviso ? aviso.texto : null,
      })
      if (error) throw error
    }
  }
}
