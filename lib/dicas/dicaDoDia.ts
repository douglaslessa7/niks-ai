// ─────────────────────────────────────────────────────────────────────────────
// Dica do dia — fila numerada, uma dica por DIA DE USO.
// O contador anda quando a usuária abre o app num dia diferente do último em que
// abriu — não por dia de calendário. Quem some uma semana volta na dica seguinte,
// não na sétima adiante. Dentro do mesmo dia a dica não muda.
// Estado em AsyncStorage: um índice (só cresce) + a data da última virada.
// ─────────────────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CATALOGO_DICAS, Dica } from './catalogo';

const INDEX_KEY = 'dica_do_dia:index';
const DAY_KEY = 'dica_do_dia:last_day';

// Dia CIVIL (vira à meia-noite local). Mesmo padrão de chave-por-dia do
// lib/routineProgress, mas SEM o deslocamento de −4h de lá — aquele existe para a
// sessão noturna de skincare cruzar a meia-noite; aqui o dia é o dia mesmo.
function civilDateStr(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// O índice guardado é um contador que só cresce (0, 1, 2, …). A volta ao início do
// catálogo é aplicada SÓ aqui, na exibição — assim, quando o catálogo crescer, quem
// já deu a volta continua andando em vez de ficar preso no fim antigo.
export function dicaAt(index: number): Dica {
  const total = CATALOGO_DICAS.length;
  const i = ((Math.trunc(index) % total) + total) % total;
  return CATALOGO_DICAS[i];
}

// Resolve a dica de hoje, avançando a fila se o dia virou. Nunca lança: qualquer
// falha de leitura cai na primeira dica (nunca um card vazio).
export async function getDicaDoDia(now: Date = new Date()): Promise<Dica> {
  try {
    const today = civilDateStr(now);
    const [[, rawIndex], [, lastDay]] = await AsyncStorage.multiGet([INDEX_KEY, DAY_KEY]);

    const parsed = rawIndex == null ? NaN : parseInt(rawIndex, 10);
    let index = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;

    if (lastDay !== today) {
      // Primeiro acesso de todos (sem data gravada) → fica na dica 1 e marca o dia.
      // Dia novo → anda uma casa na fila.
      if (lastDay != null) index += 1;
      await AsyncStorage.multiSet([[INDEX_KEY, String(index)], [DAY_KEY, today]]);
    }

    return dicaAt(index);
  } catch {
    return CATALOGO_DICAS[0];
  }
}
