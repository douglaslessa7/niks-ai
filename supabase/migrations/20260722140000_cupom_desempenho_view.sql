-- View de consulta: quantas aplicações e quantas conversões cada cupom teve.
--
-- Calculada DIRETO de cupom_aplicacoes (fonte da verdade), então também serve de
-- conferência contra os contadores de `cupons` (total_aplicacoes/total_assinaturas).
-- Consulte no dashboard do Supabase (SQL editor):  select * from cupom_desempenho;
--
-- security_invoker = true: a view respeita a RLS das tabelas de base. Como cupons e
-- cupom_aplicacoes não têm nenhuma policy, o app (anon/authenticated) não lê nada por
-- aqui; só o service role / SQL editor do dashboard enxerga. Sem brecha de leitura.

create or replace view public.cupom_desempenho
with (security_invoker = true) as
select
  c.codigo,
  c.influenciadora,
  c.ativo,
  count(a.id)                                                as aplicacoes,
  count(a.id) filter (where a.converteu)                     as conversoes,
  count(a.id) filter (where a.converteu and a.user_id is not null) as conversoes_com_conta,
  case when count(a.id) > 0
       then round(100.0 * count(a.id) filter (where a.converteu) / count(a.id), 1)
       else 0 end                                            as taxa_conversao_pct
from public.cupons c
left join public.cupom_aplicacoes a on a.cupom_id = c.id
group by c.id, c.codigo, c.influenciadora, c.ativo
order by conversoes desc, aplicacoes desc;

-- Defesa em profundidade: nega leitura ao app mesmo se algum default privilege liberasse.
revoke all on public.cupom_desempenho from anon, authenticated;
