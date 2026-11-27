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
export const TAMANHO_MAXIMO = 450 * 1024; // bem abaixo do limite de 1 MiB por documento e leve no 3G
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
//                       registroId (null enquanto é rascunho), enviada, criadoEm, fila }
// `fila` diz o que falta fazer com ela (e tem índice, para não ler todas as imagens a cada ciclo):
//   'enviar' — o checklist foi enviado e a foto ainda não subiu;
//   'apagar' — o checklist foi excluído e falta tirar a foto da nuvem (só a marca, sem a imagem);
//   'nada'   — rascunho, ou já enviada.
const comFila = foto => ({
  ...foto,
  fila: foto.apagar ? 'apagar' : foto.registroId && !foto.enviada ? 'enviar' : 'nada'
});

function cofreEmMemoria() {
  const fotos = new Map();
  return {
    guardar: async foto => void fotos.set(foto.id, comFila(foto)),
    ler: async id => (fotos.has(id) ? { ...fotos.get(id) } : null),
    todas: async () => [...fotos.values()].map(foto => ({ ...foto })),
    naFila: async fila => [...fotos.values()].filter(foto => foto.fila === fila).map(foto => ({ ...foto })),
    apagar: async id => void fotos.delete(id)
  };
}

function cofreNoIndexedDB(indexedDB) {
  let conexao = null;
  const abrir = () => {
    conexao ||= new Promise((resolver, rejeitar) => {
      const pedido = indexedDB.open('clv-fotos', 2);
      pedido.onupgradeneeded = evento => {
        const db = pedido.result;
        const loja =
          evento.oldVersion < 1
            ? db.createObjectStore('fotos', { keyPath: 'id' })
            : pedido.transaction.objectStore('fotos');
        if (!loja.indexNames.contains('fila')) loja.createIndex('fila', 'fila');
        // Fotos guardadas pela versão anterior: calcula a fila de cada uma.
        if (evento.oldVersion >= 1) {
          loja.openCursor().onsuccess = ({ target }) => {
            const cursor = target.result;
            if (!cursor) return;
            cursor.update(comFila(cursor.value));
            cursor.continue();
          };
        }
      };
      pedido.onsuccess = () => {
        const db = pedido.result;
        // Conexão perdida (o iPhone fecha depois de um tempo em segundo plano) ou versão nova
        // aberta em outra aba: na próxima operação, abre de novo.
        db.onclose = () => {
          conexao = null;
        };
        db.onversionchange = () => {
          db.close();
          conexao = null;
        };
        resolver(db);
      };
      pedido.onerror = () => {
        conexao = null;
        rejeitar(pedido.error);
      };
      pedido.onblocked = () => {
        conexao = null;
        rejeitar(new Error('IndexedDB bloqueado'));
      };
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
    reabrir: () => {
      conexao = null;
    },
    guardar: foto => operar('readwrite', loja => loja.put(comFila(foto))).then(() => undefined),
    ler: id => operar('readonly', loja => loja.get(id)).then(foto => foto || null),
    todas: () => operar('readonly', loja => loja.getAll()).then(fotos => fotos || []),
    naFila: fila => operar('readonly', loja => loja.index('fila').getAll(fila)).then(fotos => fotos || []),
    apagar: id => operar('readwrite', loja => loja.delete(id)).then(() => undefined)
  };
}

/** Junta duas listas de fotos; a da memória (mais recente, se o disco falhou) vale mais. */
const unir = (doDisco, daMemoria) => {
  const porId = new Map(doDisco.map(foto => [foto.id, foto]));
  for (const foto of daMemoria) porId.set(foto.id, foto);
  return [...porId.values()];
};

/**
 * Cofre de fotos do aparelho. Usa o IndexedDB; se uma operação falhar, reabre a conexão e tenta
 * de novo, e só então guarda na memória (a foto ainda é enviada, só não sobrevive a fechar o app).
 * As leituras olham os dois lugares, para nenhuma foto "sumir" depois de uma falha.
 */
export function criarCofreDeFotos({ indexedDB = globalThis.indexedDB } = {}) {
  const memoria = cofreEmMemoria();
  const disco = indexedDB ? cofreNoIndexedDB(indexedDB) : null;
  const noDisco = async (metodo, ...argumentos) => {
    if (!disco) throw new Error('sem IndexedDB');
    try {
      return await disco[metodo](...argumentos);
    } catch {
      disco.reabrir();
      return disco[metodo](...argumentos);
    }
  };

  const guardar = async foto => {
    try {
      await noDisco('guardar', foto);
      await memoria.apagar(foto.id);
    } catch {
      await memoria.guardar(foto);
    }
  };
  const ler = async id => (await memoria.ler(id)) ?? (await noDisco('ler', id).catch(() => null));
  const apagar = async id => {
    await memoria.apagar(id);
    await noDisco('apagar', id).catch(() => {});
  };
  const naFila = async fila =>
    unir(await noDisco('naFila', fila).catch(() => []), await memoria.naFila(fila)).sort(
      (a, b) => (a.criadoEm || 0) - (b.criadoEm || 0)
    );

  return {
    guardar,
    ler,
    apagar,

    /**
     * Liga as fotos do rascunho ao checklist enviado: a partir daí elas entram na fila de envio.
     * Devolve os ids que não foram encontrados no aparelho (para o checklist não apontar para eles).
     */
    async vincular(ids, registroId) {
      const faltando = [];
      for (const id of ids) {
        const foto = await ler(id);
        if (foto) await guardar({ ...foto, registroId, enviada: false });
        else faltando.push(id);
      }
      return faltando;
    },

    /** Fotos de checklists já enviados que ainda não chegaram à nuvem. */
    pendentes: () => naFila('enviar'),

    async marcarEnviada(id) {
      const foto = await ler(id);
      if (foto) await guardar({ ...foto, enviada: true });
    },

    /** Checklist excluído: a foto sai do aparelho e fica só a marca para tirá-la da nuvem. */
    marcarParaApagar: id => guardar({ id, apagar: true, criadoEm: Date.now() }),

    /** Fotos que faltam tirar da nuvem. */
    aApagar: () => naFila('apagar'),

    /**
     * Arrumação (ao abrir o app): apaga fotos de rascunhos abandonados, as já enviadas há mais de
     * 60 dias (continuam na nuvem; se alguém abrir, baixa de novo) e marcas de exclusão antigas.
     * `emUso`: ids das fotos dos rascunhos ainda abertos, que nunca são apagadas.
     */
    async arrumar(agora = Date.now(), emUso = new Set()) {
      const todas = unir(await noDisco('todas').catch(() => []), await memoria.todas());
      for (const foto of todas) {
        if (emUso.has(foto.id)) continue;
        const idade = agora - (foto.criadoEm || 0);
        const rascunhoAbandonado = !foto.registroId && !foto.apagar && idade > DIA;
        const enviadaAntiga = foto.enviada && idade > 60 * DIA;
        const marcaAntiga = foto.apagar && idade > 30 * DIA;
        if (rascunhoAbandonado || enviadaAntiga || marcaAntiga) await apagar(foto.id);
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

const enderecos = new Map(); // id -> Promise<url | null>, do menos para o mais usado
const LIMITE_DE_ENDERECOS = 80; // acima disso, libera da memória as fotos vistas há mais tempo

const liberar = promessa => promessa.then(url => url && URL.revokeObjectURL(url)).catch(() => {});

/**
 * Endereço (blob:) para mostrar a foto. Procura no aparelho; se não tiver, baixa da nuvem
 * e guarda no aparelho. Devolve null se a foto ainda não chegou à nuvem.
 */
export function enderecoDaFoto(id, { nuvem, cofre = cofreDeFotos } = {}) {
  if (enderecos.has(id)) {
    // Usada de novo: passa para o fim da fila (é a última a ser liberada).
    const promessa = enderecos.get(id);
    enderecos.delete(id);
    enderecos.set(id, promessa);
    return promessa;
  }
  const promessa = (async () => {
    let foto = await cofre.ler(id);
    if (!foto?.bytes) foto = null; // marca de exclusão (sem imagem) não serve para mostrar
    if (!foto && nuvem?.ativa) {
      foto = await nuvem.buscarFoto(id);
      if (foto) await cofre.guardar({ ...foto, enviada: true, criadoEm: Date.now() });
    }
    return foto ? URL.createObjectURL(new Blob([foto.bytes], { type: foto.tipo || 'image/jpeg' })) : null;
  })();
  // Se não deu (sem internet, ou ainda não enviada), tenta de novo na próxima vez.
  promessa.then(
    url => {
      if (!url && enderecos.get(id) === promessa) enderecos.delete(id);
    },
    () => {
      if (enderecos.get(id) === promessa) enderecos.delete(id);
    }
  );
  enderecos.set(id, promessa);
  while (enderecos.size > LIMITE_DE_ENDERECOS) {
    const [maisAntigo, antiga] = enderecos.entries().next().value;
    enderecos.delete(maisAntigo);
    liberar(antiga);
  }
  return promessa;
}

/** Esquece o endereço de uma foto removida do rascunho. */
export function esquecerFoto(id) {
  const promessa = enderecos.get(id);
  enderecos.delete(id);
  if (promessa) liberar(promessa);
}
