-- Cortesia de boas-vindas (26/nov/2026) — rodar UMA vez, depois da migration
-- 20261228120000_boas_vindas_cortesia. Congela a lista e credita +100 a cada conta.
-- Quem: contas criadas de 12/nov até a correção (20261226120000, aplicada às 18:40 UTC de
-- 26/nov), sem `boas_vindas` nem `boas_vindas_cortesia`, com assinatura ativa (`assinante()`).
insert into public.boas_vindas_cortesia_lote (user_id, total_antes, nivel_antes, nivel_visto_antes)
select u.id, coalesce(p.total, 0), coalesce(p.nivel, 1), coalesce(p.nivel_visto, 1)
  from auth.users u
  join public.users pu on pu.id = u.id
  left join public.pontos_usuario p on p.user_id = u.id
 where u.created_at >= '2026-11-12' and u.created_at < '2026-11-26 18:40:00+00'
   and not exists (select 1 from public.pontos_eventos e where e.user_id = u.id and e.acao in ('boas_vindas', 'boas_vindas_cortesia'))
   and public.assinante(u.id)
on conflict (user_id) do nothing;

select count(*) filter (where (r ->> 'ok')::boolean) creditadas, count(*) filter (where not (r ->> 'ok')::boolean) puladas
  from (select public.boas_vindas_cortesia(l.user_id) r from public.boas_vindas_cortesia_lote l where l.creditada_em is null) x;
