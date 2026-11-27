// Rascunho do checklist: o que o motorista já preencheu fica guardado no aparelho até o
// envio, para não se perder se o navegador recarregar a página ou ele trocar de aplicativo.
// O motorista não fica no rascunho: é quem tocou no crachá ao entrar (está na sessão).

import { gravarPreferencia, lerPreferencia } from './banco.js';

const VALIDADE = 12 * 60 * 60 * 1000; // um rascunho com mais de 12 h é descartado
const chave = unidade => `rascunho.${unidade.id}`;

const identificador = () => `rs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function novoRascunho() {
  return {
    id: identificador(),
    em: Date.now(),
    dados: {
      kmSaida: '',
      itens: {},
      outros: '',
      fotos: [] // [{ id, largura, altura }]; a imagem fica no cofre de fotos do aparelho
    }
  };
}

export function lerRascunho(unidade) {
  const salvo = lerPreferencia(chave(unidade));
  if (!salvo || typeof salvo !== 'object' || typeof salvo.id !== 'string' || !salvo.dados) return null;
  if (Date.now() - (salvo.em || 0) > VALIDADE) return null;
  return salvo;
}

export const gravarRascunho = (unidade, rascunho) => gravarPreferencia(chave(unidade), rascunho);
export const apagarRascunho = unidade => gravarPreferencia(chave(unidade), null);
