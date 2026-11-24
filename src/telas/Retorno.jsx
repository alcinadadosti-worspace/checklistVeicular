import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Botao, Topo, transicaoDeTela } from '../componentes/Basicos.jsx';
import { CampoKm, CarimboDeHora } from '../componentes/Campos.jsx';
import { FundoRadar } from '../componentes/Fundos.jsx';
import Icone from '../componentes/Icone.jsx';
import { banco } from '../lib/banco.js';
import { dataHora, haQuantoTempo, km, numero, paraKm } from '../lib/formato.js';
import { useAgora, useBanco } from '../lib/ganchos.js';
import { emRota, registrarRetorno, validarRetorno } from '../lib/registros.js';
import CometDial from '../reactbits/CometDial.jsx';

const ESCALAS = [50, 100, 200, 400, 800, 1600, 3200];

/** Fecha uma viagem em andamento: KM de volta, com data e hora automáticas. */
export default function Retorno({ unidade, registroId, aoVoltar, aoConcluir }) {
  const { registros } = useBanco();
  const registro = useMemo(() => registros.find(item => item.id === registroId) || null, [registros, registroId]);
  const [texto, setTexto] = useState('');
  const [tentou, setTentou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const agora = useAgora(30000);

  if (!registro || (!emRota(registro) && !enviando)) {
    return (
      <motion.main className="tela tela--retorno" {...transicaoDeTela}>
        <Topo titulo="Registrar retorno" subtitulo={unidade.nome} aoVoltar={aoVoltar} />
        <div className="conteudo">
          <div className="vazio">
            <Icone nome="check" tamanho={30} />
            <strong>Esta viagem já foi encerrada</strong>
            <p>O KM de volta já está registrado.</p>
            <Botao variante="suave" icone="seta-esquerda" onClick={aoVoltar}>
              Voltar ao início
            </Botao>
          </div>
        </div>
      </motion.main>
    );
  }

  const volta = paraKm(texto);
  const erro = validarRetorno(registro, volta);
  const rodados = volta !== null && volta >= registro.kmSaida ? volta - registro.kmSaida : 0;
  const escala = ESCALAS.find(limite => rodados <= limite) ?? Math.ceil(rodados / 1000) * 1000;

  const confirmar = () => {
    if (enviando) return;
    if (erro) {
      setTentou(true);
      navigator.vibrate?.(90);
      return;
    }
    setEnviando(true);
    banco.gravar(registrarRetorno(registro, volta));
    navigator.vibrate?.([40, 60, 40]);
    aoConcluir(registro.id);
  };

  return (
    <motion.main className="tela tela--retorno" {...transicaoDeTela}>
      <Topo titulo="Registrar retorno" subtitulo={`${unidade.nome} · ${unidade.veiculo.apelido}`} aoVoltar={aoVoltar} />

      <div className="conteudo">
        <div className="passo passo--dividido">
          <div className="palco palco--radar">
            <div className="palco__fundo" aria-hidden="true">
              <FundoRadar centerY={0.52} scale={1.02} targets={6} />
            </div>
            <div className="mostrador mostrador--sobre-radar">
              <CometDial
                value={Math.min(rodados, escala)}
                min={0}
                max={escala}
                step={1}
                unit=" km"
                label="Quilômetros rodados"
                accent="#38bdf8"
                ink="#e8eef7"
                size={210}
                sweep={280}
                thickness={7}
                cometReach={220}
                cometWidth={12}
                disabled
              />
              <span className="mostrador__rotulo">rodados nesta viagem</span>
            </div>
          </div>

          <div className="passo__campos">
            <span className="selo selo--rota">
              <i className="pulso" aria-hidden="true" />
              Em rota · {haQuantoTempo(registro.preenchidoEm, agora.getTime())}
            </span>
            <h2>Chegou? Informe o KM de volta</h2>

            <dl className="ficha ficha--compacta">
              <div>
                <dt>Motorista</dt>
                <dd>{registro.motoristaNome}</dd>
              </div>
              <div>
                <dt>Saída</dt>
                <dd>{dataHora(registro.preenchidoEm)}</dd>
              </div>
              <div>
                <dt>KM de saída</dt>
                <dd className="mono">{numero(registro.kmSaida)}</dd>
              </div>
              <div>
                <dt>KM rodados</dt>
                <dd className="mono">{volta !== null && !erro ? km(rodados) : '—'}</dd>
              </div>
            </dl>

            <CampoKm
              rotulo="KM de volta"
              valor={texto}
              aoMudar={setTexto}
              autoFocus
              erro={
                tentou
                  ? erro
                  : volta !== null && volta < registro.kmSaida && texto.length >= String(registro.kmSaida).length
                    ? erro
                    : null
              }
              dica={`Precisa ser igual ou maior que ${numero(registro.kmSaida)}.`}
            />

            <CarimboDeHora rotulo="Data e hora do retorno" />

            <Botao tamanho="g" icone="bandeira" carregando={enviando} onClick={confirmar}>
              Encerrar viagem
            </Botao>
          </div>
        </div>
      </div>
    </motion.main>
  );
}
