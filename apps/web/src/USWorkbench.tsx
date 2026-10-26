import { useState, type FormEvent } from 'react';
import './USWorkbench.css';

type TaskStatus = 'To do' | 'In progress' | 'Completed';
type Task = { id: number; title: string; owner: string; status: TaskStatus };
const initialTasks: Task[] = [
  { id: 1, title: 'Review the sample proposal', owner: 'Sales', status: 'To do' },
  { id: 2, title: 'Confirm project requirements', owner: 'Operations', status: 'In progress' },
  { id: 3, title: 'Prepare the weekly check-in', owner: 'Team', status: 'Completed' },
];

export default function USWorkbench() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('Sales');
  const [note, setNote] = useState('');

  const counts = {
    open: tasks.filter(task => task.status !== 'Completed').length,
    completed: tasks.filter(task => task.status === 'Completed').length,
    total: tasks.length,
  };

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    const id = Math.max(0, ...tasks.map(task => task.id)) + 1;
    setTasks(previous => previous.concat({ id, title: title.trim(), owner, status: 'To do' }));
    setTitle(''); setNote('Added locally. Reload the page to clear demo changes.');
  }

  return <section className="avnw" id="sample-tasks" aria-label="NexOffices USA task board demonstration">
    <div className="avnw-head">
      <p className="avus-eyebrow">Interactive workspace · USA demo</p>
      <h2>See how a business command center could work.</h2>
      <p>Add sample tasks, assign teams and move work between stages. This is a browser-only demonstration. No accounts, workspaces, customer data or API calls are created.</p>
    </div>
    <div className="avnw-metrics">
      <div><small>Tasks</small><strong>{counts.total}</strong></div>
      <div><small>Open work</small><strong>{counts.open}</strong></div>
      <div><small>Completed</small><strong>{counts.completed}</strong></div>
    </div>
    <div className="avnw-grid">
      <div className="avnw-card">
        <h3>Sample action inbox</h3>
        <div className="avnw-list">{tasks.map(task => <article key={task.id}>
          <strong>{task.title}</strong>
          <div><span>{task.owner}</span>
            <label>Stage
              <select value={task.status} onChange={e => setTasks(old => old.map(item => item.id === task.id ? { ...item, status: e.target.value as TaskStatus } : item))}>
                <option>To do</option><option>In progress</option><option>Completed</option>
              </select>
            </label>
          </div>
        </article>)}</div>
      </div>
      <div className="avnw-card">
        <h3>Create a fictional task</h3>
        <form onSubmit={addTask}>
          <label>Task description<input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} required placeholder="e.g., Follow up on sample inquiry" /></label>
          <label>Team owner<select value={owner} onChange={e => setOwner(e.target.value)}><option>Sales</option><option>Operations</option><option>Team</option><option>Marketing</option></select></label>
          <button type="submit">Add sample task</button>
        </form>
        <button type="button" className="avnw-reset" onClick={() => { setTasks(initialTasks); setTitle(''); setOwner('Sales'); setNote('Demo reset.'); }}>Reset board</button>
        <p role="status">{note || 'All examples are fictional and are not saved anywhere.'}</p>
      </div>
    </div>
    <p className="avnw-disclaimer">This does not enable US invoices, payments, banking, tax reports or external integrations. Those capabilities require a separate provider and legal review.</p>
  </section>;
}
