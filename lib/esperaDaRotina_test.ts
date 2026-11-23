// Testes da espera da rotina (Deno): deno test --no-lock lib/esperaDaRotina_test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { comTeto, esperarRotina, fetchComTeto } from './esperaDaRotina.ts';

const pendurada = () => new Promise<never>(() => {});
const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.test('tentativa pendurada para sempre: abandona, tenta de novo e segue para o app', async () => {
  let abandonos = 0, tentativas = 0;
  const r = await esperarRotina({ tentar: () => { tentativas++; return pendurada(); }, abandonar: () => { abandonos++; }, tetoMs: 30 });
  assertEquals(r.fim, 'adiada');
  assertEquals(tentativas, 2);
  assertEquals(abandonos, 2);
  assertEquals(r.motivos, ['teto', 'teto']);
});

Deno.test('1ª pendura, 2ª termina: fica pronta sem ir ao app antes', async () => {
  let n = 0;
  const r = await esperarRotina({ tentar: () => (++n === 1 ? pendurada() : Promise.resolve({ status: 'ok' as const })), abandonar: () => {}, tetoMs: 30 });
  assertEquals(r.fim, 'ok');
  assertEquals(r.tentativas, 2);
});

Deno.test('falha (sem estourar) duas vezes: segue para o app, sem abandonar nada', async () => {
  let abandonos = 0;
  const r = await esperarRotina({ tentar: () => Promise.resolve({ status: 'falhou' as const }), abandonar: () => { abandonos++; }, tetoMs: 30 });
  assertEquals(r.fim, 'adiada');
  assertEquals(abandonos, 0);
  assertEquals(r.motivos, ['falhou', 'falhou']);
});

Deno.test('erro lançado conta como falha', async () => {
  const r = await esperarRotina({ tentar: () => Promise.reject(new Error('rede')), abandonar: () => {}, tetoMs: 30 });
  assertEquals(r.fim, 'adiada');
  assertEquals(r.motivos, ['erro', 'erro']);
});

Deno.test('sem sessão: para na hora (a abertura decide)', async () => {
  let n = 0;
  const r = await esperarRotina({ tentar: () => { n++; return Promise.resolve({ status: 'sem_sessao' as const }); }, abandonar: () => {}, tetoMs: 30 });
  assertEquals(r.fim, 'sem_sessao');
  assertEquals(n, 1);
});

Deno.test('tudo certo na 1ª: uma tentativa só', async () => {
  const r = await esperarRotina({ tentar: async () => { await dorme(5); return { status: 'ok' as const }; }, abandonar: () => {}, tetoMs: 200 });
  assertEquals(r, { fim: 'ok', tentativas: 1, motivos: [] });
});

Deno.test('comTeto: rejeita com o motivo; resolve se der tempo', async () => {
  let erro = '';
  try { await comTeto(pendurada(), 20, 'teto'); } catch (e) { erro = (e as Error).message; }
  assertEquals(erro, 'teto');
  assertEquals(await comTeto(Promise.resolve(7), 50), 7);
});

Deno.test('fetchComTeto: cancela a requisição que passa do limite', async () => {
  const srv = Deno.serve({ port: 0, onListen: () => {} }, async () => { await dorme(500); return new Response('tarde'); });
  const url = `http://localhost:${srv.addr.port}/`;
  let abortou = false;
  const t0 = Date.now();
  try { await fetchComTeto(url, {}, 60); } catch (e) { abortou = (e as Error).name === 'AbortError'; }
  assert(abortou, 'deveria abortar');
  assert(Date.now() - t0 < 400, 'não esperou o servidor');
  await srv.shutdown();
});
