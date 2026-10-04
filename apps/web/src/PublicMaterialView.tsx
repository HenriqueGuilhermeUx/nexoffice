import {useEffect,useState} from 'react';
import {api} from './api';
import './public-material.css';

type Slide={kicker?:string;title:string;subtitle?:string;bullets?:string[];cta?:string};
type Payload={kind:string;theme:'executive'|'bold'|'light';title:string;subtitle?:string;content:{title:string;subtitle?:string;slides:Slide[]};workspace_name:string;published_at?:string};
const palettes={executive:{bg:'#07111f',text:'#f8fbff',muted:'#a9b8ca',accent:'#55e6c1',soft:'#17314f'},bold:{bg:'#180f2b',text:'#fff8ff',muted:'#c7b7de',accent:'#a987ff',soft:'#3b2261'},light:{bg:'#f3f7fb',text:'#112338',muted:'#5c6d80',accent:'#1769ff',soft:'#dfeaf7'}};

export default function PublicMaterialView({token}:{token:string}){
  const[data,setData]=useState<Payload|null>(null);const[index,setIndex]=useState(0);const[error,setError]=useState('');
  useEffect(()=>{api<Payload>(`/v1/public/materials/${encodeURIComponent(token)}`).then(setData).catch(e=>setError(e?.message||'Apresentação indisponível.'))},[token]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(!data)return;if(['ArrowRight','PageDown',' '].includes(e.key)){e.preventDefault();setIndex(i=>Math.min(data.content.slides.length-1,i+1))}if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();setIndex(i=>Math.max(0,i-1))}if(e.key==='Home')setIndex(0);if(e.key==='End')setIndex(data.content.slides.length-1)};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[data]);
  if(error)return <main className="publicMaterialState"><div><b>NexOffice</b><h1>Material indisponível</h1><p>{error}</p></div></main>;
  if(!data)return <main className="publicMaterialState"><div><b>NexOffice</b><h1>Carregando apresentação…</h1></div></main>;
  const palette=palettes[data.theme]||palettes.executive,slides=data.content?.slides||[],slide=slides[index];
  if(!slide)return <main className="publicMaterialState"><div><b>NexOffice</b><h1>Este material está vazio.</h1></div></main>;
  return <main className="publicMaterialShell" style={{background:palette.bg,color:palette.text}}>
    <header className="publicMaterialTop"><div><strong>{data.workspace_name}</strong><span>{data.title}</span></div><div><span>{index+1} / {slides.length}</span><button onClick={()=>document.documentElement.requestFullscreen?.()}>Tela cheia</button></div></header>
    <section className="publicMaterialStage">
      <article className="publicMaterialSlide" style={{borderLeftColor:palette.accent}}>
        <small style={{color:palette.accent}}>{String(slide.kicker||data.kind||'APRESENTAÇÃO').toUpperCase()}</small>
        <h1>{slide.title}</h1>
        {slide.subtitle&&<h2 style={{color:palette.muted}}>{slide.subtitle}</h2>}
        {slide.bullets?.length?<ul>{slide.bullets.map((b,i)=><li key={i}>{b}</li>)}</ul>:null}
        {slide.cta&&<div className="publicMaterialCta" style={{background:palette.soft}}>{slide.cta}</div>}
        <footer style={{color:palette.muted}}><span>{data.workspace_name}</span><em style={{color:palette.accent}}>{String(index+1).padStart(2,'0')}</em></footer>
      </article>
    </section>
    <nav className="publicMaterialNav"><button onClick={()=>setIndex(i=>Math.max(0,i-1))} disabled={index===0}>← Anterior</button><div>{slides.map((_,i)=><button key={i} aria-label={`Ir para slide ${i+1}`} className={i===index?'active':''} onClick={()=>setIndex(i)} style={i===index?{background:palette.accent}:undefined}/>)}</div><button onClick={()=>setIndex(i=>Math.min(slides.length-1,i+1))} disabled={index===slides.length-1}>Próximo →</button></nav>
  </main>
}
