// ─────────────────────────────────────────────────────────────────────────────
// Altura REAL da navbar global — SÓ ANDROID.
//
// ⚠️ Este arquivo só pode ser usado dentro de ramos `Platform.OS === 'android'`.
// O iOS segue com os valores fixos de sempre e não pode executar nada daqui.
//
// Por que existe: a caixa de texto do chat ficava a 100pt fixos do fundo, o que
// cabe na navbar do iPhone (~90pt) mas não na do Android com barra de 3 botões
// (~104pt, inset inferior ~48) — a navbar cobria a caixa. A navbar (no
// `(app)/_layout.tsx`) publica aqui a altura medida no `onLayout`, e o chat lê.
//
// Registro de MÓDULO, não Zustand: a navbar não pode ganhar estado nem re-render
// novo por causa disso (mesmo padrão de `lib/coachMarks.ts`).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

let height: number | null = null;
const subscribers = new Set<() => void>();

/** `onLayout` da navbar — passar SÓ no Android. */
export function reportAndroidNavBarHeight(e: LayoutChangeEvent): void {
  const h = e.nativeEvent.layout.height;
  if (height != null && Math.abs(height - h) < 0.5) return;
  height = h;
  subscribers.forEach((fn) => fn());
}

/** Altura medida da navbar, ou `null` enquanto ela não foi desenhada. */
export function useAndroidNavBarHeight(): number | null {
  const [value, setValue] = useState(height);
  useEffect(() => {
    const fn = () => setValue(height);
    subscribers.add(fn);
    fn(); // pega a medida feita antes deste componente montar
    return () => { subscribers.delete(fn); };
  }, []);
  return value;
}
