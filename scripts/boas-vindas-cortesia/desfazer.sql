-- Desfaz a cortesia (scripts/boas-vindas-cortesia/creditar.sql). Só as contas do lote congelado.
-- Tira o evento, volta total e nível, e o nível visto nunca fica acima do nível. O push enviado
-- não volta.
update public.pontos_usuario p
   set total = greatest(p.total - e.pontos, 0),
       nivel = (public.nivel_de(greatest(p.total - e.pontos, 0)) ->> 'nivel')::int,
       nivel_visto = least(p.nivel_visto, (public.nivel_de(greatest(p.total - e.pontos, 0)) ->> 'nivel')::int),
       atualizado_em = now()
  from public.pontos_eventos e
  join public.boas_vindas_cortesia_lote l on l.user_id = e.user_id
 where e.acao = 'boas_vindas_cortesia' and p.user_id = e.user_id;
delete from public.pontos_eventos e using public.boas_vindas_cortesia_lote l
 where e.user_id = l.user_id and e.acao = 'boas_vindas_cortesia';
update public.boas_vindas_cortesia_lote set creditada_em = null;
