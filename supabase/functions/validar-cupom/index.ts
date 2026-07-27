// validar-cupom
// Recebe o código digitado no paywall (usuária AINDA anônima — sem sessão Supabase,
// RevenueCat anônimo) e responde se o cupom vale ou não.
//
// Sem autenticação: deployada com --no-verify-jwt. A identidade provisória é o
// `rc_app_user_id` (id do RevenueCat no momento da aplicação); o `user_id` real é
// resolvido depois, no signup.
//
// Regras:
//  - Se valer: registra a aplicação e o contador é incrementado (trigger no banco).
//  - Se a MESMA pessoa (mesmo rc_app_user_id) aplicar o mesmo cupom de novo: responde
//    que vale, mas NÃO conta de novo (ja_aplicado: true).
//  - Se não valer, o motivo é distinguível para a tela mostrar mensagens diferentes:
//    'nao_existe' | 'desativado' | 'expirado' | 'limite_atingido'.
//
// Respostas de negócio sempre voltam com HTTP 200 (o app lê `valido` + `motivo`).
// 400 = input malformado. 500 = erro inesperado.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { codigo, rc_app_user_id } = await req.json().catch(() => ({}))

    const codigoNorm = typeof codigo === 'string' ? codigo.trim().toUpperCase() : ''
    if (!codigoNorm) return json({ error: 'codigo é obrigatório' }, 400)
    if (!rc_app_user_id || typeof rc_app_user_id !== 'string') {
      return json({ error: 'rc_app_user_id é obrigatório' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Busca o cupom pelo código (sempre em maiúsculas).
    const { data: cupom, error: cupomErr } = await supabase
      .from('cupons')
      .select('id, codigo, influenciadora, ativo, expira_em, max_usos, total_aplicacoes')
      .eq('codigo', codigoNorm)
      .maybeSingle()

    if (cupomErr) throw cupomErr
    if (!cupom) return json({ valido: false, motivo: 'nao_existe' })
    if (!cupom.ativo) return json({ valido: false, motivo: 'desativado' })
    if (cupom.expira_em && new Date(cupom.expira_em) < new Date()) {
      return json({ valido: false, motivo: 'expirado' })
    }

    const cupomInfo = { codigo: cupom.codigo, influenciadora: cupom.influenciadora }

    // Já aplicou antes? (mesma pessoa, mesmo cupom) → vale, mas não conta de novo.
    const { data: existente, error: existErr } = await supabase
      .from('cupom_aplicacoes')
      .select('id')
      .eq('cupom_id', cupom.id)
      .eq('rc_app_user_id', rc_app_user_id)
      .maybeSingle()

    if (existErr) throw existErr
    if (existente) {
      return json({ valido: true, motivo: 'ok', ja_aplicado: true, cupom: cupomInfo })
    }

    // Limite de usos (só checado em aplicação NOVA).
    if (cupom.max_usos != null && cupom.total_aplicacoes >= cupom.max_usos) {
      return json({ valido: false, motivo: 'limite_atingido' })
    }

    // Registra a aplicação. `on conflict do nothing`: se outra chamada inseriu no meio
    // (mesma pessoa, corrida), o insert não retorna linha → tratamos como já_aplicado.
    // O contador cupons.total_aplicacoes é incrementado pelo trigger no banco.
    const { data: inserida, error: insErr } = await supabase
      .from('cupom_aplicacoes')
      .upsert(
        { cupom_id: cupom.id, rc_app_user_id, user_id: null, converteu: false },
        { onConflict: 'cupom_id,rc_app_user_id', ignoreDuplicates: true },
      )
      .select('id')
      .maybeSingle()

    if (insErr) throw insErr

    return json({
      valido: true,
      motivo: 'ok',
      ja_aplicado: !inserida, // sem linha nova = corrida com aplicação simultânea
      cupom: cupomInfo,
    })
  } catch (err) {
    console.error('[validar-cupom] erro:', err)
    return json({ error: String(err instanceof Error ? err.message : err) }, 500)
  }
})
