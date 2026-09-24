import {useEffect,useState} from 'react';
import ComplianceCenter from './ComplianceCenter';
import {session} from './api';
import './compliance-dock.css';

export default function ComplianceDock(){
  const [open,setOpen]=useState(false);const [visible,setVisible]=useState(Boolean(session.token()));
  useEffect(()=>{const sync=()=>setVisible(Boolean(session.token()));window.addEventListener('storage',sync);const id=window.setInterval(sync,1500);return()=>{window.removeEventListener('storage',sync);window.clearInterval(id)}},[]);
  if(!visible)return null;
  return <>
    <button className="compliance-dock-launcher" onClick={()=>setOpen(true)} aria-label="Abrir Compliance"><span>✓</span><b>Compliance</b></button>
    {open&&<div className="compliance-dock-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
      <div className="compliance-dock-sheet"><div className="compliance-dock-head"><div><small>NEXOFFICE</small><b>Compliance & Proteção da Empresa</b></div><button onClick={()=>setOpen(false)} aria-label="Fechar">×</button></div><div className="compliance-dock-body"><ComplianceCenter/></div></div>
    </div>}
  </>;
}
