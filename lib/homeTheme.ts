// ─────────────────────────────────────────────────────────────────────────────
// Fundo das telas na identidade da home (design 38e de dia / 38f de noite) —
// FONTE ÚNICA. Usado pela home, por "Seu progresso" e pelo alarme da rotina.
// A partir das 18h (período "pm" da rotina, até as 04:00) as telas viram noturnas:
// muda o degradê, a bolha de cor e o fundo do cabeçalho rolado.
// ─────────────────────────────────────────────────────────────────────────────
import { getRoutinePeriodForNow } from './routineProgress';

/** BG7 do design (dia). */
export const BG_DAY = ['#FFE3EF', '#FFD3E5', '#FFC6DC', '#FDDFEB', '#FBEEF3', '#F9F2F5'] as const;
/** BGN do design (noite). */
export const BG_NIGHT = ['#EADCF4', '#F0D9EE', '#F6D3E5', '#F9E3EE', '#FBEFF4', '#F9F3F6'] as const;
export const BG_STOPS = [0, 0.28, 0.5, 0.64, 0.8, 1] as const;

/** true das 18:00 às 03:59 — mesma régua da rotina. */
export function isNightTheme(now: Date = new Date()): boolean {
  return getRoutinePeriodForNow(now) === 'pm';
}

/** `dayBlob`: a bolha de dia varia por design (home .45; progresso e alarme .40). */
export function homeTheme(night: boolean, dayBlob = 'rgba(255,226,236,0.45)') {
  return {
    bg: night ? BG_NIGHT : BG_DAY,
    /** Cor de fundo sólida por trás do degradê (última parada). */
    base: night ? BG_NIGHT[BG_NIGHT.length - 1] : BG_DAY[BG_DAY.length - 1],
    /** Bolha de cor do canto superior direito. */
    blob: night ? 'rgba(232,214,246,0.5)' : dayBlob,
    /** Fundo do cabeçalho fixo depois de rolar. */
    header: night ? 'rgba(234,218,244,0.94)' : 'rgba(255,214,231,0.94)',
  };
}
