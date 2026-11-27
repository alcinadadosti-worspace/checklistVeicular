import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig } from 'motion/react';
import Protecao from './componentes/Protecao.jsx';
import { unidadePorId } from './config/frota.js';
import { comMotorista, encerrarSessao, gravarSessao, lembrarMotorista, lerSessao } from './lib/acesso.js';
import { banco } from './lib/banco.js';
import { cofreDeFotos } from './lib/fotosDoChecklist.js';
import { apagarRascunho, gravarRascunho, lerRascunho, novoRascunho } from './lib/rascunho.js';
import { sincronizacao } from './lib/sincronizacao.js';
import Login from './telas/Login.jsx';

const carregarMotorista = () => import('./telas/Motorista.jsx');
const carregarInicio = () => import('./telas/Inicio.jsx');
const carregarChecklist = () => import('./telas/Checklist.jsx');
const carregarAdmin = () => import('./telas/Admin.jsx');
const EscolhaMotorista = lazy(carregarMotorista);
const Inicio = lazy(carregarInicio);
const Checklist = lazy(carregarChecklist);
const Retorno = lazy(() => import('./telas/Retorno.jsx'));
const Sucesso = lazy(() => import('./telas/Sucesso.jsx'));
const Admin = lazy(carregarAdmin);

// Etapas do checklist (Veículo, Inspeção, Revisão): a última é a de número 2.
const ULTIMO_PASSO = 2;

// Unidade sem motorista escolhido (logo depois do código) vai para "Quem está acessando?".
const precisaEscolherMotorista = sessao => sessao?.tipo === 'unidade' && !sessao.motorista;

const telaDeEntrada = sessao =>
  !sessao
    ? { tela: 'login' }
    : sessao.tipo === 'admin'
      ? { tela: 'admin' }
      : precisaEscolherMotorista(sessao)
        ? { tela: 'motorista' }
        : { tela: 'inicio' };

/**
 * Garante que a rota faz sentido para a sessão atual (por exemplo, depois de usar o
 * botão "voltar" do navegador para uma tela de um formulário que já foi enviado).
 */
function corrigirRota(rota, sessao, formularioAtivo) {
  const entrada = telaDeEntrada(sessao);
  if (!sessao) return entrada;
  if (!rota || typeof rota.tela !== 'string') return entrada;
  if (sessao.tipo === 'admin') return rota.tela === 'admin' ? rota : entrada;
  if (precisaEscolherMotorista(sessao)) return entrada;

  switch (rota.tela) {
    case 'inicio':
      return rota;
    case 'motorista':
      return { tela: 'motorista', troca: true }; // já há motorista: é o "Trocar motorista"
    case 'checklist':
      if (rota.formulario && rota.formulario === formularioAtivo) {
        return { ...rota, passo: Math.min(ULTIMO_PASSO, Math.max(0, Number(rota.passo) || 0)) };
      }
      return entrada;
    case 'retorno':
    case 'sucesso':
      return rota.registro && banco.registro(rota.registro) ? rota : entrada;
    default:
      return entrada;
  }
}

function Carregando() {
  return (
    <div className="carregando" role="status">
      <span className="carregando__giro" aria-hidden="true" />
      Carregando…
    </div>
  );
}

export default function App() {
  const [sessao, setSessao] = useState(lerSessao);
  const unidade = sessao?.tipo === 'unidade' ? unidadePorId(sessao.unidadeId) : null;

  // Formulário em andamento (se houver rascunho recente desta unidade, continua nele).
  const formularioAtivo = useRef(unidade ? (lerRascunho(unidade)?.id ?? null) : null);

  const [rota, setRota] = useState(() => corrigirRota(window.history.state, sessao, formularioAtivo.current));
  const sessaoAtual = useRef(sessao);
  sessaoAtual.current = sessao;
  const aposVoltar = useRef(null);

  const ir = useCallback((destino, { substituir = false } = {}) => {
    if (substituir) window.history.replaceState(destino, '');
    else window.history.pushState(destino, '');
    setRota(destino);
  }, []);

  useEffect(() => {
    window.history.replaceState(rota, '');
    const aoNavegar = evento => {
      if (aposVoltar.current) {
        const acao = aposVoltar.current;
        aposVoltar.current = null;
        acao();
        return;
      }
      const destino = corrigirRota(evento.state, sessaoAtual.current, formularioAtivo.current);
      if (destino !== evento.state) window.history.replaceState(destino, '');
      setRota(destino);
    };
    window.addEventListener('popstate', aoNavegar);
    return () => window.removeEventListener('popstate', aoNavegar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sincronizacao.iniciar();
    // fotos de rascunhos abandonados e fotos antigas já enviadas saem do aparelho
    const arrumacao = setTimeout(() => cofreDeFotos.arrumar().catch(() => {}), 8000);
    return () => {
      clearTimeout(arrumacao);
      sincronizacao.parar();
    };
  }, []);

  // Enquanto a pessoa digita o código, já adianta o download da próxima tela.
  useEffect(() => {
    if (rota.tela !== 'login') return undefined;
    const relogio = setTimeout(() => {
      carregarMotorista().catch(() => {});
      carregarInicio().catch(() => {});
      carregarChecklist().catch(() => {});
    }, 1200);
    return () => clearTimeout(relogio);
  }, [rota.tela]);

  /* --- ações ------------------------------------------------------------------------ */

  const entrar = useCallback(
    nova => {
      gravarSessao(nova);
      sessaoAtual.current = nova;
      const novaUnidade = nova.tipo === 'unidade' ? unidadePorId(nova.unidadeId) : null;
      formularioAtivo.current = novaUnidade ? (lerRascunho(novaUnidade)?.id ?? null) : null;
      setSessao(nova);
      ir(telaDeEntrada(nova), { substituir: true });
    },
    [ir]
  );

  const sair = useCallback(() => {
    encerrarSessao();
    sessaoAtual.current = null;
    formularioAtivo.current = null;
    setSessao(null);
    ir({ tela: 'login' }, { substituir: true });
  }, [ir]);

  /**
   * Volta `etapas` telas no histórico do navegador e então troca a tela atual por `destino`
   * (assim o botão "voltar" do celular não reabre uma tela que já foi concluída).
   */
  const voltarEtapas = useCallback(
    (etapas, destino) => {
      const finalizar = () => ir(destino, { substituir: true });
      if (etapas <= 0) {
        finalizar();
        return;
      }
      aposVoltar.current = finalizar;
      window.history.go(-etapas);
      // Se o navegador não tiver para onde voltar, segue em frente mesmo assim.
      setTimeout(() => {
        if (aposVoltar.current !== finalizar) return;
        aposVoltar.current = null;
        finalizar();
      }, 700);
    },
    [ir]
  );

  // Tocou no crachá: a sessão passa a ter o motorista e o app vai para o início.
  const escolherMotorista = (id, nomeOutro) => {
    const nova = comMotorista(sessaoAtual.current, id, nomeOutro);
    if (!nova?.motorista) return;
    gravarSessao(nova);
    sessaoAtual.current = nova;
    setSessao(nova);
    lembrarMotorista(unidadePorId(nova.unidadeId), id, nomeOutro);
    if (rota.troca) voltarEtapas(1, { tela: 'inicio' });
    else ir({ tela: 'inicio' }, { substituir: true });
  };

  const iniciarChecklist = useCallback(() => {
    if (!unidade) return;
    let rascunho = lerRascunho(unidade);
    if (!rascunho) {
      rascunho = novoRascunho();
      gravarRascunho(unidade, rascunho);
    }
    formularioAtivo.current = rascunho.id;
    ir({ tela: 'checklist', formulario: rascunho.id, passo: 0 });
  }, [ir, unidade]);

  // Depois de enviar, as etapas do formulário saem do histórico do navegador: o botão
  // "voltar" na tela de sucesso leva ao início, não a um formulário já enviado.
  const concluirChecklist = useCallback(
    (registroId, passoAtual) => {
      formularioAtivo.current = null;
      if (unidade) apagarRascunho(unidade);
      voltarEtapas(Math.max(0, Number(passoAtual) || 0), { tela: 'sucesso', registro: registroId });
    },
    [unidade, voltarEtapas]
  );

  const voltar = useCallback(() => window.history.back(), []);

  /* --- telas ------------------------------------------------------------------------ */

  let conteudo;
  if (rota.tela === 'login' || !sessao) {
    conteudo = <Login key="login" aoEntrar={entrar} />;
  } else if (rota.tela === 'admin') {
    conteudo = <Admin key="admin" aoSair={sair} />;
  } else if (rota.tela === 'motorista' || precisaEscolherMotorista(sessao)) {
    conteudo = (
      <EscolhaMotorista
        key="motorista"
        unidade={unidade}
        atual={sessao.motorista}
        troca={Boolean(rota.troca && sessao.motorista)}
        aoEscolher={escolherMotorista}
        aoVoltar={voltar}
        aoSair={sair}
      />
    );
  } else if (rota.tela === 'checklist') {
    conteudo = (
      <Checklist
        key={`checklist-${rota.formulario}`}
        unidade={unidade}
        motorista={sessao.motorista}
        formularioId={rota.formulario}
        passo={rota.passo}
        aoMudarPasso={passo => {
          if (passo < rota.passo) window.history.go(passo - rota.passo);
          else ir({ ...rota, passo });
        }}
        aoVoltar={voltar}
        aoConcluir={concluirChecklist}
      />
    );
  } else if (rota.tela === 'retorno') {
    conteudo = (
      <Retorno
        key={`retorno-${rota.registro}`}
        unidade={unidade}
        registroId={rota.registro}
        aoVoltar={voltar}
        aoConcluir={registroId => ir({ tela: 'sucesso', registro: registroId }, { substituir: true })}
      />
    );
  } else if (rota.tela === 'sucesso') {
    conteudo = (
      <Sucesso
        key={`sucesso-${rota.registro}`}
        unidade={unidade}
        registroId={rota.registro}
        aoVoltar={() => ir({ tela: 'inicio' }, { substituir: true })}
      />
    );
  } else {
    conteudo = (
      <Inicio
        key="inicio"
        unidade={unidade}
        motorista={sessao.motorista}
        aoIniciar={iniciarChecklist}
        aoTrocarMotorista={() => ir({ tela: 'motorista', troca: true })}
        aoRetornar={registroId => ir({ tela: 'retorno', registro: registroId })}
        aoSair={sair}
      />
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      {/* se uma tela falhar, a barreira "zera" quando a pessoa muda de tela */}
      <Protecao reiniciarCom={rota.tela}>
        <Suspense fallback={<Carregando />}>
          <AnimatePresence mode="wait" initial={false}>
            {conteudo}
          </AnimatePresence>
        </Suspense>
      </Protecao>
    </MotionConfig>
  );
}
