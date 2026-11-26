-- ─────────────────────────────────────────────────────────────────────────────
-- Aviso da cortesia de boas-vindas no app (26/nov/2026, próxima build).
--
-- A cortesia (20261228120000) creditou +100 a quem assinou de 12 a 26/nov e não recebeu as
-- boas-vindas. O app mostra UMA vez o aviso "Seus 100 NIKS Points chegaram ✨"
-- (components/AvisoCortesia.tsx). A tabela `boas_vindas_cortesia_lote` não tem política para
-- o app (RLS sem policy), então ele lê e marca por estas duas funções, sempre da própria conta
-- (`auth.uid()`):
--   • `minha_cortesia()` → `{ pontos, vista }` (null = não recebeu a cortesia);
--   • `marcar_cortesia_vista()` → grava `vista_em` (uma vez; repetir não muda nada).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.minha_cortesia()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('pontos', coalesce(e.pontos, 100), 'vista', l.vista_em is not null)
    from public.boas_vindas_cortesia_lote l
    left join public.pontos_eventos e on e.user_id = l.user_id and e.acao = 'boas_vindas_cortesia'
   where l.user_id = auth.uid() and l.creditada_em is not null
   limit 1
$$;

create or replace function public.marcar_cortesia_vista()
returns void
language sql
security definer
set search_path = public
as $$
  update public.boas_vindas_cortesia_lote
     set vista_em = now()
   where user_id = auth.uid() and vista_em is null
$$;

revoke all on function public.minha_cortesia() from public, anon;
revoke all on function public.marcar_cortesia_vista() from public, anon;
grant execute on function public.minha_cortesia() to authenticated;
grant execute on function public.marcar_cortesia_vista() to authenticated;
