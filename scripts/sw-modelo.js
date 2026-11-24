// Service worker do Checklist Veicular — é o que faz o app abrir sem internet.
//
// Este arquivo é um MODELO: no build, o vite.config.js o copia para dist/sw.js trocando
// a versão do cache e a lista de arquivos do app.
//
//  - página (index.html): tenta a rede primeiro; sem rede (ou com rede lenta), usa a cópia.
//  - /assets (nomes com hash, nunca mudam): usa a cópia; baixa só o que faltar.
//  - demais arquivos do site (modelos 3D, ícone): entrega a cópia e atualiza em segundo plano.
//  - chamadas ao banco de dados (outro domínio): nunca passam pelo cache.

const CACHE = 'checklist-__VERSAO__';
const ARQUIVOS = /*__ARQUIVOS__*/ [];
const ESPERA_DA_REDE = 3500;

// Os arquivos do site são os mesmos para qualquer cabeçalho: ao procurar no cache, ignora
// o "Vary" que alguns servidores acrescentam (senão a cópia não é encontrada).
const BUSCA = { ignoreVary: true };

self.addEventListener('install', evento => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const guardar = async caminho => {
        // Reaproveita o que já foi baixado por uma versão anterior (mesmo nome = mesmo arquivo).
        const antigo = await caches.match(caminho, BUSCA);
        if (antigo) return cache.put(caminho, antigo);
        return cache.add(new Request(caminho, { cache: 'reload' }));
      };
      await Promise.allSettled([cache.add(new Request('/', { cache: 'reload' })), ...ARQUIVOS.map(guardar)]);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    (async () => {
      // Mantém a versão atual e a anterior (abas antigas ainda abertas continuam funcionando).
      const nomes = (await caches.keys()).filter(nome => nome.startsWith('checklist-')).sort();
      await Promise.all(nomes.slice(0, -2).map(nome => caches.delete(nome)));
      await self.clients.claim();
    })()
  );
});

const comPrazo = (promessa, ms) =>
  new Promise((resolver, rejeitar) => {
    const relogio = setTimeout(() => rejeitar(new Error('rede lenta')), ms);
    promessa.then(
      valor => {
        clearTimeout(relogio);
        resolver(valor);
      },
      erro => {
        clearTimeout(relogio);
        rejeitar(erro);
      }
    );
  });

const pagina = async pedido => {
  const cache = await caches.open(CACHE);
  const guardada = (await cache.match('/', BUSCA)) || (await caches.match('/', BUSCA));
  const daRede = fetch(pedido).then(resposta => {
    if (resposta.ok) cache.put('/', resposta.clone());
    return resposta;
  });
  try {
    return await (guardada ? comPrazo(daRede, ESPERA_DA_REDE) : daRede);
  } catch {
    daRede.catch(() => {});
    return guardada || Response.error();
  }
};

const arquivoComHash = async pedido => {
  const guardado = await caches.match(pedido.url, BUSCA);
  if (guardado) return guardado;
  const resposta = await fetch(pedido);
  if (resposta.ok) (await caches.open(CACHE)).put(pedido.url, resposta.clone());
  return resposta;
};

const outroArquivo = async pedido => {
  const cache = await caches.open(CACHE);
  const guardado = (await cache.match(pedido.url, BUSCA)) || (await caches.match(pedido.url, BUSCA));
  const daRede = fetch(pedido)
    .then(resposta => {
      if (resposta.ok) cache.put(pedido.url, resposta.clone());
      return resposta;
    })
    .catch(() => null);
  return guardado || (await daRede) || Response.error();
};

self.addEventListener('fetch', evento => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  if (pedido.mode === 'navigate') evento.respondWith(pagina(pedido));
  else if (url.pathname.startsWith('/assets/')) evento.respondWith(arquivoComHash(pedido));
  else evento.respondWith(outroArquivo(pedido));
});
