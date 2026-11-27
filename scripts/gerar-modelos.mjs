// Gera os modelos 3D estilizados dos veículos (public/models/*.glb).
//
//   npm run modelos
//
// Não existem modelos oficiais e de uso livre da Hilux e da Saveiro, então os dois
// são construídos aqui por código, a partir das medidas reais de cada carro
// (comprimento, entre-eixos, altura, caçamba, rodas). São representações
// estilizadas, não réplicas. As duas picapes da frota rodam com baú fechado sobre a
// caçamba (campo `bau` das fichas; sem ele, a caçamba fica aberta).
//
// Para usar um modelo profissional no lugar, basta salvar o arquivo como
// public/models/hilux.glb ou public/models/saveiro.glb (formato .glb) — o app
// carrega o que estiver lá. Para mudar a cor, altere `pintura` nas fichas abaixo.
//
// Os arquivos saem compactados (meshopt), com ~250 KB cada, para abrir rápido no celular.
//
// Eixos: X = comprimento (frente em +X), Y = altura, Z = largura. Medidas em metros.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js';
import { mergeGeometries, mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { quantize, reorder } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

// O exportador do three.js espera o FileReader do navegador.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(buffer => {
        this.result = buffer;
        this.onloadend?.();
      });
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then(buffer => {
        this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
        this.onloadend?.();
      });
    }
  };
}

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = join(RAIZ, 'public', 'models');

/* ------------------------------------------------------------------ */
/* Fichas dos veículos                                                 */
/* ------------------------------------------------------------------ */

const HILUX = {
  arquivo: 'hilux.glb',
  nome: 'Toyota Hilux Cabine Simples',
  pintura: '#f3f4f1',
  frente: 2.53,
  traseira: -2.8,
  eixoF: 1.5425,
  eixoT: -1.5425,
  largura: 1.8,
  roda: { raio: 0.39, largura: 0.265, aro: 0.225, estilo: 'aco' },
  folgaArco: 0.09,
  soleira: 0.49,
  parachoqueBase: 0.47,
  capoFrente: 1.15,
  cowl: { x: 1.15, y: 1.25 },
  cinturaTras: 1.3,
  teto: 1.8,
  tetoFrenteX: 0.63,
  tetoTrasX: -0.33,
  cabineTras: -0.4,
  afunilamento: 0.17,
  cacamba: { frente: -0.44, tras: -2.74, borda: 1.315, piso: 0.86 },
  bau: { sobreTeto: 0.2 }, // baú fechado sobre a caçamba, 20 cm mais alto que a cabine
  parachoqueTraseiro: 'cromado',
  parachoqueDianteiro: 'pintado',
  paralamas: true,
  narizSuave: 1,
  gradeTraseira: false,
  estepeSobCacamba: true,
  antena: true
};

const SAVEIRO = {
  arquivo: 'saveiro.glb',
  nome: 'Volkswagen Saveiro 2025',
  pintura: '#f1f2f0',
  frente: 2.195,
  traseira: -2.295,
  eixoF: 1.375,
  eixoT: -1.375,
  largura: 1.71,
  roda: { raio: 0.315, largura: 0.205, aro: 0.192, estilo: 'calota' },
  folgaArco: 0.07,
  soleira: 0.27,
  parachoqueBase: 0.25,
  capoFrente: 0.84,
  cowl: { x: 1.07, y: 0.985 },
  cinturaTras: 1.045,
  teto: 1.5,
  tetoFrenteX: 0.46,
  tetoTrasX: -0.27,
  cabineTras: -0.335,
  afunilamento: 0.2,
  cacamba: { frente: -0.345, tras: -2.25, borda: 1.085, piso: 0.56 },
  bau: { sobreTeto: 0.2 },
  parachoqueTraseiro: 'preto',
  parachoqueDianteiro: 'preto',
  paralamas: false,
  narizSuave: 2.1,
  gradeTraseira: true,
  estepeSobCacamba: false,
  antena: true
};

/* ------------------------------------------------------------------ */
/* Utilidades de geometria                                             */
/* ------------------------------------------------------------------ */

const limitar = (v, a, b) => Math.min(b, Math.max(a, v));
const suave = (a, b, v) => {
  const t = limitar((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const normalizar = geometria => {
  const g = geometria.index ? geometria.toNonIndexed() : geometria;
  for (const nome of Object.keys(g.attributes)) {
    if (nome !== 'position' && nome !== 'normal') g.deleteAttribute(nome);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  g.morphAttributes = {};
  g.clearGroups();
  return g;
};

const espelharZ = geometria => {
  const g = geometria.clone();
  g.applyMatrix4(new THREE.Matrix4().makeScale(1, 1, -1));
  for (const atributo of Object.values(g.attributes)) {
    const dados = atributo.array;
    const n = atributo.itemSize;
    for (let i = 0; i + 2 < atributo.count; i += 3) {
      for (let k = 0; k < n; k++) {
        const troca = dados[(i + 1) * n + k];
        dados[(i + 1) * n + k] = dados[(i + 2) * n + k];
        dados[(i + 2) * n + k] = troca;
      }
    }
  }
  return g;
};

// Ângulo (rad) acima do qual uma aresta fica "viva". Baixo o bastante para as faces planas
// não pegarem o sombreamento do chanfro vizinho.
const VINCO = 0.3;

const deformar = (geometria, funcao, { vinco = VINCO, malha = 0 } = {}) => {
  let g = normalizar(geometria);
  if (malha > 0) g = normalizar(new TessellateModifier(malha, 10).modify(g));
  const posicao = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < posicao.count; i++) {
    v.fromBufferAttribute(posicao, i);
    funcao(v);
    posicao.setXYZ(i, v.x, v.y, v.z);
  }
  posicao.needsUpdate = true;
  return toCreasedNormals(g, vinco);
};

const arco = (cx, cy, raio, inicio, fim, passos) => {
  const pontos = [];
  for (let i = 0; i <= passos; i++) {
    const a = inicio + ((fim - inicio) * i) / passos;
    pontos.push([cx + Math.cos(a) * raio, cy + Math.sin(a) * raio]);
  }
  return pontos;
};

const subdividir = (pontos, maximo) => {
  const saida = [];
  for (let i = 0; i < pontos.length; i++) {
    const a = pontos[i];
    const b = pontos[(i + 1) % pontos.length];
    saida.push(a);
    const partes = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maximo);
    for (let k = 1; k < partes; k++) {
      saida.push([a[0] + ((b[0] - a[0]) * k) / partes, a[1] + ((b[1] - a[1]) * k) / partes]);
    }
  }
  return saida;
};

const formaDe = pontos => new THREE.Shape(pontos.map(([x, y]) => new THREE.Vector2(x, y)));

// Polígono com cantos arredondados (para vidros, placas, etc.).
const formaArredondada = (pontos, raio) => {
  const forma = new THREE.Shape();
  const n = pontos.length;
  for (let i = 0; i < n; i++) {
    const anterior = pontos[(i + n - 1) % n];
    const atual = pontos[i];
    const proximo = pontos[(i + 1) % n];
    const da = Math.hypot(atual[0] - anterior[0], atual[1] - anterior[1]);
    const db = Math.hypot(proximo[0] - atual[0], proximo[1] - atual[1]);
    const r = Math.min(raio, da / 2.2, db / 2.2);
    const entrada = [atual[0] + ((anterior[0] - atual[0]) * r) / da, atual[1] + ((anterior[1] - atual[1]) * r) / da];
    const saida = [atual[0] + ((proximo[0] - atual[0]) * r) / db, atual[1] + ((proximo[1] - atual[1]) * r) / db];
    if (i === 0) forma.moveTo(entrada[0], entrada[1]);
    else forma.lineTo(entrada[0], entrada[1]);
    forma.quadraticCurveTo(atual[0], atual[1], saida[0], saida[1]);
  }
  forma.closePath();
  return forma;
};

// Extrusão de um perfil lateral (plano XY) ao longo da largura (Z), centrada em z = 0.
const extrudar = (forma, largura, { chanfro = 0.02, segmentos = 2, passos = 1, curvas = 6 } = {}) => {
  const profundidade = Math.max(largura - 2 * chanfro, 0.002);
  const g = new THREE.ExtrudeGeometry(forma, {
    depth: profundidade,
    steps: passos,
    bevelEnabled: chanfro > 0,
    bevelThickness: chanfro,
    bevelSize: chanfro,
    bevelOffset: -chanfro,
    bevelSegments: segmentos,
    curveSegments: curvas
  });
  g.translate(0, 0, -profundidade / 2);
  return toCreasedNormals(g, VINCO);
};

const caixa = (dx, dy, dz, x, y, z, raio = 0) => {
  if (raio <= 0) {
    const g = new THREE.BoxGeometry(dx, dy, dz);
    g.translate(x, y, z);
    return g;
  }
  const r = Math.min(raio, dx / 2 - 0.001, dy / 2 - 0.001);
  const forma = formaArredondada(
    [
      [-dx / 2, -dy / 2],
      [dx / 2, -dy / 2],
      [dx / 2, dy / 2],
      [-dx / 2, dy / 2]
    ],
    r
  );
  const g = extrudar(forma, dz, { chanfro: Math.min(r * 0.6, dz / 2 - 0.001), segmentos: 2 });
  g.translate(x, y, z);
  return g;
};

const cilindroZ = (raio, comprimento, x, y, z, lados = 28) => {
  const g = new THREE.CylinderGeometry(raio, raio, comprimento, lados);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
};

// Painel plano posicionado no espaço: a forma 2D (u, v) é levada para origem + u·U + v·V.
const painel = (forma, origem, eixoU, eixoV, afastamento = 0.004, curvas = 8) => {
  const g = new THREE.ShapeGeometry(forma, curvas).toNonIndexed();
  const u = new THREE.Vector3(...eixoU).normalize();
  const v = new THREE.Vector3(...eixoV).normalize();
  const n = new THREE.Vector3().crossVectors(u, v).normalize();
  const o = new THREE.Vector3(...origem);
  const posicao = g.attributes.position;
  const p = new THREE.Vector3();
  for (let i = 0; i < posicao.count; i++) {
    const a = posicao.getX(i);
    const b = posicao.getY(i);
    p.copy(o).addScaledVector(u, a).addScaledVector(v, b).addScaledVector(n, afastamento);
    posicao.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  return g;
};

class Montagem {
  constructor() {
    this.pecas = new Map();
  }

  add(material, ...geometrias) {
    if (!this.pecas.has(material)) this.pecas.set(material, []);
    for (const g of geometrias) this.pecas.get(material).push(normalizar(g));
    return this;
  }

  par(material, ...geometrias) {
    for (const g of geometrias) {
      const base = normalizar(g);
      this.add(material, base, espelharZ(base));
    }
    return this;
  }

  grupo(materiais, nome) {
    const grupo = new THREE.Group();
    grupo.name = nome;
    for (const [chave, lista] of this.pecas) {
      const malha = new THREE.Mesh(mergeVertices(mergeGeometries(lista, false), 1e-4), materiais[chave]);
      malha.name = chave;
      grupo.add(malha);
    }
    return grupo;
  }
}

/* ------------------------------------------------------------------ */
/* Materiais                                                           */
/* ------------------------------------------------------------------ */

const criarMateriais = ficha => ({
  pintura: new THREE.MeshPhysicalMaterial({
    name: 'pintura',
    color: ficha.pintura,
    metalness: 0.18,
    roughness: 0.38,
    clearcoat: 1,
    clearcoatRoughness: 0.07
  }),
  vidro: new THREE.MeshPhysicalMaterial({
    name: 'vidro',
    color: '#0a1220',
    metalness: 0.55,
    roughness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    side: THREE.DoubleSide
  }),
  // Baú de fibra branco: um pouco menos brilhante que a pintura do carro.
  bau: new THREE.MeshPhysicalMaterial({
    name: 'bau',
    color: '#f5f6f3',
    metalness: 0.04,
    roughness: 0.46,
    clearcoat: 0.35,
    clearcoatRoughness: 0.2
  }),
  plastico: new THREE.MeshStandardMaterial({ name: 'plastico', color: '#1a1c20', metalness: 0.05, roughness: 0.72 }),
  borracha: new THREE.MeshStandardMaterial({ name: 'borracha', color: '#0d0d0f', metalness: 0, roughness: 0.9 }),
  cromado: new THREE.MeshStandardMaterial({ name: 'cromado', color: '#d5d9e0', metalness: 1, roughness: 0.18 }),
  aco: new THREE.MeshStandardMaterial({ name: 'aco', color: '#b9bec7', metalness: 0.85, roughness: 0.34 }),
  forro: new THREE.MeshStandardMaterial({ name: 'forro', color: '#111214', metalness: 0, roughness: 0.94 }),
  assoalho: new THREE.MeshStandardMaterial({ name: 'assoalho', color: '#08090a', metalness: 0.1, roughness: 0.85 }),
  farol: new THREE.MeshStandardMaterial({
    name: 'farol',
    color: '#f4f8ff',
    emissive: '#cfe3ff',
    emissiveIntensity: 1.1,
    metalness: 0.2,
    roughness: 0.12
  }),
  lanterna: new THREE.MeshStandardMaterial({
    name: 'lanterna',
    color: '#c1121f',
    emissive: '#ff2135',
    emissiveIntensity: 0.9,
    metalness: 0.1,
    roughness: 0.22
  }),
  pisca: new THREE.MeshStandardMaterial({
    name: 'pisca',
    color: '#ffa41c',
    emissive: '#ff9500',
    emissiveIntensity: 0.9,
    metalness: 0.1,
    roughness: 0.25
  }),
  placa: new THREE.MeshStandardMaterial({ name: 'placa', color: '#f5f6f7', metalness: 0, roughness: 0.5 }),
  placaFaixa: new THREE.MeshStandardMaterial({ name: 'placaFaixa', color: '#1d4ed8', metalness: 0, roughness: 0.5 })
});

/* ------------------------------------------------------------------ */
/* Rodas                                                               */
/* ------------------------------------------------------------------ */

// Roda construída com o eixo em Y e a face externa virada para +Y.
const construirRoda = roda => {
  const partes = { borracha: [], aco: [], cromado: [], plastico: [] };
  const R = roda.raio;
  const L = roda.largura;
  const A = roda.aro;

  // Pneu: perfil com ombros arredondados, girado em torno do eixo.
  const perfil = [
    [A - 0.004, -L / 2 + 0.035],
    [A + 0.03, -L / 2 + 0.008],
    [R - 0.07, -L / 2],
    [R - 0.028, -L / 2 + 0.012],
    [R - 0.006, -L / 2 + 0.04],
    [R, -L / 2 + 0.075],
    [R, L / 2 - 0.075],
    [R - 0.006, L / 2 - 0.04],
    [R - 0.028, L / 2 - 0.012],
    [R - 0.07, L / 2],
    [A + 0.03, L / 2 - 0.008],
    [A - 0.004, L / 2 - 0.035]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  partes.borracha.push(new THREE.LatheGeometry(perfil, 36));

  // Sulcos da banda de rodagem.
  for (const y of [-L * 0.2, 0, L * 0.2]) {
    const sulco = new THREE.CylinderGeometry(R + 0.0015, R + 0.0015, 0.012, 36, 1, true);
    sulco.translate(0, y, 0);
    partes.assoalhoSulco = partes.assoalhoSulco || [];
    partes.assoalhoSulco.push(sulco);
  }

  const face = L / 2 - 0.045; // plano da face externa do aro
  const materialDisco = roda.estilo === 'calota' ? 'cromado' : 'aco';

  // Tambor / fundo do aro.
  const tambor = [
    [0.001, -L / 2 + 0.05],
    [A, -L / 2 + 0.05],
    [A, face + 0.03],
    [A - 0.012, face + 0.034],
    [A - 0.03, face + 0.012],
    [A * 0.62, face - 0.012],
    [A * 0.34, face + 0.012],
    [0.001, face + 0.016]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  partes[materialDisco].push(new THREE.LatheGeometry(tambor, 32));

  if (roda.estilo === 'calota') {
    // Calota: raios em relevo e miolo.
    const raios = 7;
    for (let i = 0; i < raios; i++) {
      const angulo = (i / raios) * Math.PI * 2;
      const janela = new THREE.CylinderGeometry(A * 0.15, A * 0.105, 0.006, 16);
      janela.scale(1, 1, 1.9);
      janela.translate(0, face + 0.004, A * 0.62);
      janela.rotateY(angulo);
      partes.plastico.push(janela);
    }
    const miolo = new THREE.CylinderGeometry(A * 0.2, A * 0.23, 0.02, 24);
    miolo.translate(0, face + 0.02, 0);
    partes.cromado.push(miolo);
    const emblema = new THREE.CylinderGeometry(A * 0.11, A * 0.11, 0.006, 20);
    emblema.translate(0, face + 0.032, 0);
    partes.plastico.push(emblema);
  } else {
    // Roda de aço: furos de ventilação, porcas e tampa central.
    const furos = 8;
    for (let i = 0; i < furos; i++) {
      const angulo = (i / furos) * Math.PI * 2;
      const furo = new THREE.CylinderGeometry(A * 0.1, A * 0.1, 0.006, 14);
      furo.scale(1, 1, 1.5);
      furo.translate(0, face - 0.004, A * 0.66);
      furo.rotateY(angulo);
      partes.plastico.push(furo);
    }
    for (let i = 0; i < 6; i++) {
      const angulo = (i / 6) * Math.PI * 2 + 0.3;
      const porca = new THREE.CylinderGeometry(0.013, 0.013, 0.02, 6);
      porca.translate(0, face + 0.022, A * 0.3);
      porca.rotateY(angulo);
      partes.cromado.push(porca);
    }
    const tampa = new THREE.CylinderGeometry(A * 0.2, A * 0.22, 0.03, 20);
    tampa.translate(0, face + 0.026, 0);
    partes.cromado.push(tampa);
  }
  return partes;
};

const instalarRodas = (montagem, ficha) => {
  const roda = construirRoda(ficha.roda);
  const zCentro = ficha.largura / 2 - ficha.roda.largura / 2 - 0.012;
  const destinos = {
    borracha: 'borracha',
    aco: 'aco',
    cromado: 'cromado',
    plastico: 'plastico',
    assoalhoSulco: 'assoalho'
  };
  for (const x of [ficha.eixoF, ficha.eixoT]) {
    for (const lado of [1, -1]) {
      for (const [chave, lista] of Object.entries(roda)) {
        for (const peca of lista) {
          const g = peca.clone();
          g.rotateX((lado * Math.PI) / 2);
          g.translate(x, ficha.roda.raio, lado * zCentro);
          montagem.add(destinos[chave], g);
        }
      }
    }
  }
};

/* ------------------------------------------------------------------ */
/* Picape                                                              */
/* ------------------------------------------------------------------ */

const construirPicape = ficha => {
  const m = new Montagem();
  const f = ficha;
  const hw = f.largura / 2;
  const yc = f.roda.raio;
  const Rarco = f.roda.raio + f.folgaArco;
  const dy = f.soleira - yc;
  const meiaCorda = Math.sqrt(Rarco * Rarco - dy * dy);
  const phi = Math.asin(dy / Rarco);
  const arcoRoda = cx => arco(cx, yc, Rarco, Math.PI - phi, phi, 20).slice(1, -1);

  // Forma da frente: capô abaulado, ombros dos para-lamas arredondados e "nariz" mais estreito
  // visto de cima. A mesma função molda a carroceria e tudo o que vai preso nela.
  const narizInicio = f.eixoF - 0.1;
  const moldarFrente = v => {
    const noCapo = suave(f.capoFrente - 0.16, f.capoFrente - 0.02, v.y) * suave(f.cowl.x - 0.05, f.cowl.x + 0.15, v.x);
    v.y += 0.04 * noCapo * (1 - Math.pow(limitar(v.z / hw, -1, 1), 2));
    const ombro = suave(f.capoFrente - 0.3, f.capoFrente + 0.05, v.y) * suave(f.cowl.x - 0.3, f.cowl.x + 0.2, v.x);
    v.z *= 1 - 0.035 * ombro;
    if (v.x > narizInicio) {
      const u = (v.x - narizInicio) / (f.frente - narizInicio);
      v.z *= 1 - 0.15 * Math.pow(u, 2.3);
    }
    return v;
  };
  const naFrente = geometria => deformar(geometria, moldarFrente);

  // Contorno da frente (de baixo para cima). `narizSuave` deixa o bico mais inclinado.
  const k = f.narizSuave ?? 1;
  const contornoFrente = [
    [f.frente - 0.02, f.parachoqueBase + 0.06],
    [f.frente, f.parachoqueBase + 0.2],
    [f.frente - 0.008 * k, f.capoFrente - 0.27],
    [f.frente - 0.03 * k, f.capoFrente - 0.09],
    [f.frente - 0.075 * k, f.capoFrente - 0.02]
  ];
  const xFrenteEm = y => {
    for (let i = 0; i < contornoFrente.length - 1; i++) {
      const [x0, y0] = contornoFrente[i];
      const [x1, y1] = contornoFrente[i + 1];
      if (y <= y1) return x0 + (x1 - x0) * limitar((y - y0) / (y1 - y0), 0, 1);
    }
    return contornoFrente[contornoFrente.length - 1][0];
  };
  // Peças da fachada são desenhadas como se a frente fosse um plano em x = frente
  // e depois acompanham o contorno real.
  const naFachada = geometria =>
    deformar(geometria, v => {
      v.x += xFrenteEm(v.y) - f.frente;
      moldarFrente(v);
    });

  /* --- frente + parte baixa da cabine --------------------------------- */
  const perfilFrente = subdividir(
    [
      [f.cabineTras, f.soleira],
      [f.eixoF - meiaCorda, f.soleira],
      ...arcoRoda(f.eixoF),
      [f.eixoF + meiaCorda, f.soleira],
      [f.frente - 0.1, f.parachoqueBase],
      ...contornoFrente,
      [f.frente - 0.16 * k, f.capoFrente + 0.012 * k],
      [(f.frente + f.cowl.x) / 2, (f.capoFrente + f.cowl.y) / 2 + 0.03],
      [f.cowl.x + 0.1, f.cowl.y - 0.005],
      [f.cowl.x, f.cowl.y],
      [f.cabineTras, f.cinturaTras]
    ],
    0.13
  );
  m.add(
    'pintura',
    deformar(extrudar(formaDe(perfilFrente), f.largura, { chanfro: 0.035, passos: 8 }), moldarFrente, { malha: 0.17 })
  );

  /* --- cabine (estufa) -------------------------------------------------- */
  const yBase = f.cowl.y;
  const alturaEstufa = f.teto - yBase;
  const zBase = hw - 0.04;
  const zEm = y => zBase * (1 - f.afunilamento * limitar((y - yBase) / alturaEstufa, 0, 1));
  const topoParabrisa = [f.tetoFrenteX + 0.05, f.teto - 0.045];
  const topoTraseiro = [f.tetoTrasX - 0.025, f.teto - 0.05];
  const perfilEstufa = subdividir(
    [
      [f.cabineTras, f.cinturaTras],
      [f.cowl.x, f.cowl.y],
      topoParabrisa,
      [f.tetoFrenteX - 0.05, f.teto - 0.012],
      [(f.tetoFrenteX + f.tetoTrasX) / 2, f.teto],
      [f.tetoTrasX + 0.04, f.teto - 0.012],
      topoTraseiro
    ],
    0.12
  );
  m.add(
    'pintura',
    deformar(extrudar(formaDe(perfilEstufa), zBase * 2, { chanfro: 0.03, passos: 8 }), v => {
      const t = limitar((v.y - yBase) / alturaEstufa, 0, 1);
      v.y += 0.03 * suave(0.86, 1, t) * (1 - Math.pow(limitar(v.z / zBase, -1, 1), 2));
      v.z *= 1 - f.afunilamento * t;
    })
  );

  // Vidros laterais: plano inclinado que acompanha o afunilamento da cabine.
  const inclinacao = Math.hypot(alturaEstufa, zBase * f.afunilamento) / alturaEstufa;
  const eixoVLateral = [0, alturaEstufa, -zBase * f.afunilamento];
  const naLateral = ([x, y]) => [x, (y - yBase) * inclinacao];
  const rampa = (topoParabrisa[0] - f.cowl.x) / (topoParabrisa[1] - f.cowl.y);
  const baseVidro = Math.max(f.cowl.y, f.cinturaTras) + 0.05;
  const topoVidro = f.teto - 0.11;
  const frenteVidro = y => f.cowl.x + rampa * (y - f.cowl.y) - 0.1;
  const trasVidro = f.cabineTras + 0.17;
  const vidroLateral = formaArredondada(
    [
      [trasVidro, baseVidro],
      [frenteVidro(baseVidro) - 0.02, baseVidro],
      [frenteVidro(topoVidro), topoVidro],
      [trasVidro + 0.03, topoVidro]
    ].map(naLateral),
    0.045
  );
  m.par('vidro', painel(vidroLateral, [0, yBase, zBase], [1, 0, 0], eixoVLateral, 0.006, 6));

  // Para-brisa.
  const compParabrisa = Math.hypot(topoParabrisa[0] - f.cowl.x, topoParabrisa[1] - f.cowl.y);
  const eixoVParabrisa = [topoParabrisa[0] - f.cowl.x, topoParabrisa[1] - f.cowl.y, 0];
  const zCowl = zEm(f.cowl.y) - 0.075;
  const zTopo = zEm(topoParabrisa[1]) - 0.07;
  const parabrisa = formaArredondada(
    [
      [-zCowl, 0.055],
      [zCowl, 0.055],
      [zTopo, compParabrisa - 0.03],
      [-zTopo, compParabrisa - 0.03]
    ],
    0.05
  );
  m.add('vidro', painel(parabrisa, [f.cowl.x, f.cowl.y, 0], [0, 0, -1], eixoVParabrisa, 0.006, 6));

  // Limpadores do para-brisa.
  for (const deslocamento of [0.06, -0.52]) {
    const haste = formaDe([
      [deslocamento, 0.07],
      [deslocamento + 0.5, 0.15],
      [deslocamento + 0.5, 0.168],
      [deslocamento, 0.088]
    ]);
    m.add('borracha', painel(haste, [f.cowl.x, f.cowl.y, 0], [0, 0, -1], eixoVParabrisa, 0.014, 2));
  }

  // Vidro traseiro.
  const compTraseiro = Math.hypot(topoTraseiro[0] - f.cabineTras, topoTraseiro[1] - f.cinturaTras);
  const eixoVTraseiro = [topoTraseiro[0] - f.cabineTras, topoTraseiro[1] - f.cinturaTras, 0];
  const zTrasBase = zEm(f.cinturaTras) - 0.11;
  const zTrasTopo = zEm(topoTraseiro[1]) - 0.09;
  const vidroTraseiro = formaArredondada(
    [
      [-zTrasBase, 0.07],
      [zTrasBase, 0.07],
      [zTrasTopo, compTraseiro - 0.06],
      [-zTrasTopo, compTraseiro - 0.06]
    ],
    0.045
  );
  m.add('vidro', painel(vidroTraseiro, [f.cabineTras, f.cinturaTras, 0], [0, 0, 1], eixoVTraseiro, 0.006, 6));

  if (f.gradeTraseira) {
    // Grade de proteção do vidro traseiro.
    for (let i = 0; i < 4; i++) {
      const v0 = 0.12 + (i * (compTraseiro - 0.26)) / 3;
      const barra = formaDe([
        [-zTrasTopo + 0.02, v0],
        [zTrasTopo - 0.02, v0],
        [zTrasTopo - 0.02, v0 + 0.016],
        [-zTrasTopo + 0.02, v0 + 0.016]
      ]);
      m.add('plastico', painel(barra, [f.cabineTras, f.cinturaTras, 0], [0, 0, 1], eixoVTraseiro, 0.03, 2));
    }
  }

  // Retrovisores.
  const xEspelho = f.cowl.x - 0.1;
  const yEspelho = Math.max(f.cowl.y, f.cinturaTras) + 0.1;
  m.par(
    'plastico',
    caixa(0.07, 0.13, 0.19, xEspelho, yEspelho, hw + 0.075, 0.025),
    caixa(0.045, 0.035, 0.1, xEspelho + 0.01, yEspelho - 0.05, hw - 0.005)
  );

  // Frisos das portas e maçanetas.
  const xPortaFrente = f.cowl.x - 0.32;
  const xPortaTras = f.cabineTras + 0.2;
  const alturaPorta = f.cinturaTras - f.soleira - 0.07;
  const yPorta = f.soleira + 0.06 + alturaPorta / 2;
  m.par(
    'assoalho',
    caixa(0.012, alturaPorta, 0.006, xPortaFrente, yPorta, hw),
    caixa(0.012, alturaPorta, 0.006, xPortaTras, yPorta, hw),
    caixa(xPortaFrente - xPortaTras, 0.012, 0.006, (xPortaFrente + xPortaTras) / 2, f.soleira + 0.065, hw)
  );
  m.par('plastico', caixa(0.15, 0.032, 0.02, xPortaTras + 0.16, f.cinturaTras - 0.1, hw + 0.006, 0.012));
  // Pisca lateral no para-lama.
  m.par('pisca', naFrente(caixa(0.09, 0.03, 0.012, f.eixoF + 0.02, yc + Rarco + 0.1, hw + 0.002)));

  /* --- frente: grade, faróis, para-choque, placa ------------------------- */
  const yFarol = f.capoFrente - 0.125;
  const altFarol = 0.125;
  // Carcaça escura do farol, com filete de LED e projetor acesos.
  m.par('vidro', naFachada(caixa(0.2, altFarol, 0.38, f.frente - 0.088, yFarol, hw - 0.186, 0.03)));
  m.par(
    'farol',
    naFachada(caixa(0.2, 0.024, 0.384, f.frente - 0.083, yFarol + altFarol / 2 - 0.026, hw - 0.186, 0.008))
  );
  m.par('farol', naFachada(caixa(0.2, 0.05, 0.1, f.frente - 0.083, yFarol - 0.02, hw - 0.25, 0.02)));
  m.par('pisca', naFachada(caixa(0.2, 0.03, 0.12, f.frente - 0.083, yFarol - 0.03, hw - 0.075, 0.01)));

  const yGrade = f.capoFrente - 0.17;
  const larguraGrade = hw * 2 - 0.86;
  m.add('plastico', naFachada(caixa(0.06, 0.25, larguraGrade, f.frente - 0.012, yGrade, 0, 0.02)));
  for (let i = 0; i < 3; i++) {
    m.add(
      'cromado',
      naFachada(caixa(0.02, 0.022, larguraGrade - 0.06, f.frente + 0.022, yGrade + 0.075 - i * 0.075, 0))
    );
  }
  const emblema = new THREE.CylinderGeometry(0.058, 0.058, 0.018, 24);
  emblema.rotateZ(Math.PI / 2);
  emblema.translate(f.frente + 0.034, yGrade, 0);
  m.add('cromado', naFachada(emblema));

  const yParachoque = f.parachoqueBase + 0.14;
  const materialParachoque = f.parachoqueDianteiro === 'preto' ? 'plastico' : 'pintura';
  m.add(materialParachoque, naFachada(caixa(0.16, 0.2, hw * 2 + 0.02, f.frente - 0.06, yParachoque, 0, 0.04)));
  m.add('plastico', naFachada(caixa(0.06, 0.1, hw * 2 - 0.85, f.frente, yParachoque - 0.02, 0, 0.02)));
  // Faróis de neblina.
  m.par('farol', naFachada(caixa(0.05, 0.05, 0.1, f.frente + 0.001, yParachoque, hw - 0.2, 0.02)));
  // Placa dianteira (padrão Mercosul: faixa azul em cima).
  m.add('placa', naFachada(caixa(0.012, 0.11, 0.38, f.frente + 0.036, yParachoque - 0.02, 0)));
  m.add('placaFaixa', naFachada(caixa(0.014, 0.026, 0.38, f.frente + 0.037, yParachoque + 0.022, 0)));
  // Protetor inferior.
  m.add('aco', caixa(0.2, 0.03, hw * 2 - 0.9, f.frente - 0.14, f.parachoqueBase, 0, 0.01));

  /* --- caçamba ------------------------------------------------------------ */
  const c = f.cacamba;
  const espessura = 0.06;
  const perfilCacamba = [
    [c.tras, f.soleira + 0.03],
    [f.eixoT - meiaCorda, f.soleira],
    ...arcoRoda(f.eixoT),
    [f.eixoT + meiaCorda, f.soleira],
    [c.frente, f.soleira],
    [c.frente, c.borda],
    [c.tras, c.borda]
  ];
  const lateralCacamba = extrudar(formaDe(perfilCacamba), espessura, { chanfro: 0.02 });
  lateralCacamba.translate(0, 0, hw - espessura / 2);
  m.par('pintura', lateralCacamba);

  const zInterno = hw - espessura;
  const comprimentoCacamba = c.frente - c.tras;
  const xMeioCacamba = (c.frente + c.tras) / 2;
  const alturaParede = c.borda - c.piso;
  // Painel dianteiro, tampa traseira e assoalho.
  m.add(
    'pintura',
    caixa(0.05, alturaParede + 0.02, zInterno * 2, c.frente - 0.027, c.piso + alturaParede / 2 - 0.01, 0)
  );
  m.add(
    'pintura',
    caixa(0.055, alturaParede, zInterno * 2 - 0.012, c.tras + 0.03, c.piso + alturaParede / 2, 0, 0.012)
  );
  m.add('forro', caixa(comprimentoCacamba - 0.06, 0.05, zInterno * 2, xMeioCacamba, c.piso - 0.025, 0));
  // Forro interno (protetor de caçamba).
  m.par(
    'forro',
    caixa(
      comprimentoCacamba - 0.12,
      alturaParede - 0.02,
      0.012,
      xMeioCacamba,
      c.piso + alturaParede / 2 - 0.01,
      zInterno - 0.006
    )
  );
  m.add(
    'forro',
    caixa(0.012, alturaParede - 0.02, zInterno * 2 - 0.02, c.frente - 0.058, c.piso + alturaParede / 2 - 0.01, 0)
  );
  m.add(
    'forro',
    caixa(0.012, alturaParede - 0.03, zInterno * 2 - 0.03, c.tras + 0.063, c.piso + alturaParede / 2 - 0.015, 0)
  );
  // Caixas de roda dentro da caçamba.
  const topoCaixaRoda = Math.min(yc + Rarco + 0.04, c.borda - 0.12);
  if (topoCaixaRoda > c.piso + 0.02) {
    m.par(
      'forro',
      caixa(Rarco * 2 + 0.1, topoCaixaRoda - c.piso, 0.24, f.eixoT, (topoCaixaRoda + c.piso) / 2, zInterno - 0.12, 0.03)
    );
  }
  // Capa das bordas.
  m.par(
    'plastico',
    caixa(comprimentoCacamba - 0.02, 0.018, espessura + 0.012, xMeioCacamba, c.borda + 0.006, hw - espessura / 2, 0.006)
  );
  m.add('plastico', caixa(0.062, 0.018, zInterno * 2 - 0.02, c.tras + 0.03, c.borda + 0.004, 0, 0.006));
  // Puxador e friso da tampa.
  m.add('plastico', caixa(0.012, 0.045, 0.2, c.tras - 0.002, c.borda - 0.12, 0, 0.006));
  m.add('assoalho', caixa(0.008, 0.012, zInterno * 2 - 0.3, c.tras + 0.001, c.piso + alturaParede * 0.38, 0));

  // Lanternas traseiras (verticais, abraçando o canto).
  const altLanterna = Math.min(0.34, alturaParede * 0.72);
  m.par(
    'lanterna',
    caixa(0.056, altLanterna, 0.115, c.tras + 0.023, c.borda - 0.04 - altLanterna / 2, hw - 0.053, 0.014)
  );
  m.par('pisca', caixa(0.057, 0.05, 0.116, c.tras + 0.023, c.borda - 0.04 - altLanterna - 0.032, hw - 0.053, 0.012));

  // Para-choque traseiro, placa e degrau.
  const yTraseiro = f.soleira + 0.11;
  const materialTraseiro = f.parachoqueTraseiro === 'cromado' ? 'cromado' : 'plastico';
  m.add(materialTraseiro, caixa(0.14, 0.15, hw * 2 - 0.02, f.traseira + 0.07, yTraseiro, 0, 0.035));
  m.add('plastico', caixa(0.1, 0.02, hw * 2 - 0.5, f.traseira + 0.075, yTraseiro + 0.08, 0, 0.006));
  m.add('placa', caixa(0.012, 0.11, 0.38, f.traseira - 0.004, yTraseiro, 0));
  m.add('placaFaixa', caixa(0.014, 0.026, 0.38, f.traseira - 0.005, yTraseiro + 0.042, 0));

  /* --- baú fechado sobre a caçamba ----------------------------------------- */
  if (f.bau) {
    const base = c.borda + 0.012; // apoiado nas bordas da caçamba
    const topo = f.teto + f.bau.sobreTeto;
    const xFrente = c.frente - 0.015; // logo atrás da cabine
    const xTras = c.tras - 0.01; // alinhado com a tampa traseira
    const comprimento = xFrente - xTras;
    const altura = topo - base;
    const xMeio = (xFrente + xTras) / 2;
    const yMeio = (base + topo) / 2;
    const zBau = hw - 0.004; // metade da largura do baú

    // Caixa (fibra branca) com cantos arredondados.
    m.add('bau', caixa(comprimento, altura, zBau * 2, xMeio, yMeio, 0, 0.05));
    // Vedação escura entre o baú e as bordas da caçamba.
    m.add('plastico', caixa(comprimento - 0.02, 0.022, zBau * 2 + 0.006, xMeio, base + 0.004, 0, 0.006));
    // Cantoneiras de alumínio: arestas de cima e colunas dos quatro cantos.
    m.par('aco', caixa(comprimento - 0.04, 0.028, 0.028, xMeio, topo - 0.026, zBau - 0.01, 0.008));
    for (const x of [xFrente - 0.018, xTras + 0.018]) {
      m.par('aco', caixa(0.03, altura - 0.03, 0.03, x, yMeio, zBau - 0.012, 0.008));
    }
    // Frisos laterais (reforço horizontal) a meia altura.
    m.par('aco', caixa(comprimento - 0.1, 0.018, 0.012, xMeio, base + altura * 0.42, zBau + 0.002, 0.004));

    // Traseira: porta dupla com moldura, barras de trava, puxadores e dobradiças.
    const xPorta = xTras - 0.004;
    m.add('aco', caixa(0.03, 0.04, zBau * 2 - 0.02, xTras + 0.01, topo - 0.035, 0, 0.008));
    m.add('aco', caixa(0.034, 0.05, zBau * 2 - 0.02, xTras + 0.012, base + 0.04, 0, 0.008));
    m.add('plastico', caixa(0.008, altura - 0.16, 0.012, xPorta - 0.002, yMeio, 0)); // divisão das folhas
    for (const z of [0.2, -0.2]) {
      m.add('cromado', caixa(0.022, altura - 0.2, 0.022, xPorta - 0.012, yMeio, z, 0.008));
      m.add('cromado', caixa(0.05, 0.03, 0.12, xPorta - 0.03, base + altura * 0.45, z - Math.sign(z) * 0.05, 0.01));
    }
    for (const fracao of [0.2, 0.5, 0.8]) {
      m.par('aco', caixa(0.03, 0.06, 0.07, xPorta - 0.01, base + altura * fracao, zBau - 0.07, 0.008));
    }
    // Luzes delimitadoras nos cantos de cima e brake light central.
    m.par('lanterna', caixa(0.02, 0.04, 0.09, xPorta - 0.006, topo - 0.09, zBau - 0.11, 0.008));
    m.add('lanterna', caixa(0.02, 0.03, 0.34, xPorta - 0.006, topo - 0.1, 0, 0.008));
    m.par('pisca', caixa(0.02, 0.04, 0.09, xFrente + 0.006, topo - 0.09, zBau - 0.11, 0.008));
  }

  /* --- paralamas, soleira, para-barros ------------------------------------- */
  const aroArco = cx => {
    const forma = new THREE.Shape();
    const a0 = phi + 0.04;
    const a1 = Math.PI - phi - 0.04;
    const externo = Rarco + (f.paralamas ? 0.055 : 0.022);
    const interno = Rarco - 0.006;
    forma.absarc(cx, yc, externo, a0, a1, false);
    forma.absarc(cx, yc, interno, a1, a0, true);
    forma.closePath();
    const profundidade = f.paralamas ? 0.05 : 0.022;
    const g = extrudar(forma, profundidade, { chanfro: 0.008, segmentos: 2, curvas: 22 });
    g.translate(0, 0, hw - profundidade / 2 + (f.paralamas ? 0.028 : 0.01));
    return g;
  };
  m.par('plastico', naFrente(aroArco(f.eixoF)), aroArco(f.eixoT));

  // Soleira escura entre as rodas.
  const xSoleiraFrente = f.eixoF - meiaCorda - 0.02;
  const xSoleiraTras = f.eixoT + meiaCorda + 0.02;
  m.par(
    'plastico',
    caixa(
      xSoleiraFrente - xSoleiraTras,
      0.07,
      0.03,
      (xSoleiraFrente + xSoleiraTras) / 2,
      f.soleira + 0.012,
      hw - 0.006,
      0.012
    )
  );
  // Para-barros atrás das rodas.
  const altBarro = Math.max(0.12, f.soleira - 0.14);
  for (const x of [f.eixoF - meiaCorda - 0.03, f.eixoT - meiaCorda - 0.03]) {
    m.par(
      'borracha',
      caixa(0.02, altBarro, f.roda.largura + 0.03, x, f.soleira - altBarro / 2 + 0.02, hw - f.roda.largura / 2 - 0.02)
    );
  }

  /* --- assoalho, caixas de roda internas, chassi ----------------------------- */
  const zChassi = hw - f.roda.largura - 0.07;
  m.add(
    'assoalho',
    caixa(f.frente - f.traseira - 0.5, 0.16, zChassi * 2, (f.frente + f.traseira) / 2 + 0.05, f.soleira - 0.06, 0)
  );
  m.add(
    'assoalho',
    caixa(Rarco * 2 + 0.06, yc + Rarco - f.soleira + 0.06, zChassi * 2, f.eixoF, (yc + Rarco + f.soleira) / 2 - 0.05, 0)
  );
  const topoInternoTras = Math.min(yc + Rarco, c.piso - 0.02);
  m.add(
    'assoalho',
    caixa(
      Rarco * 2 + 0.06,
      topoInternoTras - f.soleira + 0.14,
      zChassi * 2,
      f.eixoT,
      (topoInternoTras + f.soleira) / 2 - 0.07,
      0
    )
  );
  // Fechamento entre o assoalho da caçamba e o chassi.
  m.add(
    'assoalho',
    caixa(
      comprimentoCacamba - 0.1,
      Math.max(0.02, c.piso - 0.05 - f.soleira),
      zChassi * 2,
      xMeioCacamba,
      (c.piso - 0.05 + f.soleira) / 2,
      0
    )
  );
  // Eixos.
  m.add('assoalho', cilindroZ(0.045, hw * 2 - f.roda.largura - 0.02, f.eixoF, yc, 0, 10));
  m.add('assoalho', cilindroZ(0.06, hw * 2 - f.roda.largura - 0.02, f.eixoT, yc, 0, 10));

  if (f.estepeSobCacamba) {
    // Estepe preso sob a caçamba, como na picape de verdade.
    const xEstepe = (f.eixoT + c.tras) / 2 - 0.08;
    const pneu = new THREE.TorusGeometry(f.roda.raio - 0.11, 0.11, 10, 26);
    pneu.rotateX(Math.PI / 2);
    pneu.translate(xEstepe, f.soleira - 0.03, 0);
    m.add('borracha', pneu);
    const centro = new THREE.CylinderGeometry(f.roda.aro * 0.9, f.roda.aro * 0.9, 0.08, 18);
    centro.translate(xEstepe, f.soleira - 0.03, 0);
    m.add('aco', centro);
  }

  if (f.antena) {
    const antena = new THREE.CylinderGeometry(0.004, 0.006, 0.24, 6);
    antena.rotateZ(-0.6);
    antena.translate(f.tetoTrasX + 0.14, f.teto + 0.1, 0);
    m.add('assoalho', antena);
  }

  instalarRodas(m, f);
  return m;
};

/* ------------------------------------------------------------------ */
/* Exportação                                                          */
/* ------------------------------------------------------------------ */

const exportar = cena =>
  new Promise((resolver, rejeitar) => {
    new GLTFExporter().parse(cena, resolver, rejeitar, { binary: true });
  });

// Compacta a malha (reordena, quantiza e aplica EXT_meshopt_compression).
const compactar = async glb => {
  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const documento = await io.readBinary(new Uint8Array(glb));
  documento.getLogger().debug = () => {};
  await documento.transform(
    reorder({ encoder: MeshoptEncoder, level: 'medium' }),
    quantize({ quantizePosition: 14, quantizeNormal: 12 })
  );
  documento
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  return io.writeBinary(documento);
};

const gerar = async ficha => {
  const materiais = criarMateriais(ficha);
  const grupo = construirPicape(ficha).grupo(materiais, ficha.nome);
  const cena = new THREE.Scene();
  cena.add(grupo);
  const bruto = await exportar(cena);
  const glb = await compactar(bruto);
  mkdirSync(SAIDA, { recursive: true });
  const destino = join(SAIDA, ficha.arquivo);
  writeFileSync(destino, Buffer.from(glb));
  let triangulos = 0;
  let vertices = 0;
  grupo.traverse(objeto => {
    if (!objeto.isMesh) return;
    triangulos += objeto.geometry.index.count / 3;
    vertices += objeto.geometry.attributes.position.count;
  });
  console.log(
    `[modelos] ${ficha.nome} -> public/models/${ficha.arquivo} ` +
      `(${Math.round(glb.byteLength / 1024)} KB; antes de compactar ${Math.round(bruto.byteLength / 1024)} KB; ` +
      `${triangulos} triângulos, ${vertices} vértices)`
  );
};

for (const ficha of [HILUX, SAVEIRO]) await gerar(ficha);
