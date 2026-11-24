// Regras do checklist: como um registro nasce, como é validado e como é avaliado.
// (Funções puras — não dependem do navegador — para poderem ser testadas.)

import { ITENS, SITUACOES, nomeDoVeiculo } from '../config/frota.js';
import { limparNome } from './formato.js';

export const KM_MAXIMO = 9_999_999;
const IDS_ITENS = ITENS.map(item => item.id);
const IDS_SITUACOES = SITUACOES.map(situacao => situacao.id);

const aleatorio = tamanho => {
  const alfabeto = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(tamanho);
  (globalThis.crypto || { getRandomValues: a => a.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(bytes);
  return Array.from(bytes, b => alfabeto[b % alfabeto.length]).join('');
};

export const novoId = (agora = Date.now()) => `ck_${agora.toString(36)}_${aleatorio(8)}`;

const kmValido = valor => Number.isInteger(valor) && valor >= 0 && valor <= KM_MAXIMO;

/** Confere os dados da saída. Devolve { ok, erros } com uma mensagem por campo. */
export function validarChecklist({ motoristaId, motoristaNome, kmSaida, kmVolta, itens }) {
  const erros = {};
  if (!motoristaId) erros.motorista = 'Escolha o motorista.';
  else if (!limparNome(motoristaNome)) erros.motorista = 'Digite o nome do motorista.';

  if (kmSaida === null || kmSaida === undefined) erros.kmSaida = 'Informe o KM de saída.';
  else if (!kmValido(kmSaida)) erros.kmSaida = 'KM de saída inválido.';

  if (kmVolta !== null && kmVolta !== undefined) {
    if (!kmValido(kmVolta)) erros.kmVolta = 'KM de volta inválido.';
    else if (kmValido(kmSaida) && kmVolta < kmSaida) erros.kmVolta = 'O KM de volta não pode ser menor que o de saída.';
  }

  const faltando = IDS_ITENS.filter(id => !IDS_SITUACOES.includes(itens?.[id]));
  if (faltando.length > 0) {
    erros.itens = faltando.length === 1 ? 'Falta avaliar 1 item.' : `Faltam avaliar ${faltando.length} itens.`;
  }
  return { ok: Object.keys(erros).length === 0, erros, itensFaltando: faltando };
}

/** Confere o KM de volta de uma viagem em andamento. */
export function validarRetorno(registro, kmVolta) {
  if (kmVolta === null || kmVolta === undefined) return 'Informe o KM de volta.';
  if (!kmValido(kmVolta)) return 'KM de volta inválido.';
  if (kmVolta < registro.kmSaida) return `O KM de volta não pode ser menor que o de saída (${registro.kmSaida}).`;
  return null;
}

/** Monta o registro que vai para o banco. A data e a hora são capturadas aqui, automaticamente. */
export function criarRegistro(
  { unidade, motoristaId, motoristaNome, kmSaida, kmVolta = null, itens, outros = '' },
  agora = new Date()
) {
  const instante = agora.getTime();
  const temVolta = kmVolta !== null && kmVolta !== undefined;
  return {
    id: novoId(instante),
    versao: 1,
    unidade: unidade.id,
    unidadeNome: unidade.nome,
    veiculo: nomeDoVeiculo(unidade),
    motoristaId,
    motoristaNome: limparNome(motoristaNome),
    kmSaida,
    kmVolta: temVolta ? kmVolta : null,
    preenchidoEm: agora.toISOString(),
    retornoEm: temVolta ? agora.toISOString() : null,
    itens: Object.fromEntries(IDS_ITENS.map(id => [id, itens[id]])),
    outros: String(outros ?? '')
      .trim()
      .slice(0, 2000),
    excluido: false,
    criadoEm: instante,
    atualizadoEm: instante
  };
}

/** Fecha a viagem: grava o KM de volta e a data/hora do retorno. */
export function registrarRetorno(registro, kmVolta, agora = new Date()) {
  return { ...registro, kmVolta, retornoEm: agora.toISOString() };
}

export const emRota = registro => !registro.excluido && (registro.kmVolta === null || registro.kmVolta === undefined);

export const kmRodados = registro =>
  registro.kmVolta === null || registro.kmVolta === undefined ? null : registro.kmVolta - registro.kmSaida;

/** Conta as respostas e calcula a "condição do veículo" (0 a 100). */
export function resumoDosItens(itens = {}) {
  const contagem = { bom: 0, ruim: 0, faltante: 0 };
  for (const id of IDS_ITENS) {
    const situacao = itens[id];
    if (situacao in contagem) contagem[situacao] += 1;
  }
  const respondidos = contagem.bom + contagem.ruim + contagem.faltante;
  const total = IDS_ITENS.length;
  const condicao = respondidos === 0 ? 0 : Math.round(((contagem.bom + contagem.ruim * 0.5) / respondidos) * 100);
  return {
    ...contagem,
    total,
    respondidos,
    completo: respondidos === total,
    progresso: Math.round((respondidos / total) * 100),
    condicao,
    problemas: contagem.ruim + contagem.faltante
  };
}

/** Pior situação encontrada: 'faltante' > 'ruim' > 'bom' (ou null se nada foi avaliado). */
export const piorSituacao = itens => {
  const resumo = resumoDosItens(itens);
  if (resumo.faltante > 0) return 'faltante';
  if (resumo.ruim > 0) return 'ruim';
  return resumo.bom > 0 ? 'bom' : null;
};

export const temProblema = registro => resumoDosItens(registro.itens).problemas > 0;

/** Último KM conhecido do veículo de uma unidade (para sugerir no próximo preenchimento). */
export function ultimoKm(registros, unidadeId) {
  let melhor = null;
  for (const registro of registros) {
    if (registro.unidade !== unidadeId || registro.excluido) continue;
    const valor = registro.kmVolta ?? registro.kmSaida;
    const quando = Date.parse(registro.retornoEm || registro.preenchidoEm) || 0;
    if (!melhor || quando > melhor.quando) melhor = { km: valor, quando };
  }
  return melhor ? melhor.km : null;
}

/** Ordena do mais recente para o mais antigo. */
export const maisRecentesPrimeiro = (a, b) =>
  (Date.parse(b.preenchidoEm) || 0) - (Date.parse(a.preenchidoEm) || 0) || b.criadoEm - a.criadoEm;
