import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// Link do convite de grupo (Parte A da fase 3): https://…/functions/v1/convite?t=<token>
// É HTTPS para ser clicável no WhatsApp/Instagram. Só redireciona (302) para o app:
// niks-ai://convite/<token> — o Safari pergunta "Abrir no NIKS?" e o app valida o token
// no servidor (função `grupos`). Não lê nem grava nada: sem banco, sem JWT.
// Sem o app instalado o Safari mostra "endereço inválido" — a mensagem do convite traz a
// linha da App Store. Universal links / instalação (Paywallo, Branch ou domínio) = Parte B.

const TOKEN = /^[A-Za-z0-9_-]{16,64}$/

serve((req) => {
  const t = new URL(req.url).searchParams.get('t') ?? ''
  if (!TOKEN.test(t)) {
    return new Response('Convite inválido.', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
  return new Response(null, {
    status: 302,
    headers: { Location: `niks-ai://convite/${t}`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  })
})
