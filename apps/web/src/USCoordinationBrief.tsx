import { useState } from 'react';
import './USCoordinationBrief.css';

type Focus = 'Operations' | 'Sales' | 'Documents';
type SampleAction = { id: string; title: string; reason: string; next: string; owner: string };
const scenarios: Record<Focus, SampleAction[]> = {
  Operations: [
    { id: 'ops-1', title: 'Prioritize the upcoming team handoff', reason: 'Fictional project requirements are marked as in progress.', next: 'Review the example checklist with Operations.', owner: 'Operations' },
    { id: 'ops-2', title: 'Review the weekly check-in agenda', reason: 'The sample action inbox includes an upcoming coordination task.', next: 'Assign a team member to the fictional update.', owner: 'Team' },
  ],
  Sales: [
    { id: 'sales-1', title: 'Follow up on a sample proposal', reason: 'A fictional opportunity is in the proposal stage.', next: 'Prepare a draft question for the example buyer.', owner: 'Sales' },
    { id: 'sales-2', title: 'Qualify the example consultation', reason: 'A sample sales opportunity awaits the next step.', next: 'Confirm the fictional project scope.', owner: 'Sales' },
  ],
  Documents: [
    { id: 'docs-1', title: 'Review the sample service proposal', reason: 'The demonstration review queue has a document in review.', next: 'Ask the example Sales reviewer to confirm its stage.', owner: 'Sales' },
    { id: 'docs-2', title: 'Prepare the fictional vendor checklist', reason: 'The sample document is still in draft.', next: 'Route the example checklist to Operations.', owner: 'Operations' },
  ],
};

/** Explicitly rules-based example, not a connected AI agent or a live business recommendation. */
export default function USCoordinationBrief() {
  const [focus, setFocus] = useState<Focus>('Operations');
  const [brief, setBrief] = useState<{ focus: Focus; actions: SampleAction[] } | null>(null);
  const [reviewed, setReviewed] = useState<string[]>([]);
  const reviewedCount = brief?.actions.filter(action => reviewed.includes(action.id)).length ?? 0;

  function prepare() {
    setBrief({ focus, actions: scenarios[focus] });
    setReviewed([]);
  }
  function reset() {
    setFocus('Operations');
    setBrief(null);
    setReviewed([]);
  }
  function toggleReviewed(id: string) {
    setReviewed(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]);
  }

  return <section className="avcb" id="sample-agent" aria-label="NexOffices USA sample coordination brief">
    <div className="avcb-heading">
      <p className="avus-eyebrow">AI-assisted coordination · Illustrative workflow</p>
      <h2>Turn scattered signals into a next-step briefing.</h2>
      <p>Explore how a future assistant could prioritize operations, sales and document reviews. This demo uses fixed fictional scenarios and simple rules — no AI model, live data, messaging or API access.</p>
    </div>
    <div className="avcb-panel">
      <div className="avcb-controls">
        <label htmlFor="avcb-focus">Sample team focus
          <select id="avcb-focus" value={focus} onChange={event => setFocus(event.target.value as Focus)}>
            <option>Operations</option><option>Sales</option><option>Documents</option>
          </select>
        </label>
        <button type="button" onClick={prepare}>Prepare sample brief</button>
        <button type="button" className="avcb-reset" onClick={reset}>Reset briefing</button>
      </div>
      {brief ? <div className="avcb-results">
        <div className="avcb-status" role="status"><strong>{brief.focus} sample briefing</strong><span>{reviewedCount} of {brief.actions.length} reviewed</span></div>
        <div className="avcb-list">
          {brief.actions.map((action, index) => <article key={action.id}>
            <div className="avcb-actionhead"><span>Priority {index + 1}</span><small>Suggested owner: {action.owner}</small></div>
            <h3>{action.title}</h3>
            <p><strong>Sample signal:</strong> {action.reason}</p>
            <p><strong>Illustrative next step:</strong> {action.next}</p>
            <button type="button" aria-pressed={reviewed.includes(action.id)} aria-label={'Mark ' + action.title + ' as reviewed'} onClick={() => toggleReviewed(action.id)}>
              {reviewed.includes(action.id) ? 'Reviewed ✓' : 'Mark reviewed'}
            </button>
          </article>)}
        </div>
      </div> : <p className="avcb-empty" role="status">Choose an example team and prepare a fictional prioritization briefing.</p>}
    </div>
    <p className="avcb-disclaimer">No real AI inference, customer insight, automated decision, task creation, email or external action occurs here. Refreshing clears this demonstration.</p>
  </section>;
}
