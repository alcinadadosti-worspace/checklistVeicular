// Sincronização entre o banco local do aparelho e a nuvem.
//
// Ciclo: 1) busca o que mudou na nuvem e junta com o local; 2) envia os checklists pendentes;
// 3) envia as fotos anexadas que ainda não subiram; 4) tira da nuvem as fotos de checklists excluídos.
// Roda ao abrir o app, ao voltar a internet, ao voltar para a aba, depois de cada
// gravação e de tempos em tempos. Se falhar, tenta de novo sozinha (com espera crescente).

import { banco } from './banco.js';
import { cofreDeFotos } from './fotosDoChecklist.js';
import { nuvem as nuvemPadrao } from './nuvem.js';
import { fotosDoRegistro, normalizarRegistro } from './registros.js';

const ESPERAS_APOS_ERRO = [5000, 15000, 30000, 60000, 120000];

export function criarSincronizacao({
  nuvem = nuvemPadrao,
  dados = banco,
  fotos = cofreDeFotos,
  ambiente = globalThis
} = {}) {
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

  // Checklist excluído: as fotos dele saem do aparelho e entram na fila para sair da nuvem
  // (passo 4, que tenta de novo a cada ciclo até conseguir). Foto que nunca subiu só sai daqui.
  const apagarFotosDe = async registro => {
    for (const { id } of fotosDoRegistro(registro)) {
      const local = await fotos.ler(id);
      if (local && !local.enviada && !local.apagar) await fotos.apagar(id);
      else await fotos.marcarParaApagar(id);
    }
  };

  const ciclo = async () => {
    // 1) nuvem -> aparelho
    const { registros, cursor } = await nuvem.buscar(dados.cursor());
    dados.aplicarRemotos(registros, cursor);
    // Excluído em outro aparelho (ex.: pela administração): as fotos que este aparelho tem
    // (inclusive as que ele mesmo enviou) também saem.
    for (const remoto of registros) {
      if (!remoto?.excluido) continue;
      for (const { id } of fotosDoRegistro(normalizarRegistro(remoto))) {
        const local = await fotos.ler(id);
        if (!local || local.apagar) continue;
        if (local.enviada) await fotos.marcarParaApagar(id);
        else await fotos.apagar(id); // nunca subiu: só sai do aparelho
      }
    }

    // 2) aparelho -> nuvem
    let recusados = 0;
    let erroDeDados = null;
    const recusar = erro => {
      // Um registro ou foto recusado (dados/permissão) não deve travar o envio dos outros.
      if (erro?.tipo !== 'dados' && erro?.tipo !== 'permissao') throw erro;
      recusados += 1;
      erroDeDados = erro;
    };
    for (const id of dados.pendentes()) {
      const registro = dados.registro(id);
      if (!registro) continue;
      try {
        await nuvem.enviar(registro);
        dados.confirmarEnvio(id, registro.atualizadoEm);
      } catch (erro) {
        recusar(erro);
        continue;
      }
      if (registro.excluido) await apagarFotosDe(registro);
    }

    // 3) fotos anexadas -> nuvem, só depois que o checklist delas chegou (o texto vem primeiro)
    const aindaPendentes = new Set(dados.pendentes());
    for (const foto of await fotos.pendentes()) {
      const registro = dados.registro(foto.registroId);
      if (registro?.excluido) {
        await fotos.apagar(foto.id);
        continue;
      }
      if (aindaPendentes.has(foto.registroId)) continue;
      try {
        await nuvem.enviarFoto(foto);
        await fotos.marcarEnviada(foto.id);
      } catch (erro) {
        recusar(erro);
      }
    }

    // 4) fotos de checklists excluídos -> fora da nuvem
    for (const { id } of await fotos.aApagar()) {
      try {
        await nuvem.apagarFoto(id);
      } catch (erro) {
        if (erro?.tipo === 'rede' || erro?.tipo === 'servidor') break; // tenta no próximo ciclo
        // Recusado: a foto não está na nuvem (nunca subiu) ou o checklist dela sumiu de vez.
      }
      await fotos.apagar(id);
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
