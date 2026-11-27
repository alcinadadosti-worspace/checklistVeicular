import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  FOTOS_POR_CHECKLIST,
  cofreDeFotos,
  enderecoDaFoto,
  esquecerFoto,
  novoIdDeFoto,
  prepararFoto
} from '../lib/fotosDoChecklist.js';
import { nuvem } from '../lib/nuvem.js';
import Icone from './Icone.jsx';

// Fotos anexadas ao checklist: o campo do passo "Inspeção" (tirar/escolher e remover) e a
// galeria só de leitura da ficha (motorista e administração). Tocar numa foto abre em tela cheia.

const AVISOS = {
  carregando: 'Carregando…',
  aguardando: 'Ainda não chegou',
  'sem-conexao': 'Sem conexão'
};

const NOVA_TENTATIVA = 15000;

/**
 * Endereço da foto para o <img>: do aparelho ou baixada da nuvem. Se ainda não chegou (o
 * motorista está sem sinal) ou faltou conexão, tenta de novo de tempos em tempos.
 */
function useEnderecoDaFoto(id) {
  const [estado, setEstado] = useState({ id: null, url: null, situacao: 'carregando' });
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let vivo = true;
    let relogio = null;
    const deNovo = () => {
      relogio = setTimeout(() => setTentativa(atual => atual + 1), NOVA_TENTATIVA);
    };
    enderecoDaFoto(id, { nuvem }).then(
      url => {
        if (!vivo) return;
        setEstado({ id, url, situacao: url ? 'pronta' : 'aguardando' });
        if (!url) deNovo();
      },
      () => {
        if (!vivo) return;
        setEstado({ id, url: null, situacao: 'sem-conexao' });
        deNovo();
      }
    );
    return () => {
      vivo = false;
      clearTimeout(relogio);
    };
  }, [id, tentativa]);
  return estado.id === id ? estado : { url: null, situacao: 'carregando' };
}

function Miniatura({ foto, indice, aoAbrir, aoRemover }) {
  const { url, situacao } = useEnderecoDaFoto(foto.id);
  return (
    <motion.li
      className="foto"
      data-situacao={situacao}
      layout
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.22 }}
    >
      <button
        type="button"
        className="foto__abrir"
        disabled={!url}
        aria-label={`Ver foto ${indice + 1}`}
        onClick={() => url && aoAbrir(url)}
      >
        {url ? (
          <img src={url} alt="" draggable="false" />
        ) : (
          <span className="foto__aviso">
            <Icone nome="camera" tamanho={20} />
            {AVISOS[situacao]}
          </span>
        )}
      </button>
      {aoRemover ? (
        <button
          type="button"
          className="foto__remover"
          aria-label={`Remover foto ${indice + 1}`}
          onClick={() => aoRemover(foto.id)}
        >
          <Icone nome="xis" tamanho={14} espessura={2.6} />
        </button>
      ) : null}
    </motion.li>
  );
}

/** Foto em tela cheia, por cima de tudo (inclusive da ficha). */
function VisorDeFoto({ url, aoFechar }) {
  useEffect(() => {
    if (!url) return undefined;
    // Na fase de captura: o Esc fecha só a foto, não a ficha que está por baixo.
    const aoTeclar = evento => {
      if (evento.key !== 'Escape') return;
      evento.stopPropagation();
      aoFechar();
    };
    window.addEventListener('keydown', aoTeclar, true);
    return () => window.removeEventListener('keydown', aoTeclar, true);
  }, [url, aoFechar]);

  return createPortal(
    <AnimatePresence>
      {url ? (
        <motion.div
          className="visor"
          role="dialog"
          aria-modal="true"
          aria-label="Foto do checklist"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={aoFechar}
        >
          <motion.img
            src={url}
            alt="Foto anexada ao checklist"
            initial={{ scale: 0.94 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          />
          <button type="button" className="botao-icone visor__fechar" aria-label="Fechar foto" onClick={aoFechar}>
            <Icone nome="xis" tamanho={20} />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

/** Galeria só de leitura (ficha do checklist e revisão). */
export function GaleriaFotos({ fotos }) {
  const [aberta, setAberta] = useState(null);
  if (!fotos?.length) return null;
  return (
    <>
      <ul className="fotos">
        {fotos.map((foto, indice) => (
          <Miniatura key={foto.id} foto={foto} indice={indice} aoAbrir={setAberta} />
        ))}
      </ul>
      <VisorDeFoto url={aberta} aoFechar={() => setAberta(null)} />
    </>
  );
}

/**
 * Campo de fotos do passo "Inspeção". `fotos` = [{ id, largura, altura }] do rascunho;
 * `aoMudar(atualizar)` recebe uma função que leva a lista atual à nova.
 */
export function CampoFotos({
  fotos,
  unidadeId,
  aoMudar,
  aoPreparar,
  rotulo = 'Fotos',
  dica = 'Mostre o que viu: um pneu, um arranhão, uma luz no painel. A administração vê na ficha.'
}) {
  const entrada = useRef(null);
  const [preparando, setPreparando] = useState(0);
  const [erro, setErro] = useState('');
  const [aberta, setAberta] = useState(null);
  const ocupadas = fotos.length + preparando;
  const cabe = ocupadas < FOTOS_POR_CHECKLIST;

  const adicionar = async evento => {
    const escolhidos = [...(evento.target.files || [])];
    evento.target.value = ''; // deixa escolher a mesma foto de novo, se quiser
    if (escolhidos.length === 0) return;
    const arquivos = escolhidos.slice(0, Math.max(0, FOTOS_POR_CHECKLIST - ocupadas));
    setErro(
      escolhidos.length > arquivos.length ? `Dá para anexar até ${FOTOS_POR_CHECKLIST} fotos por checklist.` : ''
    );
    setPreparando(atual => atual + arquivos.length);
    aoPreparar?.(arquivos.length);
    let falhas = 0;
    for (const arquivo of arquivos) {
      try {
        const pronta = await prepararFoto(arquivo);
        const foto = {
          id: novoIdDeFoto(),
          ...pronta,
          unidade: unidadeId,
          registroId: null,
          enviada: false,
          criadoEm: Date.now()
        };
        await cofreDeFotos.guardar(foto);
        aoMudar(atuais =>
          [...atuais, { id: foto.id, largura: foto.largura, altura: foto.altura }].slice(0, FOTOS_POR_CHECKLIST)
        );
      } catch {
        falhas += 1;
      }
      setPreparando(atual => atual - 1);
      aoPreparar?.(-1);
    }
    if (falhas > 0) {
      setErro(falhas === 1 ? 'Não deu para abrir uma das fotos. Tente outra.' : 'Não deu para abrir algumas fotos.');
    }
  };

  const remover = id => {
    aoMudar(atuais => atuais.filter(foto => foto.id !== id));
    cofreDeFotos.apagar(id).catch(() => {});
    esquecerFoto(id);
    setErro('');
  };

  return (
    <div className="campo-fotos">
      <span className="rotulo">
        {rotulo} <em>opcional · até {FOTOS_POR_CHECKLIST}</em>
      </span>
      <ul className="fotos" data-vazio={ocupadas === 0 ? '' : undefined}>
        <AnimatePresence initial={false}>
          {fotos.map((foto, indice) => (
            <Miniatura key={foto.id} foto={foto} indice={indice} aoAbrir={setAberta} aoRemover={remover} />
          ))}
          {Array.from({ length: preparando }, (_, indice) => (
            <motion.li
              key={`preparando-${indice}`}
              className="foto"
              data-situacao="preparando"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <span className="foto__aviso">
                <span className="botao__giro" aria-hidden="true" />
                Preparando…
              </span>
            </motion.li>
          ))}
          {cabe ? (
            <motion.li key="adicionar" className="fotos__adicionar" layout>
              <button type="button" className="foto foto--adicionar" onClick={() => entrada.current?.click()}>
                <Icone nome="camera" tamanho={ocupadas === 0 ? 20 : 22} />
                <span>{ocupadas === 0 ? 'Tirar ou escolher foto' : 'Mais uma'}</span>
              </button>
            </motion.li>
          ) : null}
        </AnimatePresence>
      </ul>
      <input
        ref={entrada}
        className="visualmente-oculto"
        type="file"
        accept="image/*"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        onChange={adicionar}
      />
      {erro ? (
        <p className="campo__erro" role="alert">
          {erro}
        </p>
      ) : (
        <p className="campo__dica">{dica}</p>
      )}
      <VisorDeFoto url={aberta} aoFechar={() => setAberta(null)} />
    </div>
  );
}
