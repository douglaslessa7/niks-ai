-- Monitor (26/nov/2026): "pagou e voltou ao paywall" — mesmo aparelho, `transaction_complete`
-- seguido de `paywall_open` em até 10 minutos. Na loja, o normal é ZERO (conferido 23–26/nov:
-- 0 em 257 compras). Rodar: superwall query --file scripts/monitor/compra-paywall-volta.sql --json
-- App iOS 40128, sem sandbox, últimos 7 dias (o máximo permitido nesta tabela), por dia.
WITH ev AS (
  SELECT appUserId AS aparelho, name, ts
  FROM sw.events_rep
  WHERE applicationId = 40128 AND isSandbox = 0
    AND ts > toStartOfHour(now() - INTERVAL 7 DAY) AND ts < now()
    AND name IN ('transaction_complete', 'paywall_open')
),
compras AS (SELECT aparelho, ts AS t FROM ev WHERE name = 'transaction_complete'),
paywalls AS (SELECT aparelho, ts FROM ev WHERE name = 'paywall_open')
SELECT
  toDate(c.t, 'America/Sao_Paulo') AS dia,
  count() AS compras,
  countIf(n10 > 0) AS voltou_ao_paywall_10min,
  round(100 * countIf(n10 > 0) / count(), 1) AS pct
FROM (
  SELECT c.aparelho, c.t, countIf(p.ts > c.t AND p.ts < c.t + INTERVAL 10 MINUTE) AS n10
  FROM compras c LEFT JOIN paywalls p ON p.aparelho = c.aparelho
  GROUP BY c.aparelho, c.t
) AS c
GROUP BY dia ORDER BY dia
