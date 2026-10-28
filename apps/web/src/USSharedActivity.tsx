import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import './USSharedActivity.css';

export type ActivitySource = 'Tasks' | 'CRM' | 'Documents';
type NewActivity = { source: ActivitySource; title: string; action: string };
type Activity = NewActivity & { id: number };
type ActivityContext = { entries: Activity[]; publish: (event: NewActivity) => void; clear: () => void };
const context = createContext<ActivityContext | null>(null);
const suggestedNext: Record<ActivitySource, string> = {
  Tasks: 'Review the example owner and update the task stage.',
  CRM: 'Review the fictional buyer journey and next contact step.',
  Documents: 'Confirm the sample reviewer and draft status.',
};

/** Shared, volatile React-only event bus. Never writes to any API, browser storage or external system. */
export function USActivityProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Activity[]>([]);
  const nextId = useRef(1);
  const publish = useCallback((event: NewActivity) => {
    setEntries(previous => [{ ...event, id: nextId.current++ }, ...previous].slice(0, 20));
  }, []);
  const clear = useCallback(() => { setEntries([]); nextId.current = 1; }, []);
  const value = useMemo(() => ({ entries, publish, clear }), [entries, publish, clear]);
  return <context.Provider value={value}>{children}</context.Provider>;
}

export function useUSActivity() {
  const value = useContext(context);
  if (!value) throw new Error('USActivityProvider required inside the USA preview');
  return value;
}

export function USActivityCenter() {
  const { entries, clear } = useUSActivity();
  const [filter, setFilter] = useState<ActivitySource | 'All'>('All');
  const filtered = entries.filter(item => filter === 'All' || item.source === filter);
  const sources = new Set(entries.map(item => item.source)).size;

  function resetActivity() { clear(); setFilter('All'); }
  return <section className="avhub" id="sample-activity" aria-label="NexOffices USA connected workflow demonstration">
    <div className="avhub-heading">
      <p className="avus-eyebrow">Cross-module coordination · Browser-only demonstration</p>
      <h2>One activity feed across the workspace.</h2>
      <p>Create or change a fictional task, sales opportunity or document review above. The event appears here immediately, connecting those three examples without a backend.</p>
    </div>
    <div className="avhub-metrics">
      <div><small>Sample changes</small><strong>{entries.length}</strong></div>
      <div><small>Modules represented</small><strong>{sources} of 3</strong></div>
    </div>
    <div className="avhub-panel">
      <div className="avhub-toolbar">
        <h3>Cross-module activity</h3>
        <label>Filter demo activity
          <select value={filter} onChange={event => setFilter(event.target.value as ActivitySource | 'All')}>
            <option>All</option><option>Tasks</option><option>CRM</option><option>Documents</option>
          </select>
        </label>
        <button type="button" onClick={resetActivity}>Clear demo activity</button>
      </div>
      <div className="avhub-events">
        {filtered.length ? filtered.map(event => <article key={event.id}>
          <div><span>{event.source}</span><small>{event.action}</small></div>
          <h4>{event.title}</h4>
          <p><strong>Illustrative next step:</strong> {suggestedNext[event.source]}</p>
        </article>) : <p className="avhub-empty" role="status">{entries.length ? 'No simulated activity for this module yet.' : 'No sample changes yet. Try a task, CRM or document action above.'}</p>}
      </div>
    </div>
    <p className="avhub-note">This is a short-lived demonstration feed, not a real audit log, persistent record or autonomous agent. It clears when you reload the page and sends nothing to a server.</p>
  </section>;
}
