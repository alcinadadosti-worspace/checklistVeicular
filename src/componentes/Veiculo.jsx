import { Suspense, lazy } from 'react';
import { useNaTela } from '../lib/ganchos.js';
import { FundoGrade } from './Fundos.jsx';
import Protecao from './Protecao.jsx';

// O visualizador 3D (three.js) é pesado: só é baixado quando o palco chega perto da tela.
const Veiculo3D = lazy(() => import('./Veiculo3D.jsx'));

/**
 * Palco do veículo: o carro da unidade em 3D (React Bits · ModelViewer) dentro de uma
 * "sala de varredura" (React Bits · GridScan).
 */
export function PalcoVeiculo({ unidade, className = '', comGrade = true, children, ...opcoes }) {
  const [ref, visivel] = useNaTela();
  return (
    <div className={`palco palco--veiculo${className ? ` ${className}` : ''}`} ref={ref}>
      <div className="palco__fundo" aria-hidden="true">
        {visivel && comGrade ? <FundoGrade /> : null}
      </div>
      {visivel ? (
        <Protecao silenciosa>
          <Suspense fallback={null}>
            <Veiculo3D url={unidade.veiculo.modelo} altura="100%" {...opcoes} />
          </Suspense>
        </Protecao>
      ) : null}
      {children}
      <span className="palco__dica" aria-hidden="true">
        arraste para girar
      </span>
      <span className="visualmente-oculto">
        Modelo 3D do veículo {unidade.veiculo.nome} {unidade.veiculo.versao}.
      </span>
    </div>
  );
}
