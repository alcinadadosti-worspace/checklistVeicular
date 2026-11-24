// Fundos animados do React Bits, carregados sob demanda e com resolução ajustada ao aparelho.
// Se o navegador não tiver WebGL2, eles simplesmente não desenham e fica o degradê do CSS.

import { Suspense, lazy } from 'react';
import { useDensidade } from '../lib/ganchos.js';
import Protecao from './Protecao.jsx';

const GhostFibers = lazy(() => import('../reactbits/GhostFibers.jsx'));
const Radar = lazy(() => import('../reactbits/Radar.jsx'));
const GridScan = lazy(() => import('../reactbits/GridScan.jsx'));

/** Fitas de fibras luminosas (login, crachá e tela de sucesso). */
export function FundoFibras({ cor = '#38bdf8', corSecundaria = '#6366f1', ...opcoes }) {
  const densidade = useDensidade();
  return (
    <Protecao silenciosa>
      <Suspense fallback={null}>
        <GhostFibers
          glowColor={cor}
          secondaryColor={corSecundaria}
          gradient="along"
          speed={0.42}
          layers={3}
          threads={64}
          twist={1.25}
          depthOfField={0.9}
          particles={0.55}
          sparkle={0.6}
          glow={1.15}
          brightness={1.3}
          vignette={0.3}
          grain={0.05}
          hoverEffect="focus"
          pulseOnClick
          dpr={densidade}
          {...opcoes}
        />
      </Suspense>
    </Protecao>
  );
}

/** Radar de rota (viagem em andamento, retorno e painel da administração). */
export function FundoRadar({ cor = '#38bdf8', ...opcoes }) {
  const densidade = useDensidade();
  return (
    <Protecao silenciosa>
      <Suspense fallback={null}>
        <Radar
          color={cor}
          mode="sweep"
          speed={0.85}
          trail={0.42}
          scale={0.95}
          ringCount={5}
          spokeCount={12}
          targets={5}
          clutter={0.25}
          glow={1.05}
          gridOpacity={0.85}
          tilt={0}
          grain={0.03}
          fade={0.25}
          dpr={densidade}
          {...opcoes}
        />
      </Suspense>
    </Protecao>
  );
}

/** Sala em grade com feixe de varredura (palco do veículo). */
export function FundoGrade({ cor = '#7dd3fc', ...opcoes }) {
  const densidade = useDensidade();
  return (
    <Protecao silenciosa>
      <Suspense fallback={null}>
        <GridScan
          linesColor="#3b4a66"
          scanColor={cor}
          cells={9}
          lineThickness={1}
          depth={3.2}
          depthFade={0.7}
          parallax={0.9}
          points
          reflection={0.4}
          shading={0.75}
          scanDirection="forward"
          scanDuration={2.8}
          scanDelay={1.2}
          scanWidth={1.1}
          trail={0.55}
          glow={0.7}
          clickEffect="ping"
          dpr={densidade}
          {...opcoes}
        />
      </Suspense>
    </Protecao>
  );
}
