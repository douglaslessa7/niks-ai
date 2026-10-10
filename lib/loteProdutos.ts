// ─────────────────────────────────────────────────────────────────────────────
// Scan em lote dos produtos de casa (plano da Rotina, Fase 5 — decisão 4).
//
// Para cada produto: foto da FRENTE e, depois, foto do RÓTULO de ingredientes (ela
// pode pular o rótulo). O app junta as duas numa imagem só, no formato que a função
// `montar-rotina-com-produtos` espera (testado na Fase 0):
//   · com rótulo: 1024×1536 — frente no terço de cima (1024×512), rótulo nos dois
//     terços de baixo (1024×1024), cada uma INTEIRA ("contain") sobre branco;
//   · sem rótulo: só a frente, 1024×1024 (vira "Precisão baixa" na análise).
// Até 7 produtos por lote. Nada é analisado durante as fotos: só no "Pronto, montar
// minha rotina" as imagens vão para o bucket privado `rotina-lotes`
// (`{user_id}/{lote_id}/{n}.jpg`, a combinada que vai para a IA, + `{n}-frente.jpg`,
// só a frente, que vira a foto do produto na estante) — a função lê de lá, em segundo
// plano (Fase 6).
//
// O lote em montagem vive só na memória (store abaixo): fechar o app no meio das
// fotos perde o lote (o servidor só entra no "Pronto").
// ─────────────────────────────────────────────────────────────────────────────
import { create } from 'zustand';
import * as ImageManipulator from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { Skia, ImageFormat, type SkImage } from '@shopify/react-native-skia';
import { supabase } from './supabase';

export const MAX_PRODUTOS_LOTE = 7;
const LARGURA = 1024;
const ALTURA_FRENTE = 512;   // terço de cima
const ALTURA_ROTULO = 1024;  // dois terços de baixo
const QUALIDADE = 85;
export const BUCKET_LOTES = 'rotina-lotes';

export type ProdutoLote = {
  id: string;
  frenteUri: string;
  rotuloUri: string | null;   // null = ela pulou o rótulo
  combinadaUri: string;       // a imagem que vai para a IA (arquivo no cache)
  frenteJpgUri?: string;      // só a frente, 1024 px (foto do produto na estante)
};

type LoteState = {
  produtos: ProdutoLote[];
  adicionar: (p: ProdutoLote) => void;
  substituir: (p: ProdutoLote) => void;  // ex.: "Adicionar foto do rótulo" depois
  remover: (id: string) => void;
  limpar: () => void;
};

export const useLote = create<LoteState>((set) => ({
  produtos: [],
  adicionar: (p) => set((s) => (s.produtos.length >= MAX_PRODUTOS_LOTE ? s : { produtos: [...s.produtos, p] })),
  substituir: (p) => set((s) => ({ produtos: s.produtos.map((x) => (x.id === p.id ? p : x)) })),
  remover: (id) => set((s) => ({ produtos: s.produtos.filter((x) => x.id !== id) })),
  limpar: () => set({ produtos: [] }),
}));

const novoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// A foto da câmera pode vir "deitada" com a rotação só na EXIF — o Skia não lê EXIF.
// Passar pelo ImageManipulator grava a rotação nos pixels (e já reduz para o que a IA
// usa: o lado maior em 1536 basta para qualquer recorte do 1024×1536).
async function carregar(uri: string): Promise<SkImage> {
  const norm = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1536 } }], {
    compress: 0.95, format: ImageManipulator.SaveFormat.JPEG,
  });
  const data = await Skia.Data.fromURI(norm.uri);
  const img = Skia.Image.MakeImageFromEncoded(data);
  if (!img) throw new Error('imagem ilegível');
  return img;
}

// Desenha a imagem INTEIRA ("contain") centralizada no retângulo.
function caber(canvas: ReturnType<NonNullable<ReturnType<typeof Skia.Surface.MakeOffscreen>>['getCanvas']>, img: SkImage, x: number, y: number, w: number, h: number) {
  const k = Math.min(w / img.width(), h / img.height());
  const dw = img.width() * k;
  const dh = img.height() * k;
  canvas.drawImageRect(
    img,
    Skia.XYWHRect(0, 0, img.width(), img.height()),
    Skia.XYWHRect(x + (w - dw) / 2, y + (h - dh) / 2, dw, dh),
    Skia.Paint(),
  );
}

/** Monta a imagem combinada (frente + rótulo, ou só a frente) e grava no cache. */
export async function montarProduto(frenteUri: string, rotuloUri: string | null, id: string = novoId()): Promise<ProdutoLote> {
  const frente = await carregar(frenteUri);
  const rotulo = rotuloUri ? await carregar(rotuloUri) : null;
  const altura = rotulo ? ALTURA_FRENTE + ALTURA_ROTULO : LARGURA;
  const surface = Skia.Surface.MakeOffscreen(LARGURA, altura);
  if (!surface) throw new Error('sem superfície');
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('white'));
  if (rotulo) {
    caber(canvas, frente, 0, 0, LARGURA, ALTURA_FRENTE);
    caber(canvas, rotulo, 0, ALTURA_FRENTE, LARGURA, ALTURA_ROTULO);
  } else {
    caber(canvas, frente, 0, 0, LARGURA, LARGURA);
  }
  surface.flush();
  const bytes = surface.makeImageSnapshot().encodeToBytes(ImageFormat.JPEG, QUALIDADE);
  const file = new File(Paths.cache, `lote-${id}-${Date.now()}.jpg`);
  file.write(bytes);
  // Só a frente, já com a rotação certa (foto do produto na estante e base do recorte).
  const so = await ImageManipulator.manipulateAsync(frenteUri, [{ resize: { width: LARGURA } }], {
    compress: QUALIDADE / 100, format: ImageManipulator.SaveFormat.JPEG,
  });
  return { id, frenteUri, rotuloUri, combinadaUri: file.uri, frenteJpgUri: so.uri };
}

/**
 * "Pronto, montar minha rotina": envia as imagens combinadas para o bucket privado.
 * Devolve o código do lote e os caminhos, na ordem dos produtos (Produto 1, 2, …).
 * Falhou um envio → apaga o que já subiu deste lote e lança o erro.
 */
export async function enviarLote(userId: string, produtos: ProdutoLote[]): Promise<{ loteId: string; caminhos: string[] }> {
  const loteId = novoId();
  const caminhos: string[] = [];
  const enviadas: string[] = [];
  const subir = async (path: string, uri: string) => {
    const bytes = await new File(uri).bytes();
    const { error } = await supabase.storage.from(BUCKET_LOTES).upload(path, bytes.buffer as ArrayBuffer, {
      contentType: 'image/jpeg', upsert: false,
    });
    if (error) throw error;
    enviadas.push(path);
  };
  try {
    for (let i = 0; i < produtos.length; i++) {
      const path = `${userId}/${loteId}/${i + 1}.jpg`;
      await subir(path, produtos[i].combinadaUri);
      caminhos.push(path);
      // A frente sozinha, ao lado (`{n}-frente.jpg`). Sem ela, a função usa a combinada.
      if (produtos[i].frenteJpgUri) {
        const pf = `${userId}/${loteId}/${i + 1}-frente.jpg`;
        await subir(pf, produtos[i].frenteJpgUri!);
      }
    }
    return { loteId, caminhos };
  } catch (e) {
    if (enviadas.length) await supabase.storage.from(BUCKET_LOTES).remove(enviadas).catch(() => {});
    throw e;
  }
}
