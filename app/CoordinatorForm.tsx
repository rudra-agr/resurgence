'use client';

import { useState, type FormEvent } from 'react';
import { send } from '@/lib/client';

const EMPTY = { title: '', location: '', families: '', urgency: 'High', items: '', language: '' };

// "40 tarpaulin sheet, wool blanket" -> [{ quantity: 40, name: ... }, { quantity: 1, name: ... }]
function parseItems(s: string) {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const m = x.match(/^(\d+)\s+(.+)$/);
      return m ? { quantity: Number(m[1]), name: m[2] } : { quantity: 1, name: x };
    });
}

export default function CoordinatorForm({ onPosted }: { onPosted: (id: string) => void }) {
  const [form, setForm] = useState(EMPTY);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // Fills the form from free text; the coordinator still reviews and posts it.
  async function extract() {
    setBusy(true);
    setMsg('Reading the request…');
    const { ok, j } = await send('/api/extract', { text });
    setBusy(false);
    if (!ok) return setMsg(j.error || 'Drafting failed. Fill the fields by hand.');
    setForm({
      title: j.title,
      location: j.location,
      families: String(j.families || ''),
      urgency: j.urgency,
      language: j.language,
      items: (j.items as { quantity: number; name: string }[]).map((i) => `${i.quantity} ${i.name}`).join(', '),
    });
    setMsg('Draft ready. Check every field, fix anything wrong, then post.');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { ok, j } = await send('/api/needs', {
      title: form.title,
      location: form.location,
      families: Number(form.families) || 0,
      urgency: form.urgency,
      language: form.language || undefined,
      originalText: text.trim() || undefined,
      items: parseItems(form.items),
    });
    if (!ok) return setMsg(j.error || 'Could not post.');
    setForm(EMPTY);
    setText('');
    setMsg('Need posted. Now find and approve products for it.');
    onPosted(j.id);
  }

  const upd = (k: keyof typeof EMPTY, v: string) => setForm({ ...form, [k]: v });

  return (
    <form className="panel" onSubmit={submit}>
      <h2>Coordinator: post a need</h2>
      <textarea
        rows={3}
        placeholder="Describe the need in any language, then let AI draft the fields (optional)"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="button" className="alt" disabled={busy || !text.trim()} onClick={extract}>
        Draft fields from text
      </button>
      {msg && <p className="note">{msg}</p>}
      <input placeholder="Title" required value={form.title} onChange={(e) => upd('title', e.target.value)} />
      <input placeholder="Location" value={form.location} onChange={(e) => upd('location', e.target.value)} />
      <input placeholder="Families" type="number" min="0" value={form.families} onChange={(e) => upd('families', e.target.value)} />
      <select value={form.urgency} onChange={(e) => upd('urgency', e.target.value)}>
        {['Critical', 'High', 'Medium', 'Low'].map((u) => (
          <option key={u}>{u}</option>
        ))}
      </select>
      <input
        placeholder="Items, e.g. 40 tarpaulin sheet, 20 wool blanket"
        required
        value={form.items}
        onChange={(e) => upd('items', e.target.value)}
      />
      <button>Approve and post</button>
    </form>
  );
}
