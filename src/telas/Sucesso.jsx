import { useMemo } from 'react';
import { motion } from 'motion/react';
import { Botao, transicaoDeTela } from '../componentes/Basicos.jsx';
import { FundoFibras } from '../componentes/Fundos.jsx';
import Icone from '../componentes/Icone.jsx';
import { PastaDeChecklists } from '../componentes/Registros.jsx';
import StatusNuvem from '../componentes/StatusNuvem.jsx';
import { ITENS } from '../config/frota.js';
import { dataHora, km, numero } from '../lib/formato.js';
import { useBanco } from '../lib/ganchos.js';
import { emRota, kmRodados, resumoDosItens } from '../lib/registros.js';

const BOLINHA = { bom: '🟢', ruim: '🟡', faltante: '🔴' };

/** Confirmação do envio: o checklist "entra na pasta" e os itens saltam como bilhetes. */
export default function Sucesso({ unidade, registroId, aoVoltar }) {
  const { registros } = useBanco();
  const registro = useMemo(() => registros.find(item => item.id === registroId) || null, [registros, registroId]);

  const bilhetes = useMemo(() => {
    if (!registro) return [];
    const itens = ITENS.map(item => ({
      label: `${BOLINHA[registro.itens[item.id]] || '⚪'} ${item.curto}`,
      value: item.id
    }));
    const rodados = kmRodados(registro);
    return [
      {
        label: `📍 ${rodados === null ? `saída ${numero(registro.kmSaida)} km` : `${km(rodados)} rodados`}`,
        value: 'km'
      },
      ...itens
    ];
  }, [registro]);

  if (!registro) {
    return (
      <motion.main className="tela tela--sucesso" {...transicaoDeTela}>
        <div className="sucesso">
          <h1>Checklist não encontrado</h1>
          <Botao icone="seta-esquerda" onClick={aoVoltar}>
            Voltar ao início
          </Botao>
        </div>
      </motion.main>
    );
  }

  const rodando = emRota(registro);
  const resumo = resumoDosItens(registro.itens);

  return (
    <motion.main className="tela tela--sucesso" {...transicaoDeTela}>
      <div className="login__fundo" aria-hidden="true">
        <FundoFibras
          cor={rodando ? '#38bdf8' : '#34d399'}
          corSecundaria={rodando ? '#6366f1' : '#0ea5e9'}
          speed={0.6}
        />
      </div>
      <div className="login__veu" aria-hidden="true" />

      <div className="sucesso">
        <div className="sucesso__nuvem">
          <StatusNuvem />
        </div>

        <motion.div
          className="sucesso__selo"
          initial={{ scale: 0, rotate: -40 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.15 }}
        >
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <motion.circle
              cx="32"
              cy="32"
              r="27"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.6, delay: 0.25 }}
            />
            <motion.path
              d="M19 33l9 9 17-19"
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.4, delay: 0.7 }}
            />
          </svg>
        </motion.div>

        <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          {rodando ? 'Checklist enviado!' : 'Viagem encerrada!'}
        </motion.h1>
        <motion.p
          className="texto-2 sucesso__texto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {rodando ? (
            <>
              Boa rota, <strong>{registro.motoristaNome.split(' ')[0]}</strong>. Ao voltar, abra o app e registre o KM
              de volta.
            </>
          ) : (
            <>
              Tudo registrado, <strong>{registro.motoristaNome.split(' ')[0]}</strong>:{' '}
              <strong>{km(kmRodados(registro))}</strong> rodados.
            </>
          )}
        </motion.p>

        <motion.div
          className="sucesso__pasta"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75, duration: 0.5 }}
        >
          <PastaDeChecklists
            registros={[]}
            bilhetes={bilhetes}
            titulo={`Arquivado · ${unidade.sigla}`}
            legenda={dataHora(registro.preenchidoEm)}
            abrirDeInicio
          />
        </motion.div>

        <motion.p
          className="sucesso__resumo"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.95 }}
        >
          <span className={`selo selo--${resumo.problemas === 0 ? 'bom' : resumo.faltante > 0 ? 'faltante' : 'ruim'}`}>
            <Icone nome={resumo.problemas === 0 ? 'check' : 'alerta'} tamanho={14} espessura={2.4} />
            {resumo.problemas === 0
              ? 'Todos os itens em ordem'
              : resumo.problemas === 1
                ? '1 apontamento'
                : `${resumo.problemas} apontamentos`}
          </span>
          <span className="selo selo--pendente mono">
            {numero(registro.kmSaida)} → {rodando ? '…' : numero(registro.kmVolta)} km
          </span>
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.05 }}>
          <Botao tamanho="g" icone="volante" onClick={aoVoltar}>
            Voltar ao início
          </Botao>
        </motion.div>

        <p className="sucesso__nota">
          <Icone nome="relogio" tamanho={14} /> Registrado em{' '}
          {dataHora(rodando ? registro.preenchidoEm : registro.retornoEm)}
        </p>
      </div>
    </motion.main>
  );
}
