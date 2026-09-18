import {session} from './api';

const painPoints=[
  ['Tudo passa por você','Sua equipe pergunta, você lembra, cobra, confere e decide. A empresa cresce, mas o dono continua sendo o sistema que conecta tudo.'],
  ['A operação está espalhada','Cliente no CRM, tarefa no WhatsApp, vencimento na planilha, compromisso na agenda, documento no e-mail e informação importante na cabeça de alguém.'],
  ['Dinheiro e oportunidades escapam','Follow-up esquecido, cobrança atrasada, tarefa sem dono e pendência descoberta tarde demais viram venda perdida, atraso e retrabalho.'],
  ['Você descobre o problema tarde','Os sistemas registram muita coisa, mas ainda depende de alguém perceber o que mudou, entender a prioridade e transformar isso em ação.']
];

const outcomes=[
  ['Vendas sem próximo passo','Clara identifica oportunidades paradas e traz quem precisa de follow-up para a sua atenção.'],
  ['Cobranças esquecidas','Theo acompanha recebíveis e pendências para que atraso não dependa da sua memória.'],
  ['Agenda e tarefas soltas','Sofia organiza compromissos, tarefas e prioridades dentro do mesmo contexto da operação.'],
  ['Financeiro sem contexto','Nico conecta receitas, despesas e acontecimentos operacionais para você entender o que exige atenção.'],
  ['Documentos e pendências','Dora ajuda a manter documentos e necessidades operacionais visíveis, em vez de enterrados em e-mails e pastas.'],
  ['Decisões espalhadas','A Central de Comando reúne o que precisa de você e separa informação de decisão.']
];

const caseStudies=[
  {
    label:'EMPRESA DE SERVIÇOS',
    title:'O dono vende, entrega, cobra e ainda precisa lembrar a equipe do que fazer.',
    before:['Leads chegam por vários canais','Propostas ficam sem retorno','Tarefas dependem de cobrança manual','Contas a receber são acompanhadas em planilha'],
    after:'O NexOffice conecta oportunidade, próximo passo, tarefa, agenda e cobrança. A Central de Comando mostra onde a operação precisa de atenção antes que o dono tenha que procurar.'
  },
  {
    label:'ESCRITÓRIO PROFISSIONAL',
    title:'Clientes, prazos, documentos e financeiro convivem em lugares diferentes.',
    before:['Pendências ficam em conversas','Documentos somem em pastas e e-mails','Agenda não conversa com a operação','O gestor precisa conferir tudo manualmente'],
    after:'Sofia organiza agenda e tarefas, Dora mantém pendências documentais visíveis e o financeiro permanece conectado ao cliente e ao trabalho em andamento.'
  },
  {
    label:'OPERAÇÃO COMERCIAL',
    title:'Há oportunidades no funil, mas ninguém sabe com clareza quem precisa de ação hoje.',
    before:['Follow-ups se perdem','Pipeline vira registro, não rotina','Cobrança e vendas não compartilham contexto','A prioridade muda conforme quem pergunta'],
    after:'Clara traz oportunidades sem próximo passo, Theo sinaliza recebíveis e o gestor recebe uma fila priorizada do que precisa ser decidido ou executado.'
  },
  {
    label:'EMPRESA EM CRESCIMENTO',
    title:'Mais pessoas e mais sistemas aumentaram a operação — mas também aumentaram o ruído.',
    before:['Cada área trabalha em sua ferramenta','Informação importante não chega na hora certa','Decisões ficam concentradas no dono','A empresa reage mais do que antecipa'],
    after:'O NexOffice vira a camada entre as áreas e a gestão: reúne contexto, identifica pendências, distribui trabalho e preserva aprovação humana nas ações sensíveis.'
  }
];

const operatingLoop=[
  ['01','O NexOffice reúne o contexto','Clientes, oportunidades, tarefas, agenda, financeiro, cobranças, documentos e integrações passam a alimentar a mesma operação.'],
  ['02','Entende o que merece atenção','Pendências, riscos, atrasos, próximos passos e necessidades de aprovação aparecem de forma priorizada.'],
  ['03','A equipe digital prepara a ação','Cada especialista trabalha com o contexto do negócio e prepara o próximo passo dentro da sua função.'],
  ['04','Você continua no controle','Ações sensíveis respeitam permissões, aprovações e políticas de autonomia definidas pela empresa.']
];

const agents=[
  ['Sofia','Secretária','Agenda, tarefas, prioridades e organização do dia.'],
  ['Alex','Atendimento','Contexto de atendimento e continuidade das demandas.'],
  ['Clara','CRM','Leads, oportunidades, follow-ups e próximos passos.'],
  ['Nico','Operação financeira','Movimentações, contexto financeiro e rotina operacional.'],
  ['Theo','Cobrança','Recebíveis, atrasos e ações de cobrança.'],
  ['Theo','Controladoria','Visão de controle, pendências e acompanhamento.'],
  ['Dora','Documentos','Documentos, referências e pendências documentais.'],
  ['Maya','Growth','Oportunidades de crescimento e execução comercial.']
];

const hiddenCosts=[
  ['Uma venda que esfria','O custo não aparece como “erro operacional”. Ele aparece quando uma proposta fica sem retorno e a oportunidade simplesmente desaparece.'],
  ['Uma cobrança que ninguém acompanhou','O valor continua no contas a receber enquanto alguém precisa lembrar de cobrar, conferir e voltar ao assunto.'],
  ['Uma hora do dono procurando informação','É tempo de gestão gasto descobrindo o que aconteceu em vez de decidir o que fazer a seguir.'],
  ['Uma tarefa sem responsável','O trabalho não some. Ele reaparece depois como atraso, urgência, cobrança interna ou retrabalho.'],
  ['Uma decisão tomada com contexto incompleto','Quando dados, conversas e pendências estão espalhados, a gestão decide mais tarde ou decide sem enxergar o quadro inteiro.'],
  ['A empresa crescer sem o processo crescer junto','Mais clientes, pessoas e ferramentas podem aumentar o volume de coordenação que continua concentrado em poucas pessoas.']
];

export default function MarketingLanding(){
  if(session.token()||new URLSearchParams(location.search).has('app'))return null;
  const enter=()=>{location.href='/?app=1'};
  return <div className="marketingPage">
    <header className="marketingNav">
      <a className="marketingLogo" href="/">NexOffice</a>
      <nav><a href="#dor">O problema</a><a href="#para-quem">Para quem</a><a href="#como-funciona">Como funciona</a><a href="#custo">O custo do caos</a><a href="#preco">Preço</a></nav>
      <div><button className="mkGhost" onClick={enter}>Entrar</button><button className="mkPrimary" onClick={enter}>Começar grátis</button></div>
    </header>

    <main>
      <section className="mkHero">
        <div className="mkHeroCopy">
          <p className="mkEyebrow">O SISTEMA OPERACIONAL DO SEU NEGÓCIO</p>
          <h1>Pare de tocar sua empresa no WhatsApp, nas planilhas e na sua cabeça.</h1>
          <p className="mkLead">O NexOffice reúne o que está acontecendo no seu negócio, mostra o que precisa da sua atenção e coloca uma equipe digital para ajudar sua empresa a executar — sem tirar você do controle.</p>
          <div className="mkCtas"><button className="mkPrimary mkBig" onClick={enter}>Testar grátis por 7 dias</button><span>Sem cartão no trial · depois R$ 197/mês</span></div>
          <div className="mkHeroPromise"><b>Abra o NexOffice e saiba:</b><span>o que aconteceu</span><span>o que está atrasado</span><span>onde existe risco</span><span>qual é a próxima ação</span></div>
        </div>
        <div className="mkCommand">
          <div className="mkCommandTop"><span>Central de Comando</span><b>Agora</b></div>
          <h3>Você não precisa saber onde procurar. O NexOffice precisa saber o que trazer até você.</h3>
          <div className="mkAction"><i>01</i><div><b>Clara · CRM</b><span>3 oportunidades estão sem próximo passo</span></div><em>Prioridade</em></div>
          <div className="mkAction"><i>02</i><div><b>Theo · Cobrança</b><span>2 recebíveis vencidos precisam de decisão</span></div><em>Revisar</em></div>
          <div className="mkAction"><i>03</i><div><b>Sofia · Secretária</b><span>2 tarefas de amanhã ainda estão sem responsável</span></div><em>Organizar</em></div>
          <div className="mkAction"><i>04</i><div><b>Dora · Documentos</b><span>1 pendência documental exige atenção</span></div><em>Pendente</em></div>
        </div>
      </section>

      <section id="dor" className="mkPainSection">
        <div className="mkPainIntro"><p className="mkEyebrow">O PROBLEMA NÃO É FALTA DE SOFTWARE</p><h2>O problema é que sua operação ainda depende de alguém lembrar, procurar, cobrar e conectar tudo.</h2><p>É assim que o empresário vira o integrador humano da própria empresa. Quanto mais o negócio cresce, mais informação aparece — e mais difícil fica enxergar o que realmente precisa acontecer agora.</p></div>
        <div className="mkPainGrid">{painPoints.map(([title,text],i)=><article key={title}><b>{String(i+1).padStart(2,'0')}</b><h3>{title}</h3><p>{text}</p></article>)}</div>
      </section>

      <section className="mkBridge">
        <p className="mkEyebrow">A VIRADA</p>
        <h2>O NexOffice não foi feito só para guardar informação.<br/>Foi feito para transformar informação em operação.</h2>
        <p>Em vez de abrir vários lugares para descobrir o que está acontecendo, você passa a ter uma camada única que conecta contexto, prioridade, decisão e execução.</p>
      </section>

      <section className="mkUseCases">
        <div className="mkUseHeader"><p className="mkEyebrow">SE SUA EMPRESA VIVE ASSIM, O NEXOFFICE FOI FEITO PARA ELA</p><h2>Problemas pequenos que, juntos, viram caos operacional.</h2></div>
        <div className="mkOutcomeGrid">{outcomes.map(([title,text])=><article key={title}><span>→</span><div><h3>{title}</h3><p>{text}</p></div></article>)}</div>
      </section>

      <section id="para-quem" className="mkStories">
        <div className="mkStoriesHead"><p className="mkEyebrow">NA PRÁTICA</p><h2>Quatro tipos de empresa. O mesmo problema: a operação depende demais de pessoas conectando tudo manualmente.</h2><p>O NexOffice não exige que sua empresa tenha uma estrutura perfeita. Ele foi pensado justamente para operações que já funcionam, mas estão começando a sentir o peso da desorganização, do crescimento ou da dependência do dono.</p></div>
        <div className="mkStoriesGrid">{caseStudies.map((story,i)=><article className="mkStory" key={story.label}><div className="mkStoryTop"><span>{String(i+1).padStart(2,'0')}</span><b>{story.label}</b></div><h3>{story.title}</h3><div className="mkStoryBefore"><small>ANTES</small>{story.before.map(item=><p key={item}>{item}</p>)}</div><div className="mkStoryAfter"><small>COM NEXOFFICE</small><p>{story.after}</p></div></article>)}</div>
        <div className="mkStoriesCta"><div><b>Não importa onde o caos começa.</b><span>Se ele termina sempre nas costas do dono, existe espaço para o NexOffice.</span></div><button className="mkPrimary mkBig" onClick={enter}>Testar na minha empresa</button></div>
      </section>

      <section id="como-funciona" className="mkHow">
        <div className="mkHowIntro"><p className="mkEyebrow">COMO FUNCIONA</p><h2>Do que aconteceu ao que precisa ser feito.</h2><p>O NexOffice cria um ciclo operacional contínuo. O dado entra, vira contexto, o contexto vira prioridade e a prioridade vira ação — com você definindo os limites.</p></div>
        <div className="mkLoop">{operatingLoop.map(([n,title,text])=><article key={n}><b>{n}</b><div><h3>{title}</h3><p>{text}</p></div></article>)}</div>
      </section>

      <section id="equipe" className="mkDark">
        <div className="mkTeamIntro"><p className="mkEyebrow">EQUIPE DIGITAL</p><h2>Uma equipe que não perde o contexto do seu negócio.</h2><p>Você não compra “agentes de IA”. Você ganha ajuda operacional em áreas que normalmente acabam nas costas do dono. Cada especialista atua no seu papel, mas todos trabalham sobre o mesmo contexto da empresa.</p><blockquote>O software deixa de ser só ferramenta e passa a ajudar o trabalho a acontecer.</blockquote></div>
        <div className="mkAgents">{agents.map(([name,role,text],i)=><article key={`${name}-${role}`}><b>{String(i+1).padStart(2,'0')}</b><div><h3>{name}<span>{role}</span></h3><p>{text}</p></div></article>)}</div>
      </section>

      <section className="mkControl">
        <div><p className="mkEyebrow">AUTOMAÇÃO SEM PERDER O CONTROLE</p><h2>O NexOffice ajuda a executar. Você continua decidindo os limites.</h2></div>
        <div className="mkControlCards"><article><b>Prioriza</b><p>Mostra o que exige atenção antes que vire urgência.</p></article><article><b>Prepara</b><p>Organiza contexto e próximo passo para reduzir trabalho manual.</p></article><article><b>Executa com regras</b><p>Fluxos respeitam permissões, aprovações e políticas definidas pela empresa.</p></article><article><b>Registra</b><p>Decisões e ações permanecem conectadas à operação.</p></article></div>
      </section>

      <section id="custo" className="mkCost">
        <div className="mkCostIntro">
          <p className="mkEyebrow">QUANTO CUSTA CONTINUAR ASSIM?</p>
          <h2>O custo da desorganização não chega em uma única fatura.</h2>
          <p>Ele aparece espalhado em oportunidades perdidas, atrasos, horas de gestão consumidas, cobrança manual, retrabalho e decisões tomadas tarde. Cada empresa sente isso de um jeito — por isso o NexOffice não promete um ROI inventado.</p>
          <div className="mkCostCallout"><b>R$ 197/mês é um preço visível.</b><span>O custo de continuar dependendo da memória, do improviso e da cobrança manual quase nunca é.</span></div>
        </div>
        <div className="mkCostGrid">{hiddenCosts.map(([title,text],i)=><article key={title}><span>{String(i+1).padStart(2,'0')}</span><div><h3>{title}</h3><p>{text}</p></div></article>)}</div>
      </section>

      <section className="mkDecision">
        <p className="mkEyebrow">UMA PERGUNTA SIMPLES</p>
        <h2>Quanto da sua semana ainda é gasto lembrando, procurando, cobrando e conferindo?</h2>
        <p>O NexOffice existe para transformar esse esforço invisível em uma operação que consegue mostrar prioridade, distribuir contexto e acompanhar execução.</p>
        <button className="mkPrimary mkBig" onClick={enter}>Descobrir em 7 dias</button>
      </section>

      <section id="preco" className="mkPricing">
        <div><p className="mkEyebrow">PREÇO FUNDADOR</p><h2>Coloque sua operação dentro do NexOffice antes de decidir.</h2><p>Use por sete dias no trabalho real. Organize clientes, tarefas, agenda, financeiro e prioridades. Depois escolha se quer continuar.</p><div className="mkPriceQuote">“Se o NexOffice evitar uma cobrança esquecida, um follow-up perdido ou algumas horas de retrabalho, ele já começa a justificar estar na operação.”</div></div>
        <article><small>NEXOFFICE PRO · PREÇO FUNDADOR</small><div className="mkPrice"><b>R$ 197</b><span>/mês</span></div><ul><li>Central de Comando</li><li>Equipe Digital</li><li>CRM e pipeline</li><li>Financeiro e cobranças</li><li>Agenda e tarefas</li><li>Documentos e integrações</li><li>Políticas de aprovação</li></ul><button className="mkPrimary mkBig" onClick={enter}>Começar 7 dias grátis</button><p>Sem cartão no trial · Pix Automático depois · cancele quando quiser</p></article>
      </section>

      <section className="mkFinal">
        <p className="mkEyebrow">NEXOFFICE</p>
        <h2>Sua empresa funcionando sem tudo depender de você.</h2>
        <p>Organize a operação, enxergue as prioridades e tenha ajuda para fazer acontecer.</p>
        <button className="mkPrimary mkBig" onClick={enter}>Criar meu NexOffice</button>
        <span>7 dias grátis · sem cartão</span>
      </section>
    </main>
    <footer className="mkFooter">
      <b>NexOffice</b>
      <nav style={{display:'flex',justifyContent:'center',gap:'14px',flexWrap:'wrap'}}>
        <a style={{color:'#d8e1e7',textDecoration:'none'}} href="/?legal=terms">Termos</a>
        <a style={{color:'#d8e1e7',textDecoration:'none'}} href="/?legal=privacy">Privacidade</a>
        <a style={{color:'#d8e1e7',textDecoration:'none'}} href="/?legal=cancellation">Cancelamento</a>
        <a style={{color:'#d8e1e7',textDecoration:'none'}} href="/?legal=support">Suporte</a>
      </nav>
      <span>© 2026 NexOffice · 7 dias grátis · R$ 197/mês no preço fundador</span>
    </footer>
  </div>;
}
