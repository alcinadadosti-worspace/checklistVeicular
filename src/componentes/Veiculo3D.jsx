import { useEffect, useRef, useState } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import ModelViewer from '../reactbits/ModelViewer.jsx';

// Estúdio de luz montado por código (softboxes), para a pintura e os vidros terem reflexos
// sem baixar nenhum arquivo HDR de fora do site.
const Estudio = () => (
  <>
    <ambientLight intensity={0.18} />
    <directionalLight position={[3, 5, 7]} intensity={0.85} />
    <directionalLight position={[-5, 6, -2]} intensity={0.35} />
    <Environment resolution={256} frames={1} environmentIntensity={0.72}>
      <color attach="background" args={['#06080d']} />
      {/* teto */}
      <Lightformer form="rect" intensity={4} position={[0, 7, 0]} rotation-x={Math.PI / 2} scale={[14, 10, 1]} />
      {/* luz principal, atrás da câmera */}
      <Lightformer form="rect" intensity={2.4} position={[0, 2.5, 9]} scale={[18, 5, 1]} />
      {/* laterais */}
      <Lightformer form="rect" intensity={2.6} position={[-8, 2, 2]} rotation-y={Math.PI / 2} scale={[12, 4, 1]} />
      <Lightformer form="rect" intensity={2} position={[8, 2, 0]} rotation-y={-Math.PI / 2} scale={[12, 4, 1]} />
      {/* contraluz azulada */}
      <Lightformer
        form="rect"
        color="#7dd3fc"
        intensity={2.4}
        position={[0, 2, -9]}
        rotation-y={Math.PI}
        scale={[16, 2, 1]}
      />
      {/* chão escuro */}
      <Lightformer
        form="rect"
        color="#1e293b"
        intensity={0.7}
        position={[0, -5, 0]}
        rotation-x={-Math.PI / 2}
        scale={[16, 16, 1]}
      />
    </Environment>
  </>
);

/**
 * Carro da unidade em 3D (React Bits · ModelViewer).
 * Arrastar gira, pinça dá zoom, duplo clique volta ao ângulo inicial.
 */
export default function Veiculo3D({ url, altura = 280, className = '', ...opcoes }) {
  const caixaRef = useRef(null);
  const [proporcao, setProporcao] = useState(1.6);

  // O visualizador enquadra pela altura; como o carro é comprido, usamos a largura disponível.
  useEffect(() => {
    const elemento = caixaRef.current;
    if (!elemento) return undefined;
    const medir = () => {
      const { width, height } = elemento.getBoundingClientRect();
      if (width > 0 && height > 0) setProporcao(width / height);
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  // Limite de 1,25: quando o carro gira e aponta para a câmera, precisa de folga para não cortar.
  const enquadramento = Math.min(1.25, Math.max(0.86, 0.9 * Math.max(1, proporcao)));

  return (
    <div ref={caixaRef} className={className} style={{ width: '100%', height: altura }}>
      <ModelViewer
        url={url}
        width="100%"
        height="100%"
        environment="none"
        exposure={1}
        rotationOrder="XYZ"
        autoRotate
        autoRotateSpeed={0.35}
        autoRotateDelay={1.5}
        turntable
        zoom
        minZoom={0.8}
        maxZoom={1.8}
        hoverTilt={0.06}
        float={0.16}
        shadow
        shadowOpacity={0.65}
        intro="rise"
        startAngle={-38}
        tilt={13}
        offsetY={0.07}
        fit={enquadramento}
        {...opcoes}
      >
        <Estudio />
      </ModelViewer>
    </div>
  );
}
