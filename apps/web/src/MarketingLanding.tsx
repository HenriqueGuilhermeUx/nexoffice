const pains=[
  ['VENDA','Fechou — e agora?','Proposta, contrato, execução, nota, cobrança e pagamento costumam se espalhar por ferramentas diferentes.'],
  ['DINHEIRO','Entrou um Pix — de quem é?','Banco mostra a movimentação; planilha e memória tentam descobrir a cobrança correspondente.'],
  ['CLIENTE','Ele está esfriando?','Silêncio, atraso e renovação próxima passam despercebidos até virarem problema.'],
  ['GESTÃO','Só você junta tudo na cabeça?','CRM, agenda, financeiro, WhatsApp e documentos existem — mas a decisão ainda depende do dono.']
];

const situations=[
  {tag:'VENDA',title:'Fechou um cliente?',text:'Você não perde a venda depois do “sim”. Proposta, contrato, trabalho, nota, cobrança e pagamento continuam ligados até o dinheiro entrar.',action:'Continuar a operação →'},
  {tag:'DINHEIRO',title:'Entrou um Pix?',text:'O NexOffice compara movimentação, valor, data e cliente e deixa a conciliação mais provável pronta para você confirmar.',action:'Conciliar com contexto →'},
  {tag:'CLIENTE',title:'Alguém está esfriando?',text:'Atrasos, silêncio, renovação próxima e oportunidades de expansão aparecem antes de virarem surpresa.',action:'Agir antes do problema →'},
  {tag:'ESTOQUE',title:'Um produto vai acabar?',text:'Para quem vende mercadoria, estoque e compras aparecem só quando fazem sentido, com reposição sugerida e rastreável.',action:'Planejar reposição →'},
  {tag:'RESULTADO',title:'O que realmente dá dinheiro?',text:'Receita, custo conhecido, margem, recorrência e recebimento ficam conectados à oferta e ao cliente.',action:'Ver o que vale repetir →'},
  {tag:'CRESCIMENTO',title:'Quer vender mais?',text:'CRM, relacionamento, marketing e a equipe de IA trabalham sobre a mesma memória permitida do negócio.',action:'Transformar sinal em ação →'}
];

const flows=['Cliente','Venda','Proposta','Contrato','Trabalho','Nota','Cobrança','Pagamento','Resultado','Próximo ciclo'];
const proofSteps=[
  ['01','Cliente entra','Contato, oportunidade e histórico começam no mesmo contexto.'],
  ['02','Venda avança','Oferta, proposta e contrato seguem conectados ao cliente.'],
  ['03','Trabalho acontece','Tarefas, agenda, documentos e execução continuam ligados à venda.'],
  ['04','Dinheiro entra','Nota, cobrança, Pix e conciliação deixam o recebimento rastreável.'],
  ['05','Próximo ciclo nasce','Resultado, margem, risco e renovação viram próximos passos.']
];


const engines=[
  {brand:'SmartBots',mark:'SB',role:'Atendimento & captação',text:'Bots para recepção, dúvidas, captação e qualificação de contatos conectados ao fluxo comercial.'},
  {brand:'MODO',mark:'M',role:'Marketing & crescimento',text:'Estratégia, campanhas, conteúdo e criativos preparados a partir do contexto e dos objetivos do negócio.'},
  {brand:'DocWallet',mark:'DW',role:'Documentos & contratos',text:'Documentos, contratos, organização e fluxos de assinatura trabalhando junto da operação.'},
  {brand:'TaxAgent',mark:'TA',role:'Fiscal',text:'Camada fiscal para apoiar notas e rotinas tributárias dentro dos fluxos habilitados.'},
  {brand:'PDF Fácil',mark:'PDF',role:'Produtividade documental',text:'Transformação e organização de PDFs sem quebrar o fluxo de trabalho do usuário.'},
  {brand:'Staff',mark:'ST',role:'Atendimento operacional',text:'Ponte de atendimento e comunicação operacional usada pelo NexOffice nos fluxos em que essa capacidade está habilitada.'}
];

const orchestrations=[
  ['“Quero conseguir mais clientes.”','Maya coordena → MODO prepara a campanha → SmartBots atende → Clara organiza leads e follow-ups.'],
  ['“Quero fechar este negócio.”','Clara acompanha a venda → DocWallet entra no contrato → Dora mantém documentos e obrigações no contexto.'],
  ['“Entrou dinheiro. Quero dar baixa.”','Theo cruza financeiro e movimentações → NexOffice sugere a conciliação → você confirma quando houver efeito financeiro.'],
  ['“Preciso organizar a documentação fiscal.”','TaxAgent, DocWallet e PDF Fácil entram no fluxo apropriado, sem obrigar você a trocar de sistema.']
];

const agents=[
  ['Maya','Coordena','Cruza o negócio inteiro e mostra o que merece sua atenção.'],
  ['Clara','Vende','Enxerga pipeline, follow-ups, risco, renovação e expansão.'],
  ['Theo','Cuida do dinheiro','Acompanha recebíveis, conciliação, recorrência e resultado.'],
  ['Nico','Opera','Conecta execução, produtos, estoque, compras e próximos passos.'],
  ['Dora','Organiza documentos','Mantém contratos, documentos e obrigações no contexto certo.'],
  ['Sofia','Organiza o dia','Agenda, tarefas e compromissos sem deixar pontas soltas.']
];

const useCases=[
  ['Serviços recorrentes','Venda uma vez, acompanhe margem, gere próximos ciclos, veja atrasos e prepare renovação antes do vencimento.'],
  ['Comércio e produtos','Catálogo, venda, estoque controlado quando necessário, reposição, compra e recebimento no mesmo fluxo.'],
  ['Escritórios e profissionais','Clientes, propostas, contratos, agenda, documentos, cobrança, recebimento e relacionamento sem planilhas paralelas.'],
  ['Negócios em crescimento','O dono deixa de ser o único lugar onde CRM, financeiro, operação e decisões se encontram.']
];

export default function MarketingLanding(){
  if(new URLSearchParams(location.search).has('app'))return null;
  const enter=()=>{location.href='/?app=1'};
  return <div className="marketingPage mkNew">
    <header className="marketingNav">
      <a className="marketingLogo" href="/">NexOffice</a>
      <nav><a href="#como">Como funciona</a><a href="#possibilidades">O que faz</a><a href="#ecossistema">Ecossistema</a><a href="#ia">Equipe de IA</a><a href="#preco">Preço</a></nav>
      <div><button className="mkGhost" onClick={enter}>Entrar</button><button className="mkPrimary" onClick={enter}>Começar grátis</button></div>
    </header>

    <main>
      <section className="mkHeroNew">
        <div className="mkHeroNewCopy">
          <p className="mkEyebrow">NEXOFFICE · O SISTEMA OPERACIONAL DO SEU NEGÓCIO</p>
          <h1>Seu negócio não precisa de mais uma tela.<br/><em>Precisa saber o que fazer agora.</em></h1>
          <p className="mkLeadNew">O NexOffice conecta clientes, vendas, financeiro, documentos e operação em um único fluxo. Sua equipe de IA acompanha o que acontece, encontra o que merece atenção e deixa a próxima ação pronta.</p>
          <div className="mkCapabilityLine"><span>CRM</span><span>Financeiro</span><span>Documentos</span><span>Operação</span><span>Automação</span><span>IA</span></div>
          <div className="mkCtas"><button className="mkPrimary mkBig" onClick={enter}>Criar meu NexOffice grátis</button><button className="mkTextCta" onClick={()=>document.getElementById('como')?.scrollIntoView({behavior:'smooth'})}>Ver como funciona ↓</button></div>
          <div className="mkTrustLine"><span>✓ 7 dias grátis</span><span>✓ Sem cartão no trial</span><span>✓ Ações sensíveis continuam sob seu controle</span></div>
          <div className="mkFitLine"><b>Feito para quem precisa tocar o negócio, não administrar um ERP.</b><span>Serviços · Escritórios · Consultorias · Comércio · Operações recorrentes</span></div>
        </div>
        <div className="mkLiveBoard">
          <div className="mkLiveTop"><span><i/> NEXOFFICE · AGORA</span><b>Maya</b></div>
          <h3>3 coisas merecem sua atenção.</h3>
          <article className="critical"><span>RECEBIMENTO</span><b>PIX de R$ 1.500 provavelmente é da Clínica Aurora</b><p>Valor exato · data próxima · cliente compatível</p><button>Conciliar</button></article>
          <article><span>RELACIONAMENTO</span><b>Contrato da Atlas vence em 28 dias</b><p>Cliente em dia · proposta anterior disponível</p><button>Preparar renovação</button></article>
          <article className="warning"><span>ESTOQUE</span><b>Café Especial está no ponto de reposição</b><p>4 unidades · mínimo 5 · compra sugerida: 6</p><button>Planejar compra</button></article>
          <small className="mkLiveFoot">O NexOffice sugere. Você decide quando a ação tem efeito financeiro, fiscal ou externo.</small>
        </div>
      </section>

      <section className="mkPainSection">
        <div className="mkSectionIntro centered"><p className="mkEyebrow">ISSO ACONTECE NA SUA EMPRESA?</p><h2>O problema não é falta de software.<br/>É o negócio continuar dependendo da sua memória.</h2><p>As informações já existem. O que falta é continuidade entre elas.</p></div>
        <div className="mkPainGrid">{pains.map(([tag,title,text])=><article key={tag}><span>{tag}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
        <div className="mkStackCompare"><div><small>HOJE</small><b>CRM + planilha + banco + WhatsApp + agenda + arquivos + cabeça do dono</b></div><i>→</i><div><small>COM NEXOFFICE</small><b>Um negócio conectado + próximas ações</b></div></div>
      </section>

      <section className="mkFlowSection" id="como">
        <div className="mkSectionIntro"><p className="mkEyebrow">UMA HISTÓRIA, NÃO DEZ MÓDULOS</p><h2>Da oportunidade ao dinheiro recebido.</h2><p>O NexOffice acompanha a continuidade da operação. Você não precisa pensar como um ERP para usar um sistema completo.</p></div>
        <div className="mkFlowRail">{flows.map((step,index)=><div key={step}><span>{String(index+1).padStart(2,'0')}</span><b>{step}</b>{index<flows.length-1&&<i>→</i>}</div>)}</div>
        <div className="mkFlowExample"><div><small>EXEMPLO</small><b>Você vende uma mensalidade de R$ 2.500.</b></div><p>O NexOffice reutiliza a oferta → prepara proposta → mantém contrato no contexto → acompanha execução → organiza nota e cobrança → identifica pagamento → calcula rentabilidade → prepara próximo ciclo → sinaliza renovação ou risco.</p></div>
      </section>

      <section className="mkProofSection" aria-labelledby="mkProofTitle">
        <div className="mkProofIntro"><p className="mkEyebrow">VEJA UMA VENDA ATRAVESSAR O NEXOFFICE</p><h2 id="mkProofTitle">O “sim” do cliente não é o fim do CRM.<br/>É o começo da operação.</h2><p>Exemplo ilustrativo: uma venda de R$ 2.500 continua conectada até o pagamento, o resultado e a próxima oportunidade.</p></div>
        <div className="mkProofRail">{proofSteps.map(([number,title,text])=><article key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
        <div className="mkProofOutcome"><div><small>SEM NEXOFFICE</small><b>A venda se espalha entre pessoas, abas e planilhas.</b></div><i>→</i><div><small>COM NEXOFFICE</small><b>O contexto acompanha o negócio até o dinheiro entrar — e continua no próximo ciclo.</b></div></div>
      </section>

      <section className="mkPossibilities" id="possibilidades">
        <div className="mkSectionIntro centered"><p className="mkEyebrow">POSSIBILIDADES REAIS</p><h2>Abra o NexOffice e faça o negócio andar.</h2><p>Não são dashboards para olhar. São situações que terminam com uma ação concreta.</p></div>
        <div className="mkSituationGrid">{situations.map((item,index)=><article key={item.tag}><span>{String(index+1).padStart(2,'0')} · {item.tag}</span><h3>{item.title}</h3><p>{item.text}</p><b>{item.action}</b></article>)}</div>
      </section>

      <section className="mkEcosystem" id="ecossistema">
        <div className="mkEcosystemIntro">
          <p className="mkEyebrow">UM NEXOFFICE. VÁRIOS MOTORES ESPECIALIZADOS.</p>
          <h2>Você não precisa montar uma pilha de ferramentas para fazer o negócio funcionar.</h2>
          <p>O NexOffice é o produto principal. Por baixo dele, tecnologias especializadas entram quando ajudam na tarefa — sem obrigar você a aprender seis sistemas diferentes.</p>
          <div className="mkArchitecture"><span><b>NexOffice</b><small>experiência única</small></span><i>→</i><span><b>Maya + especialistas</b><small>coordenação e decisão</small></span><i>→</i><span><b>Motores especializados</b><small>execução por capacidade</small></span></div>
        </div>
        <div className="mkEngineGrid">{engines.map(engine=><article key={engine.brand}><div className="mkEngineMark">{engine.mark}</div><div><span>{engine.role}</span><h3>{engine.brand}</h3><p>{engine.text}</p></div></article>)}</div>
        <div className="mkEcosystemRule"><b>Você pede. O NexOffice coordena.</b><span>A capacidade certa aparece dentro do fluxo certo — e ações sensíveis continuam respeitando confirmação, aprovação e permissões.</span></div>
        <div className="mkOrchestrationGrid">{orchestrations.map(([ask,flow])=><article key={ask}><h3>{ask}</h3><p>{flow}</p></article>)}</div>
      </section>

      <section className="mkDifference">
        <div><p className="mkEyebrow">O QUE MUDA</p><h2>Menos “onde está isso?”.<br/>Mais “qual é o próximo passo?”.</h2></div>
        <div className="mkDifferenceGrid">
          <article><span>ANTES</span><b>CRM termina na venda.</b><p>Depois alguém precisa levar contrato, nota, cobrança e pagamento para outros lugares.</p></article>
          <article><span>COM NEXOFFICE</span><b>A venda vira operação.</b><p>O contexto continua até o recebimento, resultado e próximo ciclo.</p></article>
          <article><span>ANTES</span><b>Extrato é conferência manual.</b><p>Alguém compara banco, planilha e cliente linha por linha.</p></article>
          <article><span>COM NEXOFFICE</span><b>Conciliação vem explicada.</b><p>Valor, data e contraparte viram uma sugestão pronta para confirmar.</p></article>
          <article><span>ANTES</span><b>ERP exige disciplina para alimentar telas.</b><p>O sistema registra o passado, mas não ajuda a decidir o que fazer.</p></article>
          <article><span>COM NEXOFFICE</span><b>Cada atividade traz opções.</b><p>Risco, recorrência, margem, relacionamento e estoque já deixam a próxima ação à mão.</p></article>
        </div>
      </section>

      <section className="mkAiSection" id="ia">
        <div className="mkAiIntro"><p className="mkEyebrow">UMA EQUIPE QUE CONHECE O MESMO NEGÓCIO</p><h2>IA sem contexto vira chat.<br/>Aqui ela trabalha sobre a operação.</h2><p>Maya e os especialistas usam o contexto permitido do workspace e coordenam os motores certos sem ultrapassar suas permissões.</p><blockquote>“O que mudou? O que está em risco? O que vale fazer agora?”</blockquote></div>
        <div className="mkAgentGrid">{agents.map(([name,role,text],index)=><article key={name}><span>{index+1}</span><div><h3>{name}<small>{role}</small></h3><p>{text}</p></div></article>)}</div>
      </section>

      <section className="mkUseNew">
        <div className="mkSectionIntro"><p className="mkEyebrow">FLEXÍVEL PELO NEGÓCIO, NÃO PELO MENU</p><h2>O mesmo core. Só a complexidade que faz sentido.</h2><p>Serviço não precisa enxergar estoque. Comércio não precisa viver num CRM de consultoria. O NexOffice ativa o que agrega para cada operação.</p></div>
        <div className="mkUseNewGrid">{useCases.map(([title,text])=><article key={title}><h3>{title}</h3><p>{text}</p></article>)}</div>
      </section>

      <section className="mkControlNew" id="controle">
        <div><p className="mkEyebrow">AUTONOMIA COM GOVERNANÇA</p><h2>IA ajuda a operar.<br/>Você continua decidindo.</h2><p>O NexOffice classifica cada ação por permissão, risco e efeito externo. Rotinas internas simples podem ser preparadas; ações sensíveis seguem para o fluxo humano correto.</p></div>
        <div className="mkControlStack">
          <article><span>AUTOMATIZÁVEL</span><b>Organizar contexto e criar tarefas internas</b><p>Baixo risco, sem efeito externo.</p></article>
          <article><span>CONFIRMAÇÃO</span><b>Conciliar, ajustar estoque, ativar recorrência</b><p>Muda o estado do negócio e pede ação humana explícita.</p></article>
          <article><span>APROVAÇÃO / FLUXO DEDICADO</span><b>Enviar mensagem, emitir nota, enviar pedido, movimentar dinheiro</b><p>Efeito externo nunca entra escondido numa “automação inteligente”.</p></article>
        </div>
      </section>

      <section className="mkPricingNew" id="preco">
        <div><p className="mkEyebrow">COMECE PEQUENO. CRESÇA SEM TROCAR DE SISTEMA.</p><h2>Um lugar para operar o negócio inteiro.</h2><p>Comece com CRM, agenda, financeiro e equipe digital. Catálogo, rentabilidade, recorrência, relacionamento, conciliação e operação crescem junto com o uso.</p></div>
        <article><small>NEXOFFICE PRO</small><div className="mkPrice"><b>R$ 197</b><span>/ mês</span></div><ul><li>CRM, agenda e financeiro operacional</li><li>Catálogo, rentabilidade e recorrência</li><li>Relacionamento & renovação inteligente</li><li>Conciliação de CSV/OFX</li><li>Operação Comercial 360</li><li>Estoque & Compras Lite quando necessário</li><li>Documentos, Materiais e equipe de IA</li><li>Governança e aprovações</li></ul><button className="mkPrimary mkBig" onClick={enter}>Criar meu NexOffice grátis</button><p>7 dias · sem cartão no trial.</p></article>
      </section>

      <section className="mkFinalNew">
        <p className="mkEyebrow">NEXOFFICE</p>
        <h2>Um sistema. Uma memória do negócio.<br/><em>Vários especialistas trabalhando juntos.</em></h2>
        <p>Do primeiro cliente ao próximo ciclo, com contexto, inteligência e as melhores opções sempre à mão.</p>
        <button className="mkPrimary mkBig" onClick={enter}>Criar meu NexOffice grátis</button>
      </section>
    </main>
    <footer className="mkFooter"><b>NexOffice</b><span>O sistema operacional do seu negócio.</span><span>Você decide. O NexOffice ajuda a fazer acontecer.</span></footer>
  </div>;
}
