// Sincronização entre o banco local do aparelho e a nuvem.
//
// Ciclo: 1) busca o que mudou na nuvem e junta com o local; 2) envia o que está pendente.
// Roda ao abrir o app, ao voltar a internet, ao voltar para a aba, depois de cada
// gravação e de tempos em tempos. Se falhar, tenta de novo sozinha (com espera crescente).

import { banco } from './banco.js';
import { nuvem as nuvemPadrao } from './nuvem.js';

const ESPERAS_APOS_ERRO = [5000, 15000, 30000, 60000, 120000];

export function criarSincronizacao({ nuvem = nuvemPadrao, dados = banco, ambiente = globalThis } = {}) {
  let situacao = {
    ativa: nuvem.ativa,
    fase: nuvem.ativa ? 'aguardando' : 'local', // 'local' | 'aguardando' | 'sincronizando' | 'em-dia' | 'offline' | 'erro'
    mensagem: null,
    ultimoSucesso: null,
    recusados: 0
  };
  const ouvintes = new Set();
  let emCurso = null;
  let pedidoExtra = false;
  let relogio = null;
  let falhas = 0;
  let intervalo = 180000;
  let iniciada = false;

  const mudar = parte => {
    situacao = { ...situacao, ...parte };
    for (const ouvinte of ouvintes) ouvinte();
  };

  const online = () => ambiente.navigator?.onLine !== false;
  const visivel = () => !ambiente.document || ambiente.document.visibilityState !== 'hidden';

  const agendar = espera => {
    if (!iniciada) return;
    ambiente.clearTimeout(relogio);
    relogio = ambiente.setTimeout(() => {
      if (visivel()) sincronizar();
      else agendar(intervalo);
    }, espera);
  };

  const ciclo = async () => {
    // 1) nuvem -> aparelho
    const { registros, cursor } = await nuvem.buscar(dados.cursor());
    dados.aplicarRemotos(registros, cursor);

    // 2) aparelho -> nuvem
    let recusados = 0;
    let erroDeDados = null;
    for (const id of dados.pendentes()) {
      const registro = dados.registro(id);
      if (!registro) continue;
      try {
        await nuvem.enviar(registro);
        dados.confirmarEnvio(id, registro.atualizadoEm);
      } catch (erro) {
        // Um registro recusado (dados/permissão) não deve travar o envio dos outros.
        if (erro?.tipo === 'dados' || erro?.tipo === 'permissao') {
          recusados += 1;
          erroDeDados = erro;
          continue;
        }
        throw erro;
      }
    }
    if (erroDeDados) {
      const recusa = new Error(erroDeDados.message);
      recusa.tipo = erroDeDados.tipo;
      recusa.recusados = recusados;
      throw recusa;
    }
  };

  async function sincronizar() {
    if (!nuvem.ativa) return situacao;
    if (emCurso) {
      pedidoExtra = true; // algo mudou durante o ciclo: roda mais um ao terminar
      return emCurso;
    }
    if (!online()) {
      mudar({
        fase: 'offline',
        mensagem: 'Sem internet. Tudo fica salvo no aparelho e é enviado quando a conexão voltar.'
      });
      agendar(15000);
      return situacao;
    }

    mudar({ fase: 'sincronizando', mensagem: null });
    emCurso = (async () => {
      try {
        await ciclo();
        falhas = 0;
        mudar({ fase: 'em-dia', mensagem: null, ultimoSucesso: Date.now(), recusados: 0 });
        agendar(dados.pendentes().length > 0 ? 3000 : intervalo);
      } catch (erro) {
        falhas += 1;
        const semRede = erro?.tipo === 'rede';
        mudar({
          fase: semRede ? 'offline' : 'erro',
          mensagem: semRede
            ? 'Sem conexão com a nuvem. Tudo fica salvo no aparelho e é enviado quando a conexão voltar.'
            : erro?.message || 'Não foi possível sincronizar.',
          recusados: erro?.recusados || 0
        });
        agendar(ESPERAS_APOS_ERRO[Math.min(falhas - 1, ESPERAS_APOS_ERRO.length - 1)]);
      } finally {
        emCurso = null;
      }
      if (pedidoExtra) {
        pedidoExtra = false;
        return sincronizar();
      }
      return situacao;
    })();
    return emCurso;
  }

  const aoVoltar = () => {
    if (visivel()) sincronizar();
  };
  let atraso = null;
  const aoGravar = () => {
    if (dados.pendentes().length === 0) return;
    ambiente.clearTimeout(atraso);
    atraso = ambiente.setTimeout(sincronizar, 400);
  };
  let pararDeOuvir = null;

  return {
    assinar(ouvinte) {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
    obter: () => situacao,
    agora: sincronizar,

    /** Com que frequência conferir a nuvem enquanto o app está aberto (a tela da administração usa 30 s). */
    definirIntervalo(ms) {
      intervalo = ms;
      if (iniciada && !emCurso) agendar(ms);
    },

    iniciar() {
      if (iniciada || !nuvem.ativa) return;
      iniciada = true;
      ambiente.addEventListener?.('online', aoVoltar);
      ambiente.addEventListener?.('focus', aoVoltar);
      ambiente.document?.addEventListener?.('visibilitychange', aoVoltar);
      pararDeOuvir = dados.assinar(aoGravar);
      sincronizar();
    },

    parar() {
      iniciada = false;
      ambiente.clearTimeout(relogio);
      ambiente.clearTimeout(atraso);
      ambiente.removeEventListener?.('online', aoVoltar);
      ambiente.removeEventListener?.('focus', aoVoltar);
      ambiente.document?.removeEventListener?.('visibilitychange', aoVoltar);
      pararDeOuvir?.();
    }
  };
}

export const sincronizacao = criarSincronizacao();
