import { useNavigate } from 'react-router-dom';
import { useTariff } from '../hooks/useTariff.js';

const fmtTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const minutesUntil = (iso: string): number =>
  Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));

export const EnergyHeader = (): JSX.Element => {
  const { tariff } = useTariff();
  const navigate = useNavigate();

  const isCheap = tariff?.currentType === 'cheap';
  const rate = tariff?.currentRatePenceIncVat;
  const mins = tariff?.validTo ? minutesUntil(tariff.validTo) : null;

  return (
    <button
      onClick={() => void navigate('/energy')}
      className="w-full flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 text-xs text-slate-400 gap-3 active:bg-slate-800"
    >
      {/* Solar / Battery / Grid — Phase 2 data */}
      <span className="flex gap-3 min-w-0">
        <span className="text-amber-400">⚡ --</span>
        <span className="text-slate-400">🔋 --%</span>
        <span className="text-slate-400">↕ --</span>
      </span>

      {/* Tariff indicator */}
      {tariff ? (
        <span className={`flex items-center gap-1 shrink-0 font-medium ${isCheap ? 'text-green-400' : 'text-slate-400'}`}>
          <span className="uppercase tracking-wide">{tariff.currentType}</span>
          <span className="text-slate-500">·</span>
          <span>{rate?.toFixed(1)}p</span>
          {mins !== null && (
            <span className="text-slate-500 font-normal">
              {isCheap ? `ends ${fmtTime(tariff.validTo!)}` : `cheap ${fmtTime(tariff.validTo!)}`}
            </span>
          )}
        </span>
      ) : (
        <span className="text-slate-600">tariff loading…</span>
      )}
    </button>
  );
};
