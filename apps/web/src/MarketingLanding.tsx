import {session} from './api';

const features=[
  ['Central de Comando','Tudo que exige sua atenção aparece priorizado em um só lugar.'],
  ['Equipe Digital','Secretária, CRM, financeiro, cobrança, documentos e growth trabalhando com o contexto do seu negócio.'],
  ['CRM que vira ação','Leads, oportunidades e próximos passos conectados à operação — não isolados numa planilha.'],
  ['Financeiro operacional','Receitas, despesas, cobranças, vencimentos e conciliação integrados ao dia a dia.'],
  ['Agenda & execução','Compromissos e tarefas conectados a clientes, negócios e decisões.'],
  ['Humano no controle','A equipe digital prepara e executa fluxos respeitando aprovações e políticas de autonomia.']
];

export default function MarketingLanding(){
  if(session.token()||new URLSearchParams(location.search).has('app'))return null;
  const enter=()=>{location.href='/?app=1'};
  return <div className="marketingPage">
    <header className="marketingNav"><a className="marketingLogo" href="/">NexOffice</a><nav><a href="#produto">Produto</a><a href="#equipe">Equipe Digital</a><a href="#preco">Preço</a></nav><div><button className="mkGhost" onClick={enter}>Entrar</button><button className="mkPrimary" onClick={enter}>Começar grátis</button></div></header>
    <main>
      <section className="mkHero"><div className="mkHeroCopy"><p className="mkEyebrow">O SISTEMA OPERACIONAL DO SEU NEGÓCIO</p><h1>Sua empresa não precisa de mais um sistema. Precisa de uma operação que funcione.</h1><p className="mkLead">NexOffice conecta CRM, financeiro, agenda, documentos e tarefas a uma equipe digital que organiza o que está acontecendo, prioriza o que importa e ajuda sua empresa a executar.</p><div className="mkCtas"><button className="mkPrimary mkBig" onClick={enter}>Testar grátis por 7 dias</button><span>Sem cartão · cancele quando quiser</span></div><div className="mkTrust"><span>Central de Comando</span><span>Equipe Digital</span><span>CRM</span><span>Financeiro</span><span>Automações</span></div></div><div className="mkCommand"><div className="mkCommandTop"><span>Central de Comando</span><b>Agora</b></div><h3>Seu negócio, transformado em decisões e ações.</h3><div className="mkAction"><i>01</i><div><b>Clara · CRM</b><span>3 oportunidades precisam de próximo passo</span></div><em>Prioridade</em></div><div className="mkAction"><i>02</i><div><b>Theo · Cobrança</b><span>2 recebíveis vencidos aguardam sua aprovação</span></div><em>Revisar</em></div><div className="mkAction"><i>03</i><div><b>Sofia · Secretária</b><span>Agenda de amanhã organizada</span></div><em>Pronto</em></div></div></section>
      <section id="produto" className="mkSection"><p className="mkEyebrow">UM NEGÓCIO. UMA OPERAÇÃO.</p><h2>Do que aconteceu ao que precisa ser feito.</h2><p className="mkSectionLead">Em vez de ferramentas desconectadas, o NexOffice cria uma camada operacional única. Os dados deixam de ser apenas registros e passam a alimentar decisões, tarefas, aprovações e ações.</p><div className="mkGrid">{features.map(([title,text])=><article key={title}><span>✦</span><h3>{title}</h3><p>{text}</p></article>)}</div></section>
      <section id="equipe" className="mkDark"><div><p className="mkEyebrow">EQUIPE DIGITAL</p><h2>O software deixa de ser só ferramenta e passa a trabalhar com você.</h2><p>Sofia organiza. Clara cuida do CRM. Nico acompanha a operação financeira. Theo monitora cobranças e controladoria. Dora cuida dos documentos. Maya pensa crescimento. Você define as regras e mantém o controle.</p></div><div className="mkAgents">{['Sofia · Secretária','Alex · Atendimento','Clara · CRM','Nico · ERP','Theo · Cobrança','Theo · Controller','Dora · Documentos','Maya · Growth'].map((x,i)=><span key={x}><b>{String(i+1).padStart(2,'0')}</b>{x}</span>)}</div></section>
      <section id="preco" className="mkPricing"><div><p className="mkEyebrow">PREÇO FUNDADOR</p><h2>Comece usando. Decida depois.</h2><p>Sete dias para colocar sua operação dentro do NexOffice e sentir o produto no trabalho real.</p></div><article><small>NEXOFFICE PRO</small><div className="mkPrice"><b>R$ 197</b><span>/mês</span></div><ul><li>Central de Comando</li><li>Equipe Digital</li><li>CRM e pipeline</li><li>Financeiro e cobranças</li><li>Agenda e tarefas</li><li>Documentos e integrações</li><li>Políticas de aprovação</li></ul><button className="mkPrimary mkBig" onClick={enter}>Começar 7 dias grátis</button><p>Sem cartão no trial. Depois, assinatura mensal via Pix Automático.</p></article></section>
      <section className="mkFinal"><p className="mkEyebrow">NEXOFFICE</p><h2>Menos sistemas para alimentar.<br/>Mais negócio acontecendo.</h2><button className="mkPrimary mkBig" onClick={enter}>Criar meu NexOffice</button></section>
    </main><footer className="mkFooter"><b>NexOffice</b><span>O sistema operacional do seu negócio.</span><span>© 2026 NexOffice</span></footer>
  </div>;
}
