'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAdminIdToken } from 'app/lib/get-admin-token';

type Actor = { name: string; at: number; active?: boolean };
type Activity = { viewers?: Record<string, Actor>; marks?: Record<string, Actor> };

export async function saveAdminChatAction(body: Record<string, unknown>) {
  const token = await getAdminIdToken();
  if (!token) throw new Error('Увійдіть як адміністратор');
  const response = await fetch('/api/admin/chat-activity', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Не вдалося зберегти дію');
}

export function useAdminChatActivity(userId: string | null, adminId: string | undefined, messageIds: string[]) {
  const [activity, setActivity] = useState<Record<string, Activity>>({});
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const ids = messageIds.join(',');
  const current = useRef(userId);
  useEffect(() => { current.current = userId; }, [userId]);
  useEffect(() => {
    setActivity({});
    setError('');
  }, [userId]);
  useEffect(() => {
    if (!userId || !adminId) return;
    let disposed = false;
    let busy = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (document.hidden || busy) return;
      busy = true;
      try {
        const token = await getAdminIdToken();
        if (!token) throw new Error('Увійдіть як адміністратор');
        const response = await fetch(`/api/admin/chat-activity?userId=${encodeURIComponent(userId)}`, {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        });
        if (!response.ok) throw new Error('Не вдалося оновити дії адміністраторів');
        const result = await response.json();
        if (disposed) return;
        setActivity(result.activity);
        const unread = ids.split(',').filter(id => id && !result.activity[id]?.viewers?.[adminId]);
        for (let index = 0; index < unread.length && !disposed; index += 100) {
          const batch = unread.slice(index, index + 100);
          await saveAdminChatAction({ userId, action: 'view', messageIds: batch });
        }
        if (unread.length && !disposed) setRevision(value => value + 1);
        if (!disposed) setError('');
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : 'Помилка синхронізації');
      } finally { busy = false; }
    };
    void refresh();
    const timer = setInterval(refresh, 8000);
    document.addEventListener('visibilitychange', refresh);
    return () => { disposed = true; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [userId, adminId, ids, revision]);
  const mark = useCallback(async (id: string, active: boolean) => {
    if (!userId) return;
    try {
      await saveAdminChatAction({ userId, action: 'mark', messageIds: [id], active });
      if (current.current === userId) { setError(''); setRevision(value => value + 1); }
    } catch (cause) {
      if (current.current === userId) setError(cause instanceof Error ? cause.message : 'Помилка позначки');
    }
  }, [userId]);
  return { activity, error, mark };
}

export function MessageAdminActivity({ activity, adminId, onMark }: { activity?: Activity; adminId?: string; onMark: (active: boolean) => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const active = Boolean(adminId && activity?.marks?.[adminId]?.active);
  const describe = (actors: Actor[]) => actors.map(actor => `${actor.name} (${new Date(actor.at).toLocaleString('uk-UA')})`).join(', ');
  const viewers = Object.values(activity?.viewers || {});
  const marks = Object.values(activity?.marks || {}).filter(actor => actor.active);
  const removed = Object.values(activity?.marks || {}).filter(actor => actor.active === false);
  return <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-300">
    {viewers.length > 0 && <span title={describe(viewers)}>Переглянули: {viewers.map(actor => actor.name).join(', ')}</span>}
    {marks.length > 0 && <span className="text-amber-300" title={describe(marks)}>Позначили: {marks.map(actor => actor.name).join(', ')}</span>}
    {removed.length > 0 && <span title={describe(removed)}>Зняли позначку: {removed.map(actor => actor.name).join(', ')}</span>}
    <button type="button" disabled={!adminId || pending} aria-pressed={active} className="rounded border border-white/15 px-1.5 py-0.5 hover:bg-white/10 disabled:opacity-50" onClick={async () => {
      setPending(true);
      try { await onMark(!active); } finally { setPending(false); }
    }}>{pending ? 'Збереження…' : active ? 'Зняти мою позначку' : 'Позначити'}</button>
  </div>;
}
