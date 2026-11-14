-- Conta de teste vale como assinante sempre (13/nov/2026, pedido do produto).
--
-- Contas da tabela `contas_teste` (hoje só a do dono, felipeesteves188@icloud.com) passam a
-- valer como assinantes sem depender de compra. Motivo: no TestFlight todas as contas de teste
-- usam a mesma assinatura de teste da Apple, que só pode ficar ligada a UMA conta do NIKS; a
-- conta do dono caía no paywall e a compra/restauração não a destravava (o StoreKit do iPhone
-- não devolvia a assinatura que a própria Apple dizia existir).
--
-- Só a última condição é nova; o resto é a `assinante()` de produção de 13/nov/2026, sem mudança.
-- Contas fora de `contas_teste`: resultado idêntico. Tirar a conta da tabela desfaz o efeito
-- para ela. Volta completa: ~/Developer/niks-ai-backups/2026-11-13_conta_teste_assinante/VOLTA.sql

create or replace function public.assinante(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.assinaturas_loja a
     where a.user_id = p_uid
       and a.status in ('ativa', 'cancelada', 'problema_cobranca')
       and a.expira_em > now()
       and (coalesce(a.ambiente, 'PRODUCTION') <> 'SANDBOX'
            or a.comprovada_por = p_uid
            or exists (select 1 from public.cartas_config c where c.id = 1 and p_uid = any(c.testers)))
  )
  or exists (select 1 from public.contas_teste t where t.user_id = p_uid);
$$;
