import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

type ProposedChanges = {
  action: 'add' | 'remove' | 'pause'
  step_name: string
  period: 'morning' | 'night' | 'both' | null
  duration_days: number | null
  details: string
}

type ProtocolStep = {
  name: string
  ingredient: string
  instruction: string
  [key: string]: unknown
}

function applyChanges(
  steps: ProtocolStep[],
  changes: ProposedChanges,
): ProtocolStep[] {
  if (changes.action === 'add') {
    const newStep: ProtocolStep = {
      name: changes.step_name,
      ingredient: changes.step_name,
      instruction: changes.details || 'Aplique conforme orientação da NIKS.',
    }
    return [...steps, newStep]
  }

  // 'remove' or 'pause'
  const needle = changes.step_name.toLowerCase()
  return steps.filter(
    s =>
      !s.name.toLowerCase().includes(needle) &&
      !s.ingredient.toLowerCase().includes(needle),
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    const user_id = user.id

    const body = await req.json()
    const { suggestion_id, approved } = body as {
      suggestion_id?: string
      approved?: boolean
    }

    if (!suggestion_id || approved === undefined) {
      return new Response(
        JSON.stringify({ error: 'suggestion_id e approved são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Buscar sugestão pendente
    const { data: suggestion, error: suggestionError } = await supabase
      .from('coach_protocol_suggestions')
      .select('id, proposed_changes')
      .eq('id', suggestion_id)
      .eq('user_id', user_id)
      .eq('status', 'pending')
      .single()

    if (suggestionError || !suggestion) {
      return new Response(
        JSON.stringify({ error: 'Sugestão não encontrada ou já processada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!approved) {
      await supabase
        .from('coach_protocol_suggestions')
        .update({ status: 'rejected' })
        .eq('id', suggestion_id)

      return new Response(
        JSON.stringify({ success: true, action: 'rejected' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Buscar protocolo atual
    const { data: protocol, error: protocolError } = await supabase
      .from('protocolos')
      .select('id, rotina_am, rotina_pm, updated_at')
      .eq('user_id', user_id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    if (protocolError || !protocol) {
      return new Response(
        JSON.stringify({ error: 'Protocolo não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const changes = suggestion.proposed_changes as ProposedChanges
    const { period } = changes

    let rotinaAm: ProtocolStep[] = protocol.rotina_am ?? []
    let rotinaPm: ProtocolStep[] = protocol.rotina_pm ?? []

    if (period === 'morning') {
      rotinaAm = applyChanges(rotinaAm, changes)
    } else if (period === 'night') {
      rotinaPm = applyChanges(rotinaPm, changes)
    } else {
      // 'both' or null
      rotinaAm = applyChanges(rotinaAm, changes)
      rotinaPm = applyChanges(rotinaPm, changes)
    }

    const now = new Date().toISOString()

    const { error: updateProtocolError } = await supabase
      .from('protocolos')
      .update({ rotina_am: rotinaAm, rotina_pm: rotinaPm, updated_at: now })
      .eq('id', protocol.id)

    if (updateProtocolError) {
      throw updateProtocolError
    }

    await supabase
      .from('coach_protocol_suggestions')
      .update({ status: 'applied', approved_at: now, applied_at: now })
      .eq('id', suggestion_id)

    return new Response(
      JSON.stringify({
        success: true,
        action: 'applied',
        protocol: {
          id: protocol.id,
          rotina_am: rotinaAm,
          rotina_pm: rotinaPm,
          updated_at: now,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('approve-coach-protocol-change: erro não tratado', error)
    return new Response(
      JSON.stringify({ error: 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
