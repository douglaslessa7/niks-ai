-- ─────────────────────────────────────────────────────────────────────────────
-- MEDALHAS no lugar dos nomes de nível (08/nov/2026, pedido do produto).
--
-- Saem os 11 níveis com nome ("Cara Lavada", "Hidratadinha"… "Ícone" e "Ícone II, III…").
-- Entram 13 níveis-medalha: Bronze 1–3 (1–3) · Prata 1–3 (4–6) · Ouro 1–3 (7–9) ·
-- Diamante 1–3 (10–12) · NIKS (13, o último). O desenho está no app (lib/medalhas.ts).
--
-- A CURVA (pontos para subir ao próximo): 100 · 150 · 200 · 250 · 300 · 400 · 500 · 600 · 800
-- · 1000 · 1300 · 1800 → acumulado [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3300,
-- 4300, 5600, 7400]. Fica em `cartas_config.pontos` (muda sem deploy); o app tem um espelho em
-- lib/niveis.ts (`CURVA_NIVEIS`) — mudou aqui, mude lá.
--
-- DEPOIS DO NIKS os pontos continuam somando, mas não há nível acima: `nivel_de` devolve o
-- NIKS com teto = piso e título do próximo vazio (antes vinha "Ícone II, III…").
--
-- NINGUÉM PERDE PONTOS: o `total` não muda. O `nivel` de cada conta é recalculado pela curva
-- nova, e o `nivel_visto` vai junto — a troca de curva não dispara a celebração de "subiu de
-- nível" sozinha. Em 08/nov/2026 só 1 conta tinha pontos (a de teste, 387 → Bronze 3).
--
-- Antes desta migration (para voltar): niveis [0, 90, 225, 405, 630, 945, 1350, 1800, 2385,
-- 3150, 4050], titulos ["Cara Lavada", "Hidratadinha", "Inimiga da Espinha", "Sem Filtro",
-- "Pele de Pêssego", "Pele de Rica", "Pele de Novela", "Glass Skin", "Inveja das Amigas",
-- "Pele que Humilha", "Ícone"], e a `nivel_de` da 20261103130000_niks_points_motor.sql.
-- ─────────────────────────────────────────────────────────────────────────────

update public.cartas_config
   set pontos = pontos
         || jsonb_build_object(
              'niveis',  '[0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3300, 4300, 5600, 7400]'::jsonb,
              'titulos', '["Bronze 1", "Bronze 2", "Bronze 3", "Prata 1", "Prata 2", "Prata 3", "Ouro 1", "Ouro 2", "Ouro 3", "Diamante 1", "Diamante 2", "Diamante 3", "NIKS"]'::jsonb),
       atualizado_em = now()
 where id = 1;

-- Nível de um total: o último nível (NIKS) não tem "próximo".
create or replace function public.nivel_de(p_total integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg jsonb;
  niv integer[];
  tit text[];
  qtd integer;
  n integer := 1;
  i integer;
begin
  select pontos into cfg from public.cartas_config where id = 1;
  select array_agg(x::int order by o) into niv from jsonb_array_elements_text(cfg -> 'niveis') with ordinality t(x, o);
  select array_agg(x order by o) into tit from jsonb_array_elements_text(cfg -> 'titulos') with ordinality t(x, o);
  qtd := array_length(niv, 1);
  for i in 1..qtd loop
    if coalesce(p_total, 0) >= niv[i] then n := i; end if;
  end loop;

  if n < qtd then
    return jsonb_build_object('nivel', n, 'titulo', tit[n], 'piso', niv[n], 'teto', niv[n + 1], 'titulo_proximo', tit[n + 1]);
  end if;
  return jsonb_build_object('nivel', qtd, 'titulo', tit[qtd], 'piso', niv[qtd], 'teto', niv[qtd], 'titulo_proximo', '');
end;
$$;

revoke all on function public.nivel_de(integer) from public, anon, authenticated;
grant execute on function public.nivel_de(integer) to service_role;

-- Quem já tem pontos: o nível pela curva nova; o "já viu" junto (sem celebração falsa).
update public.pontos_usuario
   set nivel = (public.nivel_de(total) ->> 'nivel')::int,
       nivel_visto = (public.nivel_de(total) ->> 'nivel')::int,
       atualizado_em = now()
 where nivel is distinct from (public.nivel_de(total) ->> 'nivel')::int
    or nivel_visto is distinct from (public.nivel_de(total) ->> 'nivel')::int;
