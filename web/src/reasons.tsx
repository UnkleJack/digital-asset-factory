// Common reasons, as quick picks. A pick starts the note; you still finish it by saying which part.
// Used in Batch approval's Reject / Return for revision box and when rewriting a refused note. Edit freely.
export const COMMON_REASONS = [
  'Blurry or low quality:',
  'Text too small or hard to read:',
  'Typo or wrong wording:',
  'Wrong dates or days:',
  'Layout cramped or messy:',
  'Colors clash or look off:',
  'Not on theme / not what I asked for:',
  'Too close to the edge for printing:',
];

export function ReasonPicks({ notes, setNotes }: { notes: string; setNotes: (s: string) => void }) {
  return (
    <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 8 }} aria-label="Common reasons">
      {COMMON_REASONS.map((r) => (
        <button key={r} type="button" className="small" onClick={() => setNotes(notes.trim() ? `${notes.trim()}\n${r} ` : `${r} `)}>{r.replace(/:$/, '')}</button>
      ))}
    </div>
  );
}
