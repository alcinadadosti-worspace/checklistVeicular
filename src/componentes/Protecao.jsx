import { Component } from 'react';
import Icone from './Icone.jsx';

/**
 * Barreira de erros. Se algo quebrar dentro dela, o resto do app continua funcionando.
 *
 * - `silenciosa`: usada em volta dos enfeites 3D/animados. Em aparelhos sem WebGL (ou sem
 *   conexão para baixar o enfeite) simplesmente não mostra nada, e o formulário segue normal.
 * - padrão: tela de "algo deu errado" com botão para tentar de novo.
 */
export default class Protecao extends Component {
  constructor(props) {
    super(props);
    this.state = { erro: null };
  }

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro) {
    // Mantém o registro no console para quem for dar manutenção.
    console.warn('[checklist] componente protegido falhou:', erro?.message || erro);
  }

  // `reiniciarCom`: quando esse valor muda (ex.: a pessoa foi para outra tela), a barreira
  // esquece o erro e tenta mostrar o conteúdo de novo.
  componentDidUpdate(anterior) {
    if (this.state.erro && anterior.reiniciarCom !== this.props.reiniciarCom) this.setState({ erro: null });
  }

  render() {
    if (!this.state.erro) return this.props.children;
    if (this.props.silenciosa) return this.props.reserva ?? null;

    const semRede = typeof navigator !== 'undefined' && navigator.onLine === false;
    return (
      <div className="pane" role="alert">
        <Icone nome={semRede ? 'nuvem-fora' : 'alerta'} tamanho={34} />
        <h1>{semRede ? 'Sem conexão para abrir esta tela' : 'Algo deu errado nesta tela'}</h1>
        <p>
          {semRede
            ? 'Esta parte do app ainda não tinha sido aberta neste aparelho. Seus dados estão salvos; conecte-se à internet e tente de novo.'
            : 'Seus dados continuam salvos no aparelho. Tente de novo; se o problema continuar, recarregue a página.'}
        </p>
        <div className="pane__acoes">
          <button type="button" className="botao botao--solido botao--m" onClick={() => this.setState({ erro: null })}>
            Tentar de novo
          </button>
          <button type="button" className="botao botao--fantasma botao--m" onClick={() => window.location.reload()}>
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}
