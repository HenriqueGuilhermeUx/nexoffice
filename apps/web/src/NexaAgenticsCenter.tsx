import {useState} from 'react';

type Pane='assistant'|'missions'|'alerts';
/** UX shell only: never pretend research, monitoring or payments are active. */
export default function NexaAgenticsCenter(){
  const [pane,setPane]=useState<Pane>('assistant');
  return <section className="np-panel" aria-label="Nexa IA e Missões">
    <div className="np-panel-head"><div><span className="np-kicker">NEXA AGENTICS</span><h2>Sua Nexa IA, suas missões</h2>
      <p>Uma única assistente para conversar, pesquisar e acompanhar tarefas quando as integrações estiverem disponíveis.</p></div>
      <span className="np-pill">Em preparação</span></div>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
      {([['assistant','Nexa IA'],['missions','Minhas missões'],['alerts','Alertas']] as const).map(([key,label])=>
        <button key={key} type="button" className={pane===key?'np-primary':'np-text-button'} aria-pressed={pane===key} onClick={()=>setPane(key)}>{label}</button>)}
    </div>
    {pane==='assistant'&&<div className="np-empty"><h3>Converse com a Maya</h3><p>A Maya já coordena os especialistas da Nexa. Continue usando a área Maya para conversar. Pesquisas externas e missões automáticas ainda não estão habilitadas.</p><p>Não envie instruções de pagamento por esta área.</p></div>}
    {pane==='missions'&&<div className="np-empty"><h3>Nenhuma missão ativa</h3><p>Suas futuras missões terão prazo, fonte de informação, status, opção de cancelar e histórico. O monitoramento automático ainda não está disponível.</p></div>}
    {pane==='alerts'&&<div className="np-empty"><h3>Sem alertas</h3><p>Os alertas só aparecerão após a ativação de fontes verificadas e o seu consentimento. Não existem monitoramentos em execução nesta tela.</p></div>}
  </section>;
}
