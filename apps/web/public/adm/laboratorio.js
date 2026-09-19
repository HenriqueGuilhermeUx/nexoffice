const API=location.hostname==='localhost'?'http://localhost:4000':'https://api.nexoffices.com.br';
const TOKEN='nexoffice.token';
const lab=document.getElementById('lab');
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmt=v=>v===null||v===undefined||v===''?'—':String(v);
const pct=v=>v===null||v===undefined?'—':`${Number(v).toFixed(1)}%`;
const date=v=>v?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v)):'—';
const sectorLabel=v=>({general:'Geral',services:'Serviços',professional_services:'Serviços profissionais',health:'Saúde',beauty:'Beleza',commerce:'Comércio',restaurant:'Alimentação',education:'Educação',automotive:'Automotivo',real_estate:'Imobiliário',creator:'Criadores'}[v]||v||'Geral');
const verdictLabel=v=>({confirmed:'Confirmado',partial:'Parcial',not_confirmed:'Não confirmado',unknown:'Indefinido'}[v]||'Não revisado');

async function call(path,{method='GET',body}={}){const token=localStorage.getItem(TOKEN);if(!token)throw Object.assign(new Error('Faça login primeiro na Central de Inteligência.'),{status:401});const r=await fetch(API+path,{method,headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:body===undefined?undefined:JSON.stringify(body)});const payload=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(payload.message||payload.error||`HTTP ${r.status}`),{status:r.status});return payload}

function kpi(label,value,hint=''){return `<article class="labCard"><small>${esc(label)}</small><b>${esc(value)}</b><span class="muted">${esc(hint)}</span></article>`}
function rate(confirmed,partial,reviewed){if(!reviewed)return'—';return `${(((Number(confirmed||0)+Number(partial||0)*.5)/Number(reviewed))*100).toFixed(1)}%`}

async function boot(){
  try{await call('/v1/admin/intelligence/me');await load()}catch(e){if(e.status===401||e.status===403||e.status===503){lab.innerHTML=`<div class="login"><div class="loginCard"><small>NEXOFFICE · USO INTERNO</small><h1>Laboratório de Inteligência</h1><p class="muted">${esc(e.message)}</p><a class="btn primary" href="/adm/">Entrar pela Central de Inteligência</a></div></div>`;return}lab.innerHTML=`<div class="error">${esc(e.message)}</div>`}
}

async function load(){
  lab.innerHTML='<div class="loading">Atualizando laboratório…</div>';
  try{const d=await call('/v1/admin/intelligence/lab');render(d)}catch(e){lab.innerHTML=`<div class="error">${esc(e.message)}</div>`}
}

function render(d){const s=d.summary||{},rules=d.rules||[],sectors=d.sectors||[],pending=d.pendingSignals||[],outcomes=d.recentOutcomes||[];
  lab.innerHTML=`
    <div class="labTop"><div><small>NEXOFFICE · USO INTERNO</small><h1>Laboratório de Inteligência</h1><p>Meça quais sinais ajudam de verdade, quais precisam ser ajustados e em quanto tempo antecipam problemas.</p></div><div class="labActions"><button class="btn" id="reload">Atualizar</button><a class="labHeaderLink" href="/adm/">← Central de Inteligência</a></div></div>
    <div class="warn"><b>Regra do laboratório</b><div class="muted">Não chamamos um alerta de “bom” só porque parece plausível. Registramos o que aconteceu depois e medimos o resultado.</div></div>
    <div class="labGrid">
      ${kpi('Sinais em 90 dias',s.signals_90||0,'eventos para acompanhar')}
      ${kpi('Resultados registrados',s.outcomes_90||0,'observações reais')}
      ${kpi('Cobertura de validação',pct(s.validation_coverage_pct),'sinais com resultado')}
      ${kpi('Taxa de confirmação',pct(s.confirmation_rate_pct),'confirmado + parcial ponderado')}
      ${kpi('Antecedência média',s.avg_lead_days===null||s.avg_lead_days===undefined?'—':`${s.avg_lead_days} dias`,'entre sinal e resultado')}
    </div>

    <section class="section"><div class="sectionHead"><div><h2>Sinais aguardando validação</h2><p>Alertas com pelo menos 7 dias e ainda sem resultado ligado.</p></div><span class="tag">${pending.length} pendentes</span></div>
      ${pending.length?`<div class="tableWrap"><table class="table"><thead><tr><th>Empresa</th><th>Regra</th><th>Sinal</th><th>Severidade</th><th>Data</th><th>O que ocorreu?</th></tr></thead><tbody>${pending.map(x=>`<tr><td><b>${esc(x.company)}</b></td><td>${esc(x.rule_code||x.code)}${x.rule_version?` · v${x.rule_version}`:''}</td><td><b>${esc(x.title)}</b><br><small>${esc(x.message)}</small></td><td>${esc(x.severity)}</td><td>${date(x.created_at)}</td><td><div class="labActions"><button class="vbtn ok" data-validate="confirmed" data-signal="${x.signal_id}" data-workspace="${x.workspace_id}" data-snapshot="${x.snapshot_id||''}" data-code="${esc(x.rule_code||x.code)}" data-version="${x.rule_version||''}">Confirmou</button><button class="vbtn partial" data-validate="partial" data-signal="${x.signal_id}" data-workspace="${x.workspace_id}" data-snapshot="${x.snapshot_id||''}" data-code="${esc(x.rule_code||x.code)}" data-version="${x.rule_version||''}">Parcial</button><button class="vbtn no" data-validate="not_confirmed" data-signal="${x.signal_id}" data-workspace="${x.workspace_id}" data-snapshot="${x.snapshot_id||''}" data-code="${esc(x.rule_code||x.code)}" data-version="${x.rule_version||''}">Não confirmou</button></div></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty card">Nenhum sinal antigo aguardando validação.</div>'}
    </section>

    <section class="section"><div class="sectionHead"><div><h2>Desempenho das regras</h2><p>Cada versão é preservada. Assim conseguimos comparar antes de substituir uma regra.</p></div></div>
      <div class="tableWrap"><table class="table"><thead><tr><th>Regra</th><th>Setor</th><th>Dimensão</th><th>Disparos</th><th>Revisados</th><th>Confirmados</th><th>Parciais</th><th>Não confirmados</th><th>Taxa</th><th>Antecedência</th></tr></thead><tbody>${rules.map(r=>`<tr><td><b>${esc(r.title)}</b><br><small>${esc(r.code)} · v${r.version}${r.active?' · ativa':''}</small></td><td>${esc(sectorLabel(r.sector))}</td><td>${esc(r.dimension)}</td><td>${r.fired_90||0}</td><td>${r.reviewed_90||0}</td><td>${r.confirmed_90||0}</td><td>${r.partial_90||0}</td><td>${r.not_confirmed_90||0}</td><td><b>${rate(r.confirmed_90,r.partial_90,r.reviewed_90)}</b></td><td>${r.avg_lead_days===null||r.avg_lead_days===undefined?'—':`${r.avg_lead_days} d`}</td></tr>`).join('')}</tbody></table></div>
    </section>

    <section class="section"><div class="sectionHead"><div><h2>Leitura por setor</h2><p>Onde estamos acumulando mais sinais e resultados reais.</p></div></div>
      <div class="tableWrap"><table class="table"><thead><tr><th>Setor</th><th>Empresas</th><th>Sinais</th><th>Resultados</th><th>Confirmados</th><th>Não confirmados</th></tr></thead><tbody>${sectors.map(x=>`<tr><td><b>${esc(sectorLabel(x.sector))}</b></td><td>${x.companies||0}</td><td>${x.signals_90||0}</td><td>${x.outcomes_90||0}</td><td>${x.confirmed_90||0}</td><td>${x.not_confirmed_90||0}</td></tr>`).join('')}</tbody></table></div>
    </section>

    <section class="section"><div class="sectionHead"><div><h2>Resultados recentes</h2><p>Histórico usado para revisar o comportamento do motor.</p></div></div>
      ${outcomes.length?`<div class="tableWrap"><table class="table"><thead><tr><th>Empresa</th><th>Sinal</th><th>Resultado</th><th>Veredito</th><th>Impacto</th><th>Data</th></tr></thead><tbody>${outcomes.map(o=>`<tr><td><b>${esc(o.company)}</b></td><td>${esc(o.signal_title||o.signal_code||'Sem sinal ligado')}${o.rule_version?`<br><small>${esc(o.rule_code)} · v${o.rule_version}</small>`:''}</td><td>${esc(o.outcome_type)}<br><small>${esc(o.notes||'')}</small></td><td>${esc(verdictLabel(o.verdict))}</td><td>${fmt(o.impact_score)}</td><td>${date(o.occurred_at)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty card">Ainda não há resultados observados.</div>'}
    </section>`;
  document.getElementById('reload').onclick=load;
  document.querySelectorAll('[data-validate]').forEach(btn=>btn.onclick=()=>validateSignal(btn));
}

async function validateSignal(btn){
  const verdict=btn.dataset.validate,workspaceId=btn.dataset.workspace,signalId=btn.dataset.signal,snapshotId=btn.dataset.snapshot||null,ruleCode=btn.dataset.code||null,ruleVersion=btn.dataset.version||null;
  btn.disabled=true;
  try{
    const outcome=await call(`/v1/admin/intelligence/companies/${workspaceId}/outcomes`,{method:'POST',body:{snapshotId,signalId,outcomeType:'validacao_de_sinal',expected:{ruleCode,ruleVersion},observed:{verdict},notes:'Validação registrada no Laboratório de Inteligência.'}});
    await call(`/v1/admin/intelligence/outcomes/${outcome.id}/review`,{method:'PATCH',body:{verdict,impactScore:null}});
    await load();
  }catch(e){alert(e.message);btn.disabled=false}
}

boot();
