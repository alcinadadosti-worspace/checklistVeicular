import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Botao, BotaoIcone, Topo, transicaoDeTela } from '../componentes/Basicos.jsx';
import Icone from '../componentes/Icone.jsx';
import { motoristasDaUnidade } from '../config/frota.js';
import { motoristaDaUnidade } from '../lib/acesso.js';
import { desenharFrente } from '../lib/cracha.js';
import { fotoDe } from '../lib/fotos.js';
import { limparNome } from '../lib/formato.js';

// Tela "Quem está acessando?": aparece logo depois do código da unidade (e no botão "Trocar
// motorista" do início). Cada motorista da unidade é um crachá pendurado; tocar nele entra
// no app com o nome dele. "Outro motorista" fica embaixo, com o campo do nome.

const ESPERA_DA_ANIMACAO = 520;

/** Desenha a frente do crachá (a mesma arte do crachá 3D da tela inicial). */
function useArteDoCracha(motorista, unidade) {
  const [arte, setArte] = useState(null);
  useEffect(() => {
    let vivo = true;
    desenharFrente({
      nome: motorista.nome,
      cargo: 'Motorista',
      unidade: unidade.nome,
      veiculo: unidade.veiculo.apelido,
      fotoUrl: fotoDe(motorista.foto),
      foco: motorista.foco,
      zoom: motorista.zoom
    })
      .then(imagem => {
        if (vivo) setArte(imagem);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [motorista, unidade]);
  return arte;
}

function CrachaParaEscolher({ motorista, unidade, indice, estado, atual, aoEscolher }) {
  const arte = useArteDoCracha(motorista, unidade);
  return (
    <motion.li
      className="cracha-escolha"
      data-estado={estado}
      initial={{ opacity: 0, y: -110, rotate: indice % 2 ? 7 : -7 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 130, damping: 11, delay: 0.12 + indice * 0.14 }}
    >
      <motion.button
        type="button"
        className="cracha-escolha__botao"
        aria-label={`Entrar como ${motorista.nome}`}
        disabled={estado !== 'livre'}
        animate={
          estado === 'escolhido'
            ? { scale: 1.05, y: -6 }
            : estado === 'descartado'
              ? { scale: 0.93, opacity: 0.25 }
              : {}
        }
        whileTap={estado === 'livre' ? { scale: 0.96 } : undefined}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        onClick={() => aoEscolher(motorista.id)}
      >
        {/* balanço leve, como um crachá pendurado (some com "reduzir movimento") */}
        <motion.span
          className="cracha-escolha__balanco"
          animate={{ rotate: [-1.8, 1.8] }}
          transition={{
            duration: 2.4 + indice * 0.45,
            repeat: Infinity,
            repeatType: 'mirror',
            ease: 'easeInOut',
            delay: indice * 0.3
          }}
        >
          <span className="cracha-escolha__cordao" aria-hidden="true" />
          <span className="cracha-escolha__presilha" aria-hidden="true" />
          <span className="cracha-escolha__cartao" data-carregando={arte ? undefined : ''}>
            {arte ? <img src={arte} alt="" draggable="false" /> : <strong>{motorista.nome}</strong>}
          </span>
        </motion.span>
        <span className="cracha-escolha__legenda">
          <strong>{motorista.nome}</strong>
          {atual ? <span>Acessando agora</span> : null}
        </span>
      </motion.button>
    </motion.li>
  );
}

export default function EscolhaMotorista({ unidade, atual, troca, aoEscolher, aoVoltar, aoSair }) {
  const opcoes = motoristasDaUnidade(unidade);
  const comCracha = opcoes.filter(opcao => opcao.id !== 'outro');
  const temOutro = opcoes.some(opcao => opcao.id === 'outro');

  const [escolhido, setEscolhido] = useState(null);
  const [outroAberto, setOutroAberto] = useState(atual?.id === 'outro');
  const [nomeOutro, setNomeOutro] = useState(() => {
    if (atual?.id === 'outro') return atual.nomeOutro;
    const ultimo = motoristaDaUnidade(unidade);
    return ultimo.id === 'outro' ? ultimo.nomeOutro : '';
  });
  const [erro, setErro] = useState('');
  const relogio = useRef(null);
  const campo = useRef(null);

  useEffect(() => () => clearTimeout(relogio.current), []);

  const escolher = (id, nome = '') => {
    if (escolhido) return;
    setEscolhido(id);
    navigator.vibrate?.(30);
    relogio.current = setTimeout(() => aoEscolher(id, nome), ESPERA_DA_ANIMACAO);
  };

  const entrarComoOutro = evento => {
    evento.preventDefault();
    const nome = limparNome(nomeOutro);
    if (!nome) {
      setErro('Digite o nome do motorista.');
      navigator.vibrate?.(90);
      campo.current?.focus();
      return;
    }
    escolher('outro', nome);
  };

  const estadoDe = id => (!escolhido ? 'livre' : escolhido === id ? 'escolhido' : 'descartado');

  return (
    <motion.main className="tela tela--motorista" {...transicaoDeTela}>
      <Topo
        titulo={unidade.nome}
        subtitulo={unidade.veiculo.apelido}
        aoVoltar={troca ? aoVoltar : undefined}
        acoes={troca ? null : <BotaoIcone icone="sair" rotulo="Sair" onClick={aoSair} />}
      />

      <div className="conteudo escolha">
        <motion.header
          className="escolha__topo"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="sobretitulo">{troca ? 'Trocar motorista' : 'Antes de começar'}</span>
          <h1>
            Quem está <span className="degrade">acessando</span>?
          </h1>
          <p className="texto-2">Toque no seu crachá para entrar.</p>
        </motion.header>

        <ul className="crachas" aria-label="Motoristas da unidade" style={{ '--cartoes': comCracha.length }}>
          {comCracha.map((motorista, indice) => (
            <CrachaParaEscolher
              key={motorista.id}
              motorista={motorista}
              unidade={unidade}
              indice={indice}
              estado={estadoDe(motorista.id)}
              atual={atual?.id === motorista.id}
              aoEscolher={escolher}
            />
          ))}
        </ul>

        {temOutro ? (
          <motion.div
            className="escolha__outro"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: escolhido && escolhido !== 'outro' ? 0.3 : 1, y: 0 }}
            transition={{ duration: 0.4, delay: escolhido ? 0 : 0.45 }}
          >
            <button
              type="button"
              className="motorista"
              data-ativo={outroAberto ? '' : undefined}
              aria-expanded={outroAberto}
              disabled={Boolean(escolhido)}
              onClick={() => {
                setOutroAberto(aberto => !aberto);
                setErro('');
              }}
            >
              <span className="motorista__foto">
                <Icone nome="usuario" tamanho={26} />
              </span>
              <span className="motorista__textos">
                <strong>Outro motorista</strong>
                <span>{atual?.id === 'outro' ? 'Acessando agora' : 'Não está acima? Digite o nome'}</span>
              </span>
              <span className="motorista__marca" aria-hidden="true">
                <Icone nome="check" tamanho={16} espessura={2.6} />
              </span>
            </button>

            <AnimatePresence initial={false}>
              {outroAberto ? (
                <motion.form
                  key="outro"
                  className="escolha__formulario"
                  noValidate
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  onSubmit={entrarComoOutro}
                >
                  <div className="campo">
                    <label className="rotulo" htmlFor="nome-outro">
                      Nome do motorista
                    </label>
                    <input
                      ref={campo}
                      id="nome-outro"
                      className="entrada"
                      type="text"
                      value={nomeOutro}
                      maxLength={40}
                      autoComplete="name"
                      autoCapitalize="words"
                      enterKeyHint="go"
                      placeholder="Digite o nome completo"
                      aria-invalid={erro ? true : undefined}
                      disabled={Boolean(escolhido)}
                      onChange={evento => {
                        setNomeOutro(evento.target.value);
                        if (erro) setErro('');
                      }}
                    />
                    {erro ? (
                      <p className="campo__erro" role="alert">
                        {erro}
                      </p>
                    ) : null}
                  </div>
                  <Botao type="submit" iconeDepois="seta-direita" carregando={escolhido === 'outro'}>
                    Entrar
                  </Botao>
                </motion.form>
              ) : null}
            </AnimatePresence>
          </motion.div>
        ) : null}
      </div>
    </motion.main>
  );
}
