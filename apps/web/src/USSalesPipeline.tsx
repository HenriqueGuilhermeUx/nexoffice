import { useMemo, useState, type FormEvent } from 'react';
import './USSalesPipeline.css';
import { useUSActivity } from './USSharedActivity';

type Stage = 'New' | 'Qualified' | 'Proposal' | 'Won';
type Opportunity = { id: number; name: string; company: string; stage: Stage };
const stages: Stage[] = ['New', 'Qualified', 'Proposal', 'Won'];
const samples: Opportunity[] = [
  { id: 1, name: 'Sample website inquiry', company: 'Example Studio', stage: 'New' },
  { id: 2, name: 'Sample service consultation', company: 'Fictional Bakery', stage: 'Qualified' },
  { id: 3, name: 'Sample marketing proposal', company: 'Demo Retail', stage: 'Proposal' },
];

/** Illustrative US sales pipeline. No CRM writes, accounts, API calls or persistent data. */
export default function USSalesPipeline() {
  const [items, setItems] = useState<Opportunity[]>(samples);
  const [filter, setFilter] = useState<Stage | 'All'>('All');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [message, setMessage] = useState('');
  const { publish } = useUSActivity();

  const visible = useMemo(() => items.filter(item => filter === 'All' || item.stage === filter), [filter, items]);
  const counts = Object.fromEntries(stages.map(stage => [stage, items.filter(item => item.stage === stage).length])) as Record<Stage, number>;

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !company.trim()) return;
    setItems(current => [...current, { id: Math.max(0, ...current.map(item => item.id)) + 1, name: name.trim(), company: company.trim(), stage: 'New' }]);
    publish({ source: 'CRM', title: name.trim(), action: 'Fictional opportunity opened for ' + company.trim() });
    setName('');
    setCompany('');
    setMessage('Sample opportunity added locally. No customer record was created.');
    setFilter('All');
  }

  return <section className="avsp" aria-label="NexOffices USA sample CRM pipeline" id="sample-crm">
    <div className="avsp-head">
      <p className="avus-eyebrow">CRM & opportunity pipeline · Interactive sample</p>
      <h2>Keep every next step visible.</h2>
      <p>Try a fictional US sales pipeline, organize opportunities and move them through review stages. Do not enter real customer information: all changes exist only in this browser session.</p>
    </div>
    <div className="avsp-stats" aria-label="Sample CRM pipeline counts">
      {stages.map(stage => <article key={stage}><span>{stage}</span><strong>{counts[stage]}</strong></article>)}
    </div>
    <div className="avsp-panel">
      <div className="avsp-left">
        <div className="avsp-toolbar">
          <h3>Sample opportunities</h3>
          <label htmlFor="avsp-filter">Filter stage
            <select id="avsp-filter" value={filter} onChange={event => setFilter(event.target.value as Stage | 'All')}>
              <option>All</option>{stages.map(stage => <option key={stage}>{stage}</option>)}
            </select>
          </label>
        </div>
        <div className="avsp-list">
          {visible.length ? visible.map(item => <article key={item.id}>
            <div><strong>{item.name}</strong><small>{item.company}</small></div>
            <label>Opportunity stage
              <select aria-label={item.name + ' stage'} value={item.stage}
                onChange={event => { const stage = event.target.value as Stage; setItems(current => current.map(row => row.id === item.id ? {...row, stage} : row)); publish({ source: 'CRM', title: item.name, action: 'Fictional pipeline stage: ' + stage }); }}>
                {stages.map(stage => <option key={stage}>{stage}</option>)}
              </select>
            </label>
          </article>) : <p>No example opportunities at this stage.</p>}
        </div>
      </div>
      <form className="avsp-form" onSubmit={create}>
        <h3>Add a fictional opportunity</h3>
        <label>Opportunity title<input maxLength={90} placeholder="Sample partnership inquiry" value={name} required onChange={event => setName(event.target.value)}/></label>
        <label>Fictional organization<input maxLength={75} placeholder="Example Co." value={company} required onChange={event => setCompany(event.target.value)}/></label>
        <button type="submit">Add sample opportunity</button>
        <button type="button" className="avsp-reset" onClick={() => { setItems(samples); setFilter('All'); setName(''); setCompany(''); setMessage('Sample pipeline restored.'); }}>Reset pipeline</button>
        <p role="status">{message || 'No customer or commercial information is saved or transmitted.'}</p>
      </form>
    </div>
    <p className="avsp-disclaimer">Local prototype only. No sales outreach, payment links, financial products, analytics or account access are enabled.</p>
  </section>;
}
