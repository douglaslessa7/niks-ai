// ─────────────────────────────────────────────────────────────────────────────
// Produtos salvos na rotina — fonte de verdade COMPARTILHADA entre a tela de
// Recomendação de Produtos (onde a usuária toca "Salvar na minha rotina") e a
// tela de Rotina/Protocolo (onde a foto do produto salvo substitui o ícone do
// passo). Guardado em AsyncStorage, indexado pelo NOME normalizado do passo —
// que é o mesmo `name` do passo da rotina (protocolos.rotina_am/pm) tanto na
// recomendação (campo `passo`) quanto no protocolo (Step.title).
// ─────────────────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SavedProduct = {
  imageUrl: string;      // URL da imagem do produto (catálogo `produtos.imagem_url`)
  brand?: string | null;
  name?: string | null;
};

const KEY = 'saved_routine_products_v1';

// Chave estável de um passo: minúsculas, sem acento, espaços colapsados.
// Precisa ser idêntica nos dois lados (salvar e ler) — por isso mora aqui.
export function normStepKey(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '') // remove acentos
    .replace(/\s+/g, ' ')
    .trim();
}

export async function getSavedProducts(): Promise<Record<string, SavedProduct>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

// Salva (ou substitui) o produto escolhido para um passo da rotina.
export async function saveProductForStep(stepName: string, product: SavedProduct): Promise<void> {
  try {
    const cur = await getSavedProducts();
    cur[normStepKey(stepName)] = product;
    await AsyncStorage.setItem(KEY, JSON.stringify(cur));
  } catch {
    // best-effort — nunca deve quebrar a UI
  }
}
