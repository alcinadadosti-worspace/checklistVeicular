// Formatação de datas, quilometragem e textos (sempre em português do Brasil).

const FUSO = undefined; // usa o fuso do aparelho

const fmtData = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: FUSO });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO });
const fmtHoraSegundos = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: FUSO
});
const fmtDiaSemana = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  timeZone: FUSO
});
const fmtDiaCurto = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: FUSO });
const fmtNumero = new Intl.NumberFormat('pt-BR');

const paraData = valor => (valor instanceof Date ? valor : new Date(valor));
const valida = data => data instanceof Date && !Number.isNaN(data.getTime());

export const data = valor => (valor && valida(paraData(valor)) ? fmtData.format(paraData(valor)) : '—');
export const hora = valor => (valor && valida(paraData(valor)) ? fmtHora.format(paraData(valor)) : '—');
export const horaComSegundos = valor =>
  valor && valida(paraData(valor)) ? fmtHoraSegundos.format(paraData(valor)) : '—';
export const dataHora = valor => (valor && valida(paraData(valor)) ? `${data(valor)} às ${hora(valor)}` : '—');
export const diaCurto = valor => (valor && valida(paraData(valor)) ? fmtDiaCurto.format(paraData(valor)) : '—');
export const diaPorExtenso = valor => {
  if (!valor || !valida(paraData(valor))) return '—';
  const texto = fmtDiaSemana.format(paraData(valor));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

export const numero = valor => (Number.isFinite(valor) ? fmtNumero.format(valor) : '—');
export const km = valor => (Number.isFinite(valor) ? `${fmtNumero.format(valor)} km` : '—');

/** "há 2 h 15 min", "há 3 dias"... */
export const haQuantoTempo = (valor, agora = Date.now()) => {
  if (!valor || !valida(paraData(valor))) return '';
  const minutos = Math.max(0, Math.round((agora - paraData(valor).getTime()) / 60000));
  if (minutos < 1) return 'agora mesmo';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) {
    const resto = minutos % 60;
    return resto ? `há ${horas} h ${resto} min` : `há ${horas} h`;
  }
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
};

/** Duração entre dois instantes: "2 h 15 min". */
export const duracao = (inicio, fim) => {
  if (!inicio || !fim) return '—';
  const minutos = Math.max(0, Math.round((paraData(fim).getTime() - paraData(inicio).getTime()) / 60000));
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
};

export const saudacao = (agora = new Date()) => {
  const h = agora.getHours();
  if (h < 5) return 'Boa madrugada';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
};

/** Só os dígitos de um texto, limitado a `maximo` caracteres. */
export const soDigitos = (texto, maximo = 7) =>
  String(texto ?? '')
    .replace(/\D/g, '')
    .slice(0, maximo);

/** Converte o texto de um campo de KM em número inteiro (ou null se estiver vazio). */
export const paraKm = texto => {
  const digitos = soDigitos(texto);
  return digitos === '' ? null : Number.parseInt(digitos, 10);
};

/** Nome próprio arrumado: sem espaços sobrando e com no máximo 40 caracteres. */
export const limparNome = texto =>
  String(texto ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);

export const semAcento = texto =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
