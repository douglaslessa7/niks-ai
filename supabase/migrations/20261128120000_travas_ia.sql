-- Parte B (convidada) · Fase 8 — limite por IP nas funções de IA abertas e versão mínima.

alter table public.grupos_config add column if not exists versao_minima text;

-- Janela de 1 hora na mesma tabela do limite de códigos.
create or replace function public.limite_por_ip(p_chave text, p_limite integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  j timestamptz := date_trunc('hour', now());
  total integer;
begin
  delete from public.codigo_tentativas where janela < now() - interval '1 day';
  insert into public.codigo_tentativas (chave, janela) values (p_chave, j)
  on conflict (chave, janela) do update set n = public.codigo_tentativas.n + 1
  returning n into total;
  return total <= p_limite;
end;
$$;

revoke all on function public.limite_por_ip(text, integer) from public, anon, authenticated;
grant execute on function public.limite_por_ip(text, integer) to service_role;
