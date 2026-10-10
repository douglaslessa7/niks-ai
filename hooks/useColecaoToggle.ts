import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { getUserId } from '../lib/currentUser';
import { addToColecao, findInColecao, removeFromColecao } from '../lib/colecao';
import { haptics } from '../lib/haptics';

// Estado do botão "Tenho em casa" (Minha coleção) para UM produto — de um scan
// (`productScanId` + dados do resultado) ou do catálogo (`produtoId`). `owned` começa
// null (ainda lendo); o toggle adiciona/tira e avisa `onChange` (para recarregar listas).
type Source = {
  origem: 'scan' | 'catalogo';
  productScanId?: string | null;
  produtoId?: string | null;
  nome?: string | null;
  marca?: string | null;
  categoria?: string | null;
  compat?: number | null;
  imagemUrl?: string | null;
};

export function useColecaoToggle(src: Source | null, onChange?: () => void) {
  const key = src ? (src.productScanId ?? src.produtoId ?? null) : null;
  const [itemId, setItemId] = useState<string | null>(null);
  const [owned, setOwned] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  // `recheck()` relê se o produto está na coleção (ex.: outro caminho acabou de pô-lo lá).
  const [versao, setVersao] = useState(0);
  const recheck = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    setOwned(null); setItemId(null);
    if (!src || !key) return;
    getUserId().then(async (uid) => {
      if (!uid) return;
      const id = await findInColecao(uid, { productScanId: src.productScanId, produtoId: src.produtoId, nome: src.nome, marca: src.marca });
      if (alive) { setItemId(id); setOwned(!!id); }
    }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, versao]);

  const toggle = useCallback(async () => {
    if (!src || busy || owned === null) return;
    setBusy(true);
    try {
      const uid = await getUserId();
      if (!uid) return;
      if (owned && itemId) {
        await removeFromColecao(itemId);
        setItemId(null); setOwned(false);
      } else {
        const id = await addToColecao(uid, src);
        setItemId(id); setOwned(true);
        haptics.success();
      }
      onChange?.();
    } catch (e) {
      console.warn('[coleção] falha no "Tenho em casa"', e);
      haptics.error();
      // Antes a falha era silenciosa (só vibrava) e o produto simplesmente não aparecia.
      Alert.alert(
        owned ? 'Não deu pra remover da sua estante' : 'Não deu pra adicionar à sua estante',
        'Tente de novo em instantes.',
      );
    } finally {
      setBusy(false);
    }
  }, [src, busy, owned, itemId, onChange]);

  return { owned, busy, toggle, recheck };
}
