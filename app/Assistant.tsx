'use client';

import { useEffect, useRef, useState } from 'react';
import { send } from '@/lib/client';
import './assistant.css';

type Msg = { role: 'user' | 'assistant'; content: string };

const CHIPS = [
  'What needs help most urgently?',
  'Where are the biggest funding gaps?',
  'What has been delivered so far?',
  'How is my donation tracked?',
];

export default function Assistant() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [msgs, busy, open]);

  useEffect(() => {
    if (open) input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: question }];
    setMsgs(next);
    setText('');
    setErr('');
    setBusy(true);
    const { ok, j } = await send('/api/assistant', { messages: next });
    setBusy(false);
    if (!ok) return setErr(j.error || 'Something went wrong. Please try again.');
    setMsgs([...next, { role: 'assistant', content: String(j.reply ?? '') }]);
  }

  return (
    <>
      {!open && (
        <button className="as-launch" onClick={() => setOpen(true)} aria-haspopup="dialog">
          Ask Resurgence
        </button>
      )}
      {open && (
        <section className="as-panel" role="dialog" aria-label="Resurgence assistant">
          <header className="as-head">
            <b>Ask Resurgence</b>
            <button className="alt as-x" onClick={() => setOpen(false)} aria-label="Close assistant">×</button>
          </header>

          <div className="as-log" ref={log} role="log" aria-live="polite">
            {msgs.length === 0 && (
              <>
                <p className="as-hint">Ask about needs, funding gaps, evidence, or how a donation is tracked. Answers come from the live ledger.</p>
                <div className="as-chips">
                  {CHIPS.map((c) => (
                    <button key={c} className="alt" onClick={() => ask(c)}>{c}</button>
                  ))}
                </div>
              </>
            )}
            {msgs.map((m, i) => (
              <p key={i} className={`as-msg as-${m.role}`}>{m.content}</p>
            ))}
            {busy && <p className="as-msg as-assistant as-typing" aria-label="Assistant is typing">…</p>}
            {err && <p className="err" role="alert">{err}</p>}
          </div>

          <form className="as-form" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
            <input
              ref={input}
              value={text}
              maxLength={600}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask a question"
              aria-label="Your question"
            />
            <button type="submit" disabled={busy || !text.trim()}>Send</button>
          </form>
          <p className="as-foot">Sandbox demo. AI answers can be wrong; check the ledger.</p>
        </section>
      )}
    </>
  );
}
