'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';

const parse = (s: string) => {
  const n = Number(s.replace(/,/g, '').trim());
  return s.trim() === '' || !Number.isFinite(n) ? null : n;
};

// A number box that keeps what you type ("6.", "22.5") and reports the parsed value.
// Converting on every keystroke would drop the decimal point before the next digit.
export function NumberInput({ value, onValue, ...props }: Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & { value: number | null; onValue: (n: number | null) => void }) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => {
    if (parse(text) !== value) setText(value === null ? '' : String(value));
    // Only follow outside changes (an import), not our own keystrokes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.,]/g, '');
        setText(t);
        onValue(parse(t));
      }}
    />
  );
}
