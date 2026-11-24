import { Suspense, lazy, useEffect, useState } from 'react';
import { desenharCordao, desenharFrente, desenharVerso } from '../lib/cracha.js';
import { fotoDe } from '../lib/fotos.js';
import { useAtrasado } from '../lib/ganchos.js';
import Protecao from './Protecao.jsx';

const Lanyard = lazy(() => import('../reactbits/Lanyard.jsx'));

/**
 * Crachá pendurado no cordão (React Bits · Lanyard), com a foto e o nome da pessoa.
 * Dá para arrastar, arremessar e tocar para virar. Sem foto, aparece a silhueta.
 */
export default function Cracha({
  nome,
  cargo = 'Motorista',
  unidade,
  veiculo,
  foto = null,
  foco,
  zoom,
  tema = 'azul',
  metal = 'silver',
  tamanho = 0.62,
  cordao = 0.34,
  ancora = 'center',
  className = ''
}) {
  const [artes, setArtes] = useState(null);
  // Enquanto a pessoa digita o nome ("Outro"), espera um instante antes de redesenhar.
  const pedido = useAtrasado(
    JSON.stringify({ nome, cargo, unidade, veiculo, foto, foco, zoom, tema }),
    artes ? 260 : 0
  );

  useEffect(() => {
    let vivo = true;
    const dados = JSON.parse(pedido);
    Promise.all([
      desenharFrente({ ...dados, fotoUrl: fotoDe(dados.foto) }),
      desenharVerso(dados),
      desenharCordao({ texto: `Checklist Veicular  •  ${dados.unidade || ''}`, tema: dados.tema })
    ])
      .then(([frente, verso, fita]) => {
        if (vivo && frente) setArtes({ frente, verso, fita });
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [pedido]);

  return (
    <div className={`cracha${className ? ` ${className}` : ''}`} data-pronto={artes ? '' : undefined}>
      <Protecao silenciosa>
        <Suspense fallback={null}>
          {artes ? (
            <Lanyard
              frontImage={artes.frente}
              backImage={artes.verso}
              strapImage={artes.fita}
              imageFit="cover"
              cardColor="#dbe3ec"
              finish="glossy"
              metal={metal}
              cornerRadius={0.32}
              size={tamanho}
              anchor={ancora}
              strapLength={cordao}
              strapWidth={0.72}
              gravity={1}
              damping={0.5}
              elasticity={0.5}
              breeze={0.35}
              interactive
              intro
            />
          ) : null}
        </Suspense>
      </Protecao>
      <p className="cracha__dica" aria-hidden="true">
        arraste o crachá · toque para virar
      </p>
      <span className="visualmente-oculto">
        Crachá de {nome || 'motorista'}, {cargo}, {unidade}.
      </span>
    </div>
  );
}
