import { useEffect, useMemo, useRef, useState } from 'react';

export default function BankSearchSelect({
  banks = [],
  value = '',
  onChange,
  placeholder = 'Search your bank…',
  loading = false,
  inputStyle = {},
  id,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const selected = useMemo(
    () => banks.find(b => b.code === value) || null,
    [banks, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q === (selected?.name || '').toLowerCase()) return banks;
    return banks.filter(b =>
      b.name.toLowerCase().includes(q) || String(b.code).toLowerCase().includes(q)
    );
  }, [banks, query, selected]);

  useEffect(() => {
    if (!open) setQuery(selected?.name || '');
  }, [selected?.name, open]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (highlight >= filtered.length) setHighlight(filtered.length - 1);
  }, [filtered.length, highlight]);

  const select = (bank) => {
    onChange?.(bank);
    setQuery(bank.name);
    setOpen(false);
    setHighlight(-1);
  };

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        id={id}
        style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
        value={query}
        placeholder={loading ? 'Loading banks…' : placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        disabled={loading}
        onChange={e => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(-1);
          onChange?.(null);
        }}
        onFocus={e => {
          e.target.select();
          setOpen(true);
        }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setHighlight(h => Math.min(h + 1, filtered.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight(h => Math.max(h - 1, 0));
          } else if (e.key === 'Enter' && open && highlight >= 0) {
            e.preventDefault();
            select(filtered[highlight]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />

      {open && (
        <ul
          role="listbox"
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, margin: '4px 0 0', padding: 0,
            listStyle: 'none', background: 'white', border: '1px solid #DDD', borderRadius: 8,
            maxHeight: 220, overflowY: 'auto', zIndex: 40,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          }}
        >
          {filtered.length === 0 ? (
            <li style={{ padding: '12px 14px', fontSize: 12.5, color: '#888' }}>
              No bank found
            </li>
          ) : (
            filtered.map((bank, i) => (
              <li
                key={bank.code}
                role="option"
                aria-selected={bank.code === value}
                onMouseDown={e => { e.preventDefault(); select(bank); }}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  padding: '10px 12px', fontSize: 13, cursor: 'pointer',
                  fontWeight: bank.code === value ? 700 : 400,
                  background: i === highlight ? '#F0F9F0' : 'white',
                  color: bank.code === value ? '#1B4332' : '#333',
                }}
              >
                {bank.name}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
