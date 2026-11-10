// Sinal "comprou ou restaurou nesta sessão" (ver `lib/regraCompra.ts`). Gravado SÓ pelo paywall
// (`paywall-soft` e o paywall da convidada) depois de o Superwall devolver purchased/restored e
// o premium ser confirmado. Lido pelo cadastro e pelas boas-vindas. Fica no aparelho por até
// 24 h para sobreviver ao app fechar entre pagar e criar a conta (mesmo prazo do registro de
// compra pendente); o cadastro concluído e o logout apagam.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OrigemCompra } from './regraCompra';

const CHAVE = 'compra_nesta_sessao_v1';
const VALIDADE_MS = 24 * 60 * 60 * 1000;
let memoria: { origem: OrigemCompra; em: number } | null = null;

export async function marcarCompraNestaSessao(origem: OrigemCompra): Promise<void> {
  memoria = { origem, em: Date.now() };
  try { await AsyncStorage.setItem(CHAVE, JSON.stringify(memoria)); } catch {}
}

export async function lerCompraNestaSessao(): Promise<OrigemCompra | null> {
  let s = memoria;
  if (!s) {
    try {
      const bruto = await AsyncStorage.getItem(CHAVE);
      s = bruto ? JSON.parse(bruto) : null;
    } catch {
      s = null;
    }
  }
  if (!s || (s.origem !== 'compra' && s.origem !== 'restaurar') || Date.now() - s.em > VALIDADE_MS) return null;
  memoria = s;
  return s.origem;
}

export async function limparCompraNestaSessao(): Promise<void> {
  memoria = null;
  try { await AsyncStorage.removeItem(CHAVE); } catch {}
}
