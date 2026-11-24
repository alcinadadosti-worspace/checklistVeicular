// ---------------------------------------------------------------------------
// Configuração da frota: unidades, veículos, motoristas e itens do checklist.
// É aqui que se muda nome, veículo, motorista padrão ou código de acesso.
// ---------------------------------------------------------------------------
//
// CÓDIGOS DE ACESSO
// Os códigos não ficam escritos aqui, só o "hash" deles. Para trocar um código:
//   npm run codigo -- 12345
// e cole o resultado no `codigoHash` correspondente.
//
// FOTOS DOS CRACHÁS
// Coloque a foto na pasta img/ com o nome da pessoa (ex.: img/Rogerio.png). O campo
// `foto` abaixo é o nome do arquivo em minúsculas e sem acento/extensão ("rogerio").
// `foco` é o ponto da foto que fica no centro do crachá (0 a 1, da esquerda para a
// direita e de cima para baixo) e `zoom` aproxima o rosto.

export const UNIDADES = [
  {
    id: 'penedo',
    nome: 'Penedo',
    sigla: 'PND',
    codigoHash: 'b939803ac582274e35a1900470c87fb2b9a86415fb2b357d7eef101aa72b6266',
    motoristaPadrao: 'rogerio',
    veiculo: {
      nome: 'Toyota Hilux',
      versao: 'Cabine Simples',
      apelido: 'Hilux CS',
      modelo: '/models/hilux.glb'
    }
  },
  {
    id: 'palmeira',
    nome: 'Palmeira dos Índios',
    sigla: 'PDI',
    codigoHash: '07e793a55b0bd9e182775938580cb766d70de55b204342badf2c95e391e9a9cb',
    motoristaPadrao: 'caique',
    veiculo: {
      nome: 'Volkswagen Saveiro',
      versao: '2025',
      apelido: 'Saveiro 2025',
      modelo: '/models/saveiro.glb'
    }
  }
];

export const ADMIN = {
  id: 'admin',
  nome: 'Ludmylla',
  cargo: 'Administração',
  foto: 'ludmylla',
  foco: [0.56, 0.42],
  zoom: 1.12,
  codigoHash: '6087ba69f1003fb0eb081380751aac04f624d2615e3df71071d941cac79ed437'
};

// As três opções do campo "Nome do motorista". "Outro" abre um campo para digitar o nome
// e o crachá aparece com a silhueta.
export const MOTORISTAS = [
  { id: 'rogerio', nome: 'Rogerio', foto: 'rogerio', foco: [0.5, 0.44], zoom: 1 },
  { id: 'caique', nome: 'Caique', foto: 'caique', foco: [0.5, 0.41], zoom: 2.8 },
  { id: 'outro', nome: 'Outro', foto: null }
];

export const ITENS = [
  { id: 'farois', nome: 'Faróis / lâmpadas / piscas', curto: 'Faróis e piscas', icone: 'farol' },
  { id: 'estepe', nome: 'Estepe / chave de roda', curto: 'Estepe e chave', icone: 'estepe' },
  { id: 'limpador', nome: 'Limpador e lavador de para-brisa', curto: 'Limpador', icone: 'limpador' },
  { id: 'pneusDianteiros', nome: 'Pneus dianteiros', curto: 'Pneus diant.', icone: 'pneu' },
  { id: 'pneusTraseiros', nome: 'Pneus traseiros', curto: 'Pneus tras.', icone: 'pneu' },
  { id: 'calotas', nome: 'Calotas / rodas', curto: 'Calotas e rodas', icone: 'roda' },
  { id: 'oleo', nome: 'Óleo do motor / nível', curto: 'Óleo do motor', icone: 'oleo' }
];

export const SITUACOES = [
  { id: 'bom', nome: 'Bom', curto: 'Bom', cor: '#34d399' },
  { id: 'ruim', nome: 'Ruim', curto: 'Ruim', cor: '#fbbf24' },
  { id: 'faltante', nome: 'Faltante / Não funciona', curto: 'Faltante', cor: '#fb7185' }
];

export const unidadePorId = id => UNIDADES.find(unidade => unidade.id === id) || null;
export const motoristaPorId = id => MOTORISTAS.find(motorista => motorista.id === id) || null;
export const itemPorId = id => ITENS.find(item => item.id === id) || null;
export const situacaoPorId = id => SITUACOES.find(situacao => situacao.id === id) || null;
export const nomeDoVeiculo = unidade => `${unidade.veiculo.nome} ${unidade.veiculo.versao}`;
