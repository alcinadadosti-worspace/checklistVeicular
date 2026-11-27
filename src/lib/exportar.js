// Exporta os checklists para planilha (CSV com ponto e vírgula, que o Excel em português
// abre direto).

import { ITENS, situacaoPorId, unidadePorId } from '../config/frota.js';
import { data, hora } from './formato.js';
import { emRota, kmRodados } from './registros.js';

const celula = valor => {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  // Evita que o Excel interprete textos começados por = + - @ como fórmulas.
  const seguro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
  return /[";\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
};

export function gerarCsv(registros) {
  const cabecalho = [
    'Data',
    'Hora',
    'Unidade',
    'Veículo',
    'Motorista',
    'KM saída',
    'KM volta',
    'KM rodados',
    'Data do retorno',
    'Hora do retorno',
    'Situação',
    ...ITENS.map(item => item.nome),
    'Outros',
    'Fotos'
  ];
  const linhas = registros.map(registro => [
    data(registro.preenchidoEm),
    hora(registro.preenchidoEm),
    unidadePorId(registro.unidade)?.nome || registro.unidadeNome || registro.unidade,
    registro.veiculo,
    registro.motoristaNome,
    registro.kmSaida,
    registro.kmVolta ?? '',
    kmRodados(registro) ?? '',
    registro.retornoEm ? data(registro.retornoEm) : '',
    registro.retornoEm ? hora(registro.retornoEm) : '',
    emRota(registro) ? 'Em rota' : 'Concluído',
    ...ITENS.map(item => situacaoPorId(registro.itens?.[item.id])?.nome || ''),
    registro.outros || '',
    registro.fotos?.length || ''
  ]);
  return [cabecalho, ...linhas].map(linha => linha.map(celula).join(';')).join('\r\n');
}

export function baixarCsv(registros, nome = 'checklists') {
  const conteudo = `﻿${gerarCsv(registros)}`; // BOM: o Excel reconhece os acentos
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  const carimbo = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `${nome}-${carimbo}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
