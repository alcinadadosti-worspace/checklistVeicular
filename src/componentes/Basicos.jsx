import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { situacaoPorId } from '../config/frota.js';
import Icone from './Icone.jsx';

/** Entrada/saída padrão das telas. */
export const transicaoDeTela = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -14 },
  transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] }
};

export function Botao({
  children,
  variante = 'solido',
  tamanho = 'm',
  icone,
  iconeDepois,
  carregando = false,
  className = '',
  disabled,
  type = 'button',
  ...resto
}) {
  return (
    <motion.button
      type={type}
      whileTap={disabled || carregando ? undefined : { scale: 0.97 }}
      className={`botao botao--${variante} botao--${tamanho}${className ? ` ${className}` : ''}`}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      {...resto}
    >
      {carregando ? (
        <span className="botao__giro" aria-hidden="true" />
      ) : icone ? (
        <Icone nome={icone} tamanho={20} />
      ) : null}
      <span className="botao__texto">{children}</span>
      {iconeDepois ? <Icone nome={iconeDepois} tamanho={20} /> : null}
    </motion.button>
  );
}

export function BotaoIcone({ icone, rotulo, className = '', ...resto }) {
  return (
    <button
      type="button"
      className={`botao-icone${className ? ` ${className}` : ''}`}
      aria-label={rotulo}
      title={rotulo}
      {...resto}
    >
      <Icone nome={icone} tamanho={20} />
    </button>
  );
}

/** Barra do topo: marca ou botão de voltar, título e ações à direita. */
export function Topo({ titulo, subtitulo, aoVoltar, acoes }) {
  return (
    <header className="topo">
      <div className="topo__lado">
        {aoVoltar ? (
          <BotaoIcone icone="seta-esquerda" rotulo="Voltar" onClick={aoVoltar} />
        ) : (
          <span className="topo__marca" aria-hidden="true">
            <Icone nome="volante" tamanho={22} espessura={2.1} />
          </span>
        )}
        <div className="topo__textos">
          <strong>{titulo}</strong>
          {subtitulo ? <span>{subtitulo}</span> : null}
        </div>
      </div>
      {acoes ? <div className="topo__acoes">{acoes}</div> : null}
    </header>
  );
}

const ICONE_DA_SITUACAO = { bom: 'check', ruim: 'alerta', faltante: 'xis' };

/** Selo colorido de uma situação: Bom / Ruim / Faltante. */
export function SeloSituacao({ situacao, curto = false }) {
  const dados = situacaoPorId(situacao);
  if (!dados) return <span className="selo selo--pendente">Pendente</span>;
  return (
    <span className={`selo selo--${dados.id}`}>
      <Icone nome={ICONE_DA_SITUACAO[dados.id]} tamanho={14} espessura={2.4} />
      {curto ? dados.curto : dados.nome}
    </span>
  );
}

export const iconeDaSituacao = situacao => ICONE_DA_SITUACAO[situacao] || 'info';

/** Painel que sobe do rodapé no celular e vira janela centralizada em telas largas. */
export function Folha({ aberta, aoFechar, titulo, subtitulo, children, rodape }) {
  const painel = useRef(null);

  useEffect(() => {
    if (!aberta) return undefined;
    const anterior = document.activeElement;
    const aoTeclar = evento => {
      if (evento.key === 'Escape') {
        evento.stopPropagation();
        aoFechar();
      }
    };
    document.addEventListener('keydown', aoTeclar);
    const rolagem = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    painel.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = rolagem;
      if (anterior instanceof HTMLElement) anterior.focus({ preventScroll: true });
    };
  }, [aberta, aoFechar]);

  return (
    <AnimatePresence>
      {aberta ? (
        <motion.div
          className="folha__fundo"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onPointerDown={evento => {
            if (evento.target === evento.currentTarget) aoFechar();
          }}
        >
          <motion.section
            ref={painel}
            className="folha"
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
            tabIndex={-1}
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            <header className="folha__topo">
              <div>
                <h2>{titulo}</h2>
                {subtitulo ? <p>{subtitulo}</p> : null}
              </div>
              <BotaoIcone icone="xis" rotulo="Fechar" onClick={aoFechar} />
            </header>
            <div className="folha__corpo">{children}</div>
            {rodape ? <footer className="folha__rodape">{rodape}</footer> : null}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Número que "conta" até o valor quando muda. */
export function Contador({ valor, formatar = v => String(Math.round(v)) }) {
  const ref = useRef(null);
  const anterior = useRef(0);
  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return undefined;
    const de = anterior.current;
    const para = Number.isFinite(valor) ? valor : 0;
    anterior.current = para;
    const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduzir || de === para) {
      elemento.textContent = formatar(para);
      return undefined;
    }
    const inicio = performance.now();
    const duracao = 700;
    let quadro = 0;
    const passo = agora => {
      const t = Math.min(1, (agora - inicio) / duracao);
      const suave = 1 - Math.pow(1 - t, 3);
      elemento.textContent = formatar(de + (para - de) * suave);
      if (t < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [valor, formatar]);
  return <span ref={ref}>{formatar(Number.isFinite(valor) ? valor : 0)}</span>;
}
