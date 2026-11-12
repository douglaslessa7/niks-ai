// ─────────────────────────────────────────────────────────────────────────────
// Estatísticas do skincare no check-in (12/nov/2026, build 1.62; servidor: migration
// 20261205120000). O check-in que sai do "Iniciar skincare" leva o tempo, os passos e os
// produtos daquele skincare (sem NIKS Points). Três peças, no visual das telas de grupo:
//   • `BlocoEstatisticas` — card branco: tempo · passos · produtos e a lista dos passos com o
//     produto de cada um. Na prévia depois da foto (`(app)/checkin`) e no detalhe do check-in.
//   • `MiniaturasProdutos` — a fileira de fotos dos produtos do card do mural (`(app)/grupo`).
//   • `resumoEstatisticas` / `tituloEstatisticas` — "12 min · 4 passos · 3 produtos" e
//     "Skincare noturno".
// Check-in antigo (sem `estatisticas`) continua com o título/descrição de sempre.
// ─────────────────────────────────────────────────────────────────────────────
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import StepIcon from '../rotina/StepIcon';
import { tipoDoPasso } from '../../lib/tipoPasso';
import { duracaoPorExtenso } from '../../lib/sessaoSkincare';
import type { EstatisticasCheckin } from '../../lib/gruposServidor';

const INK = '#121212';
const MUTE = '#818181';

/** "12 min · 4 passos · 3 produtos" (o que faltar fica de fora). */
export function resumoEstatisticas(e: EstatisticasCheckin): string {
  const passos = e.n_passos ?? e.passos?.length ?? 0;
  const produtos = e.n_produtos ?? (e.passos ?? []).filter((p) => p.marca || p.produto).length;
  return [
    e.duracao_s != null ? duracaoPorExtenso(e.duracao_s * 1000) : null,
    passos ? `${passos} ${passos === 1 ? 'passo' : 'passos'}` : null,
    produtos ? `${produtos} ${produtos === 1 ? 'produto' : 'produtos'}` : null,
  ].filter(Boolean).join(' · ');
}

/** O título que ela escreveu; sem título (o servidor devolve "Rotina da manhã/noite"), o do skincare. */
export const tituloEstatisticas = (e: EstatisticasCheckin, rotina: 'am' | 'pm' | null, titulo?: string | null) =>
  (titulo && !/^Rotina da (manhã|noite)$/.test(titulo.trim()) ? titulo
    : (e.periodo ?? rotina) === 'am' ? 'Skincare matinal' : 'Skincare noturno');

/** Fileira de miniaturas dos produtos (mural). Mostra até `max`; o resto vira "+N". */
export function MiniaturasProdutos({ est, max = 5, tamanho = 30 }: { est: EstatisticasCheckin; max?: number; tamanho?: number }) {
  const comFoto = (est.passos ?? []).filter((p) => p.img?.url);
  if (!comFoto.length) return null;
  const vis = comFoto.slice(0, comFoto.length > max ? max - 1 : max);
  const resto = comFoto.length - vis.length;
  const caixa = { width: tamanho, height: tamanho, borderRadius: tamanho * 0.3 };
  return (
    <View style={styles.minis}>
      {vis.map((p, i) => (
        <View key={i} style={[styles.mini, caixa]}>
          <Image source={{ uri: p.img!.url }} cachePolicy="memory-disk" contentFit="contain" style={{ width: tamanho - 6, height: tamanho - 6 }} />
        </View>
      ))}
      {resto > 0 && (
        <View style={[styles.mini, caixa, { backgroundColor: '#FFE6F1' }]}>
          <Text style={styles.miniMais}>{`+${resto}`}</Text>
        </View>
      )}
    </View>
  );
}

function Numero({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <View style={styles.num}>
      <Text style={styles.numV} numberOfLines={1} adjustsFontSizeToFit>{valor}</Text>
      <Text style={styles.numR}>{rotulo}</Text>
    </View>
  );
}

/** Tempo, passos e produtos + a lista dos passos com os produtos. */
export function BlocoEstatisticas({ est }: { est: EstatisticasCheckin }) {
  const passos = est.passos ?? [];
  const nPassos = est.n_passos ?? passos.length;
  const nProd = est.n_produtos ?? passos.filter((p) => p.marca || p.produto).length;
  const min = est.duracao_s != null ? Math.round(est.duracao_s / 60) : null;
  const tempo = min == null ? null : min < 1 ? { v: '<1', r: 'minuto' } : min < 60 ? { v: String(min), r: min === 1 ? 'minuto' : 'minutos' } : { v: `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`, r: 'de skincare' };
  return (
    <View style={styles.card}>
      <View style={styles.nums}>
        {tempo && <Numero valor={tempo.v} rotulo={tempo.r} />}
        {tempo && <View style={styles.numSep} />}
        <Numero valor={String(nPassos)} rotulo={nPassos === 1 ? 'passo' : 'passos'} />
        <View style={styles.numSep} />
        <Numero valor={String(nProd)} rotulo={nProd === 1 ? 'produto' : 'produtos'} />
      </View>
      {passos.length > 0 && <View style={styles.sep} />}
      <LinhasPassos passos={passos} />
    </View>
  );
}

/** A lista dos passos com o produto de cada um (número, foto, passo e "Marca · Produto"). */
export function LinhasPassos({ passos }: { passos: NonNullable<EstatisticasCheckin['passos']> }) {
  return (
    <>
      {passos.map((p, i) => {
        const prod = [p.marca, p.produto].filter(Boolean).join(' · ');
        const nome = p.nome?.trim() || '';
        return (
          <View key={i} style={[styles.linha, i > 0 && styles.linhaBorda]}>
            <Text style={styles.linhaN}>{i + 1}</Text>
            <View style={styles.linhaFoto}>
              {p.img?.url
                ? <Image source={{ uri: p.img.url }} cachePolicy="memory-disk" contentFit="contain" style={{ width: 36, height: 36 }} />
                : <StepIcon tipo={tipoDoPasso(nome, '')} size={22} />}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              {prod ? (
                <>
                  {!!nome && <Text style={styles.linhaPasso} numberOfLines={1}>{nome}</Text>}
                  <Text style={styles.linhaProd} numberOfLines={2}>{prod}</Text>
                </>
              ) : (
                <Text style={styles.linhaProd} numberOfLines={2}>{nome || 'Passo'}</Text>
              )}
            </View>
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6, boxShadow: '0px 1px 2px rgba(18,18,18,0.04)' },
  nums: { flexDirection: 'row', alignItems: 'center' },
  num: { flex: 1, alignItems: 'center' },
  numV: { fontSize: 26, lineHeight: 31, fontWeight: '700', letterSpacing: -0.8, color: INK, fontVariant: ['tabular-nums'] },
  numR: { marginTop: 1, fontSize: 13, lineHeight: 17, color: MUTE },
  numSep: { width: 1, height: 32, backgroundColor: 'rgba(18,18,18,0.07)' },
  sep: { height: 1, marginTop: 16, backgroundColor: 'rgba(18,18,18,0.07)' },
  linha: { minHeight: 62, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  linhaBorda: { borderTopWidth: 1, borderTopColor: 'rgba(18,18,18,0.06)' },
  linhaN: { width: 16, fontSize: 14, fontWeight: '700', color: MUTE, fontVariant: ['tabular-nums'] },
  linhaFoto: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#FAF4F7', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  linhaPasso: { fontSize: 12, lineHeight: 15, fontWeight: '500', color: MUTE },
  linhaProd: { fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: -0.3, color: INK },
  minis: { flexDirection: 'row', gap: 5 },
  mini: { backgroundColor: '#FAF4F7', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  miniMais: { fontSize: 11, fontWeight: '700', color: '#E0428C' },
});
