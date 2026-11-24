// Nuvem: Firebase · Cloud Firestore, acessado pela API REST oficial (sem biblioteca extra).
//
// Cada checklist é um documento da coleção `checklists`, com o mesmo `id` do app.
// Ao gravar, o próprio servidor carimba o campo `servidorEm` (hora do servidor); é por
// ele que cada aparelho pergunta "o que mudou desde a última vez?", sem depender do
// relógio dos celulares.

import { COLECAO, FIREBASE_PROJECT_ID } from '../config/firebase.js';

const TEMPO_LIMITE_MS = 15000;
const PAGINA = 300;
const MARGEM_MS = 60000; // relê o último minuto a cada consulta: garante que nada escapa

export class ErroDaNuvem extends Error {
  constructor(mensagem, { tipo, status = 0 } = {}) {
    super(mensagem);
    this.name = 'ErroDaNuvem';
    this.tipo = tipo; // 'rede' | 'permissao' | 'configuracao' | 'dados' | 'servidor'
    this.status = status;
  }
}

/* --- conversão entre objetos JS e o formato de valores do Firestore --- */

export const codificar = valor => {
  if (valor === null || valor === undefined) return { nullValue: null };
  if (typeof valor === 'boolean') return { booleanValue: valor };
  if (typeof valor === 'number') {
    return Number.isInteger(valor) ? { integerValue: String(valor) } : { doubleValue: valor };
  }
  if (typeof valor === 'string') return { stringValue: valor };
  if (Array.isArray(valor)) return { arrayValue: { values: valor.map(codificar) } };
  if (typeof valor === 'object') return { mapValue: { fields: codificarCampos(valor) } };
  return { nullValue: null };
};

export const codificarCampos = objeto =>
  Object.fromEntries(
    Object.entries(objeto)
      .filter(([, valor]) => valor !== undefined)
      .map(([chave, valor]) => [chave, codificar(valor)])
  );

export const decodificar = valor => {
  if (!valor || typeof valor !== 'object') return null;
  if ('nullValue' in valor) return null;
  if ('booleanValue' in valor) return valor.booleanValue;
  if ('integerValue' in valor) return Number(valor.integerValue);
  if ('doubleValue' in valor) return Number(valor.doubleValue);
  if ('stringValue' in valor) return valor.stringValue;
  if ('timestampValue' in valor) return valor.timestampValue;
  if ('arrayValue' in valor) return (valor.arrayValue.values || []).map(decodificar);
  if ('mapValue' in valor) return decodificarCampos(valor.mapValue.fields);
  return null;
};

export const decodificarCampos = (campos = {}) =>
  Object.fromEntries(Object.entries(campos).map(([chave, valor]) => [chave, decodificar(valor)]));

/** Campos que existem só na nuvem e não fazem parte do registro do app. */
const SO_DA_NUVEM = ['servidorEm'];

const paraDocumento = registro => {
  const copia = { ...registro };
  for (const campo of SO_DA_NUVEM) delete copia[campo];
  return codificarCampos(copia);
};

/* --- cliente -------------------------------------------------------------------------- */

export function criarNuvem({
  projeto = FIREBASE_PROJECT_ID,
  colecao = COLECAO,
  servidor = 'https://firestore.googleapis.com',
  requisitar = (...argumentos) => globalThis.fetch(...argumentos)
} = {}) {
  const ativa = Boolean(projeto);
  const banco = `projects/${projeto}/databases/(default)/documents`;
  const raiz = `${servidor}/v1/${banco}`;

  const chamar = async (metodo, url, corpo) => {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
    let resposta;
    try {
      resposta = await requisitar(url, {
        method: metodo,
        headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: controle.signal
      });
    } catch (erro) {
      throw new ErroDaNuvem(
        erro?.name === 'AbortError' ? 'A nuvem demorou demais para responder.' : 'Sem conexão com a nuvem.',
        { tipo: 'rede' }
      );
    } finally {
      clearTimeout(relogio);
    }

    let dados = null;
    try {
      dados = await resposta.json();
    } catch {
      dados = null;
    }
    if (resposta.ok) return dados;

    const detalhe = (Array.isArray(dados) ? dados[0] : dados)?.error?.message || `HTTP ${resposta.status}`;
    const status = resposta.status;
    if (status === 403 || status === 401) {
      throw new ErroDaNuvem(`A nuvem recusou o acesso (confira as Regras do Firestore): ${detalhe}`, {
        tipo: 'permissao',
        status
      });
    }
    if (status === 404) {
      throw new ErroDaNuvem(`Banco não encontrado (confira o ID do projeto e se o Firestore foi criado): ${detalhe}`, {
        tipo: 'configuracao',
        status
      });
    }
    if (status === 400) throw new ErroDaNuvem(`A nuvem não aceitou os dados: ${detalhe}`, { tipo: 'dados', status });
    throw new ErroDaNuvem(`A nuvem está indisponível no momento: ${detalhe}`, { tipo: 'servidor', status });
  };

  const consulta = (desdeIso, limite) => ({
    structuredQuery: {
      from: [{ collectionId: colecao }],
      ...(desdeIso
        ? {
            where: {
              fieldFilter: {
                field: { fieldPath: 'servidorEm' },
                op: 'GREATER_THAN',
                value: { timestampValue: desdeIso }
              }
            }
          }
        : {}),
      orderBy: [{ field: { fieldPath: 'servidorEm' }, direction: 'ASCENDING' }],
      limit: limite
    }
  });

  return {
    ativa,
    projeto,

    /** Cria ou substitui o documento do registro; o servidor carimba `servidorEm`. */
    async enviar(registro) {
      const resposta = await chamar('POST', `${raiz}:commit`, {
        writes: [
          {
            update: { name: `${banco}/${colecao}/${registro.id}`, fields: paraDocumento(registro) },
            updateTransforms: [{ fieldPath: 'servidorEm', setToServerValue: 'REQUEST_TIME' }]
          }
        ]
      });
      return resposta?.commitTime || null;
    },

    /**
     * Traz o que mudou na nuvem depois de `cursor` (milissegundos, hora do servidor).
     * Sem cursor, traz tudo. Devolve { registros, cursor } com o novo cursor.
     */
    async buscar(cursor = null) {
      const registros = [];
      let novoCursor = Number.isFinite(cursor) ? cursor : null;
      let desde = Number.isFinite(cursor) ? new Date(Math.max(0, cursor - MARGEM_MS)).toISOString() : null;

      for (let pagina = 0; pagina < 200; pagina++) {
        const linhas = await chamar('POST', `${raiz}:runQuery`, consulta(desde, PAGINA));
        const documentos = (Array.isArray(linhas) ? linhas : []).map(linha => linha.document).filter(Boolean);
        let ultimoCarimbo = null;
        for (const documento of documentos) {
          const dados = decodificarCampos(documento.fields);
          if (typeof dados.id !== 'string') dados.id = documento.name.split('/').pop();
          if (!Number.isFinite(dados.atualizadoEm)) dados.atualizadoEm = 0;
          registros.push(dados);
          if (typeof dados.servidorEm === 'string') {
            ultimoCarimbo = dados.servidorEm;
            const instante = Date.parse(dados.servidorEm);
            if (Number.isFinite(instante) && (novoCursor === null || instante > novoCursor)) novoCursor = instante;
          }
        }
        if (documentos.length < PAGINA || !ultimoCarimbo) break;
        desde = ultimoCarimbo; // próxima página: a partir do último carimbo recebido
      }
      return { registros, cursor: novoCursor };
    },

    /** Remove de vez um documento (as regras só permitem para registros já marcados como excluídos). */
    async apagar(id) {
      await chamar('DELETE', `${raiz}/${colecao}/${id}`);
    }
  };
}

export const nuvem = criarNuvem();
