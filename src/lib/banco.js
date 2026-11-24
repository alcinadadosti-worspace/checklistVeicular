// Banco local do aparelho.
//
// Tudo o que o motorista preenche é gravado primeiro aqui (localStorage), na hora — com
// ou sem internet. Depois a sincronização (src/lib/sincronizacao.js) envia para a nuvem
// e traz o que os outros aparelhos gravaram.

import { maisRecentesPrimeiro } from './registros.js';

const CHAVE = 'clv.dados.v1';
const VAZIO = () => ({ registros: {}, pendentes: [], cursor: null });

/* --- armazenamento (com reserva em memória se o navegador bloquear o localStorage) --- */

const memoria = new Map();
const cofre = {
  ler(chave) {
    try {
      return globalThis.localStorage ? globalThis.localStorage.getItem(chave) : (memoria.get(chave) ?? null);
    } catch {
      return memoria.get(chave) ?? null;
    }
  },
  gravar(chave, valor) {
    memoria.set(chave, valor);
    try {
      globalThis.localStorage?.setItem(chave, valor);
      return true;
    } catch {
      return false;
    }
  },
  apagar(chave) {
    memoria.delete(chave);
    try {
      globalThis.localStorage?.removeItem(chave);
    } catch {
      /* sem acesso ao armazenamento: nada a fazer */
    }
  }
};

export const lerPreferencia = (chave, padrao = null) => {
  const bruto = cofre.ler(`clv.${chave}`);
  if (bruto === null) return padrao;
  try {
    return JSON.parse(bruto);
  } catch {
    return padrao;
  }
};
export const gravarPreferencia = (chave, valor) => {
  if (valor === null || valor === undefined) cofre.apagar(`clv.${chave}`);
  else cofre.gravar(`clv.${chave}`, JSON.stringify(valor));
};

/* --- estado ----------------------------------------------------------------------- */

const carregar = () => {
  try {
    const dados = JSON.parse(cofre.ler(CHAVE) || 'null');
    if (!dados || typeof dados !== 'object') return VAZIO();
    return {
      registros: dados.registros && typeof dados.registros === 'object' ? dados.registros : {},
      pendentes: Array.isArray(dados.pendentes) ? dados.pendentes.filter(id => dados.registros?.[id]) : [],
      cursor: Number.isFinite(dados.cursor) ? dados.cursor : null
    };
  } catch {
    return VAZIO();
  }
};

let estado = carregar();
let foto = null; // instantâneo entregue às telas (só muda quando os dados mudam)
const ouvintes = new Set();

const fotografar = () => {
  const todos = Object.values(estado.registros);
  const visiveis = todos.filter(registro => !registro.excluido).sort(maisRecentesPrimeiro);
  foto = {
    registros: visiveis,
    pendentes: estado.pendentes.length,
    idsPendentes: new Set(estado.pendentes),
    total: visiveis.length
  };
};
fotografar();

const persistir = () => {
  if (cofre.gravar(CHAVE, JSON.stringify(estado))) return;
  // Armazenamento cheio: descarta do aparelho os registros concluídos mais antigos que já
  // estão na nuvem (continuam lá) e tenta de novo.
  const pendentes = new Set(estado.pendentes);
  const descartaveis = Object.values(estado.registros)
    .filter(registro => !pendentes.has(registro.id))
    .sort((a, b) => a.criadoEm - b.criadoEm);
  while (descartaveis.length > 0) {
    for (const registro of descartaveis.splice(0, 50)) delete estado.registros[registro.id];
    if (cofre.gravar(CHAVE, JSON.stringify(estado))) return;
  }
};

const publicar = () => {
  fotografar();
  for (const ouvinte of ouvintes) ouvinte();
};

const alterar = mudanca => {
  mudanca(estado);
  persistir();
  publicar();
};

// Outra aba do mesmo navegador gravou algo: recarrega.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', evento => {
    if (evento.key !== CHAVE) return;
    estado = carregar();
    publicar();
  });
}

/* --- API ---------------------------------------------------------------------------- */

export const banco = {
  assinar(ouvinte) {
    ouvintes.add(ouvinte);
    return () => ouvintes.delete(ouvinte);
  },

  /** Instantâneo atual: { registros (sem os excluídos, mais recentes primeiro), pendentes, ... }. */
  obter: () => foto,

  registro: id => estado.registros[id] || null,
  pendentes: () => [...estado.pendentes],
  cursor: () => estado.cursor,

  /** Grava (cria ou altera) um registro neste aparelho e o marca para envio à nuvem. */
  gravar(registro, agora = Date.now()) {
    const anterior = estado.registros[registro.id];
    const atualizadoEm = Math.max(agora, (anterior?.atualizadoEm ?? 0) + 1);
    const salvo = { ...registro, atualizadoEm };
    alterar(e => {
      e.registros[salvo.id] = salvo;
      if (!e.pendentes.includes(salvo.id)) e.pendentes.push(salvo.id);
    });
    return salvo;
  },

  /** Exclusão "lógica": o registro some das telas, mas a marcação viaja para os outros aparelhos. */
  excluir(id, agora = Date.now()) {
    const atual = estado.registros[id];
    if (!atual) return null;
    return banco.gravar({ ...atual, excluido: true }, agora);
  },

  /** A nuvem confirmou o recebimento da versão `atualizadoEm` do registro. */
  confirmarEnvio(id, atualizadoEm) {
    const atual = estado.registros[id];
    if (!atual || atual.atualizadoEm !== atualizadoEm) return; // mudou de novo enquanto enviava
    alterar(e => {
      e.pendentes = e.pendentes.filter(pendente => pendente !== id);
    });
  },

  /**
   * Junta registros vindos da nuvem com os deste aparelho. Vale a versão mais nova
   * (`atualizadoEm`); o que estiver mais novo aqui continua pendente de envio.
   */
  aplicarRemotos(remotos, cursor) {
    let mudou = false;
    const proximo = { ...estado.registros };
    let pendentes = estado.pendentes;
    for (const remoto of remotos) {
      if (!remoto || typeof remoto.id !== 'string') continue;
      const local = proximo[remoto.id];
      if (local && local.atualizadoEm > remoto.atualizadoEm) continue;
      if (local && local.atualizadoEm === remoto.atualizadoEm && !pendentes.includes(remoto.id)) continue;
      proximo[remoto.id] = remoto;
      pendentes = pendentes.filter(id => id !== remoto.id);
      mudou = true;
    }
    const cursorMudou = Number.isFinite(cursor) && cursor !== estado.cursor;
    if (!mudou && !cursorMudou) return false;
    alterar(e => {
      e.registros = proximo;
      e.pendentes = pendentes;
      if (cursorMudou) e.cursor = cursor;
    });
    return mudou;
  },

  /** Apaga tudo deste aparelho (não mexe na nuvem). Usado nos testes. */
  limpar() {
    estado = VAZIO();
    cofre.apagar(CHAVE);
    publicar();
  }
};
