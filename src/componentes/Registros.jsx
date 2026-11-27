import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { unidadePorId } from '../config/frota.js';
import { diaCurto, hora, km, numero } from '../lib/formato.js';
import { useLargura } from '../lib/ganchos.js';
import { emRota, kmRodados, piorSituacao, resumoDosItens } from '../lib/registros.js';
import Icone from './Icone.jsx';
import Protecao from './Protecao.jsx';

const FolderFloat = lazy(() => import('../reactbits/FolderFloat.jsx'));

const BOLINHA = { bom: '🟢', ruim: '🟡', faltante: '🔴' };

/** Texto curto de um checklist para os bilhetes da pasta. */
export const bilheteDe = (registro, comUnidade = false) => {
  const marca = BOLINHA[piorSituacao(registro.itens)] || '⚪';
  const trecho = emRota(registro) ? 'em rota' : km(kmRodados(registro));
  const quem = comUnidade
    ? unidadePorId(registro.unidade)?.sigla || registro.unidade
    : registro.motoristaNome.split(' ')[0];
  return `${marca} ${diaCurto(registro.preenchidoEm)} · ${quem} · ${trecho}`;
};

/**
 * Pasta de checklists (React Bits · FolderFloat): ao abrir, os registros saltam como
 * bilhetes que flutuam; tocar num bilhete abre a ficha.
 */
export function PastaDeChecklists({
  registros,
  titulo,
  legenda,
  aoAbrir,
  comUnidade = false,
  abrirDeInicio = false,
  bilhetes
}) {
  const [ref, largura] = useLargura();
  const itens = useMemo(
    () => bilhetes || registros.map(registro => ({ label: bilheteDe(registro, comUnidade), value: registro.id })),
    [bilhetes, registros, comUnidade]
  );
  // Os bilhetes se espalham para os lados: limita ao espaço disponível.
  const espalhar = Math.max(110, Math.min(190, (largura || 320) / 2 - 12));
  const fileiras = useMemo(() => {
    let linhas = 1;
    let ocupado = 0;
    for (const item of itens) {
      const bilhete = 32 + [...String(item.label)].length * 7.6; // largura aproximada do bilhete
      if (ocupado > 0 && ocupado + 12 + bilhete > espalhar * 2) {
        linhas += 1;
        ocupado = 0;
      }
      ocupado += (ocupado > 0 ? 12 : 0) + bilhete;
    }
    return linhas;
  }, [itens, espalhar]);
  const chave = `${itens.length}-${Math.round(espalhar)}`;
  const [aberta, setAberta] = useState(abrirDeInicio);
  // Quando a pasta é remontada (mudou a lista ou a largura), volta ao estado inicial.
  useEffect(() => setAberta(abrirDeInicio), [chave, abrirDeInicio]);
  return (
    <div
      className="pasta"
      ref={ref}
      data-aberta={aberta ? '' : undefined}
      style={{ '--pasta-folga': `${40 + fileiras * 52}px` }}
    >
      <Protecao silenciosa>
        <Suspense fallback={<div className="pasta__espera" />}>
          {largura > 0 ? (
            <FolderFloat
              key={chave}
              items={itens}
              label={titulo}
              sublabel={legenda}
              trigger="click"
              defaultOpen={abrirDeInicio}
              closeOnSelect={false}
              physics
              drift={0.55}
              onSelect={valor => aoAbrir?.(valor)}
              onOpenChange={valor => queueMicrotask(() => setAberta(valor))}
              folderColor="#16335c"
              frontColor="#1f4f96"
              paperColor="#dbeafe"
              itemColor="#f1f5f9"
              itemTextColor="#0f172a"
              labelColor="#f8fafc"
              width={Math.min(210, Math.max(170, (largura || 320) * 0.6))}
              height={142}
              radius={16}
              spread={espalhar}
              lift={30}
              tilt={7}
              openDuration={520}
              stagger={50}
              bounce={0.35}
            />
          ) : null}
        </Suspense>
      </Protecao>
    </div>
  );
}

/** Linha de um checklist nas listas (histórico e administração). */
export function LinhaRegistro({ registro, aoAbrir, comUnidade = false, pendente = false }) {
  const resumo = resumoDosItens(registro.itens);
  const rodando = emRota(registro);
  const rodados = kmRodados(registro);
  const unidade = unidadePorId(registro.unidade);
  return (
    <li className="linha-registro" data-rota={rodando ? '' : undefined}>
      <button type="button" onClick={() => aoAbrir(registro.id)}>
        <span className="linha-registro__data">
          <strong>{diaCurto(registro.preenchidoEm)}</strong>
          <span>{hora(registro.preenchidoEm)}</span>
        </span>
        <span className="linha-registro__meio">
          <strong>
            {registro.motoristaNome}
            {comUnidade ? <em>{unidade?.nome || registro.unidadeNome}</em> : null}
          </strong>
          <span className="mono">
            {/* cada parte fica inteira; se faltar espaço, a distância desce para a linha de baixo */}
            <span className="linha-registro__trecho">
              {numero(registro.kmSaida)} → {rodando ? '…' : numero(registro.kmVolta)}
            </span>
            {rodados !== null ? (
              <>
                {' '}
                <b>· {km(rodados)}</b>
              </>
            ) : null}
          </span>
        </span>
        <span className="linha-registro__selos">
          {rodando ? (
            <span className="selo selo--rota">
              <i className="pulso" aria-hidden="true" />
              Em rota
            </span>
          ) : null}
          {resumo.problemas > 0 ? (
            <span className={`selo selo--${resumo.faltante > 0 ? 'faltante' : 'ruim'}`}>
              <Icone nome="alerta" tamanho={13} espessura={2.4} />
              {resumo.problemas}
            </span>
          ) : (
            <span className="selo selo--bom">
              <Icone nome="check" tamanho={13} espessura={2.4} />
              OK
            </span>
          )}
          {registro.manutencao?.descricao ? (
            <span className="selo selo--manutencao" title="Revisão/manutenção registrada">
              <Icone nome="chave" tamanho={13} />
            </span>
          ) : null}
          {registro.fotos?.length ? (
            <span
              className="selo selo--fotos"
              title={registro.fotos.length === 1 ? '1 foto anexada' : `${registro.fotos.length} fotos anexadas`}
            >
              <Icone nome="camera" tamanho={13} />
              {registro.fotos.length}
            </span>
          ) : null}
          {pendente ? (
            <span className="selo selo--pendente" title="Aguardando envio para a nuvem">
              <Icone nome="nuvem" tamanho={13} />
            </span>
          ) : null}
        </span>
        <Icone nome="seta-direita" tamanho={18} className="linha-registro__seta" />
      </button>
    </li>
  );
}
