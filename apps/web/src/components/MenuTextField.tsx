import { useRef } from 'react';
import { MAX_DESCRIPTION } from '../lib/menu.ts';

interface MenuTextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
}

type Edit = { value: string; start: number; end: number };

// **bold** or *italic* around the selection; with nothing selected, around a placeholder that
// stays selected, so typing replaces it.
function wrap(text: string, start: number, end: number, marker: string, placeholder: string): Edit {
  const inner = text.slice(start, end) || placeholder;
  const value = text.slice(0, start) + marker + inner + marker + text.slice(end);
  return { value, start: start + marker.length, end: start + marker.length + inner.length };
}

// "- " (item) or "  - " (sub-item) at the start of every selected line. A line that already is
// an item becomes the other kind, so the same button also changes the level.
function prefixLines(text: string, start: number, end: number, sub: boolean): Edit {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const nextBreak = text.indexOf('\n', end);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const lines = text
    .slice(lineStart, lineEnd)
    .split('\n')
    .map((line) => {
      const bare = line.replace(/^\s*- /, '');
      return (sub ? '  - ' : '- ') + bare;
    });
  const block = lines.join('\n');
  const value = text.slice(0, lineStart) + block + text.slice(lineEnd);
  return { value, start: lineStart + block.length, end: lineStart + block.length };
}

const TOOLS = [
  { name: 'Bold', glyph: 'B', className: 'menu-tool--bold' },
  { name: 'Italic', glyph: 'I', className: 'menu-tool--italic' },
  { name: 'List item', glyph: '•', className: '' },
  { name: 'Sub-item', glyph: '◦', className: '' },
] as const;

// The description of a dish: a text area with a small toolbar, so the staff format it without
// typing the marks themselves.
export function MenuTextField({ id, label, value, onChange, error }: MenuTextFieldProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  function apply(tool: (typeof TOOLS)[number]['name']) {
    const area = ref.current;
    if (!area) return;
    const { selectionStart: start, selectionEnd: end } = area;
    let edit: Edit;
    if (tool === 'Bold') edit = wrap(value, start, end, '**', 'bold text');
    else if (tool === 'Italic') edit = wrap(value, start, end, '*', 'italic text');
    else edit = prefixLines(value, start, end, tool === 'Sub-item');
    onChange(edit.value);
    // The new text is rendered first, then the selection is put back where the edit left it.
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(edit.start, edit.end);
    });
  }

  return (
    <div className="field menu-text-field">
      <label htmlFor={id}>{label}</label>
      <div className="menu-toolbar" role="toolbar" aria-label={`Format the ${label.toLowerCase()}`}>
        {TOOLS.map((tool) => (
          <button
            key={tool.name}
            type="button"
            className={`menu-tool ${tool.className}`}
            aria-label={tool.name}
            title={tool.name}
            aria-controls={id}
            // Keeps the selection of the text area while the button is pressed.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply(tool.name)}
          >
            {tool.glyph}
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        id={id}
        value={value}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        onChange={(e) => onChange(e.target.value)}
      />
      <p id={hintId} className="field__hint menu-text-field__hint">
        <span>Optional. Ingredients, how it is served.</span>
        <span>
          {value.length}/{MAX_DESCRIPTION}
        </span>
      </p>
      {error && (
        <p id={errorId} role="alert" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
