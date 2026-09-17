// Links do sistema que o expo-router NÃO deve tentar rotear.
//
// A Share Extension ("Compartilhar com o NIKS") abre o app com
// `niks-ai://dataUrl=niks-aiShareKey#…` — não é uma rota. O conteúdo é lido pelo
// `ShareIntentBridge` (app/_layout.tsx) e consumido pelo guard do (app)/_layout.
//   • cold start → '/' (index decide: sessão → home → guard; sem sessão → welcome)
//   • app aberto → null (fica na tela atual; o guard do (app) assume)
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  if (path.includes('dataUrl=')) {
    return initial ? '/' : null;
  }
  return path;
}
