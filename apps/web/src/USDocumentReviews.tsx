import { useRef, useState, type FormEvent } from 'react';
import './USDocumentReviews.css';

type ReviewStage = 'Draft' | 'In review' | 'Needs changes' | 'Approved';
type Reviewer = 'Operations' | 'Sales' | 'Legal';
type Review = { id: number; title: string; reviewer: Reviewer; stage: ReviewStage };
type Activity = { id: number; description: string };
const stages: ReviewStage[] = ['Draft', 'In review', 'Needs changes', 'Approved'];
const examples: Review[] = [
  { id: 1, title: 'Example service proposal', reviewer: 'Sales', stage: 'In review' },
  { id: 2, title: 'Fictional vendor checklist', reviewer: 'Operations', stage: 'Draft' },
  { id: 3, title: 'Sample contract outline', reviewer: 'Legal', stage: 'Approved' },
];

/** Standalone, strictly fictional review workflow. No uploads, storage, signatures or APIs. */
export default function USDocumentReviews() {
  const [reviews, setReviews] = useState<Review[]>(examples);
  const [title, setTitle] = useState('');
  const [reviewer, setReviewer] = useState<Reviewer>('Operations');
  const [history, setHistory] = useState<Activity[]>([]);
  const nextActivity = useRef(0);
  const [message, setMessage] = useState('This is a local simulation; no file is uploaded or signed.');

  const approved = reviews.filter(row => row.stage === 'Approved').length;
  const pending = reviews.filter(row => row.stage === 'In review' || row.stage === 'Needs changes').length;

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = title.trim();
    if (!cleaned) return;
    const nextId = Math.max(...reviews.map(row => row.id), 0) + 1;
    setReviews(previous => [...previous, { id: nextId, title: cleaned, reviewer, stage: 'Draft' }]);
    setHistory(previous => [{ id: ++nextActivity.current, description: 'Created fictional document: ' + cleaned }, ...previous].slice(0, 6));
    setTitle('');
    setMessage('Added locally. No document file or customer record was created.');
  }

  function updateStage(id: number, stage: ReviewStage) {
    const document = reviews.find(row => row.id === id);
    if (!document || document.stage === stage) return;
    setReviews(previous => previous.map(row => row.id === id ? { ...row, stage } : row));
    setHistory(previous => [{
      id: ++nextActivity.current,
      description: document.title + ': ' + document.stage + ' → ' + stage,
    }, ...previous].slice(0, 6));
    setMessage('Review stage updated in this browser only. No legal approval or e-signature occurred.');
  }

  function reset() {
    setReviews(examples);
    setHistory([]);
    nextActivity.current = 0;
    setTitle('');
    setReviewer('Operations');
    setMessage('Sample review queue reset.');
  }

  return <section className="avdr" id="sample-documents" aria-label="NexOffices USA sample document review workflow">
    <div className="avdr-heading">
      <p className="avus-eyebrow">Documents & approvals · Interactive simulation</p>
      <h2>Know exactly what needs review.</h2>
      <p>Move fictional documents from draft to review and see a simulated audit trail. No file uploads, legally binding approvals, digital signatures or real customer records.</p>
    </div>
    <div className="avdr-counts" aria-label="Sample document review counts">
      <div><small>Sample documents</small><strong>{reviews.length}</strong></div>
      <div><small>Awaiting resolution</small><strong>{pending}</strong></div>
      <div><small>Marked approved</small><strong>{approved}</strong></div>
    </div>
    <div className="avdr-grid">
      <div className="avdr-panel">
        <h3>Fictional review queue</h3>
        <div className="avdr-list">
          {reviews.map(item => <article key={item.id}>
            <div><strong>{item.title}</strong><small>Reviewer team: {item.reviewer}</small></div>
            <label>Review stage
              <select aria-label={item.title + ' review stage'} value={item.stage} onChange={event => updateStage(item.id, event.target.value as ReviewStage)}>
                {stages.map(stage => <option key={stage}>{stage}</option>)}
              </select>
            </label>
          </article>)}
        </div>
      </div>
      <div className="avdr-stack">
        <form className="avdr-panel avdr-form" onSubmit={add}>
          <h3>Create a sample review</h3>
          <label>Fictional document title<input maxLength={95} required placeholder="Example onboarding checklist" value={title} onChange={event => setTitle(event.target.value)}/></label>
          <label htmlFor="usa-reviewer-team">Reviewer team<select id="usa-reviewer-team" aria-label="Reviewer team" value={reviewer} onChange={event => setReviewer(event.target.value as Reviewer)}>
            <option>Operations</option><option>Sales</option><option>Legal</option>
          </select></label>
          <button type="submit">Add sample document</button>
          <button type="button" className="avdr-reset" onClick={reset}>Reset reviews</button>
          <p role="status">{message}</p>
        </form>
        <section className="avdr-panel avdr-activity" aria-label="Fictional review activity">
          <h3>Simulated activity</h3>
          {history.length ? <ol>{history.map(item => <li key={item.id}>{item.description}</li>)}</ol> : <p>Change a sample review stage to see an example activity entry.</p>}
        </section>
      </div>
    </div>
    <p className="avdr-footnote">Demonstration only. This is not a document repository, audit evidence, regulatory record, notary service, or electronic-signature product. Changes disappear when you reload.</p>
  </section>;
}
