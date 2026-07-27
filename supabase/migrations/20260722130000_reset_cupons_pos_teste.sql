-- Reparo pós-teste: deixa MAISENA10 e TESTE10 zerados para o lançamento real.
--
-- Ao validar a Edge Function `validar-cupom` em produção, foram inseridas algumas
-- aplicações de teste (rc_app_user_id = '$RCAnonymousID:teste-A/B/C'), que subiram os
-- contadores de MAISENA10 e TESTE10. Esta migration remove essas linhas e zera os
-- contadores desses dois cupons, para a atribuição às influenciadoras começar limpa.
--
-- Idempotente: em qualquer ambiente onde essas linhas de teste não existam, o DELETE
-- não casa nada e os UPDATEs deixam os contadores em 0 (o valor de seed). O TESTELIMITE
-- é intencionalmente preservado (total_aplicacoes = 1) para continuar testando o motivo
-- 'limite_atingido' no simulador.

delete from public.cupom_aplicacoes
where rc_app_user_id like '$RCAnonymousID:teste-%';

update public.cupons
set total_aplicacoes = 0, total_assinaturas = 0
where codigo in ('MAISENA10', 'TESTE10');
