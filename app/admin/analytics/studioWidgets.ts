import { createWidgets } from 'ag-studio-react';
import type { ICellRendererParams } from 'ag-grid-community';

// The "Last 7 days" column of the needs table shows an arrow beside what each need received, like the
// change arrows in the service status table of the AG Studio real-time demo. Studio 3.0.0 has no
// built-in switch for that, so this draws the cell itself. Every other column keeps Studio's own rendering.
const DELTA_FIELD = 'raised7d';

const UP = { colour: '#1b7a45', background: 'rgba(27, 122, 69, 0.12)' };
const DOWN = { colour: '#b3261e', background: 'rgba(179, 38, 30, 0.12)' };
const NONE = { colour: '#8a8f94', background: 'transparent' };

class DeltaCell {
  private el!: HTMLSpanElement;

  init(p: ICellRendererParams) {
    this.el = document.createElement('span');
    Object.assign(this.el.style, { display: 'inline-block', padding: '1px 8px', borderRadius: '4px', fontVariantNumeric: 'tabular-nums' });
    this.paint(p);
  }

  getGui() {
    return this.el;
  }

  refresh(p: ICellRendererParams) {
    this.paint(p);
    return true;
  }

  private paint(p: ICellRendererParams) {
    const n = Number(p.value);
    const look = !Number.isFinite(n) || n === 0 ? NONE : n > 0 ? UP : DOWN;
    this.el.style.color = look.colour;
    this.el.style.background = look.background;
    if (look === NONE) {
      this.el.textContent = '–';
      return;
    }
    const text = n > 0 && p.valueFormatted ? p.valueFormatted : Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    this.el.textContent = `${n > 0 ? '↑' : '↓'} ${text}`;
  }
}

// One shared object, so Studio is not handed a new widget set on every render.
export const studioWidgets = createWidgets({
  overrides: [
    {
      id: 'grid',
      options: {
        createCellRenderer: (field: { fieldId?: unknown; key?: unknown }) =>
          `${String(field.fieldId ?? '')} ${String(field.key ?? '')}`.includes(DELTA_FIELD) ? DeltaCell : undefined,
      },
    },
  ],
});
