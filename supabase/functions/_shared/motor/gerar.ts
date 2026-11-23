// Motor da rotina v2 — liga as etapas 1, 2 e 4 (rotina ideal, sem produtos).
//   plano (código) → IA escreve a rotina → conferência → 1 correção pela IA → correção
//   no código → avisos do plano no introduction_warnings.
// Devolve o protocolo no formato de sempre (morning/night/...), com "ativo" e "dias"
// em cada passo, e o plano usado (para registro).

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { carregarCatalogo, filtrosDaPele, temProdutoPara } from './catalogo.ts'
import { comAvisos, corrigirRotina, mensagemCorretiva, normalizar, problemasDaRotina, type Protocolo } from './conferencia.ts'
import { perfilMotor } from './perfil.ts'
import { montarPlano, textosDosAvisos, type Plano } from './plano.ts'
import { mensagemV2, SYSTEM_V2 } from './prompt.ts'
import { INSTRUCAO_EN_ROTINA, type Idioma } from './ingles.ts'
import { registrarChatOpenAI } from '../ia-custos.ts'

export function clienteServico(): any {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
}

/** Regra única de quem usa o motor novo (função SQL `usa_motor_novo`). Erro → motor antigo. */
export async function usaMotorNovo(supabase: any, uid: string | null): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('usa_motor_novo', { p_uid: uid })
    if (error) { console.warn('MOTOR_GATE_ERRO', error.message); return false }
    return data === true
  } catch (e) {
    console.warn('MOTOR_GATE_ERRO', String(e))
    return false
  }
}

export async function memoriasAtivas(supabase: any, uid: string | null): Promise<{ type?: string; value?: string }[]> {
  if (!uid) return []
  const { data } = await supabase.from('coach_memories').select('type, value').eq('user_id', uid).eq('is_active', true)
  return (data ?? []) as { type?: string; value?: string }[]
}

/** `quem`: só para o custo em `ia_custos` (nome da etapa + conta), gravado em segundo plano. */
export async function chamarIA(messages: { role: string; content: string }[], quem: { funcao: string; uid: string | null } = { funcao: 'motor-v2', uid: null }): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90000)
  try {
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      const t0 = Date.now()
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
        body: JSON.stringify({
          model: 'gpt-5.4-mini',
          // O teto inclui o raciocínio (mesma lição do generate-protocol). NÃO baixar.
          max_completion_tokens: 16000,
          response_format: { type: 'json_object' },
          messages,
        }),
        signal: controller.signal,
      })
      if (r.ok) {
        const d = await r.json()
        registrarChatOpenAI(quem.funcao, 'gpt-5.4-mini', d, { userId: quem.uid, duracaoMs: Date.now() - t0 })
        return d?.choices?.[0]?.message?.content ?? null
      }
      const corpo = await r.text().catch(() => '')
      console.error('MOTOR_IA_ERRO', r.status, corpo.slice(0, 300))
      if ((r.status === 500 || r.status === 503) && tentativa < 3) { await new Promise((x) => setTimeout(x, 2000)); continue }
      return null
    }
    return null
  } catch (e) {
    console.error('MOTOR_IA_ERRO', String(e))
    return null
  } finally {
    clearTimeout(timer)
  }
}

function lerJson(texto: string | null): Protocolo | null {
  if (!texto) return null
  try {
    const p = JSON.parse(texto)
    return p && typeof p === 'object' ? p as Protocolo : null
  } catch { return null }
}

export interface ResultadoV2 { protocolo: Protocolo; plano: Plano; correcoes: string[] }

export async function gerarRotinaV2(
  { scanResult, onboardingData, uid, supabase, idioma = 'pt' }: { scanResult: any; onboardingData: any; uid: string | null; supabase?: any; idioma?: Idioma },
): Promise<ResultadoV2> {
  const db = supabase ?? clienteServico()
  const [catalogo, memorias] = await Promise.all([carregarCatalogo(db), memoriasAtivas(db, uid)])
  const perfil = perfilMotor(scanResult, onboardingData, memorias)
  const filtros = filtrosDaPele(perfil, onboardingData, scanResult, null)
  const plano = montarPlano(perfil, { temProduto: temProdutoPara(catalogo, filtros) })
  const log = (motivo: string, ctx: Record<string, unknown> = {}) =>
    console.warn('MOTOR_V2', JSON.stringify({ motivo, uid, ...ctx }))
  log('PLANO', { ativos: plano.ativos.map((a) => [a.ativo, a.dores]), avisos: plano.avisos.map((a) => [a.dor, a.motivo]) })

  const correcoes: string[] = []
  const msgs = [{ role: 'system', content: idioma === 'en' ? SYSTEM_V2 + INSTRUCAO_EN_ROTINA : SYSTEM_V2 }, { role: 'user', content: mensagemV2(scanResult, onboardingData, plano) }]
  const primeiro = await chamarIA(msgs, { funcao: 'motor-v2-rotina', uid })
  let proto = lerJson(primeiro)
  if (!proto) throw new Error('motor v2: a IA não devolveu uma rotina legível')

  let problemas = problemasDaRotina(proto, plano)
  if (problemas.length) {
    correcoes.push(`ia:${problemas.map((p) => p.tipo).join(',')}`)
    const segunda = lerJson(await chamarIA([...msgs, { role: 'assistant', content: primeiro! }, { role: 'user', content: mensagemCorretiva(problemas) }], { funcao: 'motor-v2-correcao', uid }))
    if (segunda && problemasDaRotina(segunda, plano).length <= problemas.length) proto = segunda
    problemas = problemasDaRotina(proto, plano)
  }
  if (problemas.length) {
    correcoes.push(`codigo:${problemas.map((p) => p.tipo).join(',')}`)
    proto = corrigirRotina(proto, plano, idioma)
  } else {
    proto = normalizar(proto, plano)
  }
  const restantes = problemasDaRotina(proto, plano)
  if (restantes.length) log('SOBROU_PROBLEMA', { restantes })
  // Um aviso por motivo (as dores juntas); a frase da IA sobre isotretinoína sai (o aviso do plano já diz).
  proto = comAvisos(proto, textosDosAvisos(plano, idioma), plano.soBasicos ? /isotretino|roacutan/i : undefined)
  log('PRONTA', { correcoes })
  return { protocolo: proto, plano, correcoes }
}
