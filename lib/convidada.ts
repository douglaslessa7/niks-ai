// Convidada dos grupos (Parte B, Fase 4): o código digitado no onboarding fica no aparelho
// até a conta existir. Nada aqui libera acesso: quem decide é o servidor.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { entrarComCodigo } from './gruposServidor';

const CHAVE = 'convidada:codigo';

export type CodigoGuardado = { codigo: string; grupo: string };

export async function guardarCodigoGrupo(c: CodigoGuardado): Promise<void> {
  await AsyncStorage.setItem(CHAVE, JSON.stringify(c)).catch(() => {});
}

export async function lerCodigoGrupo(): Promise<CodigoGuardado | null> {
  try {
    const t = await AsyncStorage.getItem(CHAVE);
    const c = t ? JSON.parse(t) : null;
    return typeof c?.codigo === 'string' && typeof c?.grupo === 'string' ? c : null;
  } catch {
    return null;
  }
}

export async function limparCodigoGrupo(): Promise<void> {
  await AsyncStorage.removeItem(CHAVE).catch(() => {});
}

export type ResultadoEntrada = { grupoId: string } | { motivo: string } | null;

/** Entra no grupo do código guardado. `null` = não havia código. Sem internet, `motivo: rede`. */
export async function entrarNoGrupoGuardado(): Promise<ResultadoEntrada> {
  const c = await lerCodigoGrupo();
  if (!c) return null;
  try {
    const r = await entrarComCodigo(c.codigo);
    await limparCodigoGrupo();
    return r.ok ? { grupoId: r.grupo_id } : { motivo: r.motivo };
  } catch {
    return { motivo: 'rede' };
  }
}
