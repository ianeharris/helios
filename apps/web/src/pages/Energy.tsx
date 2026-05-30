import { useTariff } from '../hooks/useTariff.js';
import type { TariffSlot } from '@helios/shared';

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

export const Energy = (): JSX.Element => {
  const { tariff, status } = useTariff();

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-semibold text-slate-100">Energy</h1>

      {/* Live meters — Phase 2 (Fox ESS) */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Solar', value: '--', unit: 'W', color: 'text-amber-400' },
          { label: 'Battery', value: '--', unit: '%', color: 'text-emerald-400' },
          { label: 'Grid', value: '--', unit: 'kW', color: 'text-slate-400' },
          { label: 'Export', value: `${tariff?.exportRatePenceIncVat ?? '--'}`, unit: 'p/kWh', color: 'text-emerald-400' },
        ].map(({ label, value, unit, color }) => (
          <div key={label} className="bg-slate-800 rounded-xl p-3 space-y-1">
            <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}<span className="text-sm font-normal text-slate-500 ml-1">{unit}</span></p>
          </div>
        ))}
      </div>

      {/* Tariff slots */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide">Rate schedule</h2>
        {status === 'loading' && (
          <p className="text-sm text-slate-500">Loading tariff data…</p>
        )}
        {status === 'error' && (
          <p className="text-sm text-red-400">Could not load tariff data.</p>
        )}
        {tariff?.slots.map((slot, i) => (
          <SlotRow key={i} slot={slot} />
        ))}
      </div>

      {tariff && (
        <p className="text-xs text-slate-600 text-center">
          Updated {new Date(tariff.updatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
};
