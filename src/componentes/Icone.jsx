// Ícones do app (traço simples, 24×24). Uso: <Icone nome="farol" />

const DESENHOS = {
  volante: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M3.6 10.8h6.3M14.1 10.8h6.3M12 14.2v6.3" />
    </>
  ),
  farol: (
    <>
      <path d="M11.5 5.2c-4.2 0-6.8 3-6.8 6.8s2.6 6.8 6.8 6.8z" />
      <path d="M14.8 7.6l5-1.4M14.8 12h5.4M14.8 16.4l5 1.4" />
    </>
  ),
  estepe: (
    <>
      <circle cx="9.2" cy="12" r="6.4" />
      <circle cx="9.2" cy="12" r="2.3" />
      <path d="M17 7.2l4.2 9.6M21.2 7.2L17 16.8" />
    </>
  ),
  limpador: (
    <>
      <path d="M3.5 17.5l2.4-8.6A2.2 2.2 0 0 1 8 7.3h8a2.2 2.2 0 0 1 2.1 1.6l2.4 8.6z" />
      <path d="M12 17.5l4.2-6.4" />
      <path d="M8.2 12.6a6.2 6.2 0 0 1 6.9-2" />
    </>
  ),
  pneu: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 3.4v2.2M12 18.4v2.2M3.4 12h2.2M18.4 12h2.2M5.9 5.9l1.6 1.6M16.5 16.5l1.6 1.6M18.1 5.9l-1.6 1.6M7.5 16.5l-1.6 1.6" />
    </>
  ),
  roda: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <circle cx="12" cy="12" r="1.9" />
      <path d="M12 10.1V3.6M13.8 11.4l6.2-2M13.1 13.5l3.8 5.3M10.9 13.5l-3.8 5.3M10.2 11.4L4 9.4" />
    </>
  ),
  oleo: (
    <>
      <path d="M12 3.4c3.3 3.9 5.6 6.8 5.6 9.9a5.6 5.6 0 0 1-11.2 0c0-3.1 2.3-6 5.6-9.9z" />
      <path d="M9.2 14.6h5.6" />
    </>
  ),
  check: <path d="M4.8 12.6l4.4 4.4L19.2 7" />,
  alerta: (
    <>
      <path d="M12 4.2l8.8 15.3H3.2z" />
      <path d="M12 10v4.4M12 17v.2" />
    </>
  ),
  xis: <path d="M6 6l12 12M18 6L6 18" />,
  'seta-esquerda': <path d="M14.8 5.2L8 12l6.8 6.8" />,
  'seta-direita': <path d="M9.2 5.2L16 12l-6.8 6.8" />,
  sair: (
    <>
      <path d="M14.5 4.2h3.3a2 2 0 0 1 2 2v11.6a2 2 0 0 1-2 2h-3.3" />
      <path d="M9.6 15.8L5.8 12l3.8-3.8M5.8 12h9.6" />
    </>
  ),
  nuvem: <path d="M7.2 18.2a4.4 4.4 0 0 1-.7-8.75A5.9 5.9 0 0 1 17.9 8.6a4.8 4.8 0 0 1 .5 9.6z" />,
  'nuvem-ok': (
    <>
      <path d="M7.2 18.2a4.4 4.4 0 0 1-.7-8.75A5.9 5.9 0 0 1 17.9 8.6a4.8 4.8 0 0 1 .5 9.6z" />
      <path d="M9.3 13.4l2 2 3.6-3.8" />
    </>
  ),
  'nuvem-fora': (
    <>
      <path d="M7.2 18.2a4.4 4.4 0 0 1-.7-8.75A5.9 5.9 0 0 1 17.9 8.6a4.8 4.8 0 0 1 .5 9.6z" />
      <path d="M4 4l16 16" />
    </>
  ),
  celular: (
    <>
      <rect x="7" y="3.4" width="10" height="17.2" rx="2.2" />
      <path d="M11 17.6h2" />
    </>
  ),
  relogio: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.2V12l3.2 2" />
    </>
  ),
  velocimetro: (
    <>
      <path d="M4.6 17.2a8.6 8.6 0 1 1 14.8 0" />
      <path d="M12 13.2l4-5" />
      <circle cx="12" cy="13.6" r="1.3" />
    </>
  ),
  usuario: (
    <>
      <circle cx="12" cy="8.2" r="3.7" />
      <path d="M4.6 20a7.4 7.4 0 0 1 14.8 0" />
    </>
  ),
  picape: (
    <>
      <path d="M2.4 16.2v-3.6h9.4l1-4h4.3l2.6 4 1.9.6v3" />
      <path d="M2.4 16.2h1.7M9.3 16.2h5.4M19.9 16.2h1.7" />
      <circle cx="6.7" cy="16.6" r="2.2" />
      <circle cx="17.3" cy="16.6" r="2.2" />
    </>
  ),
  pasta: <path d="M3.2 7.2a2 2 0 0 1 2-2h3.9l2 2.5h7.7a2 2 0 0 1 2 2v7.1a2 2 0 0 1-2 2H5.2a2 2 0 0 1-2-2z" />,
  baixar: <path d="M12 4.2v10.4M7.6 10.4L12 14.8l4.4-4.4M5 19.6h14" />,
  lixeira: (
    <>
      <path d="M4.8 7.2h14.4M9.4 7.2V5h5.2v2.2M6.8 7.2l.8 12h8.8l.8-12" />
      <path d="M10.4 11v5M13.6 11v5" />
    </>
  ),
  busca: (
    <>
      <circle cx="10.8" cy="10.8" r="6.2" />
      <path d="M20 20l-4.6-4.6" />
    </>
  ),
  calendario: (
    <>
      <rect x="3.8" y="5.4" width="16.4" height="14.4" rx="2.2" />
      <path d="M3.8 10h16.4M8.2 3.6v3.4M15.8 3.6v3.4" />
    </>
  ),
  rota: (
    <>
      <circle cx="6" cy="17.6" r="2.3" />
      <circle cx="18" cy="6.4" r="2.3" />
      <path d="M8.3 17.6h5.9a3 3 0 0 0 0-6H9.8a3 3 0 0 1 0-6h5.9" />
    </>
  ),
  mais: <path d="M12 5v14M5 12h14" />,
  atualizar: (
    <>
      <path d="M19.4 12a7.4 7.4 0 1 1-2.2-5.2" />
      <path d="M19.6 4.6v4.2h-4.2" />
    </>
  ),
  apagar: (
    <>
      <path d="M9.2 6h9.6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9.2L3.4 12z" />
      <path d="M12.2 9.8l4.4 4.4M16.6 9.8l-4.4 4.4" />
    </>
  ),
  prancheta: (
    <>
      <path d="M9 3.8h6v3H9z" />
      <path d="M9 5.2H6.2v15h11.6v-15H15" />
      <path d="M9 13.4l2.1 2.1 3.9-4.1" />
    </>
  ),
  bandeira: <path d="M5.6 20.4V4.2M5.6 5h10.2l-1.9 3.6 1.9 3.6H5.6" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 11v5.2M12 7.8v.2" />
    </>
  ),
  lapis: <path d="M4.4 19.6l1-4.2L15.8 5a1.9 1.9 0 0 1 2.7 0l.5.5a1.9 1.9 0 0 1 0 2.7L8.6 18.6zM14.2 6.6l3.2 3.2" />,
  estrela: <path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />
};

export default function Icone({ nome, tamanho = 22, espessura = 1.8, className = '', ...resto }) {
  const desenho = DESENHOS[nome];
  if (!desenho) return null;
  return (
    <svg
      className={`icone${className ? ` ${className}` : ''}`}
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={espessura}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...resto}
    >
      {desenho}
    </svg>
  );
}
