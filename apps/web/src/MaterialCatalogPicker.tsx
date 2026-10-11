type CatalogItem={
  id:string;
  kind:'product'|'service';
  name:string;
  description?:string|null;
  unit:string;
  price_minor:number|string;
  billing_cycle:string;
};

const money=(minor:any=0)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:2}).format(Number(minor||0)/100);

export default function MaterialCatalogPicker({items,value,onChange}:{items:CatalogItem[];value:string;onChange:(item:CatalogItem|null)=>void}){
  if(!items.length)return null;
  const selected=items.find(item=>item.id===value)||null;
  return <div className="materialsClient">
    <label><span>Oferta do catálogo (opcional)</span>
      <select value={value} onChange={e=>onChange(items.find(item=>item.id===e.target.value)||null)}>
        <option value="">Sem oferta vinculada</option>
        {items.map(item=><option key={item.id} value={item.id}>{item.name} · {money(item.price_minor)} / {item.unit}</option>)}
      </select>
    </label>
    {selected&&<small>{selected.kind==='service'?'Serviço':'Produto'} do Catálogo do Negócio. Descrição e valor podem ser ajustados antes de gerar.</small>}
  </div>;
}
