import { useEffect, useMemo, useState } from 'react';

type LoadStatus = 'loading' | 'ok' | 'error';

type Room = {
  id: string;
  name: string;
  floor: number | null;
  icon: string | null;
};

type Device = {
  id: string;
  vendor: string;
  kind: string;
  name: string;
  roomId: string | null;
  reachable: boolean;
  role: string | null;
  tags: string[];
  rawState: {
    on?: boolean;
    brightness?: number;
  } | null;
  updatedAt: string;
};

type Scene = {
  id: string;
  name: string;
  roomId: string | null;
  icon: string | null;
  definition: unknown;
};

type RegistryState = {
  rooms: Room[];
  devices: Device[];
  scenes: Scene[];
};

const loadJson = async <T,>(path: string): Promise<T> => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json() as Promise<T>;
};

const sendDeviceCommand = async (deviceId: string, command: Record<string, unknown>): Promise<void> => {
  const response = await fetch(`/api/devices/${encodeURIComponent(deviceId)}/command`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error('command failed');
};

const recallScene = async (roomId: string, sceneId: string): Promise<void> => {
  const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/scene`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sceneId }),
  });
  if (!response.ok) throw new Error('scene recall failed');
};

const useRegistry = (): { state: RegistryState; status: LoadStatus; error: string | null; reload: () => void } => {
  const [state, setState] = useState<RegistryState>({ rooms: [], devices: [], scenes: [] });
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      setStatus('loading');
      setError(null);
      try {
        const [rooms, devices, scenes] = await Promise.all([
          loadJson<Room[]>('/api/rooms'),
          loadJson<Device[]>('/api/devices'),
          loadJson<Scene[]>('/api/scenes'),
        ]);
        if (!cancelled) {
          setState({ rooms, devices, scenes });
          setStatus('ok');
        }
      } catch (error) {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : 'Unknown registry error');
          setStatus('error');
        }
      }
    };

    void load();
    return (): void => {
      cancelled = true;
    };
  }, [reloadToken]);

  return { state, status, error, reload: () => setReloadToken((value) => value + 1) };
};

const roomSort = (a: Room, b: Room): number => {
  const floorA = a.floor ?? 0;
  const floorB = b.floor ?? 0;
  if (floorA !== floorB) return floorA - floorB;
  return a.name.localeCompare(b.name);
};

const RoomCard = ({
  room,
  devices,
  scenes,
}: {
  room: Room;
  devices: Device[];
  scenes: Scene[];
}): JSX.Element => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const lights = devices.filter((device) => device.vendor === 'hue' && device.kind === 'light');

  const run = async (id: string, action: () => Promise<void>): Promise<void> => {
    setBusyId(id);
    setErrorId(null);
    try {
      await action();
    } catch {
      setErrorId(id);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-lg bg-slate-900 border border-slate-800 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-100 truncate">{room.name}</h2>
          <p className="text-xs text-slate-500">
            {lights.length} {lights.length === 1 ? 'light' : 'lights'} · {scenes.length} {scenes.length === 1 ? 'scene' : 'scenes'}
          </p>
        </div>
        {room.icon && (
          <span className="shrink-0 rounded bg-slate-800 px-2 py-1 text-xs text-slate-400 capitalize">
            {room.icon.replace(/_/g, ' ')}
          </span>
        )}
      </div>

      {scenes.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {scenes.map((scene) => (
            <button
              key={scene.id}
              onClick={() => void run(scene.id, () => recallScene(room.id, scene.id))}
              disabled={busyId !== null}
              className="min-h-11 rounded bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50 active:bg-amber-300"
            >
              {busyId === scene.id ? 'Sending' : scene.name}
            </button>
          ))}
        </div>
      )}

      {lights.length > 0 && (
        <div className="space-y-2">
          {lights.map((light) => {
            const on = light.rawState?.on === true;
            const brightness = typeof light.rawState?.brightness === 'number'
              ? Math.round(light.rawState.brightness)
              : null;

            return (
              <div key={light.id} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded bg-slate-800 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-200">{light.name}</p>
                  <p className="text-xs text-slate-500">
                    {light.reachable ? (on ? 'On' : 'Off') : 'Unreachable'}{brightness !== null ? ` · ${brightness}%` : ''}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-1 w-24">
                  <button
                    onClick={() => void run(`${light.id}:on`, () => sendDeviceCommand(light.id, { on: true }))}
                    disabled={busyId !== null || !light.reachable}
                    className="h-9 rounded bg-slate-700 text-xs font-medium text-slate-100 disabled:opacity-40 active:bg-slate-600"
                  >
                    On
                  </button>
                  <button
                    onClick={() => void run(`${light.id}:off`, () => sendDeviceCommand(light.id, { on: false }))}
                    disabled={busyId !== null || !light.reachable}
                    className="h-9 rounded bg-slate-950 text-xs font-medium text-slate-300 disabled:opacity-40 active:bg-slate-700"
                  >
                    Off
                  </button>
                </div>
                {errorId?.startsWith(light.id) && (
                  <p className="col-span-2 text-xs text-red-400">Command failed.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export const Rooms = (): JSX.Element => {
  const { state, status, error, reload } = useRegistry();
  const rooms = useMemo(() => [...state.rooms].sort(roomSort), [state.rooms]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-100">Rooms</h1>
        <button
          onClick={reload}
          className="h-9 rounded bg-slate-800 px-3 text-xs font-medium text-slate-300 active:bg-slate-700"
        >
          Refresh
        </button>
      </div>

      {status === 'loading' && (
        <p className="text-sm text-slate-500">Loading rooms…</p>
      )}
      {status === 'error' && (
        <p className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">Could not load room registry: {error ?? 'unknown error'}.</p>
      )}
      {status === 'ok' && rooms.length === 0 && (
        <p className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm text-slate-500">No rooms discovered yet.</p>
      )}
      {status === 'ok' && rooms.map((room) => (
        <RoomCard
          key={room.id}
          room={room}
          devices={state.devices.filter((device) => device.roomId === room.id)}
          scenes={state.scenes.filter((scene) => scene.roomId === room.id)}
        />
      ))}
    </div>
  );
};
