// Rascunho do checklist: o que o motorista já preencheu fica guardado no aparelho até o
// envio, para não se perder se o navegador recarregar a página ou ele trocar de aplicativo.

import { motoristasDaUnidade } from '../config/frota.js';
import { motoristaDaUnidade } from './acesso.js';
import { gravarPreferencia, lerPreferencia } from './banco.js';

const VALIDADE = 12 * 60 * 60 * 1000; // um rascunho com mais de 12 h é descartado
const chave = unidade => `rascunho.${unidade.id}`;

const identificador = () => `rs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function novoRascunho(unidade) {
  const motorista = motoristaDaUnidade(unidade);
  return {
    id: identificador(),
    em: Date.now(),
    dados: {
      motoristaId: motorista.id,
      nomeOutro: motorista.nomeOutro,
      kmSaida: '',
      kmVolta: '',
      informarVolta: false,
      itens: {},
      outros: ''
    }
  };
}

export function lerRascunho(unidade) {
  const salvo = lerPreferencia(chave(unidade));
  if (!salvo || typeof salvo !== 'object' || typeof salvo.id !== 'string' || !salvo.dados) return null;
  if (Date.now() - (salvo.em || 0) > VALIDADE) return null;
  // Motorista que deixou de ser opção desta unidade: volta para o motorista dela.
  if (!motoristasDaUnidade(unidade).some(opcao => opcao.id === salvo.dados.motoristaId)) {
    const motorista = motoristaDaUnidade(unidade);
    return { ...salvo, dados: { ...salvo.dados, motoristaId: motorista.id, nomeOutro: motorista.nomeOutro } };
  }
  return salvo;
}

export const gravarRascunho = (unidade, rascunho) => gravarPreferencia(chave(unidade), rascunho);
export const apagarRascunho = unidade => gravarPreferencia(chave(unidade), null);
