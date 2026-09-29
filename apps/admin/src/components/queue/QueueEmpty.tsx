import React from 'react';
import { ShieldCheck } from 'lucide-react';

// État vide standard des files (lot 2) : même célébration partout 🎉.
interface QueueEmptyProps {
  title: string;
  hint: string;
}

export function QueueEmpty({ title, hint }: QueueEmptyProps) {
  return (
    <div className="bg-white border border-border rounded-3xl p-16 text-center text-muted-foreground space-y-3 shadow-sm">
      <ShieldCheck className="w-10 h-10 text-muted-foreground mx-auto" />
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs">{hint}</p>
    </div>
  );
}
