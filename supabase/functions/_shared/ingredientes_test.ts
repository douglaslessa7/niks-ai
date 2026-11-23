import { assert, assertEquals } from 'jsr:@std/assert@1'
import { chaveProduto, conferirLista, escolherLinha, paraInci, semelhanca, tipoDaFonte } from './ingredientes.ts'

const INCI = ['Aqua', 'Glycerin', 'Niacinamide', 'Salicylic Acid', 'Butylene Glycol', 'Sodium Hydroxide', 'Phenoxyethanol']

Deno.test('chave: grafias diferentes da mesma marca e tamanho caem na mesma linha', () => {
  assertEquals(chaveProduto('Creamy Skincare', 'Ácido Salicílico 2% (30ml)').chave, chaveProduto('creamy', 'acido salicilico 2% 30 ml').chave)
  assertEquals(chaveProduto('La Roche-Posay', 'Anthelios SPF 60').chave, 'la roche posay|anthelios fps60')
  assertEquals(chaveProduto('CeraVe', 'CeraVe Gel de Limpeza').nome_norm, 'gel de limpeza')
})

Deno.test('tipo da fonte vem do domínio', () => {
  assertEquals(tipoDaFonte('https://incidecoder.com/products/x', 'Creamy'), 'base_inci')
  assertEquals(tipoDaFonte('https://www.creamy.com.br/x', 'Creamy'), 'site_oficial')
  assertEquals(tipoDaFonte('https://www.laroche-posay.com.br/x', 'La Roche-Posay'), 'site_oficial')
  assertEquals(tipoDaFonte('https://inkeedecoder.com/products/x', 'Creamy'), 'loja')
  assertEquals(tipoDaFonte('https://www.ulta.com/p/x', 'SKIN1004'), 'loja')
})

Deno.test('lista do mesmo produto, página lida, site do Brasil: passa', () => {
  const r = conferirLista({ marca: 'Creamy', nome: 'Ácido Salicílico 2%', nome_na_fonte: 'Creamy Ácido Salicílico', fonte_url: 'https://creamy.com.br/acido-salicilico', inci: INCI, concentracoes: [{ ingrediente: 'Salicylic Acid', valor: '2%' }] }, ['https://www.creamy.com.br/acido-salicilico/'])
  assert(r.passou, JSON.stringify(r.conferencias))
})

Deno.test('URL não lida de verdade reprova', () => {
  const r = conferirLista({ marca: 'Creamy', nome: 'Ácido Salicílico', nome_na_fonte: 'Creamy Ácido Salicílico', fonte_url: 'https://creamy.com.br/acido-salicilico', inci: INCI }, [])
  assert(!r.passou && !r.conferencias.url_lida)
})

Deno.test('versão de outro país reprova (.ca, .co; CeraVe "EUA")', () => {
  for (const url of ['https://www.laroche-posay.ca/x', 'https://www.laroche-posay.co/x']) {
    const r = conferirLista({ marca: 'La Roche-Posay', nome: 'X', nome_na_fonte: 'X', fonte_url: url, inci: INCI }, [url])
    assert(!r.conferencias.versao, url)
  }
  const r = conferirLista({ marca: 'CeraVe', nome: 'Foaming Cleanser', nome_na_fonte: 'CeraVe Foaming Cleanser', fonte_url: 'https://incidecoder.com/products/cerave-foaming', pais_versao: 'EUA', inci: INCI }, ['https://incidecoder.com/products/cerave-foaming'])
  assert(!r.conferencias.versao)
})

Deno.test('coreana no site americano: aceita, menos versão exclusiva dos EUA e protetor solar', () => {
  const u = 'https://medicube.us/products/zero-pore-toner'
  assert(conferirLista({ marca: 'Medicube', nome: 'Zero Pore Toner', nome_na_fonte: 'medicube Zero Pore Toner', fonte_url: u, pais_versao: 'EUA', inci: INCI }, [u]).conferencias.versao)
  const ex = 'https://medicube.us/products/collagen-glow-bubble-serum'
  assert(!conferirLista({ marca: 'Medicube', nome: 'Collagen Glow Bubble Serum', nome_na_fonte: '[US ONLY] Collagen Glow Bubble Serum', fonte_url: ex, inci: INCI }, [ex]).conferencias.versao)
  const sol = 'https://cosrx.us/products/aloe-sun-cream'
  assert(!conferirLista({ marca: 'COSRX', nome: 'Aloe Soothing Sun Cream SPF50', nome_na_fonte: 'Aloe Soothing Sun Cream SPF50', fonte_url: sol, inci: INCI }, [sol]).conferencias.versao)
})

Deno.test('a palavra "usa" (verbo) na observação não é EUA; site .com.br em português passa', () => {
  const u = 'https://www.cerave.com.br/todos-os-produtos/locao-de-limpeza-hidratante'
  const pt = ['ÁGUA', 'GLICEROL', 'ÁLCOOL CETOESTEARÍLICO', 'FENOXIETANOL', 'NICOTINAMIDA', 'CERAMIDA NP', 'HIALURONATO DE SÓDIO']
  const r = conferirLista({ marca: 'CeraVe', nome: 'Loção de Limpeza Hidratante', nome_na_fonte: 'Loção de Limpeza Hidratante', fonte_url: u, pais_versao: 'Brasil', observacao: 'A mesma sequência aparece na base Dermaclub, que também usa nomes em português.', inci: pt }, [u], ['niacinamida', 'ceramidas', 'acido_hialuronico'])
  assert(r.passou, JSON.stringify(r.conferencias))
  assertEquals(paraInci('ÁLCOOL CETOESTEARÍLICO'), 'Cetearyl Alcohol')
  assertEquals(paraInci('CERAMIDA NP'), 'Ceramide NP')
  // Em português fora de site oficial brasileiro continua reprovando.
  const b = conferirLista({ marca: 'CeraVe', nome: 'Loção de Limpeza Hidratante', nome_na_fonte: 'CeraVe Loção de Limpeza Hidratante', fonte_url: 'https://incidecoder.com/products/a', inci: pt }, ['https://incidecoder.com/products/a'])
  assert(!b.conferencias.inci)
})

Deno.test('ativo do nome que não está na lista reprova (produto errado)', () => {
  const r = conferirLista({ marca: 'Creamy', nome: 'Retinol 0,3%', nome_na_fonte: 'Creamy Retinol', fonte_url: 'https://incidecoder.com/products/creamy-retinol', inci: INCI }, ['https://incidecoder.com/products/creamy-retinol'])
  assert(!r.conferencias.ativos)
})

Deno.test('nomes em português e lista curta reprovam', () => {
  const pt = ['Água', 'Glicerina', 'Ácido Salicílico', 'Extrato de Aloe', 'Niacinamide', 'Phenoxyethanol']
  const r = conferirLista({ marca: 'Creamy', nome: 'Ácido Salicílico', nome_na_fonte: 'Creamy Ácido Salicílico', fonte_url: 'https://incidecoder.com/products/a', inci: pt }, ['https://incidecoder.com/products/a'])
  assert(!r.conferencias.inci)
  const c = conferirLista({ marca: 'Creamy', nome: 'Ácido Salicílico', nome_na_fonte: 'Creamy Ácido Salicílico', fonte_url: 'https://incidecoder.com/products/a', inci: ['Aqua', 'Salicylic Acid'] }, ['https://incidecoder.com/products/a'])
  assert(!c.conferencias.tamanho)
})

Deno.test('nome: ativo em inglês na fonte conta; FPS diferente reprova', () => {
  const a = conferirLista({ marca: 'La Roche-Posay', nome: 'Effaclar Adapaleno', nome_na_fonte: 'La Roche-Posay Effaclar Adapalene Gel', fonte_url: 'https://incidecoder.com/products/lrp-effaclar-adapalene', inci: ['Aqua', 'Adapalene', 'Carbomer', 'Glycerin', 'Poloxamer 182'] }, ['https://incidecoder.com/products/lrp-effaclar-adapalene'])
  assert(a.conferencias.nome, JSON.stringify(a.conferencias.detalhes))
  const b = conferirLista({ marca: 'La Roche-Posay', nome: 'Anthelios FPS 70', nome_na_fonte: 'Anthelios FPS 50', fonte_url: 'https://incidecoder.com/products/anthelios-50', inci: INCI }, ['https://incidecoder.com/products/anthelios-50'])
  assert(!b.conferencias.nome)
})

Deno.test('nome com descrição do ativo e concentração (Azelan 150 mg/g ácido azelaico gel) passa se o ativo está na lista', () => {
  assertEquals(chaveProduto('Bayer', 'Azelan 150 mg/g ácido azelaico gel').nome_norm, 'azelan acido azelaico gel')
  const u = 'https://skinsort.com/products/bayer/azelan-gel'
  const inci = ['Azelaic Acid', 'Propylene Glycol', 'Polysorbate 80', 'Lecithin', 'Carbomer', 'Water']
  assert(conferirLista({ marca: 'Bayer', nome: 'Azelan 150 mg/g ácido azelaico gel', nome_na_fonte: 'Bayer Azelan Gel', fonte_url: u, inci }, [u]).conferencias.nome)
  // Sem o ativo na lista, a conferência de ativos reprova (e a lista não entra).
  const r = conferirLista({ marca: 'Bayer', nome: 'Azelan 150 mg/g ácido azelaico gel', nome_na_fonte: 'Bayer Azelan Gel', fonte_url: u, inci: inci.slice(1) }, [u])
  assert(!r.conferencias.ativos && !r.passou)
})

Deno.test('casamento v2: palavras descritivas não atrapalham (Neutrogena Sun Fresh)', () => {
  const tabela = 'sun fresh derm care fps70'
  for (const lido of ['Sun Fresh Derm Care FPS 70 Protetor Solar Facial', 'Sun Fresh Derm Care FPS 70 Protetor Solar Facial Sem Cor (pele mista a oleosa)', 'Sun Fresh Derm Care FPS 70 Protetor Solar Facial Sem Cor']) {
    assertEquals(semelhanca(lido, tabela), 1, lido)
  }
})

Deno.test('casamento v2: o que diferencia continua diferenciando', () => {
  // versão
  assertEquals(semelhanca('Zero Pore Pad Mild', 'zero pore pad'), 0)
  assertEquals(semelhanca('Zero Pore Pad', 'zero pore pads'), 1)
  // FPS
  assertEquals(semelhanca('Anthelios XL Protect FPS 50', 'anthelios xl protect fps60'), 0)
  // cor: os dois dizem e discordam
  assertEquals(semelhanca('Sun Fresh Derm Care FPS 70 Com Cor', 'Sun Fresh Derm Care FPS 70 Sem Cor'), 0)
  assertEquals(semelhanca('Sun Fresh Derm Care FPS 70 – Pele Clara (com cor)', 'Sun Fresh Derm Care FPS 70 sem cor'), 0)
  // forma: gel × creme da mesma linha
  assertEquals(semelhanca('Effaclar Duo Gel', 'effaclar duo creme'), 0)
  // concentração
  assertEquals(semelhanca('Niacinamide 10% + Zinc 1%', 'niacinamide 5%'), 0)
})

Deno.test('casamento v2: escolherLinha acha a linha certa e respeita a versão', () => {
  const l = (nome_norm: string) => ({ chave: `m|${nome_norm}`, marca: 'M', nome: nome_norm, nome_norm, inci: ['a'], fonte: 'site_oficial', fonte_url: null, confianca: 'media', status: 'ok' })
  const linhas = [l('sun fresh derm care fps70'), l('zero pore pad'), l('zero pore pad mild')]
  assertEquals(escolherLinha('Sun Fresh Derm Care FPS 70 Protetor Solar Facial Sem Cor', linhas, 'm|x')?.linha.nome_norm, 'sun fresh derm care fps70')
  assertEquals(escolherLinha('Zero Pore Pad Mild Toner Pads', linhas, 'm|y')?.linha.nome_norm, 'zero pore pad mild')
  assertEquals(escolherLinha('Zero Pore Pad Intense', linhas, 'm|z'), null)
})

Deno.test('casamento v2: linha sem forma no nome usa a forma da fonte (Glycare Control = gel de limpeza)', () => {
  const gl = { chave: 'mantecorp|glycare control', marca: 'Mantecorp', nome: 'Glycare Control', nome_norm: 'glycare control', inci: ['a'], fonte: 'base_inci', fonte_url: 'https://incidecoder.com/products/mantecorp-gel-limpeza-suave-mantecorp-skincare-glycare-control', confianca: 'media', status: 'ok' }
  assertEquals(escolherLinha('Glycare Control Sérum', [gl], 'x'), null)
  assertEquals(escolherLinha('Glycare Control Gel de Limpeza', [gl], 'x')?.linha.chave, 'mantecorp|glycare control')
})
