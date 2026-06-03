import { useTariff } from '../hooks/useTariff.js';
import { useDispatch } from '../hooks/useDispatch.js';
import { useSavingSessions } from '../hooks/useSavingSessions.js';
import { useFoxEss } from '../hooks/useFoxEss.js';
import type { TariffSlot, DispatchSlot } from '@helios/shared';

const fmtTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

const SlotRow = ({ slot }: { slot: TariffSlot }): JSX.Element => {
  const isCheap = slot.type === 'cheap';
  const now = Date.now();
  const isActive = new Date(slot.start).getTime() <= now && (slot.end ? new Date(slot.end).getTime() > now : true);

  return (
    <div className={`flex items-center justify-between px-4 py-3 ${isActive ? 'bg-slate-700' : 'bg-slate-800'} rounded-lg`}>
      <div className="space-y-0.5">
        <p className="text-xs text-slate-400">{fmtDate(slot.start)}</p>
        <p className="text-sm text-slate-200">
          {fmtTime(slot.start)} – {slot.end ? fmtTime(slot.end) : '—'}
        </p>
      </div>
      <div className="text-right space-y-0.5">
        <p className={`text-sm font-semibold ${isCheap ? 'text-green-400' : 'text-slate-400'}`}>
          {slot.ratePenceIncVat.toFixed(2)}p
        </p>
        <p className={`text-xs uppercase tracking-wide ${isCheap ? 'text-green-600' : 'text-slate-600'}`}>
          {slot.type}
          {isActive && <span className="ml-1 text-amber-400">● now</span>}
        </p>
      </div>
    </div>
  );
};

const DispatchRow = ({ slot }: { slot: DispatchSlot }): JSX.Element => {
  const now = new Date().toISOString();
  const isActive = slot.start_utc <= now && slot.end_utc > now;

  return (
    <div className={`flex items-center justify-between px-4 py-3 ${isActive ? 'bg-slate-700' : 'bg-slate-800'} rounded-lg`}>
      <div className="space-y-0.5">
        <p className="text-xs text-slate-400">{fmtDate(slot.start_utc)}</p>
        <p className="text-sm text-slate-200">
          {fmtTime(slot.start_utc)} – {fmtTime(slot.end_utc)}
        </p>
      </div>
      <div className="text-right space-y-0.5">
        <p className="text-sm font-semibold text-blue-400">4.95p</p>
        <p className="text-xs uppercase tracking-wide text-blue-600">
          dispatched
          {isActive && <span className="ml-1 text-amber-400">● now</span>}
        </p>
      </div>
    </div>
  );
};

export const Energy = (): JSX.Element => {
  const { tariff, status: tariffStatus } = useTariff();
  const { dispatch } = useDispatch();
  const { sessions } = useSavingSessions();
  const { live } = useFoxEss();

  const activeSession = sessions?.active ? sessions.events.find((e) => {
    const now = new Date().toISOString();
    return e.start_at <= now && e.end_at > now;
  }) : null;

  const upcomingSessions = sessions?.events.filter((e) => new Date(e.start_at) > new Date()) ?? [];

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-semibold text-slate-100">Energy</h1>

      {/* Saving Session active banner */}
      {activeSession && (
        <div className="bg-emerald-900 border border-emerald-600 rounded-xl px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-emerald-300">⚡ Saving Session active</p>
          <p className="text-xs text-emerald-400">
            Until {fmtTime(activeSession.end_at)} · {activeSession.name}
          </p>
          <p className="text-xs text-emerald-600">Reduce consumption to earn Octopoints</p>
        </div>
      )}

      {/* Live meters — Fox ESS */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Solar', value: live ? Math.round(live.pvPower * 1000).toString() : '--', unit: 'W', color: 'text-amber-400' },
          { label: 'Battery', value: live ? Math.round(live.batSoc).toString() : '--', unit: '%', color: 'text-emerald-400' },
          { label: 'Grid', value: live ? live.gridPower.toFixed(1) : '--', unit: 'kW', color: live && live.gridPower < 0 ? 'text-emerald-400' : 'text-slate-400' },
          { label: 'Export', value: `${tariff?.exportRatePenceIncVat ?? '--'}`, unit: 'p/kWh', color: 'text-emerald-400' },
        ].map(({ label, value, unit, color }) => (
          <div key={label} className="bg-slate-800 rounded-xl p-3 space-y-1">
            <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}<span className="text-sm font-normal text-slate-500 ml-1">{unit}</span></p>
          </div>
        ))}
      </div>

      {/* Intelligent dispatch schedule */}
      {dispatch && dispatch.slots.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide">Intelligent dispatch</h2>
          {dispatch.slots.map((slot, i) => (
            <DispatchRow key={i} slot={slot} />
          ))}
        </div>
      )}

      {/* Tariff rate schedule — upcoming slots only, within next 24 h */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide">Rate schedule</h2>
        {tariffStatus === 'loading' && (
          <p className="text-sm text-slate-500">Loading tariff data…</p>
        )}
        {tariffStatus === 'error' && (
          <p className="text-sm text-red-400">Could not load tariff data.</p>
        )}
        {tariff?.slots
          .filter((slot) => {
            const now = Date.now();
            const end = slot.end ? new Date(slot.end).getTime() : Infinity;
            const start = new Date(slot.start).getTime();
            return end > now && start < now + 24 * 60 * 60 * 1000;
          })
          .map((slot, i) => (
            <SlotRow key={i} slot={slot} />
          ))}
      </div>

      {/* Upcoming saving sessions */}
      {upcomingSessions.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide">Saving Sessions</h2>
          {upcomingSessions.map((event) => (
            <div key={event.id} className="bg-slate-800 rounded-lg px-4 py-3 flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-xs text-slate-400">{fmtDate(event.start_at)}</p>
                <p className="text-sm text-slate-200">
                  {fmtTime(event.start_at)} – {fmtTime(event.end_at)}
                </p>
                <p className="text-xs text-slate-400">{event.name}</p>
              </div>
              <div className="text-right space-y-0.5">
                <p className={`text-xs ${event.joined ? 'text-emerald-600' : 'text-slate-600'}`}>
                  {event.joined ? '✓ joined' : 'not joined'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {tariff && (
        <p className="text-xs text-slate-600 text-center">
          Updated {new Date(tariff.updatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
};
