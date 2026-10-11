import {useEffect,useState,type FormEvent} from 'react';
import {api,post,session} from './api';
import './business-catalog-panel.css';

export type CatalogItem={
  id:string;
  kind:'product'|'service';
  name:string;
  description?:string|null;
  sku?:string|null;
  unit:string;
  price_minor:number|string;
  cost_minor?:number|string|null;
  currency:string;
  billing_cycle:'one_time'|'weekly'|'monthly'|'quarterly'|'yearly'|'custom';
  fiscal_code?:string|null;
  nbs?:string|null;
  active:boolean;
};

const money=(minor:any=0)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(minor||0)/100);
const cycle:Record<string,string>={one_time:'Cobrança única',weekly:'Semanal',monthly:'Mensal',quarterly:'Trimestral',yearly:'Anual',custom:'Personalizada'};

export default function BusinessCatalogPanel({open,onClose,onUse}:{open:boolean;onClose:()=>void;onUse:(item:CatalogItem)=>void}){
  const[items,setItems]=useState<CatalogItem[]>([]);
  const[busy,setBusy]=useState('');
  const[error,setError]=useState('');
  const[notice,setNotice]=useState('');

  useEffect(()=>{if(open&&session.token()&&session.workspace())void load()},[open]);

  async function load(){
    setError('');
    try{setItems(await api<CatalogItem[]>('/v1/catalog/items'))}
    catch(e:any){setError(e?.message||'Não foi possível carregar o catálogo.')}
  }

  async function createItem(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const form=e.currentTarget,f=new FormData(form),cost=String(f.get('cost')||'').trim(),nbs=String(f.get('nbs')||'').replace(/\D/g,'');
    setBusy('create');setError('');setNotice('');
    try{
      await post('/v1/catalog/items',{
        kind:String(f.get('kind')||'service'),
        name:String(f.get('name')||'').trim(),
        description:String(f.get('description')||'').trim()||null,
        sku:String(f.get('sku')||'').trim()||null,
        unit:String(f.get('unit')||'unidade').trim(),
        priceMinor:Math.round(Number(f.get('price')||0)*100),
        costMinor:cost?Math.round(Number(cost)*100):null,
        currency:'BRL',
        billingCycle:String(f.get('billingCycle')||'one_time'),
        fiscalCode:String(f.get('fiscalCode')||'').trim()||null,
        nbs:nbs.length===9?nbs:null
      });
      form.reset();setNotice('Item salvo no Catálogo do Negócio.');await load();
    }catch(e:any){setError(e?.message||'Não foi possível salvar o item.')}
    finally{setBusy('')}
  }

  async function archive(id:string){
    setBusy('archive:'+id);setError('');setNotice('');
    try{
      await api('/v1/catalog/items/'+encodeURIComponent(id),{method:'DELETE'});
      setNotice('Item arquivado. Operações antigas continuam preservadas.');await load();
    }catch(e:any){setError(e?.message||'Não foi possível arquivar o item.')}
    finally{setBusy('')}
  }

  if(!open)return null;
  return <section className="businessCatalogPanel">
    <div className="businessCatalogHead"><div><small>CATÁLOGO DO NEGÓCIO</small><b>O que você vende, pronto para reutilizar.</b><span>Cadastre uma vez e leve descrição, preço e referência fiscal para a operação comercial.</span></div><button onClick={onClose}>×</button></div>
    {error&&<div className="businessCatalogError">{error}</div>}
    {notice&&<div className="businessCatalogNotice">{notice}</div>}
    <form className="businessCatalogForm" onSubmit={createItem}>
      <div className="businessCatalogTwo"><label>Tipo<select name="kind" defaultValue="service"><option value="service">Serviço</option><option value="product">Produto</option></select></label><label>Recorrência<select name="billingCycle" defaultValue="one_time"><option value="one_time">Cobrança única</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option><option value="quarterly">Trimestral</option><option value="yearly">Anual</option><option value="custom">Personalizada</option></select></label></div>
      <label>Nome<input name="name" placeholder="Ex.: Gestão de tráfego mensal" required/></label>
      <label>Descrição<textarea name="description" placeholder="Escopo curto que poderá ser reaproveitado em proposta, operação e cobrança."/></label>
      <div className="businessCatalogTwo"><label>Código interno<input name="sku" placeholder="Opcional"/></label><label>Unidade<input name="unit" defaultValue="unidade" placeholder="hora, mês, projeto..."/></label></div>
      <div className="businessCatalogTwo"><label>Preço de venda<input name="price" type="number" min="0" step="0.01" placeholder="R$" required/></label><label>Custo estimado<input name="cost" type="number" min="0" step="0.01" placeholder="Opcional"/></label></div>
      <div className="businessCatalogTwo"><label>Código fiscal/serviço<input name="fiscalCode" placeholder="Opcional"/></label><label>NBS<input name="nbs" inputMode="numeric" pattern="\d{9}" maxLength={9} placeholder="9 dígitos · opcional"/></label></div>
      <button className="businessCatalogPrimary" disabled={busy==='create'}>{busy==='create'?'Salvando…':'Salvar no catálogo'}</button>
    </form>
    <div className="businessCatalogList">{items.length?items.map(item=><article key={item.id}>
      <div className="businessCatalogItemMain"><span>{item.kind==='service'?'Serviço':'Produto'} · {cycle[item.billing_cycle]||item.billing_cycle}</span><b>{item.name}</b><small>{item.description||item.sku||'Sem descrição adicional'}</small></div>
      <div className="businessCatalogPrice"><b>{money(item.price_minor)}</b><small>por {item.unit}</small></div>
      <div className="businessCatalogActions"><button className="businessCatalogPrimary" onClick={()=>onUse(item)}>Usar na operação</button><button onClick={()=>void archive(item.id)} disabled={busy==='archive:'+item.id}>Arquivar</button></div>
    </article>):<div className="businessCatalogEmpty">Seu catálogo ainda está vazio. Cadastre o primeiro produto ou serviço acima.</div>}</div>
  </section>;
}
