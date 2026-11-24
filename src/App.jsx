import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig } from 'motion/react';
import Protecao from './componentes/Protecao.jsx';
import { unidadePorId } from './config/frota.js';
import { encerrarSessao, gravarSessao, lerSessao } from './lib/acesso.js';
import { banco } from './lib/banco.js';
import { apagarRascunho, gravarRascunho, lerRascunho, novoRascunho } from './lib/rascunho.js';
import { sincronizacao } from './lib/sincronizacao.js';
import Login from './telas/Login.jsx';

const carregarInicio = () => import('./telas/Inicio.jsx');
const carregarChecklist = () => import('./telas/Checklist.jsx');
const carregarAdmin = () => import('./telas/Admin.jsx');
const Inicio = lazy(carregarInicio);
const Checklist = lazy(carregarChecklist);
const Retorno = lazy(() => import('./telas/Retorno.jsx'));
const Sucesso = lazy(() => import('./telas/Sucesso.jsx'));
const Admin = lazy(carregarAdmin);

const telaDeEntrada = sessao =>
  !sessao ? { tela: 'login' } : sessao.tipo === 'admin' ? { tela: 'admin' } : { tela: 'inicio' };

/**
 * Garante que a rota faz sentido para a sessão atual (por exemplo, depois de usar o
 * botão "voltar" do navegador para uma tela de um formulário que já foi enviado).
 */
function corrigirRota(rota, sessao, formularioAtivo) {
  const entrada = telaDeEntrada(sessao);
  if (!sessao) return entrada;
  if (!rota || typeof rota.tela !== 'string') return entrada;
  if (sessao.tipo === 'admin') return rota.tela === 'admin' ? rota : entrada;

  switch (rota.tela) {
    case 'inicio':
      return rota;
    case 'checklist':
      if (rota.formulario && rota.formulario === formularioAtivo) {
        return { ...rota, passo: Math.min(3, Math.max(0, Number(rota.passo) || 0)) };
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
    return () => sincronizacao.parar();
  }, []);

  // Enquanto a pessoa digita o código, já adianta o download da próxima tela.
  useEffect(() => {
    if (rota.tela !== 'login') return undefined;
    const relogio = setTimeout(() => {
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

  const iniciarChecklist = useCallback(() => {
    if (!unidade) return;
    let rascunho = lerRascunho(unidade);
    if (!rascunho) {
      rascunho = novoRascunho(unidade);
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
      const destino = { tela: 'sucesso', registro: registroId };
      const etapasParaTras = Math.max(0, Number(passoAtual) || 0);
      if (etapasParaTras === 0) {
        ir(destino, { substituir: true });
        return;
      }
      const finalizar = () => ir(destino, { substituir: true });
      aposVoltar.current = finalizar;
      window.history.go(-etapasParaTras);
      // Se o navegador não tiver para onde voltar, segue em frente mesmo assim.
      setTimeout(() => {
        if (aposVoltar.current !== finalizar) return;
        aposVoltar.current = null;
        finalizar();
      }, 700);
    },
    [ir, unidade]
  );

  const voltar = useCallback(() => window.history.back(), []);

  /* --- telas ------------------------------------------------------------------------ */

  let conteudo;
  if (rota.tela === 'login' || !sessao) {
    conteudo = <Login key="login" aoEntrar={entrar} />;
  } else if (rota.tela === 'admin') {
    conteudo = <Admin key="admin" aoSair={sair} />;
  } else if (rota.tela === 'checklist') {
    conteudo = (
      <Checklist
        key={`checklist-${rota.formulario}`}
        unidade={unidade}
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
        aoIniciar={iniciarChecklist}
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
