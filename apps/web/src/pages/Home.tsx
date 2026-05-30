import { useTariff } from '../hooks/useTariff.js';

export const Home = (): JSX.Element => {
  const { tariff } = useTariff();

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold text-slate-100">Home</h1>

      {tariff && (
        <div className="rounded-xl bg-slate-800 p-4 space-y-1">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Electricity tariff</p>
          <p className={`text-2xl font-bold ${tariff.currentType === 'cheap' ? 'text-green-400' : 'text-slate-200'}`}>
            {tariff.currentRatePenceIncVat.toFixed(2)}p/kWh
          </p>
          <p className="text-sm text-slate-400 capitalize">{tariff.currentType} rate</p>
          {tariff.validTo && (
            <p className="text-xs text-slate-500">
              {tariff.currentType === 'cheap' ? 'Ends' : 'Cheap from'}{' '}
              {new Date(tariff.validTo).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      )}

      <p className="text-sm text-slate-500">Room controls available once Hue adapters are online.</p>
    </div>
  );
};
