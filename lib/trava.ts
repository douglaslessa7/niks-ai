// Cadeados da convidada (Parte B, Fase 5): tocar abre o aviso com a frase da função.
import { create } from 'zustand';

export const FRASES = {
  rotina: 'Assine para ter sua rotina feita pela IA',
  skincare: 'Assine para seguir sua rotina passo a passo',
  produtos: 'Assine para analisar seus produtos com a IA',
  chat: 'Assine para conversar com a NIKS',
  scan: 'Assine para acompanhar a evolução da sua pele',
  espinha: 'Assine para cuidar das suas espinhas com a IA',
  compatibilidade: 'Assine para ver se esse produto combina com você',
  calendario: 'Assine para ver o histórico da sua rotina',
  carta: 'Assine para ter tudo no NIKS',
} as const;

export const useTrava = create<{ frase: string | null; funcao: string | null; abrirPaywall: number }>(() => ({ frase: null, funcao: null, abrirPaywall: 0 }));

export function abrirTrava(funcao: keyof typeof FRASES) {
  useTrava.setState({ frase: FRASES[funcao], funcao });
}
export const fecharTrava = () => useTrava.setState({ frase: null, funcao: null });
/** Abre direto o paywall da convidada (botão "Assinar o NIKS" do Perfil). */
export const abrirPaywallConvidada = () => useTrava.setState((s) => ({ abrirPaywall: s.abrirPaywall + 1 }));
