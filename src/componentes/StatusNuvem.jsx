import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { haQuantoTempo } from '../lib/formato.js';
import { useBanco, useSincronizacao } from '../lib/ganchos.js';
import { sincronizacao } from '../lib/sincronizacao.js';
import { Botao } from './Basicos.jsx';
import Icone from './Icone.jsx';

const descrever = (sync, pendentes) => {
  if (!sync.ativa) {
    return {
      tom: 'neutro',
      icone: 'celular',
      texto: 'Modo local',
      detalhe:
        'Os checklists ficam guardados só neste aparelho. Para a administração ver todas as unidades, conecte o banco de dados (veja o README).'
    };
  }
  if (sync.fase === 'sincronizando') {
    return { tom: 'ativo', icone: 'atualizar', texto: 'Sincronizando', detalhe: 'Conferindo a nuvem…', girar: true };
  }
  if (sync.fase === 'offline') {
    return {
      tom: 'aviso',
      icone: 'nuvem-fora',
      texto: pendentes > 0 ? `Offline · ${pendentes} a enviar` : 'Offline',
      detalhe: sync.mensagem
    };
  }
  if (sync.fase === 'erro') {
    return { tom: 'erro', icone: 'alerta', texto: 'Erro na nuvem', detalhe: sync.mensagem };
  }
  if (pendentes > 0) {
    return {
      tom: 'aviso',
      icone: 'nuvem',
      texto: `${pendentes} a enviar`,
      detalhe: 'Há registros salvos no aparelho aguardando envio para a nuvem.'
    };
  }
  return {
    tom: 'ok',
    icone: 'nuvem-ok',
    texto: 'Sincronizado',
    detalhe: 'Tudo o que foi preenchido neste aparelho já está na nuvem.'
  };
};

/** Indicador de sincronização. Toque para ver detalhes e sincronizar na hora. */
export default function StatusNuvem() {
  const sync = useSincronizacao();
  const { pendentes } = useBanco();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef(null);
  const estado = descrever(sync, pendentes);

  useEffect(() => {
    if (!aberto) return undefined;
    const fechar = evento => {
      if (!caixa.current?.contains(evento.target)) setAberto(false);
    };
    const tecla = evento => {
      if (evento.key === 'Escape') setAberto(false);
    };
    document.addEventListener('pointerdown', fechar);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fechar);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  return (
    <div className="status-nuvem" ref={caixa}>
      <button
        type="button"
        className="status-nuvem__botao"
        data-tom={estado.tom}
        aria-expanded={aberto}
        aria-label={`Sincronização: ${estado.texto}`}
        onClick={() => setAberto(valor => !valor)}
      >
        <Icone nome={estado.icone} tamanho={17} className={estado.girar ? 'girando' : ''} />
        <span>{estado.texto}</span>
      </button>
      <AnimatePresence>
        {aberto ? (
          <motion.div
            className="status-nuvem__painel"
            role="status"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16 }}
          >
            <strong>{estado.texto}</strong>
            <p>{estado.detalhe}</p>
            {sync.ativa ? (
              <>
                <p className="status-nuvem__nota">
                  {sync.ultimoSucesso
                    ? `Última sincronização ${haQuantoTempo(sync.ultimoSucesso)}.`
                    : 'Ainda não sincronizou nesta sessão.'}
                  {pendentes > 0 ? ` ${pendentes} registro(s) aguardando envio.` : ''}
                </p>
                <Botao variante="suave" tamanho="p" icone="atualizar" onClick={() => sincronizacao.agora()}>
                  Sincronizar agora
                </Botao>
              </>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
