import {useEffect,useState} from 'react';
import {session} from './api';
import InvestmentCenter from './InvestmentCenter';

export default function InvestmentDock(){
  const [sessionKey,setSessionKey]=useState(()=>`${session.token()}|${session.workspace()}`);
  const [open,setOpen]=useState(false);
  useEffect(()=>{const timer=setInterval(()=>{const next=`${session.token()}|${session.workspace()}`;setSessionKey(prev=>prev===next?prev:next)},700);return()=>clearInterval(timer)},[]);
  const workspaceId=session.workspace();
  const authenticated=Boolean(session.token()&&workspaceId);
  useEffect(()=>{if(!authenticated)setOpen(false)},[sessionKey,authenticated]);
  if(!authenticated)return null;
  return <>
    <button className="investmentLauncher" onClick={()=>setOpen(true)}>↗ <span>Investimentos & Mercados</span></button>
    {open&&<div className="investmentBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><section className="investmentShell"><header className="investmentShellHeader"><div><small>NEXOFFICE · F-INSIGHT</small><h2>Investimentos & Mercados</h2><p>Inteligência especializada, separada do caixa operacional da empresa.</p></div><button className="investmentClose" onClick={()=>setOpen(false)}>×</button></header><div className="investmentShellBody"><InvestmentCenter workspaceId={workspaceId}/></div></section></div>}
  </>;
}
