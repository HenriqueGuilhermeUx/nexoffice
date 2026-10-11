import {useEffect,useState,type FormEvent} from 'react';
import {api,patch,post,session} from './api';
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
  track_inventory?:boolean;
  reorder_point?:number|string;
  preferred_supplier_id?:string|null;
  active:boolean;
};

const money=(minor:any=0)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(minor||0)/100);
const cycle:Record<string,string>={one_time:'Cobrança única',weekly:'Semanal',monthly:'Mensal',quarterly:'Trimestral',yearly:'Anual',custom:'Personalizada'};

function formPayload(form:HTMLFormElement){
  const f=new FormData(form),cost=String(f.get('cost')||'').trim(),nbs=String(f.get('nbs')||'').replace(/\D/g,'');
  return {
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
    nbs:nbs.length===9?nbs:null,
    trackInventory:f.get('trackInventory')==='on',
    reorderPoint:Math.max(0,Number(f.get('reorderPoint')||0))
  };
}

function CatalogFields({item}:{item?:CatalogItem|null}){
  return <>
    <div className="businessCatalogTwo"><label>Tipo<select name="kind" defaultValue={item?.kind||'service'}><option value="service">Serviço</option><option value="product">Produto</option></select></label><label>Recorrência<select name="billingCycle" defaultValue={item?.billing_cycle||'one_time'}><option value="one_time">Cobrança única</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option><option value="quarterly">Trimestral</option><option value="yearly">Anual</option><option value="custom">Personalizada</option></select></label></div>
    <label>Nome<input name="name" defaultValue={item?.name||''} placeholder="Ex.: Gestão de tráfego mensal" required/></label>
    <label>Descrição<textarea name="description" defaultValue={item?.description||''} placeholder="Escopo curto que poderá ser reaproveitado em proposta, operação e cobrança."/></label>
    <div className="businessCatalogTwo"><label>Código interno<input name="sku" defaultValue={item?.sku||''} placeholder="Opcional"/></label><label>Unidade<input name="unit" defaultValue={item?.unit||'unidade'} placeholder="hora, mês, projeto..."/></label></div>
    <div className="businessCatalogTwo"><label>Preço de venda<input name="price" type="number" min="0" step="0.01" defaultValue={item?(Number(item.price_minor||0)/100).toFixed(2):''} placeholder="R$" required/></label><label>Custo estimado<input name="cost" type="number" min="0" step="0.01" defaultValue={item?.cost_minor===null||item?.cost_minor===undefined?'':(Number(item.cost_minor)/100).toFixed(2)} placeholder="Opcional"/></label></div>
    <div className="businessCatalogTwo"><label>Código fiscal/serviço<input name="fiscalCode" defaultValue={item?.fiscal_code||''} placeholder="Opcional"/></label><label>NBS<input name="nbs" inputMode="numeric" pattern="\d{9}" maxLength={9} defaultValue={item?.nbs||''} placeholder="9 dígitos · opcional"/></label></div>
    <div className="businessCatalogInventory"><label><input name="trackInventory" type="checkbox" defaultChecked={Boolean(item?.track_inventory)}/> Controlar estoque deste produto</label><label>Ponto de reposição<input name="reorderPoint" type="number" min="0" step="0.0001" defaultValue={item?.reorder_point===undefined?'0':String(item.reorder_point)} /></label><small>Use apenas para produtos físicos. Serviços continuam sem estoque.</small></div>
  </>;
}

export default function BusinessCatalogPanel({open,onClose,onUse,focusItemId=''}:{open:boolean;onClose:()=>void;onUse:(item:CatalogItem)=>void;focusItemId?:string}){
  const[items,setItems]=useState<CatalogItem[]>([]);
  const[busy,setBusy]=useState('');
  const[error,setError]=useState('');
  const[notice,setNotice]=useState('');
  const[editingId,setEditingId]=useState('');

  useEffect(()=>{if(open&&session.token()&&session.workspace())void load()},[open,focusItemId]);

  async function load(){
    setError('');
    try{
      const loaded=await api<CatalogItem[]>('/v1/catalog/items');
      setItems(loaded);
      if(focusItemId&&loaded.some(item=>item.id===focusItemId))setEditingId(focusItemId);
    }catch(e:any){setError(e?.message||'Não foi possível carregar o catálogo.')}
  }

  async function createItem(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const form=e.currentTarget;
    setBusy('create');setError('');setNotice('');
    try{
      await post('/v1/catalog/items',formPayload(form));
      form.reset();setNotice('Item salvo no Catálogo do Negócio.');await load();
    }catch(e:any){setError(e?.message||'Não foi possível salvar o item.')}
    finally{setBusy('')}
  }

  async function updateItem(e:FormEvent<HTMLFormElement>,id:string){
    e.preventDefault();const form=e.currentTarget;
    setBusy('edit:'+id);setError('');setNotice('');
    try{
      await patch('/v1/catalog/items/'+encodeURIComponent(id),formPayload(form));
      setNotice('Oferta atualizada. Novas operações usarão os novos valores; o histórico mantém seus snapshots.');
      setEditingId('');await load();
    }catch(e:any){setError(e?.message||'Não foi possível atualizar a oferta.')}
    finally{setBusy('')}
  }

  async function archive(id:string){
    setBusy('archive:'+id);setError('');setNotice('');
    try{
      await api('/v1/catalog/items/'+encodeURIComponent(id),{method:'DELETE'});
      if(editingId===id)setEditingId('');
      setNotice('Item arquivado. Operações antigas continuam preservadas.');await load();
    }catch(e:any){setError(e?.message||'Não foi possível arquivar o item.')}
    finally{setBusy('')}
  }

  if(!open)return null;
  return <section className="businessCatalogPanel">
    <div className="businessCatalogHead"><div><small>CATÁLOGO DO NEGÓCIO</small><b>O que você vende, pronto para reutilizar.</b><span>Cadastre uma vez e leve descrição, preço, custo e referência fiscal para a operação comercial.</span></div><button onClick={onClose}>×</button></div>
    {error&&<div className="businessCatalogError">{error}</div>}
    {notice&&<div className="businessCatalogNotice">{notice}</div>}
    <form className="businessCatalogForm" onSubmit={createItem}>
      <b>Nova oferta</b><CatalogFields/>
      <button className="businessCatalogPrimary" disabled={busy==='create'}>{busy==='create'?'Salvando…':'Salvar no catálogo'}</button>
    </form>
    <div className="businessCatalogList">{items.length?items.map(item=><article key={item.id} className={editingId===item.id?'editing':''}>
      <div className="businessCatalogItemMain"><span>{item.kind==='service'?'Serviço':'Produto'} · {cycle[item.billing_cycle]||item.billing_cycle}</span><b>{item.name}</b><small>{item.description||item.sku||'Sem descrição adicional'}</small>{item.kind==='product'&&item.track_inventory&&<small>Estoque controlado · reposição em {Number(item.reorder_point||0)} {item.unit}</small>}</div>
      <div className="businessCatalogPrice"><b>{money(item.price_minor)}</b><small>{item.cost_minor===null||item.cost_minor===undefined?'custo não informado':'custo '+money(item.cost_minor)} · por {item.unit}</small></div>
      <div className="businessCatalogActions"><button className="businessCatalogPrimary" onClick={()=>onUse(item)}>Usar na operação</button><button onClick={()=>setEditingId(editingId===item.id?'':item.id)}>{editingId===item.id?'Fechar edição':'Editar oferta'}</button><button onClick={()=>void archive(item.id)} disabled={busy==='archive:'+item.id}>Arquivar</button></div>
      {editingId===item.id&&<form className="businessCatalogEditForm" onSubmit={e=>void updateItem(e,item.id)}><b>Ajustar oferta</b><CatalogFields item={item}/><div className="businessCatalogEditActions"><button type="button" onClick={()=>setEditingId('')}>Cancelar</button><button className="businessCatalogPrimary" disabled={busy==='edit:'+item.id}>{busy==='edit:'+item.id?'Salvando…':'Salvar alterações'}</button></div></form>}
    </article>):<div className="businessCatalogEmpty">Seu catálogo ainda está vazio. Cadastre o primeiro produto ou serviço acima.</div>}</div>
  </section>;
}
