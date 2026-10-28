/**
 * Nexa crypto hub — informational hand-off, not a second wallet.
 *
 * Privy wallet creation, authentication, signatures and wallet connection stay
 * in the existing audited Nexa Wallet portal. Never forward a personal-profile
 * access token, user ID, CPF, wallet address or funds across product boundaries.
 */
const WALLET_PORTAL='https://trynexa.com.br/portal/';
const WALLET_SIGNUP='https://trynexa.com.br/cadastro';

const capabilities=[
 {title:'Carteira Privy',state:'Na Nexa Wallet',description:'Carteira individual vinculada à conta Nexa, com autenticação e confirmação no fluxo próprio da Wallet.'},
 {title:'Receber USDC',state:'Na Nexa Wallet',description:'Consulte a rede e o endereço vinculados diretamente na Wallet antes de transferir; não copie endereços de demonstração.'},
 {title:'Conectar carteira externa',state:'Em homologação',description:'MetaMask e carteiras compatíveis estão sendo integradas à experiência Wallet. Nenhuma conexão será iniciada por esta tela.'},
 {title:'Pix ↔ USDC',state:'Na Nexa Wallet',description:'Operações disponíveis dependem de elegibilidade, cotação, confirmação, reconciliação e regras da conta.'},
 {title:'Histórico & segurança',state:'Na Nexa Wallet',description:'Operações e referências devem ser consultadas na carteira original, sem sincronizar credenciais com a experiência pessoal.'}
];

export default function NexaCryptoHub(){
 return <div className="np-studio np-nexa-crypto">
  <section className="np-panel np-studio-card">
   <span className="np-kicker">NEXA · CRIPTO E CARTEIRAS</span>
   <h2>Cripto sem complicação.</h2>
   <p>A Maya coordena sua experiência pessoal na Nexa. Na Nexa Wallet, o atendimento e as funções cripto pertencem ao <strong>Assistente Nexa</strong>, com autenticação e permissões exclusivas da Wallet.</p>
   <div className="np-nexa-crypto-actions">
    <a className="np-primary" href={WALLET_PORTAL} target="_blank" rel="noopener noreferrer">Abrir minha Nexa Wallet ↗</a>
    <a className="np-studio-secondary" href={WALLET_SIGNUP} target="_blank" rel="noopener noreferrer">Criar minha conta Nexa Wallet ↗</a>
   </div>
   <p className="np-footnote">Você acessará a Wallet em uma página separada. O Assistente da Wallet usa apenas os recursos realmente habilitados e autorizados no produto. O token e o texto das solicitações da Maya não são compartilhados. Nenhum agente inicia transferência, swap ou assinatura por esta tela.</p>
  </section>
  <section className="np-panel np-studio-card">
   <span className="np-kicker">O QUE JÁ EXISTE E O QUE ESTÁ EM INTEGRAÇÃO</span>
   <h2>Sua carteira, com controle.</h2>
   <div className="np-nexa-crypto-grid">
    {capabilities.map(item=><article className="np-nexa-crypto-item" key={item.title}>
     <h3>{item.title}</h3><span>{item.state}</span><p>{item.description}</p>
    </article>)}
   </div>
   <p className="np-footnote">A Nexa não apresenta saldos ou transações da Wallet nesta tela. É necessário consultar a conta autenticada no produto original; não há autorização de compartilhamento financeiro entre produtos nesta etapa.</p>
  </section>
  <section className="np-panel np-studio-card">
   <h2>Uma Wallet, não duas.</h2>
   <p>Se você já possui carteira Privy vinculada à sua conta Nexa, utilize o mesmo login da Wallet. Se não possui, siga o cadastro e a confirmação no portal existente. Não criamos uma nova carteira nem importamos chaves privadas automaticamente.</p>
   <p><strong>Entrada de carteiras externas:</strong> a tarifa Nexa definida para receber USDC é 0%; custos de rede e terceiros podem existir. Verifique sempre a rede e as condições reais antes de enviar.</p>
   <p><small>Integração direta de saldos, autenticação única e conexão WalletConnect serão liberadas somente após homologação independente de identidade, consentimento, privacidade, rede e autorização de assinatura.</small></p>
  </section>
 </div>;
}
