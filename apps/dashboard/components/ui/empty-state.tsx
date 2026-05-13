import { Inbox } from 'lucide-react';

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-sm py-page text-gray-400">
      <Inbox size={32} strokeWidth={1.5} />
      <p className="text-sm">{message}</p>
    </div>
  );
}
