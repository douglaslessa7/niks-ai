// Script que lê a FOTO DO PRODUTO de uma página carregada num navegador de verdade.
//
// ⚠️ MANTER EM SINCRONIA com `preprocessorInjectJS` no app.json (plugin
// expo-share-intent), que roda a MESMA lógica no Safari antes da Share Extension.
// Ordem: JSON-LD Product.image → og:image(:secure_url) → twitter:image →
// imagem principal da Amazon (#landingImage). Sempre como URL absoluta.
//
// Diferenças em relação ao preprocessor (só o "encanamento", nunca a regra):
//  • aqui as metatags são lidas pelo próprio script (lá o pacote já entrega `metas`);
//  • o resultado sai por `window.ReactNativeWebView.postMessage` (lá vai em `metas['niks:image']`).

export const PAGE_IMAGE_MESSAGE = 'niks-page-image';

export const PAGE_IMAGE_SCRIPT = `
(function () {
  try {
    var metas = { title: document.title };
    var metaElements = document.querySelectorAll('meta');
    for (var m = 0; m < metaElements.length; m++) {
      var name = metaElements[m].getAttribute('name') || metaElements[m].getAttribute('property');
      var content = metaElements[m].getAttribute('content');
      if (name && content) metas[name] = content;
    }

    // ── início do trecho idêntico ao preprocessorInjectJS ──
    var niksAbs = function (u) { try { return u ? new URL(u, document.baseURI).href : null; } catch (e) { return null; } };
    var niksImg = null;
    var niksLd = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < niksLd.length && !niksImg; i++) {
      try {
        var queue = [JSON.parse(niksLd[i].textContent)];
        while (queue.length && !niksImg) {
          var node = queue.shift();
          if (!node || typeof node !== 'object') continue;
          if (Array.isArray(node)) { queue.push.apply(queue, node); continue; }
          if (node['@graph']) queue.push(node['@graph']);
          var types = [].concat(node['@type'] || []);
          if (types.some(function (t) { return /Product/.test(String(t)); })) {
            var img = [].concat(node.image || [])[0];
            niksImg = niksAbs(typeof img === 'string' ? img : img && (img.url || img.contentUrl));
          }
        }
      } catch (e) {}
    }
    if (!niksImg) niksImg = niksAbs(metas['og:image:secure_url'] || metas['og:image'] || metas['twitter:image']);
    if (!niksImg) {
      var landing = document.querySelector('#landingImage, #main-image, #imgBlkFront');
      niksImg = niksAbs(landing && (landing.getAttribute('data-old-hires') || landing.currentSrc || landing.src));
    }
    // ── fim do trecho idêntico ──

    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: '${PAGE_IMAGE_MESSAGE}',
      image: niksImg,
      title: metas['og:title'] || metas.title || null,
      href: location.href
    }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: '${PAGE_IMAGE_MESSAGE}', image: null, error: String(e) }));
  }
})();
true;
`;
