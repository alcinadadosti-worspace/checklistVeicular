import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Botao, BotaoIcone, Contador, Folha, Topo, transicaoDeTela } from '../componentes/Basicos.jsx';
import Cracha from '../componentes/Cracha.jsx';
import DetalheChecklist from '../componentes/DetalheChecklist.jsx';
import { FundoRadar } from '../componentes/Fundos.jsx';
import Icone from '../componentes/Icone.jsx';
import Instalar from '../componentes/Instalar.jsx';
import { LinhaRegistro, PastaDeChecklists } from '../componentes/Registros.jsx';
import StatusNuvem from '../componentes/StatusNuvem.jsx';
import { PalcoVeiculo } from '../componentes/Veiculo.jsx';
import { motoristaPorId } from '../config/frota.js';
import { nomeDoMotorista } from '../lib/acesso.js';
import { dataHora, diaPorExtenso, haQuantoTempo, hora, numero, saudacao } from '../lib/formato.js';
import { TELA_DEITADA_BAIXA, useAgora, useBanco, useMidia } from '../lib/ganchos.js';
import { nuvem } from '../lib/nuvem.js';
import { emRota, ultimoKm } from '../lib/registros.js';

const aparecer = (atraso = 0) => ({
  initial: { opacity: 0, y: 22 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay: atraso, ease: [0.22, 1, 0.36, 1] }
});

function CartaoViagem({ registro, aoRetornar, agora }) {
  return (
    <motion.section className="cartao viagem" {...aparecer(0.12)}>
      <div className="viagem__radar" aria-hidden="true">
        <FundoRadar centerX={0.76} centerY={0.5} scale={2.1} targets={5} />
      </div>
      <div className="viagem__corpo">
        <span className="selo selo--rota">
          <i className="pulso" aria-hidden="true" />
          Em rota
        </span>
        <h2>Viagem em andamento</h2>
        <p className="texto-2">
          {registro.motoristaNome} saiu às <strong>{hora(registro.preenchidoEm)}</strong> ·{' '}
          {haQuantoTempo(registro.preenchidoEm, agora.getTime())}
        </p>
        <div className="viagem__km">
          <span className="rotulo">KM de saída</span>
          <strong className="mono">{numero(registro.kmSaida)}</strong>
        </div>
        <Botao icone="bandeira" tamanho="g" onClick={() => aoRetornar(registro.id)}>
          Registrar retorno
        </Botao>
      </div>
    </motion.section>
  );
}

export default function Inicio({ unidade, motorista, aoIniciar, aoTrocarMotorista, aoRetornar, aoSair }) {
  const { registros, idsPendentes } = useBanco();
  const agora = useAgora(30000);
  const telaBaixa = useMidia(TELA_DEITADA_BAIXA); // celular deitado: crachá um pouco menor
  const [aberto, setAberto] = useState(null);

  const daUnidade = useMemo(
    () => registros.filter(registro => registro.unidade === unidade.id),
    [registros, unidade.id]
  );
  const emAndamento = useMemo(() => daUnidade.filter(emRota), [daUnidade]);
  const quilometragem = useMemo(() => ultimoKm(daUnidade, unidade.id), [daUnidade, unidade.id]);
  const noMes = useMemo(() => {
    const mes = agora.getMonth();
    const ano = agora.getFullYear();
    return daUnidade.filter(registro => {
      const quando = new Date(registro.preenchidoEm);
      return quando.getMonth() === mes && quando.getFullYear() === ano;
    }).length;
  }, [daUnidade, agora]);

  // Quem tocou no crachá ao entrar ("Outro" aparece com a silhueta).
  const pessoa = motoristaPorId(motorista.id);
  const nome = nomeDoMotorista(motorista.id, motorista.nomeOutro);
  const primeiroNome = nome.split(' ')[0] || 'motorista';
  const registroAberto = aberto ? daUnidade.find(registro => registro.id === aberto) : null;
  const recentes = daUnidade.slice(0, 6);

  return (
    <motion.main className="tela tela--inicio" {...transicaoDeTela}>
      <Topo
        titulo={unidade.nome}
        subtitulo={unidade.veiculo.apelido}
        acoes={
          <>
            <StatusNuvem />
            <BotaoIcone icone="sair" rotulo="Sair" onClick={aoSair} />
          </>
        }
      />

      <div className="conteudo inicio">
        <section className="inicio__heroi">
          <motion.div className="palco palco--cracha" {...aparecer(0)}>
            <Cracha
              nome={nome}
              unidade={unidade.nome}
              veiculo={unidade.veiculo.apelido}
              foto={pessoa.foto}
              foco={pessoa.foco}
              zoom={pessoa.zoom}
              tamanho={telaBaixa ? 0.5 : undefined}
              cordao={telaBaixa ? 0.24 : undefined}
            />
          </motion.div>

          <motion.div className="inicio__boas-vindas" {...aparecer(0.08)}>
            <p className="sobretitulo">{diaPorExtenso(agora)}</p>
            <h1>
              {saudacao(agora)},<br />
              <span className="degrade">{primeiroNome}</span>
            </h1>
            <p className="texto-2">
              {emAndamento.length > 0
                ? 'Há uma viagem em andamento. Ao voltar, registre o KM de volta (se esquecer, o próximo checklist fecha a viagem).'
                : 'Antes de sair, faça o checklist do veículo. Leva menos de um minuto.'}
            </p>

            <div className="inicio__acoes">
              <Botao
                tamanho="g"
                variante={emAndamento.length > 0 ? 'suave' : 'solido'}
                icone="prancheta"
                iconeDepois="seta-direita"
                onClick={aoIniciar}
              >
                {emAndamento.length > 0 ? 'Novo checklist' : 'Iniciar checklist'}
              </Botao>
            </div>

            <button type="button" className="atalho inicio__trocar" onClick={aoTrocarMotorista}>
              <Icone nome="usuario" tamanho={16} />
              Não é {primeiroNome}? Trocar motorista
            </button>
            <Instalar className="inicio__instalar" />

            <dl className="indicadores">
              <div>
                <dt>Último KM</dt>
                <dd className="mono">
                  {quilometragem === null ? (
                    '—'
                  ) : (
                    <Contador valor={quilometragem} formatar={v => numero(Math.round(v))} />
                  )}
                </dd>
              </div>
              <div>
                <dt>No mês</dt>
                <dd className="mono">
                  <Contador valor={noMes} />
                </dd>
              </div>
              <div>
                <dt>Situação</dt>
                <dd data-tom={emAndamento.length > 0 ? 'rota' : 'base'}>
                  {emAndamento.length > 0 ? 'Em rota' : 'Na base'}
                </dd>
              </div>
            </dl>
          </motion.div>
        </section>

        {emAndamento.map(registro => (
          <CartaoViagem key={registro.id} registro={registro} aoRetornar={aoRetornar} agora={agora} />
        ))}

        <motion.section className="cartao veiculo" {...aparecer(0.16)}>
          <PalcoVeiculo unidade={unidade} />
          <div className="veiculo__ficha">
            <span className="sobretitulo">Veículo da rota</span>
            <h2>{unidade.veiculo.nome}</h2>
            <p className="texto-2">
              {unidade.veiculo.versao} · Unidade {unidade.nome}
            </p>
            <dl className="ficha ficha--compacta">
              <div>
                <dt>Último KM</dt>
                <dd className="mono">{quilometragem === null ? '—' : numero(quilometragem)}</dd>
              </div>
              <div>
                <dt>Último checklist</dt>
                <dd>{daUnidade[0] ? dataHora(daUnidade[0].preenchidoEm) : 'Nenhum ainda'}</dd>
              </div>
            </dl>
          </div>
        </motion.section>

        <motion.section className="historico" {...aparecer(0.22)}>
          <header className="secao__topo">
            <div>
              <span className="sobretitulo">Histórico</span>
              <h2>Checklists da unidade</h2>
            </div>
            <span className="secao__nota">
              {daUnidade.length === 1 ? '1 registro' : `${daUnidade.length} registros`}
            </span>
          </header>

          {daUnidade.length === 0 ? (
            <div className="vazio">
              <Icone nome="pasta" tamanho={30} />
              <strong>Nenhum checklist ainda</strong>
              <p>O primeiro que você enviar aparece aqui.</p>
            </div>
          ) : (
            <div className="historico__corpo">
              <PastaDeChecklists
                registros={recentes}
                titulo={`Checklists · ${unidade.sigla}`}
                legenda={
                  recentes.length === 1
                    ? 'toque para abrir · 1 bilhete'
                    : `toque para abrir · ${recentes.length} bilhetes`
                }
                aoAbrir={setAberto}
              />
              <ul className="lista-registros">
                {recentes.map(registro => (
                  <LinhaRegistro
                    key={registro.id}
                    registro={registro}
                    aoAbrir={setAberto}
                    pendente={nuvem.ativa && idsPendentes.has(registro.id)}
                  />
                ))}
              </ul>
            </div>
          )}
        </motion.section>
      </div>

      <Folha
        aberta={Boolean(registroAberto)}
        aoFechar={() => setAberto(null)}
        titulo="Checklist"
        subtitulo={registroAberto ? dataHora(registroAberto.preenchidoEm) : ''}
        rodape={
          registroAberto && emRota(registroAberto) ? (
            <Botao
              icone="bandeira"
              onClick={() => {
                const id = registroAberto.id;
                setAberto(null);
                aoRetornar(id);
              }}
            >
              Registrar retorno
            </Botao>
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
