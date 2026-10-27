'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { copyText } from '@/lib/utils';

export function CopyButton({ text, label = 'Copy', onCopied, ...props }: { text: string; label?: string; onCopied?: () => void } & Omit<ButtonProps, 'onClick'>) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      {...props}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          onCopied?.();
          setTimeout(() => setDone(false), 1600);
        }
      }}
    >
      {done ? <Check /> : <Copy />} {done ? 'Copied' : label}
    </Button>
  );
}
