import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Botao, Topo, transicaoDeTela } from '../componentes/Basicos.jsx';
import { CampoKm, CarimboDeHora, ItemInspecao } from '../componentes/Campos.jsx';
import { ResumoDosItens } from '../componentes/DetalheChecklist.jsx';
import { CampoFotos, GaleriaFotos } from '../componentes/Fotos.jsx';
import Icone from '../componentes/Icone.jsx';
import { PalcoVeiculo } from '../componentes/Veiculo.jsx';
import { ITENS, nomeDoVeiculo } from '../config/frota.js';
import { nomeDoMotorista } from '../lib/acesso.js';
import { banco } from '../lib/banco.js';
import { cofreDeFotos, esquecerFoto } from '../lib/fotosDoChecklist.js';
import { dataHora, limparNome, numero, paraKm } from '../lib/formato.js';
import { useBanco } from '../lib/ganchos.js';
import { apagarRascunho, gravarRascunho, lerRascunho, novoRascunho } from '../lib/rascunho.js';
import {
  criarRegistro,
  emRota,
  fecharPelaSaidaSeguinte,
  fotosDoRegistro,
  limparManutencao,
  piorSituacao,
  resumoDosItens,
  ultimoKm,
  validarChecklist
} from '../lib/registros.js';
import CometDial from '../reactbits/CometDial.jsx';
import SloshGauge from '../reactbits/SloshGauge.jsx';

// O motorista não é perguntado aqui: é quem tocou no crachá ao entrar no app.
const PASSOS = [
  { id: 'veiculo', nome: 'Veículo', icone: 'picape' },
  { id: 'inspecao', nome: 'Inspeção', icone: 'prancheta' },
  { id: 'revisao', nome: 'Revisão', icone: 'check' }
];

const COR_DA_SITUACAO = { bom: '#34d399', ruim: '#fbbf24', faltante: '#fb7185' };

const deslizar = {
  entrar: direcao => ({ opacity: 0, x: direcao * 46 }),
  ficar: { opacity: 1, x: 0 },
  sair: direcao => ({ opacity: 0, x: direcao * -46 })
};

/**
 * Viagem anterior que ficou "em rota" (sem KM de volta): avisa que este checklist vai fechá-la com
 * o KM de saída de agora — ou que não vai, se o KM digitado for menor que o de saída dela.
 */
function AvisoViagemAberta({ abertas, fechadas }) {
  if (abertas.length === 0) return null;
  const ficam = abertas.filter(aberta => !fechadas.some(fechada => fechada.id === aberta.id));
  if (ficam.length > 0) {
    const viagem = ficam[0];
    return (
      <div className="aviso aviso--erro aviso--viagem-aberta">
        <Icone nome="alerta" tamanho={18} />
        <p>
          A viagem de <strong>{viagem.motoristaNome}</strong> ({dataHora(viagem.preenchidoEm)}) saiu com{' '}
          <strong className="mono">{numero(viagem.kmSaida)}</strong> km e ficou sem KM de volta. O KM de saída digitado
          é menor, então ela continua em rota. Confira o painel.
        </p>
      </div>
    );
  }
  const viagem = abertas[0];
  return (
    <div className="aviso aviso--destaque aviso--viagem-aberta">
      <Icone nome="rota" tamanho={18} />
      <p>
        {abertas.length === 1 ? (
          <>
            A viagem de <strong>{viagem.motoristaNome}</strong> ({dataHora(viagem.preenchidoEm)}, saída{' '}
            <span className="mono">{numero(viagem.kmSaida)}</span> km) ficou sem KM de volta. Ao enviar este checklist,
            ela é fechada com o <strong>KM de saída de agora</strong>.
          </>
        ) : (
          <>
            {abertas.length} viagens ficaram sem KM de volta. Ao enviar este checklist, cada uma é fechada com o{' '}
            <strong>KM da saída seguinte</strong>.
          </>
        )}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Passo 1 — Veículo e quilometragem                                   */
/* ------------------------------------------------------------------ */

function PassoVeiculo({ unidade, motoristaNome, dados, mudar, erros, ultimo, abertas, fechadas }) {
  const saida = paraKm(dados.kmSaida);
  const abaixoDoUltimo = saida !== null && ultimo !== null && saida < ultimo;
  return (
    <div className="passo passo--dividido">
      <PalcoVeiculo unidade={unidade}>
        <div className="palco__legenda">
          <strong>{unidade.veiculo.nome}</strong>
          <span>
            {unidade.veiculo.versao} · {unidade.nome}
          </span>
        </div>
      </PalcoVeiculo>

      <div className="passo__campos">
        <span className="sobretitulo">Passo 1 de {PASSOS.length}</span>
        <h2>Dados do veículo</h2>
        <p className="passo__quem">
          <Icone nome="usuario" tamanho={16} />
          Motorista: <strong>{motoristaNome}</strong>
        </p>

        <CarimboDeHora />

        <CampoKm
          rotulo="KM de saída"
          valor={dados.kmSaida}
          aoMudar={valor => mudar({ kmSaida: valor })}
          erro={erros.kmSaida}
          dica={
            abaixoDoUltimo
              ? `Atenção: menor que o último KM registrado (${numero(ultimo)}). Confira o painel.`
              : ultimo !== null
                ? `Último KM registrado deste veículo: ${numero(ultimo)}`
                : 'Olhe o hodômetro no painel e digite o número.'
          }
        />
        {ultimo !== null && dados.kmSaida === '' ? (
          <button type="button" className="atalho" onClick={() => mudar({ kmSaida: String(ultimo) })}>
            <Icone nome="velocimetro" tamanho={16} />
            Usar o último KM ({numero(ultimo)})
          </button>
        ) : null}

        <AvisoViagemAberta abertas={abertas} fechadas={fechadas} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Passo 2 — Itens inspecionados                                       */
/* ------------------------------------------------------------------ */

/**
 * Revisão/manutenção feita no veículo (troca de óleo, revisão, pneu…): o motorista abre o quadro,
 * escreve o que foi feito e, se quiser, anexa fotos (nota, peça, serviço).
 */
function QuadroManutencao({ unidade, manutencao, aoAbrir, aoRemover, aoMudarTexto, aoMudarFotos, erro }) {
  if (!manutencao) {
    return (
      <button type="button" className="manutencao-abrir" onClick={aoAbrir}>
        <span className="manutencao-abrir__icone">
          <Icone nome="chave" tamanho={20} />
        </span>
        <span className="manutencao-abrir__textos">
          <strong>Registrar revisão ou manutenção</strong>
          <span>Fez troca de óleo, revisão, pneu ou outro serviço? Conte aqui e mande fotos.</span>
        </span>
        <Icone nome="seta-direita" tamanho={18} />
      </button>
    );
  }
  return (
    <motion.section
      className="manutencao"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      data-erro={erro ? '' : undefined}
    >
      <header className="manutencao__topo">
        <span className="manutencao-abrir__icone">
          <Icone nome="chave" tamanho={20} />
        </span>
        <div>
          <strong>Revisão / manutenção</strong>
          <span>A administração vê o texto e as fotos na ficha deste checklist.</span>
        </div>
        <button type="button" className="botao-icone" aria-label="Remover revisão/manutenção" onClick={aoRemover}>
          <Icone nome="lixeira" tamanho={18} />
        </button>
      </header>
      <div className="campo">
        <label className="rotulo" htmlFor="manutencao-texto">
          O que foi feito
        </label>
        <textarea
          id="manutencao-texto"
          className="entrada entrada--texto"
          rows={3}
          maxLength={2000}
          value={manutencao.descricao}
          aria-invalid={erro ? true : undefined}
          placeholder="Ex.: troca de óleo e filtro na oficina do centro; revisão dos 50.000 km; troca do pneu traseiro direito…"
          onChange={evento => aoMudarTexto(evento.target.value)}
        />
        {erro ? (
          <p className="campo__erro" role="alert">
            {erro}
          </p>
        ) : null}
      </div>
      <CampoFotos
        fotos={manutencao.fotos ?? []}
        unidadeId={unidade.id}
        aoMudar={aoMudarFotos}
        rotulo="Fotos do serviço"
        dica="Nota fiscal, peça trocada, painel com a quilometragem… A administração vê na ficha."
      />
    </motion.section>
  );
}

function PassoInspecao({ unidade, dados, mudar, mudarFotos, acoesManutencao, erro, cobrar }) {
  const resumo = resumoDosItens(dados.itens);
  const pior = piorSituacao(dados.itens);
  const cor = pior && pior !== 'bom' ? COR_DA_SITUACAO[pior] : resumo.completo ? COR_DA_SITUACAO.bom : '#38bdf8';
  const frase = resumo.completo
    ? resumo.problemas === 0
      ? 'Tudo avaliado, veículo em ordem.'
      : `Tudo avaliado, com ${resumo.problemas === 1 ? '1 apontamento' : `${resumo.problemas} apontamentos`}.`
    : resumo.respondidos === 0
      ? 'Toque em uma das três opções de cada item.'
      : `Faltam ${resumo.total - resumo.respondidos}.`;
  return (
    <div className="passo passo--inspecao">
      <div className="tanque" data-completo={resumo.completo ? '' : undefined}>
        <div className="tanque__medidor" style={{ color: '#e8eef7' }}>
          <SloshGauge
            value={resumo.progresso}
            width={62}
            height={84}
            radius={16}
            ticks={7}
            liquidColor={cor}
            glassColor="#18233a"
            viscosity={0.12}
            tilt={0.6}
            splash={0.5}
            unit="%"
            ariaLabel="Progresso da inspeção"
          />
        </div>
        <div className="tanque__textos">
          <span className="sobretitulo">Itens inspecionados</span>
          <strong>
            {resumo.respondidos} de {resumo.total} itens avaliados
          </strong>
          <span>{frase}</span>
        </div>
        <div className="tanque__contagem" aria-hidden="true">
          <span data-tipo="bom">{resumo.bom}</span>
          <span data-tipo="ruim">{resumo.ruim}</span>
          <span data-tipo="faltante">{resumo.faltante}</span>
        </div>
      </div>

      {erro ? (
        <p className="campo__erro campo__erro--bloco" role="alert">
          <Icone nome="alerta" tamanho={17} /> {erro}
        </p>
      ) : null}

      <ul className="itens">
        {ITENS.map((item, indice) => (
          <ItemInspecao
            key={item.id}
            item={item}
            indice={indice}
            valor={dados.itens[item.id]}
            cobrar={cobrar}
            aoMudar={situacao => mudar({ itens: { ...dados.itens, [item.id]: situacao } })}
          />
        ))}
      </ul>

      <div className="campo campo--outros">
        <label className="rotulo" htmlFor="outros">
          Outros <em>opcional</em>
        </label>
        <textarea
          id="outros"
          className="entrada entrada--texto"
          rows={3}
          maxLength={2000}
          value={dados.outros}
          placeholder="Algo que não está na lista? Escreva aqui (ex.: barulho na suspensão, luz acesa no painel, arranhão novo…)"
          onChange={evento => mudar({ outros: evento.target.value })}
        />
        <CampoFotos fotos={dados.fotos ?? []} unidadeId={unidade.id} aoMudar={mudarFotos} />
      </div>

      <QuadroManutencao unidade={unidade} manutencao={dados.manutencao} {...acoesManutencao} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Passo 3 — Revisão e envio                                           */
/* ------------------------------------------------------------------ */

function PassoRevisao({ unidade, motoristaNome, dados, erros, abertas, fechadas }) {
  const resumo = resumoDosItens(dados.itens);
  const [mostrado, setMostrado] = useState(0);
  useEffect(() => {
    const relogio = setTimeout(() => setMostrado(resumo.condicao), 380);
    return () => clearTimeout(relogio);
  }, [resumo.condicao]);

  const cor =
    resumo.condicao >= 90
      ? COR_DA_SITUACAO.bom
      : resumo.condicao >= 60
        ? COR_DA_SITUACAO.ruim
        : COR_DA_SITUACAO.faltante;
  const veredito =
    resumo.problemas === 0
      ? 'Veículo em ordem'
      : resumo.faltante > 0
        ? 'Precisa de atenção'
        : 'Em ordem, com ressalvas';
  const saida = paraKm(dados.kmSaida);
  const pendencias = Object.values(erros);

  return (
    <div className="passo passo--revisao">
      <div className="revisao__painel">
        <div className="mostrador" style={{ '--cor': cor }}>
          <CometDial
            value={mostrado}
            min={0}
            max={100}
            step={1}
            unit="%"
            label="Condição do veículo"
            accent={cor}
            ink="#e8eef7"
            size={196}
            sweep={270}
            thickness={7}
            cometReach={200}
            cometWidth={10}
            disabled
          />
        </div>
        <div className="revisao__veredito">
          <span className="sobretitulo">Condição do veículo</span>
          <strong style={{ color: cor }}>{veredito}</strong>
          <p className="texto-2">
            {resumo.bom} bom · {resumo.ruim} ruim · {resumo.faltante} faltante ou não funciona
          </p>
        </div>
      </div>

      <div className="revisao__dados">
        <dl className="ficha">
          <div>
            <dt>Motorista</dt>
            <dd>{motoristaNome || '—'}</dd>
          </div>
          <div>
            <dt>Unidade</dt>
            <dd>{unidade.nome}</dd>
          </div>
          <div>
            <dt>Veículo</dt>
            <dd>{nomeDoVeiculo(unidade)}</dd>
          </div>
          <div>
            <dt>KM de saída</dt>
            <dd className="mono">{saida === null ? '—' : numero(saida)}</dd>
          </div>
          <div>
            <dt>KM de volta</dt>
            <dd>Ao retornar</dd>
          </div>
        </dl>

        <CarimboDeHora nota="O app grava a data e a hora exatas no momento do envio" />

        {pendencias.length > 0 ? (
          <div className="aviso aviso--erro" role="alert">
            <Icone nome="alerta" tamanho={18} />
            <div>
              <strong>Falta completar antes de enviar:</strong>
              <ul>
                {pendencias.map(texto => (
                  <li key={texto}>{texto}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <>
            <AvisoViagemAberta abertas={abertas} fechadas={fechadas} />
            <div className="aviso">
              <Icone nome="rota" tamanho={18} />
              <p>
                Depois do envio o veículo fica <strong>em rota</strong>. Ao voltar, abra o app e registre o KM de volta.
                Se esquecer, o próximo checklist fecha a viagem com o KM de saída dele.
              </p>
            </div>
          </>
        )}

        <h3 className="detalhe__titulo">Itens inspecionados</h3>
        <ResumoDosItens itens={dados.itens} />

        {dados.outros.trim() ? (
          <>
            <h3 className="detalhe__titulo">Outros</h3>
            <p className="detalhe__outros">{dados.outros.trim()}</p>
          </>
        ) : null}

        {dados.fotos?.length ? (
          <>
            <h3 className="detalhe__titulo">Fotos</h3>
            <GaleriaFotos fotos={dados.fotos} />
          </>
        ) : null}

        {limparManutencao(dados.manutencao) ? (
          <>
            <h3 className="detalhe__titulo detalhe__titulo--manutencao">
              <Icone nome="chave" tamanho={16} /> Revisão / manutenção
            </h3>
            <p className="detalhe__outros">{dados.manutencao.descricao.trim()}</p>
            <GaleriaFotos fotos={dados.manutencao.fotos} />
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Assistente                                                          */
/* ------------------------------------------------------------------ */

export default function Checklist({ unidade, motorista, formularioId, passo, aoMudarPasso, aoVoltar, aoConcluir }) {
  const { registros } = useBanco();
  const [dados, setDados] = useState(() => {
    const salvo = lerRascunho(unidade);
    return salvo && salvo.id === formularioId ? salvo.dados : novoRascunho().dados;
  });
  const [tentou, setTentou] = useState({});
  const [enviando, setEnviando] = useState(false);
  const passoAnterior = useRef(passo);
  const direcao = passo >= passoAnterior.current ? 1 : -1;
  const corpo = useRef(null);

  useEffect(() => {
    passoAnterior.current = passo;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [passo]);

  // Guarda o rascunho no aparelho a cada alteração.
  useEffect(() => {
    if (enviando) return undefined;
    const relogio = setTimeout(() => gravarRascunho(unidade, { id: formularioId, em: Date.now(), dados }), 250);
    return () => clearTimeout(relogio);
  }, [dados, unidade, formularioId, enviando]);

  const mudar = parte => setDados(atual => ({ ...atual, ...parte }));
  const mudarFotos = atualizar => setDados(atual => ({ ...atual, fotos: atualizar(atual.fotos ?? []) }));
  const mudarManutencao = parte =>
    setDados(atual => ({ ...atual, manutencao: { descricao: '', fotos: [], ...atual.manutencao, ...parte(atual) } }));
  const acoesManutencao = {
    aoAbrir: () => mudar({ manutencao: { descricao: '', fotos: [] } }),
    aoRemover: () => {
      for (const foto of dados.manutencao?.fotos ?? []) {
        cofreDeFotos.apagar(foto.id).catch(() => {});
        esquecerFoto(foto.id);
      }
      mudar({ manutencao: null });
    },
    aoMudarTexto: descricao => mudarManutencao(() => ({ descricao })),
    aoMudarFotos: atualizar => mudarManutencao(atual => ({ fotos: atualizar(atual.manutencao?.fotos ?? []) }))
  };

  const ultimo = useMemo(() => ultimoKm(registros, unidade.id), [registros, unidade.id]);
  const saida = paraKm(dados.kmSaida);
  const nome = nomeDoMotorista(motorista.id, motorista.nomeOutro);

  // Viagens desta unidade que ficaram sem KM de volta, e quais o envio vai fechar.
  const abertas = useMemo(
    () => registros.filter(registro => registro.unidade === unidade.id && emRota(registro)),
    [registros, unidade.id]
  );
  const fechadas = useMemo(() => {
    if (abertas.length === 0) return [];
    if (saida === null) return abertas; // ainda sem KM: o aviso fala do caso normal
    const agora = new Date().toISOString();
    return fecharPelaSaidaSeguinte(registros, { id: '', unidade: unidade.id, kmSaida: saida, preenchidoEm: agora });
  }, [abertas, registros, unidade.id, saida]);

  const validacao = useMemo(() => {
    const resultado = validarChecklist({
      motoristaId: motorista.id,
      motoristaNome: nome,
      kmSaida: saida,
      kmVolta: null,
      itens: dados.itens,
      manutencao: dados.manutencao
    });
    return { erros: resultado.erros, ok: resultado.ok };
  }, [dados.itens, dados.manutencao, motorista.id, nome, saida]);

  const errosDoPasso = [
    validacao.erros.kmSaida ? { kmSaida: validacao.erros.kmSaida } : {},
    {
      ...(validacao.erros.itens ? { itens: validacao.erros.itens } : {}),
      ...(validacao.erros.manutencao ? { manutencao: validacao.erros.manutencao } : {})
    },
    validacao.erros
  ];

  const enviar = async () => {
    if (enviando) return;
    setEnviando(true);
    const registro = criarRegistro({
      unidade,
      motoristaId: motorista.id,
      motoristaNome: limparNome(nome),
      kmSaida: saida,
      kmVolta: null,
      itens: dados.itens,
      outros: dados.outros,
      fotos: dados.fotos,
      manutencao: dados.manutencao
    });
    // As fotos entram na fila de envio junto com o checklist.
    await cofreDeFotos
      .vincular(
        fotosDoRegistro(registro).map(foto => foto.id),
        registro.id
      )
      .catch(() => {});
    // Viagem anterior que ficou sem KM de volta: fecha com o KM de saída deste checklist.
    for (const viagem of fecharPelaSaidaSeguinte(registros, registro)) banco.gravar(viagem);
    const salvo = banco.gravar(registro);
    apagarRascunho(unidade);
    navigator.vibrate?.([40, 60, 40]);
    aoConcluir(salvo.id, passo);
  };

  const avancar = () => {
    const erros = errosDoPasso[passo];
    if (Object.keys(erros).length > 0) {
      setTentou(atual => ({ ...atual, [passo]: true }));
      navigator.vibrate?.(90);
      requestAnimationFrame(() => {
        corpo.current
          ?.querySelector('[role="alert"], [data-erro], [data-cobrar]')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      return;
    }
    if (passo < PASSOS.length - 1) aoMudarPasso(passo + 1);
    else enviar();
  };

  const mostrar = indice => (tentou[indice] ? errosDoPasso[indice] : {});

  return (
    <motion.main className="tela tela--checklist" {...transicaoDeTela}>
      <Topo
        titulo="Checklist de saída"
        subtitulo={`${unidade.nome} · ${unidade.veiculo.apelido} · ${nome}`}
        aoVoltar={aoVoltar}
      />

      <nav className="trilho" aria-label="Etapas do checklist" style={{ '--passos': PASSOS.length }}>
        <ol>
          {PASSOS.map((etapa, indice) => {
            const estado = indice < passo ? 'feito' : indice === passo ? 'atual' : 'adiante';
            return (
              <li key={etapa.id} data-estado={estado}>
                <button
                  type="button"
                  disabled={indice >= passo}
                  aria-current={indice === passo ? 'step' : undefined}
                  onClick={() => aoMudarPasso(indice)}
                >
                  <span className="trilho__bola">
                    <Icone nome={indice < passo ? 'check' : etapa.icone} tamanho={16} espessura={2.2} />
                  </span>
                  <span className="trilho__nome">{etapa.nome}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="trilho__barra" aria-hidden="true">
          <motion.i
            animate={{ width: `${(passo / (PASSOS.length - 1)) * 100}%` }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </nav>

      <div className="conteudo assistente" ref={corpo}>
        <AnimatePresence mode="wait" custom={direcao} initial={false}>
          <motion.div
            key={passo}
            custom={direcao}
            variants={deslizar}
            initial="entrar"
            animate="ficar"
            exit="sair"
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            {passo === 0 ? (
              <PassoVeiculo
                unidade={unidade}
                motoristaNome={nome}
                dados={dados}
                mudar={mudar}
                erros={mostrar(0)}
                ultimo={ultimo}
                abertas={abertas}
                fechadas={fechadas}
              />
            ) : passo === 1 ? (
              <PassoInspecao
                unidade={unidade}
                dados={dados}
                mudar={mudar}
                mudarFotos={mudarFotos}
                acoesManutencao={{ ...acoesManutencao, erro: mostrar(1).manutencao }}
                erro={mostrar(1).itens}
                cobrar={Boolean(tentou[1])}
              />
            ) : (
              <PassoRevisao
                unidade={unidade}
                motoristaNome={nome}
                dados={dados}
                erros={mostrar(2)}
                abertas={abertas}
                fechadas={fechadas}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <footer className="assistente__rodape">
        <div className="assistente__rodape-conteudo">
          <Botao variante="fantasma" icone="seta-esquerda" onClick={aoVoltar} disabled={enviando}>
            {passo === 0 ? 'Sair' : 'Voltar'}
          </Botao>
          {passo < PASSOS.length - 1 ? (
            <Botao tamanho="g" iconeDepois="seta-direita" onClick={avancar}>
              Continuar
            </Botao>
          ) : (
            <Botao tamanho="g" icone="check" carregando={enviando} onClick={avancar}>
              Enviar checklist
            </Botao>
          )}
        </div>
      </footer>
    </motion.main>
  );
}
