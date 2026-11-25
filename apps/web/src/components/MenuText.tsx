import { parseMenuText, type Inline } from '../lib/menuText.ts';

function Line({ parts }: { parts: Inline[] }) {
  return parts.map((part, i) => {
    if (part.bold) return <strong key={i}>{part.text}</strong>;
    if (part.italic) return <em key={i}>{part.text}</em>;
    return <span key={i}>{part.text}</span>;
  });
}

// A dish description with its formatting, built as elements: the text is never read as HTML.
export function MenuText({ text, className }: { text: string; className?: string }) {
  const blocks = parseMenuText(text);
  if (blocks.length === 0) return null;
  return (
    <div className={className}>
      {blocks.map((block, b) =>
        block.kind === 'p' ? (
          <p key={b}>
            <Line parts={block.inline} />
          </p>
        ) : (
          <ul key={b}>
            {block.items.map((item, i) => (
              <li key={i}>
                <Line parts={item.inline} />
                {item.sub.length > 0 && (
                  <ul>
                    {item.sub.map((sub, s) => (
                      <li key={s}>
                        <Line parts={sub} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
