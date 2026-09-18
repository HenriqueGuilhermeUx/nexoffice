import {session} from './api';
import './public-legal.css';

type PageKey='terms'|'privacy'|'cancellation'|'support';

const updated='18 de setembro de 2026';

export function PublicLegalFooter(){
  const params=new URLSearchParams(location.search);
  if(session.token()||params.has('app')||params.has('legal'))return null;
  return <footer className="publicLegalFooter">
    <div><b>NexOffice</b><span>Sistema operacional do seu negócio.</span></div>
    <nav>
      <a href="/?legal=terms">Termos de Uso</a>
      <a href="/?legal=privacy">Privacidade</a>
      <a href="/?legal=cancellation">Cancelamento</a>
      <a href="/?legal=support">Suporte</a>
    </nav>
    <small>7 dias grátis · sem cartão no trial · NexOffice Pro R$ 197/mês no preço fundador</small>
  </footer>;
}

export function PublicLegalPage(){
  const key=new URLSearchParams(location.search).get('legal') as PageKey|null;
  if(!key||!['terms','privacy','cancellation','support'].includes(key))return null;
  return <div className="publicLegalOverlay">
    <header className="publicLegalTop">
      <a href="/" className="publicLegalLogo">NexOffice</a>
      <nav>
        <a className={key==='terms'?'active':''} href="/?legal=terms">Termos</a>
        <a className={key==='privacy'?'active':''} href="/?legal=privacy">Privacidade</a>
        <a className={key==='cancellation'?'active':''} href="/?legal=cancellation">Cancelamento</a>
        <a className={key==='support'?'active':''} href="/?legal=support">Suporte</a>
      </nav>
      <a className="publicLegalBack" href="/">Voltar ao site</a>
    </header>
    <main className="publicLegalBody">
      {key==='terms'&&<Terms/>}
      {key==='privacy'&&<Privacy/>}
      {key==='cancellation'&&<Cancellation/>}
      {key==='support'&&<Support/>}
    </main>
    <footer className="publicLegalBottom">Última atualização: {updated}. A identificação formal do fornecedor responsável pela contratação constará no checkout, recibo ou documento comercial aplicável.</footer>
  </div>;
}

function Intro({eyebrow,title,children}:{eyebrow:string;title:string;children:React.ReactNode}){
  return <><p className="publicLegalEyebrow">{eyebrow}</p><h1>{title}</h1><div className="publicLegalLead">{children}</div></>;
}

function Terms(){return <article>
  <Intro eyebrow="NEXOFFICE" title="Termos de Uso"><p>Estes Termos regulam o uso do NexOffice, plataforma de organização e inteligência operacional para empresas. Ao criar uma conta, iniciar o trial ou contratar o plano, o usuário declara que leu e aceita estas condições.</p></Intro>
  <Section title="1. O serviço"><p>O NexOffice reúne recursos de CRM, agenda, tarefas, financeiro operacional, cobranças, documentos, marketing, módulos flexíveis, integrações e uma equipe digital assistiva. Funcionalidades podem evoluir, ser aprimoradas ou depender de integrações de terceiros.</p><p>O NexOffice não promete que toda ação externa seja automática. Ações sensíveis podem depender de permissões, aprovação humana, credenciais válidas e disponibilidade do provedor integrado.</p></Section>
  <Section title="2. Trial e plano"><p>O trial comercial padrão é de 7 dias, sem cartão. O plano NexOffice Pro é oferecido no lançamento por R$ 197 por mês, em condição de preço fundador enquanto essa oferta estiver vigente.</p><p>A continuidade paga depende de autorização expressa da cobrança indicada no checkout. O NexOffice não transforma o trial gratuito em cobrança sem a jornada de autorização aplicável.</p></Section>
  <Section title="3. Conta e dados inseridos"><p>O usuário é responsável por manter suas credenciais seguras, controlar os acessos da própria equipe e possuir base legítima para inserir ou tratar dados de clientes, colaboradores, fornecedores e demais terceiros na plataforma.</p></Section>
  <Section title="4. Inteligência artificial"><p>Recursos de IA ajudam a organizar contexto, identificar sinais, preparar conteúdo, explicar informações e sugerir próximos passos. Essas respostas podem conter limitações ou erros e não substituem a análise humana em decisões relevantes.</p><p>Recomendações financeiras, fiscais, jurídicas, médicas, de marketing ou de qualquer área regulada devem ser revisadas por pessoa qualificada quando a situação exigir.</p></Section>
  <Section title="5. Integrações"><p>Serviços externos podem possuir termos, disponibilidade, limites e políticas próprias. Uma integração pode ficar temporariamente indisponível sem que isso represente indisponibilidade integral do NexOffice.</p></Section>
  <Section title="6. Uso aceitável"><p>Não é permitido usar a plataforma para fraude, violação de direitos, acesso indevido, distribuição de malware, abuso de serviços de terceiros, envio ilegal de comunicações ou qualquer atividade proibida por lei.</p></Section>
  <Section title="7. Disponibilidade e evolução"><p>O NexOffice é oferecido como software em evolução contínua. Podem ocorrer manutenções, alterações de interface, substituição de provedores e aprimoramentos de capacidades. Procuramos preservar os dados e fluxos essenciais durante essas mudanças.</p></Section>
  <Section title="8. Cancelamento"><p>O usuário pode solicitar o cancelamento da renovação pelo próprio NexOffice quando a assinatura estiver ativa. As condições detalhadas constam na Política de Cancelamento.</p></Section>
  <Section title="9. Responsabilidade"><p>Dentro dos limites permitidos pela legislação aplicável, o NexOffice não responde por decisões tomadas exclusivamente a partir de sugestões automáticas, indisponibilidades de terceiros ou dados incorretos fornecidos pelo usuário.</p></Section>
  <Section title="10. Contato e fornecedor"><p>Durante a fase fundador, suporte e comunicações contratuais são realizados pelo canal de onboarding/comercial informado ao cliente. A identificação formal do fornecedor constará no checkout, recibo ou documento de contratação.</p></Section>
</article>}

function Privacy(){return <article>
  <Intro eyebrow="LGPD E DADOS" title="Política de Privacidade"><p>Esta política explica, em linguagem direta, como o NexOffice trata dados necessários para operar a plataforma. O desenho do produto busca manter isolamento entre empresas e reduzir a circulação desnecessária de dados entre motores especializados.</p></Intro>
  <Section title="1. Dados tratados"><p>Podemos tratar dados de cadastro e acesso, dados da empresa e de seus usuários, registros operacionais inseridos na plataforma, dados de CRM, tarefas, agenda, financeiro, documentos estruturados, uso do produto, suporte e informações necessárias às integrações ativadas pelo cliente.</p></Section>
  <Section title="2. Finalidades"><p>Os dados são usados para autenticação, operação da conta, execução das funcionalidades contratadas, segurança, prevenção a abuso, suporte, cobrança, melhoria do produto e geração das análises solicitadas pelo próprio usuário.</p></Section>
  <Section title="3. Dados de terceiros inseridos pelo cliente"><p>Quando a empresa cliente inclui dados de clientes, leads, colaboradores, fornecedores ou outros terceiros, ela é responsável por avaliar sua base legal e cumprir as obrigações aplicáveis como controladora desses dados. O NexOffice atua conforme o contexto contratual e as instruções legítimas do cliente.</p></Section>
  <Section title="4. Integrações e suboperadores"><p>Algumas funções dependem de provedores de infraestrutura, pagamentos, inteligência artificial e produtos integrados. Somente os dados necessários ao fluxo são enviados conforme a capacidade ativada. Produtos especializados do ecossistema podem manter seu próprio domínio de dados, em vez de compartilhar bancos de dados diretamente.</p></Section>
  <Section title="5. Inteligência artificial"><p>Dados e contexto podem ser enviados aos motores de IA necessários para responder ou executar a funcionalidade solicitada. O NexOffice procura limitar esse contexto ao necessário para a tarefa e preservar a separação entre workspaces.</p></Section>
  <Section title="6. Compartilhamento e venda de dados"><p>O NexOffice não vende dados pessoais a anunciantes. Dados podem ser compartilhados com fornecedores necessários à prestação do serviço, por obrigação legal ou mediante instrução/autorização apropriada do cliente.</p></Section>
  <Section title="7. Segurança"><p>Aplicamos controles de autenticação, autorização por workspace, isolamento lógico, trilhas de auditoria e governança de ações sensíveis. Nenhum sistema é imune a risco, por isso controles e procedimentos são revistos continuamente.</p></Section>
  <Section title="8. Retenção e exclusão"><p>Os dados são mantidos pelo período necessário à prestação do serviço, cumprimento de obrigações legais, defesa de direitos e segurança. Pedidos de correção, exportação ou exclusão serão analisados conforme a relação contratual e a legislação aplicável.</p></Section>
  <Section title="9. Direitos"><p>Quando aplicável, titulares podem exercer os direitos previstos na LGPD, incluindo confirmação de tratamento, acesso, correção e demais direitos legalmente cabíveis. Durante a fase fundador, a solicitação deve ser enviada pelo canal de suporte/onboarding utilizado na contratação.</p></Section>
  <Section title="10. Dados sensíveis"><p>O NexOffice possui integrações e verticais que podem envolver domínios sensíveis. Esses fluxos devem respeitar finalidade específica, minimização, consentimentos ou outras bases legais aplicáveis e as barreiras de dados definidas para cada produto.</p></Section>
</article>}

function Cancellation(){return <article>
  <Intro eyebrow="ASSINATURA" title="Política de Cancelamento"><p>Queremos que a contratação seja simples de entender: você testa antes de pagar e controla a renovação da assinatura.</p></Intro>
  <Section title="1. Trial gratuito"><p>O trial padrão dura 7 dias e não exige cartão. Se o cliente não concluir a autorização da assinatura, o trial não gera automaticamente uma cobrança de cartão.</p></Section>
  <Section title="2. Ativação paga"><p>A assinatura NexOffice Pro no lançamento custa R$ 197 por mês no preço fundador. A cobrança recorrente é ativada somente após a autorização exigida pela jornada de Pix Automático apresentada ao cliente.</p></Section>
  <Section title="3. Cancelamento"><p>Quando a assinatura estiver ativa, o cliente pode cancelar a renovação pelo próprio NexOffice. O cancelamento impede novas renovações programadas, observadas as confirmações do provedor de pagamentos.</p></Section>
  <Section title="4. Período já pago"><p>Quando houver mensalidade já liquidada, o acesso normalmente permanece disponível até o final do período contratado, salvo hipótese legal, fraude, abuso ou situação específica informada no momento do cancelamento.</p></Section>
  <Section title="5. Reembolso"><p>Pedidos de reembolso são analisados conforme a legislação aplicável, a natureza da contratação e as circunstâncias do pagamento. Esta política não reduz direitos obrigatórios assegurados por lei.</p></Section>
  <Section title="6. Problemas no cancelamento"><p>Se o botão de cancelamento ou a confirmação do provedor apresentar falha, o cliente deve comunicar o problema pelo canal de suporte/onboarding utilizado na contratação para registro e tratamento manual.</p></Section>
</article>}

function Support(){return <article>
  <Intro eyebrow="FASE FUNDADOR" title="Suporte NexOffice"><p>Os primeiros clientes recebem acompanhamento assistido. Nosso objetivo é fazer o NexOffice entrar no trabalho real da empresa, não apenas entregar um login.</p></Intro>
  <Section title="Como pedir ajuda"><p>Use o mesmo canal comercial/onboarding pelo qual você recebeu o acesso ao NexOffice. Durante a fase fundador, esse é o canal oficial para suporte, dúvidas de cobrança, cancelamento e acompanhamento de implantação.</p></Section>
  <Section title="Ao solicitar suporte"><p>Informe o nome da empresa/workspace, o que você estava tentando fazer, a tela em que ocorreu o problema e, se possível, uma captura de tela. Nunca envie senha, token, chave de API ou segredo de integração.</p></Section>
  <Section title="Implantação"><p>Podemos orientar a configuração inicial de CRM, tarefas, agenda, financeiro, documentos, módulos flexíveis e Marketing para acelerar o primeiro valor durante o trial.</p></Section>
  <Section title="Cobrança"><p>Dúvidas sobre Pix Automático, ativação, renovação ou cancelamento também devem ser tratadas pelo canal de onboarding na fase fundador.</p></Section>
  <div className="publicSupportCta"><b>Ainda não é cliente?</b><p>Volte ao site, inicie os 7 dias grátis e use o canal comercial que apresentou o NexOffice para tirar dúvidas durante a implantação.</p><a href="/">Voltar para nexoffices.com.br</a></div>
</article>}

function Section({title,children}:{title:string;children:React.ReactNode}){return <section className="publicLegalSection"><h2>{title}</h2>{children}</section>}
