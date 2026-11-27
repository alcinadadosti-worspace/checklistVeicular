// Fotos do checklist: o motorista anexa fotos no passo "Inspeção", junto de "Outros".
//
// - No aparelho: cada foto fica no IndexedDB (cabe muito mais que o localStorage), já reduzida.
//   Assim ela não se perde sem internet e é enviada quando a conexão voltar.
// - Na nuvem: um documento por foto na coleção `fotos` do Firestore, com a imagem num campo de
//   bytes. Fica fora de `checklists` para a sincronização dos checklists continuar leve: a foto
//   só é baixada quando alguém abre a ficha.
// - O registro do checklist guarda só a lista: fotos: [{ id, largura, altura }].

export const FOTOS_POR_CHECKLIST = 4;
const LADO_MAXIMO = 1280; // px no lado maior: dá para ler um painel ou ver um pneu
export const TAMANHO_MAXIMO = 600 * 1024; // bem abaixo do limite de 1 MiB por documento
const DIA = 24 * 60 * 60 * 1000;

const aleatorio = () => Math.random().toString(36).slice(2, 8);
export const novoIdDeFoto = (agora = Date.now()) => `ft_${agora.toString(36)}_${aleatorio()}`;

/** Só o que vai para o registro do checklist (sem a imagem). */
export const resumoDasFotos = fotos =>
  (Array.isArray(fotos) ? fotos : [])
    .filter(foto => foto && typeof foto.id === 'string')
    .slice(0, FOTOS_POR_CHECKLIST)
    .map(({ id, largura, altura }) => ({ id, largura: largura || 0, altura: altura || 0 }));

/* --- cofre do aparelho ---------------------------------------------------------------- */

// Cada foto guardada: { id, bytes (ArrayBuffer), tipo, largura, altura, unidade,
//                       registroId (null enquanto é rascunho), enviada, criadoEm }

function cofreEmMemoria() {
  const fotos = new Map();
  return {
    guardar: async foto => void fotos.set(foto.id, { ...foto }),
    ler: async id => (fotos.has(id) ? { ...fotos.get(id) } : null),
    todas: async () => [...fotos.values()].map(foto => ({ ...foto })),
    apagar: async id => void fotos.delete(id)
  };
}

function cofreNoIndexedDB(indexedDB) {
  let conexao = null;
  const abrir = () => {
    conexao ||= new Promise((resolver, rejeitar) => {
      const pedido = indexedDB.open('clv-fotos', 1);
      pedido.onupgradeneeded = () => pedido.result.createObjectStore('fotos', { keyPath: 'id' });
      pedido.onsuccess = () => resolver(pedido.result);
      pedido.onerror = () => rejeitar(pedido.error);
      pedido.onblocked = () => rejeitar(new Error('IndexedDB bloqueado'));
    });
    return conexao;
  };
  const operar = async (modo, acao) => {
    const db = await abrir();
    return new Promise((resolver, rejeitar) => {
      const transacao = db.transaction('fotos', modo);
      const pedido = acao(transacao.objectStore('fotos'));
      transacao.oncomplete = () => resolver(pedido?.result);
      transacao.onerror = () => rejeitar(transacao.error);
      transacao.onabort = () => rejeitar(transacao.error);
    });
  };
  return {
    guardar: foto => operar('readwrite', loja => loja.put(foto)).then(() => undefined),
    ler: id => operar('readonly', loja => loja.get(id)).then(foto => foto || null),
    todas: () => operar('readonly', loja => loja.getAll()).then(fotos => fotos || []),
    apagar: id => operar('readwrite', loja => loja.delete(id)).then(() => undefined)
  };
}

/**
 * Cofre de fotos do aparelho. Usa o IndexedDB; se o navegador não deixar (ou nos testes),
 * fica na memória — a foto ainda é enviada, só não sobrevive a recarregar a página.
 */
export function criarCofreDeFotos({ indexedDB = globalThis.indexedDB } = {}) {
  const reserva = cofreEmMemoria();
  let base = indexedDB ? cofreNoIndexedDB(indexedDB) : reserva;
  const usar = async (metodo, ...argumentos) => {
    try {
      return await base[metodo](...argumentos);
    } catch {
      base = reserva;
      return reserva[metodo](...argumentos);
    }
  };

  return {
    guardar: foto => usar('guardar', foto),
    ler: id => usar('ler', id),
    apagar: id => usar('apagar', id),

    /** Liga as fotos do rascunho ao checklist enviado: a partir daí elas entram na fila de envio. */
    async vincular(ids, registroId) {
      for (const id of ids) {
        const foto = await usar('ler', id);
        if (foto) await usar('guardar', { ...foto, registroId, enviada: false });
      }
    },

    /** Fotos de checklists já enviados que ainda não chegaram à nuvem. */
    async pendentes() {
      const todas = await usar('todas');
      return todas.filter(foto => foto.registroId && !foto.enviada).sort((a, b) => a.criadoEm - b.criadoEm);
    },

    async marcarEnviada(id) {
      const foto = await usar('ler', id);
      if (foto) await usar('guardar', { ...foto, enviada: true });
    },

    /**
     * Arrumação: apaga fotos de rascunhos abandonados (o rascunho vence em 12 h) e as já
     * enviadas há mais de 60 dias (continuam na nuvem; se alguém abrir, baixa de novo).
     */
    async arrumar(agora = Date.now()) {
      for (const foto of await usar('todas')) {
        const idade = agora - (foto.criadoEm || 0);
        if ((!foto.registroId && idade > DIA) || (foto.enviada && idade > 60 * DIA)) await usar('apagar', foto.id);
      }
    }
  };
}

export const cofreDeFotos = criarCofreDeFotos();

/* --- preparar a foto tirada pelo motorista ------------------------------------------- */

const paraBlob = (canvas, qualidade) =>
  new Promise((resolver, rejeitar) => {
    canvas.toBlob(blob => (blob ? resolver(blob) : rejeitar(new Error('sem imagem'))), 'image/jpeg', qualidade);
  });

const abrirImagem = async arquivo => {
  if (globalThis.createImageBitmap) {
    try {
      const bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
      return { imagem: bitmap, largura: bitmap.width, altura: bitmap.height, liberar: () => bitmap.close?.() };
    } catch {
      /* alguns navegadores não abrem certos formatos assim: tenta pelo <img> */
    }
  }
  const url = URL.createObjectURL(arquivo);
  const imagem = new Image();
  imagem.src = url;
  try {
    await imagem.decode();
  } catch (erro) {
    URL.revokeObjectURL(url);
    throw erro;
  }
  return {
    imagem,
    largura: imagem.naturalWidth,
    altura: imagem.naturalHeight,
    liberar: () => URL.revokeObjectURL(url)
  };
};

/**
 * Reduz a foto (no máximo 1280 px no lado maior, JPEG) até caber em TAMANHO_MAXIMO.
 * Uma foto de celular de 3–5 MB vira algo entre 150 e 400 KB.
 */
export async function prepararFoto(arquivo) {
  const { imagem, largura, altura, liberar } = await abrirImagem(arquivo);
  try {
    if (!largura || !altura) throw new Error('imagem vazia');
    let lado = LADO_MAXIMO;
    let qualidade = 0.78;
    for (let tentativa = 0; ; tentativa++) {
      const escala = Math.min(1, lado / Math.max(largura, altura));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(largura * escala));
      canvas.height = Math.max(1, Math.round(altura * escala));
      const contexto = canvas.getContext('2d');
      contexto.fillStyle = '#ffffff'; // PNG transparente não fica preto no JPEG
      contexto.fillRect(0, 0, canvas.width, canvas.height);
      contexto.drawImage(imagem, 0, 0, canvas.width, canvas.height);
      const blob = await paraBlob(canvas, qualidade);
      if (blob.size <= TAMANHO_MAXIMO || tentativa >= 6) {
        return { bytes: await blob.arrayBuffer(), tipo: 'image/jpeg', largura: canvas.width, altura: canvas.height };
      }
      if (qualidade > 0.6) qualidade -= 0.09;
      else lado = Math.round(lado * 0.8);
    }
  } finally {
    liberar();
  }
}

/* --- mostrar uma foto (do aparelho ou baixada da nuvem) -------------------------------- */

const enderecos = new Map(); // id -> Promise<url | null>

/**
 * Endereço (blob:) para mostrar a foto. Procura no aparelho; se não tiver, baixa da nuvem
 * e guarda no aparelho. Devolve null se a foto ainda não chegou à nuvem.
 */
export function enderecoDaFoto(id, { nuvem, cofre = cofreDeFotos } = {}) {
  if (!enderecos.has(id)) {
    const promessa = (async () => {
      let foto = await cofre.ler(id);
      if (!foto && nuvem?.ativa) {
        foto = await nuvem.buscarFoto(id);
        if (foto) await cofre.guardar({ ...foto, enviada: true, criadoEm: Date.now() });
      }
      return foto ? URL.createObjectURL(new Blob([foto.bytes], { type: foto.tipo || 'image/jpeg' })) : null;
    })();
    // Se não deu (sem internet, ou ainda não enviada), tenta de novo na próxima vez.
    promessa.then(
      url => {
        if (!url) enderecos.delete(id);
      },
      () => enderecos.delete(id)
    );
    enderecos.set(id, promessa);
  }
  return enderecos.get(id);
}

/** Esquece o endereço de uma foto removida do rascunho. */
export function esquecerFoto(id) {
  const promessa = enderecos.get(id);
  enderecos.delete(id);
  promessa?.then(url => url && URL.revokeObjectURL(url)).catch(() => {});
}
