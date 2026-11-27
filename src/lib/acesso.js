// Códigos de acesso e sessão.
//
// O código digitado nunca é comparado com um código escrito no site: comparamos o hash
// dele com os hashes de src/config/frota.js. Importante: é uma barreira simples (o site
// é estático e roda inteiro no navegador), não um controle de acesso forte.

import { ADMIN, UNIDADES, motoristaPorId, motoristasDaUnidade, unidadePorId } from '../config/frota.js';
import { gravarPreferencia, lerPreferencia } from './banco.js';
import { limparNome } from './formato.js';
import { hashDoCodigo } from './hash.js';

export const CODIGO_MINIMO = 4;
export const CODIGO_MAXIMO = 6;

/** Devolve a sessão correspondente ao código, ou null se o código não existir. */
export function identificar(codigo) {
  const texto = String(codigo ?? '').trim();
  if (texto.length < CODIGO_MINIMO) return null;
  const hash = hashDoCodigo(texto);
  if (hash === ADMIN.codigoHash) return { tipo: 'admin' };
  const unidade = UNIDADES.find(item => item.codigoHash === hash);
  return unidade ? { tipo: 'unidade', unidadeId: unidade.id } : null;
}

/** Motorista escolhido ao entrar, se ele for uma das opções da unidade ("Outro" precisa de nome). */
const motoristaValido = (unidade, motorista) => {
  if (!motorista || typeof motorista !== 'object') return null;
  if (!motoristasDaUnidade(unidade).some(opcao => opcao.id === motorista.id)) return null;
  const nomeOutro = motorista.id === 'outro' ? limparNome(motorista.nomeOutro) : '';
  if (motorista.id === 'outro' && !nomeOutro) return null;
  return { id: motorista.id, nomeOutro };
};

// Sessão da unidade: { tipo, unidadeId, motorista }. Sem `motorista` (logo depois do código, ou
// numa sessão de antes desta mudança), o app pergunta quem está acessando.
export const sessaoValida = sessao => {
  if (!sessao || typeof sessao !== 'object') return null;
  if (sessao.tipo === 'admin') return { tipo: 'admin' };
  const unidade = sessao.tipo === 'unidade' ? unidadePorId(sessao.unidadeId) : null;
  if (!unidade) return null;
  const motorista = motoristaValido(unidade, sessao.motorista);
  return motorista ? { tipo: 'unidade', unidadeId: unidade.id, motorista } : { tipo: 'unidade', unidadeId: unidade.id };
};

/** A mesma sessão, agora com o motorista que tocou no crachá. */
export const comMotorista = (sessao, id, nomeOutro = '') => sessaoValida({ ...sessao, motorista: { id, nomeOutro } });

export const lerSessao = () => sessaoValida(lerPreferencia('sessao'));
export const gravarSessao = sessao => gravarPreferencia('sessao', sessaoValida(sessao));
export const encerrarSessao = () => gravarPreferencia('sessao', null);

/**
 * Motorista usado por último neste aparelho para a unidade, se ele ainda for uma das opções
 * dela (senão, o motorista padrão da unidade). Serve para já deixar escrito o nome do "Outro".
 */
export function motoristaDaUnidade(unidade) {
  const salvo = lerPreferencia(`motorista.${unidade.id}`);
  const motorista =
    motoristasDaUnidade(unidade).find(opcao => opcao.id === salvo?.id) || motoristaPorId(unidade.motoristaPadrao);
  const nomeOutro = motorista.id === 'outro' ? limparNome(salvo?.nome) : '';
  if (motorista.id === 'outro' && !nomeOutro) {
    return { id: unidade.motoristaPadrao, nomeOutro: '' };
  }
  return { id: motorista.id, nomeOutro };
}

export const lembrarMotorista = (unidade, id, nomeOutro = '') =>
  gravarPreferencia(`motorista.${unidade.id}`, { id, nome: id === 'outro' ? limparNome(nomeOutro) : '' });

/** Nome que vai para o registro e para o crachá. */
export const nomeDoMotorista = (id, nomeOutro = '') =>
  id === 'outro' ? limparNome(nomeOutro) : (motoristaPorId(id)?.nome ?? '');
