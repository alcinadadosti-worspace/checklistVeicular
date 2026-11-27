import { ITENS, unidadePorId } from '../config/frota.js';
import { dataHora, duracao, km, numero } from '../lib/formato.js';
import { emRota, kmRodados, resumoDosItens } from '../lib/registros.js';
import { SeloSituacao } from './Basicos.jsx';
import { GaleriaFotos } from './Fotos.jsx';
import Icone from './Icone.jsx';

/** Lista dos itens inspecionados com o selo de cada um. */
export function ResumoDosItens({ itens }) {
  return (
    <ul className="resumo-itens">
      {ITENS.map(item => (
        <li key={item.id} data-situacao={itens?.[item.id] || undefined}>
          <span className="resumo-itens__icone">
            <Icone nome={item.icone} tamanho={18} />
          </span>
          <span className="resumo-itens__nome">{item.nome}</span>
          <SeloSituacao situacao={itens?.[item.id]} />
        </li>
      ))}
    </ul>
  );
}

/** Ficha completa de um checklist (usada no histórico e no painel da administração). */
export default function DetalheChecklist({ registro, pendente = false }) {
  const resumo = resumoDosItens(registro.itens);
  const rodados = kmRodados(registro);
  const rodando = emRota(registro);
  const unidade = unidadePorId(registro.unidade);
  return (
    <div className="detalhe">
      <div className="detalhe__selos">
        <span className={`selo ${rodando ? 'selo--rota' : 'selo--concluido'}`}>
          {rodando ? <i className="pulso" aria-hidden="true" /> : <Icone nome="check" tamanho={14} espessura={2.4} />}
          {rodando ? 'Em rota' : 'Concluído'}
        </span>
        {resumo.problemas > 0 ? (
          <span className="selo selo--ruim">
            <Icone nome="alerta" tamanho={14} espessura={2.4} />
            {resumo.problemas === 1 ? '1 apontamento' : `${resumo.problemas} apontamentos`}
          </span>
        ) : (
          <span className="selo selo--bom">
            <Icone nome="check" tamanho={14} espessura={2.4} />
            Tudo em ordem
          </span>
        )}
        {registro.manutencao?.descricao ? (
          <span className="selo selo--manutencao">
            <Icone nome="chave" tamanho={14} />
            Revisão / manutenção
          </span>
        ) : null}
        {registro.voltaPelaSaidaSeguinte ? (
          <span className="selo selo--pendente" title="O motorista não registrou a volta">
            <Icone nome="rota" tamanho={14} />
            Volta pela saída seguinte
          </span>
        ) : null}
        {pendente ? (
          <span className="selo selo--pendente">
            <Icone nome="nuvem" tamanho={14} />
            Aguardando envio
          </span>
        ) : null}
      </div>

      <dl className="ficha">
        <div>
          <dt>Motorista</dt>
          <dd>{registro.motoristaNome}</dd>
        </div>
        <div>
          <dt>Unidade</dt>
          <dd>{unidade?.nome || registro.unidadeNome}</dd>
        </div>
        <div>
          <dt>Veículo</dt>
          <dd>{registro.veiculo}</dd>
        </div>
        <div>
          <dt>Preenchido em</dt>
          <dd>{dataHora(registro.preenchidoEm)}</dd>
        </div>
        <div>
          <dt>KM de saída</dt>
          <dd className="mono">{numero(registro.kmSaida)}</dd>
        </div>
        <div>
          <dt>KM de volta</dt>
          <dd className="mono">{rodando ? '—' : numero(registro.kmVolta)}</dd>
        </div>
        <div>
          <dt>KM rodados</dt>
          <dd className="mono">{rodados === null ? '—' : km(rodados)}</dd>
        </div>
        <div>
          <dt>Retorno</dt>
          <dd>
            {rodando
              ? 'Ainda em rota'
              : registro.voltaPelaSaidaSeguinte
                ? `Não registrado · KM da saída seguinte (${dataHora(registro.retornoEm)})`
                : `${dataHora(registro.retornoEm)}${
                    registro.retornoEm !== registro.preenchidoEm
                      ? ` (${duracao(registro.preenchidoEm, registro.retornoEm)})`
                      : ''
                  }`}
          </dd>
        </div>
      </dl>

      <h3 className="detalhe__titulo">Itens inspecionados</h3>
      <ResumoDosItens itens={registro.itens} />

      <h3 className="detalhe__titulo">Outros</h3>
      <p className="detalhe__outros" data-vazio={registro.outros ? undefined : ''}>
        {registro.outros || 'Nada informado.'}
      </p>

      {registro.fotos?.length ? (
        <>
          <h3 className="detalhe__titulo">
            {registro.fotos.length === 1 ? 'Foto' : `Fotos (${registro.fotos.length})`}
          </h3>
          <GaleriaFotos fotos={registro.fotos} />
        </>
      ) : null}

      {registro.manutencao?.descricao ? (
        <>
          <h3 className="detalhe__titulo detalhe__titulo--manutencao">
            <Icone nome="chave" tamanho={16} /> Revisão / manutenção
          </h3>
          <p className="detalhe__outros">{registro.manutencao.descricao}</p>
          <GaleriaFotos fotos={registro.manutencao.fotos} />
        </>
      ) : null}
    </div>
  );
}
