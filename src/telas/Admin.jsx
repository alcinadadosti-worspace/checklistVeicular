import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Botao, BotaoIcone, Contador, Folha, Topo, transicaoDeTela } from '../componentes/Basicos.jsx';
import Cracha from '../componentes/Cracha.jsx';
import DetalheChecklist from '../componentes/DetalheChecklist.jsx';
import { FundoRadar } from '../componentes/Fundos.jsx';
import Icone from '../componentes/Icone.jsx';
import { LinhaRegistro, PastaDeChecklists } from '../componentes/Registros.jsx';
import StatusNuvem from '../componentes/StatusNuvem.jsx';
import { PalcoVeiculo } from '../componentes/Veiculo.jsx';
import { ADMIN, UNIDADES, nomeDoVeiculo } from '../config/frota.js';
import { banco } from '../lib/banco.js';
import { baixarCsv } from '../lib/exportar.js';
import { dataHora, diaPorExtenso, haQuantoTempo, km, numero, saudacao, semAcento } from '../lib/formato.js';
import { TELA_DEITADA_BAIXA, TELA_LARGA, useAgora, useBanco, useMidia, useSincronizacao } from '../lib/ganchos.js';
import { emRota, kmRodados, resumoDosItens, temProblema, ultimoKm } from '../lib/registros.js';
import { nuvem } from '../lib/nuvem.js';
import { sincronizacao } from '../lib/sincronizacao.js';
import CometDial from '../reactbits/CometDial.jsx';
import SloshGauge from '../reactbits/SloshGauge.jsx';

const DIA = 24 * 60 * 60 * 1000;
const PERIODOS = [
  { dias: 1, nome: 'Hoje' },
  { dias: 7, nome: '7 dias' },
  { dias: 30, nome: '30 dias' },
  { dias: 90, nome: '90 dias' }
];
const SITUACOES_DE_FILTRO = [
  { id: 'todas', nome: 'Todos' },
  { id: 'rota', nome: 'Em rota' },
  { id: 'problemas', nome: 'Com apontamentos' },
  { id: 'ok', nome: 'Sem apontamentos' }
];

const aparecer = (atraso = 0) => ({
  initial: { opacity: 0, y: 22 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay: atraso, ease: [0.22, 1, 0.36, 1] }
});

const corDaCondicao = condicao => (condicao >= 90 ? '#34d399' : condicao >= 60 ? '#fbbf24' : '#fb7185');

function CartaoUnidade({ unidade, registros, aoAbrir, agora, atraso }) {
  const ultimo = registros[0] || null;
  const viagem = registros.find(emRota) || null;
  const resumo = ultimo ? resumoDosItens(ultimo.itens) : null;
  const quilometragem = ultimoKm(registros, unidade.id);
  const recentes = registros.slice(0, 5);
  return (
    <motion.article className="cartao unidade" {...aparecer(atraso)}>
      <header className="unidade__topo">
        <div>
          <span className="sobretitulo">Unidade</span>
          <h3>{unidade.nome}</h3>
        </div>
        <span className={`selo ${viagem ? 'selo--rota' : 'selo--concluido'}`}>
          {viagem ? <i className="pulso" aria-hidden="true" /> : <Icone nome="check" tamanho={14} espessura={2.4} />}
          {viagem ? `Em rota · ${haQuantoTempo(viagem.preenchidoEm, agora.getTime())}` : 'Na base'}
        </span>
      </header>

      <PalcoVeiculo unidade={unidade} comGrade={false} className="palco--compacto" />

      <div className="unidade__dados">
        <div className="unidade__tanque" style={{ color: '#e8eef7' }}>
          <SloshGauge
            value={resumo ? resumo.condicao : 0}
            width={56}
            height={96}
            radius={15}
            ticks={4}
            liquidColor={resumo ? corDaCondicao(resumo.condicao) : '#334155'}
            glassColor="#18233a"
            unit="%"
            ariaLabel={`Condição do veículo de ${unidade.nome} no último checklist`}
          />
          <span className="rotulo">Condição</span>
        </div>
        <dl className="ficha ficha--compacta">
          <div>
            <dt>Veículo</dt>
            <dd>{nomeDoVeiculo(unidade)}</dd>
          </div>
          <div>
            <dt>Último KM</dt>
            <dd className="mono">{quilometragem === null ? '—' : numero(quilometragem)}</dd>
          </div>
          <div>
            <dt>Último checklist</dt>
            <dd>{ultimo ? dataHora(ultimo.preenchidoEm) : 'Nenhum ainda'}</dd>
          </div>
          <div>
            <dt>Motorista</dt>
            <dd>{ultimo ? ultimo.motoristaNome : '—'}</dd>
          </div>
        </dl>
      </div>

      {recentes.length > 0 ? (
        <PastaDeChecklists
          registros={recentes}
          titulo={`Pasta · ${unidade.sigla}`}
          legenda={
            recentes.length === 1 ? 'toque para abrir · 1 bilhete' : `toque para abrir · ${recentes.length} bilhetes`
          }
          aoAbrir={aoAbrir}
        />
      ) : (
        <p className="unidade__vazio">Nenhum checklist desta unidade ainda.</p>
      )}
    </motion.article>
  );
}

export default function Admin({ aoSair }) {
  const { registros, idsPendentes } = useBanco();
  const sync = useSincronizacao();
  const agora = useAgora(30000);
  const telaLarga = useMidia(TELA_LARGA);
  const telaBaixa = useMidia(TELA_DEITADA_BAIXA);
  const [dias, setDias] = useState(30);
  const [filtroUnidade, setFiltroUnidade] = useState('todas');
  const [filtroSituacao, setFiltroSituacao] = useState('todas');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(null);
  const [confirmando, setConfirmando] = useState(false);

  // Com o painel aberto, confere a nuvem a cada 30 s.
  useEffect(() => {
    sincronizacao.definirIntervalo(30000);
    return () => sincronizacao.definirIntervalo(180000);
  }, []);

  const porUnidade = useMemo(
    () =>
      Object.fromEntries(
        UNIDADES.map(unidade => [unidade.id, registros.filter(registro => registro.unidade === unidade.id)])
      ),
    [registros]
  );

  const inicioDoPeriodo = useMemo(() => {
    const hoje = new Date(agora);
    hoje.setHours(0, 0, 0, 0);
    return hoje.getTime() - (dias - 1) * DIA;
  }, [agora, dias]);

  const noPeriodo = useMemo(
    () =>
      registros.filter(
        registro =>
          (Date.parse(registro.preenchidoEm) || 0) >= inicioDoPeriodo &&
          (filtroUnidade === 'todas' || registro.unidade === filtroUnidade)
      ),
    [registros, inicioDoPeriodo, filtroUnidade]
  );

  const filtrados = useMemo(() => {
    const termo = semAcento(busca.trim());
    return noPeriodo.filter(registro => {
      if (filtroSituacao === 'rota' && !emRota(registro)) return false;
      if (filtroSituacao === 'problemas' && !temProblema(registro)) return false;
      if (filtroSituacao === 'ok' && temProblema(registro)) return false;
      if (
        termo &&
        !semAcento(`${registro.motoristaNome} ${registro.unidadeNome} ${registro.veiculo} ${registro.outros}`).includes(
          termo
        )
      ) {
        return false;
      }
      return true;
    });
  }, [noPeriodo, filtroSituacao, busca]);

  const indicadores = useMemo(
    () => ({
      checklists: noPeriodo.length,
      emRota: registros.filter(
        registro => emRota(registro) && (filtroUnidade === 'todas' || registro.unidade === filtroUnidade)
      ).length,
      apontamentos: noPeriodo.filter(temProblema).length,
      rodados: noPeriodo.reduce((soma, registro) => soma + (kmRodados(registro) || 0), 0)
    }),
    [noPeriodo, registros, filtroUnidade]
  );

  const registroAberto = aberto ? registros.find(registro => registro.id === aberto) : null;
  const fechar = () => {
    setAberto(null);
    setConfirmando(false);
  };

  return (
    <motion.main className="tela tela--admin" {...transicaoDeTela}>
      <Topo
        titulo="Central da frota"
        subtitulo="Administração"
        acoes={
          <>
            <StatusNuvem />
            <BotaoIcone icone="sair" rotulo="Sair" onClick={aoSair} />
          </>
        }
      />

      <div className="conteudo admin">
        <section className="admin__heroi">
          <div className="admin__radar" aria-hidden="true">
            <FundoRadar centerX={0.5} centerY={0.5} scale={1.5} tilt={58} targets={7} cor="#818cf8" fade={0.35} />
          </div>

          <div className="admin__cracha">
            <Cracha
              nome={ADMIN.nome}
              cargo={ADMIN.cargo}
              unidade="Central da frota"
              veiculo={`${UNIDADES.length} veículos`}
              foto={ADMIN.foto}
              foco={ADMIN.foco}
              zoom={ADMIN.zoom}
              tema="violeta"
              metal="gold"
              ancora={telaLarga ? 'left' : 'center'}
              tamanho={telaBaixa ? 0.5 : undefined}
              cordao={telaBaixa ? 0.24 : undefined}
            />
          </div>

          <motion.div className="admin__resumo" {...aparecer(0.08)}>
            <p className="sobretitulo">{diaPorExtenso(agora)}</p>
            <h1>
              {saudacao(agora)},<br />
              <span className="degrade degrade--violeta">{ADMIN.nome}</span>
            </h1>
            <p className="texto-2">
              {indicadores.emRota > 0
                ? `${indicadores.emRota === 1 ? 'Há 1 veículo' : `Há ${indicadores.emRota} veículos`} em rota agora.`
                : 'Todos os veículos estão na base.'}{' '}
              Período: {dias === 1 ? 'hoje' : `últimos ${dias} dias`}.
            </p>

            <dl className="indicadores indicadores--admin">
              <div>
                <dt>Checklists</dt>
                <dd className="mono">
                  <Contador valor={indicadores.checklists} />
                </dd>
              </div>
              <div>
                <dt>Em rota</dt>
                <dd className="mono" data-tom={indicadores.emRota > 0 ? 'rota' : undefined}>
                  <Contador valor={indicadores.emRota} />
                </dd>
              </div>
              <div>
                <dt>Com alertas</dt>
                <dd className="mono" data-tom={indicadores.apontamentos > 0 ? 'aviso' : undefined}>
                  <Contador valor={indicadores.apontamentos} />
                </dd>
              </div>
              <div>
                <dt>KM rodados</dt>
                <dd className="mono">
                  <Contador valor={indicadores.rodados} formatar={v => numero(Math.round(v))} />
                </dd>
              </div>
            </dl>
          </motion.div>
        </section>

        {!sync.ativa ? (
          <div className="aviso aviso--destaque">
            <Icone nome="celular" tamanho={20} />
            <p>
              <strong>Modo local.</strong> Sem o banco de dados conectado, este painel mostra apenas os checklists
              preenchidos neste aparelho. Conecte o Firebase (passo a passo no README) para ver todas as unidades.
            </p>
          </div>
        ) : sync.fase === 'erro' ? (
          <div className="aviso aviso--erro">
            <Icone nome="alerta" tamanho={20} />
            <p>
              <strong>Não foi possível falar com a nuvem.</strong> {sync.mensagem}
            </p>
          </div>
        ) : null}

        <section className="admin__unidades">
          {UNIDADES.map((unidade, indice) => (
            <CartaoUnidade
              key={unidade.id}
              unidade={unidade}
              registros={porUnidade[unidade.id]}
              aoAbrir={setAberto}
              agora={agora}
              atraso={0.12 + indice * 0.08}
            />
          ))}
        </section>

        <motion.section className="cartao admin__registros" {...aparecer(0.3)}>
          <header className="secao__topo">
            <div>
              <span className="sobretitulo">Registros</span>
              <h2>Checklists</h2>
            </div>
            <Botao
              variante="suave"
              icone="baixar"
              disabled={filtrados.length === 0}
              onClick={() => baixarCsv(filtrados)}
            >
              Exportar planilha
            </Botao>
          </header>

          <div className="filtros">
            <div className="filtros__periodo">
              <div className="mostrador mostrador--filtro">
                <CometDial
                  value={dias}
                  min={1}
                  max={90}
                  step={1}
                  unit={dias === 1 ? ' dia' : ' dias'}
                  label="Período em dias"
                  accent="#a78bfa"
                  ink="#e8eef7"
                  size={156}
                  sweep={280}
                  thickness={6}
                  cometReach={160}
                  cometWidth={9}
                  onChange={setDias}
                />
              </div>
              <div className="filtros__periodo-textos">
                <span className="rotulo">Período</span>
                <p className="texto-2">Gire o seletor ou escolha um atalho.</p>
                <div className="chips">
                  {PERIODOS.map(periodo => (
                    <button
                      key={periodo.dias}
                      type="button"
                      className="chip"
                      data-ativo={dias === periodo.dias ? '' : undefined}
                      onClick={() => setDias(periodo.dias)}
                    >
                      {periodo.nome}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="filtros__grupos">
              <div>
                <span className="rotulo">Unidade</span>
                <div className="chips">
                  <button
                    type="button"
                    className="chip"
                    data-ativo={filtroUnidade === 'todas' ? '' : undefined}
                    onClick={() => setFiltroUnidade('todas')}
                  >
                    Todas
                  </button>
                  {UNIDADES.map(unidade => (
                    <button
                      key={unidade.id}
                      type="button"
                      className="chip"
                      data-ativo={filtroUnidade === unidade.id ? '' : undefined}
                      onClick={() => setFiltroUnidade(unidade.id)}
                    >
                      {unidade.nome}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="rotulo">Situação</span>
                <div className="chips">
                  {SITUACOES_DE_FILTRO.map(situacao => (
                    <button
                      key={situacao.id}
                      type="button"
                      className="chip"
                      data-ativo={filtroSituacao === situacao.id ? '' : undefined}
                      onClick={() => setFiltroSituacao(situacao.id)}
                    >
                      {situacao.nome}
                    </button>
                  ))}
                </div>
              </div>
              <label className="busca">
                <Icone nome="busca" tamanho={18} />
                <span className="visualmente-oculto">Buscar</span>
                <input
                  type="search"
                  value={busca}
                  placeholder="Buscar por motorista, veículo ou observação"
                  onChange={evento => setBusca(evento.target.value)}
                />
              </label>
            </div>
          </div>

          <p className="admin__contagem" role="status">
            {filtrados.length === 0
              ? 'Nenhum checklist com esses filtros.'
              : filtrados.length === 1
                ? '1 checklist encontrado'
                : `${filtrados.length} checklists encontrados`}
            {filtrados.length > 0
              ? ` · ${km(filtrados.reduce((soma, registro) => soma + (kmRodados(registro) || 0), 0))} rodados`
              : ''}
          </p>

          {filtrados.length > 0 ? (
            <ul className="lista-registros lista-registros--admin">
              {filtrados.slice(0, 200).map(registro => (
                <LinhaRegistro
                  key={registro.id}
                  registro={registro}
                  aoAbrir={setAberto}
                  comUnidade
                  pendente={nuvem.ativa && idsPendentes.has(registro.id)}
                />
              ))}
            </ul>
          ) : (
            <div className="vazio">
              <Icone nome="pasta" tamanho={30} />
              <strong>Nada por aqui</strong>
              <p>
                {registros.length === 0
                  ? 'Quando os motoristas enviarem checklists, eles aparecem aqui.'
                  : 'Tente aumentar o período ou limpar os filtros.'}
              </p>
            </div>
          )}
          {filtrados.length > 200 ? (
            <p className="admin__contagem">Mostrando os 200 mais recentes. A planilha exportada traz todos.</p>
          ) : null}
        </motion.section>
      </div>

      <Folha
        aberta={Boolean(registroAberto)}
        aoFechar={fechar}
        titulo="Checklist"
        subtitulo={registroAberto ? `${registroAberto.unidadeNome} · ${dataHora(registroAberto.preenchidoEm)}` : ''}
        rodape={
          registroAberto ? (
            confirmando ? (
              <>
                <span className="folha__pergunta">Excluir este checklist de todos os aparelhos?</span>
                <Botao variante="fantasma" onClick={() => setConfirmando(false)}>
                  Cancelar
                </Botao>
                <Botao
                  variante="perigo"
                  icone="lixeira"
                  onClick={() => {
                    banco.excluir(registroAberto.id);
                    fechar();
                  }}
                >
                  Excluir
                </Botao>
              </>
            ) : (
              <Botao variante="fantasma" icone="lixeira" onClick={() => setConfirmando(true)}>
                Excluir checklist
              </Botao>
            )
          ) : null
        }
      >
        {registroAberto ? (
          <DetalheChecklist registro={registroAberto} pendente={nuvem.ativa && idsPendentes.has(registroAberto.id)} />
        ) : null}
      </Folha>
    </motion.main>
  );
}
