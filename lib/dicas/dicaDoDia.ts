// ─────────────────────────────────────────────────────────────────────────────
// Dica do dia — fila numerada, uma dica por CICLO DE 24 HORAS DE USO.
// A fila anda quando a usuária abre o app e já se passaram ao menos 24 horas desde
// a última dica que ela viu — não quando o dia do calendário vira. Assim, quem
// abre às 23h50 e de novo às 00h10 NÃO pula de dica: a segunda só desbloqueia 24h
// depois da primeira ter aparecido. Dentro desse intervalo a dica não muda.
// A fila é INDIVIDUAL de cada aparelho: o índice começa em 0 (dica 1) no primeiro
// acesso, então quem começou ontem está sempre uma casa à frente de quem começou
// hoje — cada usuária tem a própria fila, deslocada pela data em que entrou.
// Estado em AsyncStorage: um índice (só cresce) + o horário em que a dica atual
// foi mostrada (em milissegundos).
// ─────────────────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CATALOGO_DICAS, Dica } from './catalogo';

const INDEX_KEY = 'dica_do_dia:index';
// Horário (ms) em que a dica atual foi mostrada. Antes guardávamos só a data civil
// ('dica_do_dia:last_day'), o que fazia a fila andar à meia-noite em vez de a cada
// 24h — a chave mudou de propósito, então usamos um nome novo. Usuárias antigas
// (sem esta chave) são tratadas como primeiro acesso: mantêm o índice que já tinham
// e apenas reiniciam o relógio de 24h a partir de agora, sem pular nem resetar.
const SHOWN_AT_KEY = 'dica_do_dia:shown_at';

const UMA_DIA_MS = 24 * 60 * 60 * 1000;

// O índice guardado é um contador que só cresce (0, 1, 2, …). A volta ao início do
// catálogo é aplicada SÓ aqui, na exibição — assim, quando o catálogo crescer, quem
// já deu a volta continua andando em vez de ficar preso no fim antigo.
export function dicaAt(index: number): Dica {
  const total = CATALOGO_DICAS.length;
  const i = ((Math.trunc(index) % total) + total) % total;
  return CATALOGO_DICAS[i];
}

// Resolve a dica de hoje, avançando UMA casa se já se passaram 24h desde a última.
// Avança no máximo uma casa por chamada, mesmo que a usuária tenha sumido por dias —
// ela sempre volta na dica seguinte à que viu, nunca vários passos adiante.
// Nunca lança: qualquer falha de leitura cai na primeira dica (nunca um card vazio).
export async function getDicaDoDia(now: Date = new Date()): Promise<Dica> {
  try {
    const agora = now.getTime();
    const [[, rawIndex], [, rawShownAt]] = await AsyncStorage.multiGet([INDEX_KEY, SHOWN_AT_KEY]);

    const parsedIndex = rawIndex == null ? NaN : parseInt(rawIndex, 10);
    let index = Number.isFinite(parsedIndex) && parsedIndex >= 0 ? parsedIndex : 0;

    const parsedShownAt = rawShownAt == null ? NaN : parseInt(rawShownAt, 10);
    const shownAt = Number.isFinite(parsedShownAt) ? parsedShownAt : null;

    if (shownAt == null) {
      // Primeiro acesso (ou usuária antiga migrando): fica na dica atual e liga o
      // relógio de 24h a partir de agora. Não incrementa.
      await AsyncStorage.setItem(SHOWN_AT_KEY, String(agora));
    } else if (agora - shownAt >= UMA_DIA_MS) {
      // Passaram-se 24h desde a última dica → anda exatamente uma casa e reinicia
      // o relógio a partir de agora (por isso não pula várias de uma vez).
      index += 1;
      await AsyncStorage.multiSet([[INDEX_KEY, String(index)], [SHOWN_AT_KEY, String(agora)]]);
    }
    // Dentro das 24h: não mexe em nada, a dica continua a mesma.

    return dicaAt(index);
  } catch {
    return CATALOGO_DICAS[0];
  }
}
