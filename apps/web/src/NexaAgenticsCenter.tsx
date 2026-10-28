import {useCallback,useEffect,useState} from 'react';

type Pane='assistant'|'missions'|'alerts';
type Mission={id:string;title:string;description:string;status:'draft'|'cancelled';created_at:string};
const API=(import.meta as any).env?.VITE_PERSONAL_SINGLE_ORIGIN==='true'?'':((import.meta as any).env?.VITE_API_URL||'http://localhost:4000');

export default function NexaAgenticsCenter({token,onOpenMaya}:{token:string;onOpenMaya:()=>void}){
  const [pane,setPane]=useState<Pane>('assistant');
  const [missions,setMissions]=useState<Mission[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [title,setTitle]=useState('');
  const [description,setDescription]=useState('');
  const [saving,setSaving]=useState(false);
  const [status,setStatus]=useState<{missionCreationEnabled:boolean;missionMonitoringEnabled:boolean;alertsEnabled:boolean}|null>(null);
  const refresh=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const response=await fetch(API+'/v1/personal/agentics/missions',{headers:{authorization:'Bearer '+token}});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.message||'Não foi possível consultar suas missões.');
      setMissions(Array.isArray(body.missions)?body.missions:[]);
    }catch(e){setError(e instanceof Error?e.message:'Falha ao consultar missões.');}
    finally{setLoading(false);}
  },[token]);
  useEffect(()=>{
    void refresh();
    void fetch(API+'/v1/personal/agentics/status',{headers:{authorization:'Bearer '+token}})
      .then(async response=>{if(!response.ok)throw new Error('status unavailable');return response.json();})
      .then(body=>setStatus(body))
      .catch(()=>setStatus(null));
  },[refresh,token]);
  async function createMission(event:import('react').FormEvent<HTMLFormElement>){
    event.preventDefault();setError('');setNotice('');setSaving(true);
    try{
      const response=await fetch(API+'/v1/personal/agentics/missions',{
        method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
        body:JSON.stringify({title:title.trim(),description:description.trim()})
      });
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.message||'Não foi possível salvar a missão.');
      setTitle('');setDescription('');setNotice('Rascunho salvo. Nenhuma execução foi iniciada.');
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar.');}
    finally{setSaving(false);}
  }
  async function cancel(id:string){
    setError('');setNotice('');
    try{
      const response=await fetch(API+'/v1/personal/agentics/missions/'+encodeURIComponent(id)+'/cancel',{method:'POST',headers:{authorization:'Bearer '+token}});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.message||'Não foi possível cancelar.');
      setNotice('Missão cancelada.');await refresh();
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível cancelar.');}
  }
  return <section className="np-panel" aria-label="Nexa IA e Missões">
    <div className="np-panel-head"><div><span className="np-kicker">NEXA AGENTICS</span><h2>Sua Nexa IA, suas missões</h2>
      <p>A Maya coordena os especialistas. Missões automáticas e pesquisas externas ainda não estão habilitadas.</p></div>
      <span className="np-pill">{status?.missionMonitoringEnabled?'Monitoramento habilitado':'Em preparação'}</span></div>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
      {([['assistant','Nexa IA'],['missions','Minhas missões'],['alerts','Alertas']] as const).map(([key,label])=>
        <button key={key} type="button" className={pane===key?'np-primary':'np-text-button'} aria-pressed={pane===key} onClick={()=>setPane(key)}>{label}</button>)}
    </div>
    {error&&<p role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {pane==='assistant'&&<div className="np-empty"><h3>Converse com a Maya</h3><p>A Maya já coordena os especialistas da Nexa. Pesquisas externas e missões automáticas ainda não estão habilitadas.</p><button type="button" className="np-primary" onClick={onOpenMaya}>Abrir Maya · Coordenadora</button></div>}
    {pane==='missions'&&<div className="np-empty"><h3>Minhas missões</h3><p>Rascunhos registrados, sem execução automática ou efeitos financeiros.</p>
      {status?.missionCreationEnabled&&<form onSubmit={e=>void createMission(e)}><label>Título da missão<input required maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Descrição<textarea maxLength={1000} value={description} onChange={e=>setDescription(e.target.value)}/></label><button type="submit" disabled={saving||!title.trim()}>{saving?'Salvando…':'Salvar rascunho'}</button></form>}<button type="button" onClick={()=>void refresh()} disabled={loading}>{loading?'Atualizando…':'Atualizar'}</button>
      {!loading&&missions.length===0&&!error&&<p>Nenhuma missão registrada.</p>}
      {missions.map(m=><div key={m.id} className="np-line"><span><strong>{m.title}</strong><small>{m.description||'Sem descrição'} · {m.status==='cancelled'?'Cancelada':'Rascunho'}</small></span>
        {m.status==='draft'&&<button type="button" onClick={()=>void cancel(m.id)}>Cancelar</button>}</div>)}
      {!status?.missionCreationEnabled&&<p>Novas missões dependem da verificação Premium no servidor.</p>}</div>}
    {pane==='alerts'&&<div className="np-empty"><h3>Sem alertas ativos</h3><p>Monitoramento automático e notificações não estão habilitados. Nenhuma fonte externa está sendo consultada.</p></div>}
  </section>;
}
