import type { FoxEssLive } from '@helios/shared';

interface Props {
  live: FoxEssLive;
}

const fmtW = (w: number): string =>
  Math.abs(w) >= 1000 ? `${(w / 1000).toFixed(1)} kW` : `${Math.round(w)} W`;

interface NodeProps {
  x: number;
  y: number;
  icon: string;
  label: string;
  value: string;
  sub?: string;
  color: string;
}

const Node = ({ x, y, icon, label, value, sub, color }: NodeProps): JSX.Element => (
  <g transform={`translate(${x},${y})`}>
    <rect x={-52} y={-44} width={104} height={88} rx={12} fill="#1e293b" stroke={color} strokeWidth={1.5} />
    <text textAnchor="middle" y={-18} fontSize={22}>{icon}</text>
    <text textAnchor="middle" y={2} fontSize={11} fill="#94a3b8">{label}</text>
    <text textAnchor="middle" y={20} fontSize={15} fontWeight="600" fill={color}>{value}</text>
    {sub && <text textAnchor="middle" y={36} fontSize={10} fill="#64748b">{sub}</text>}
  </g>
);

interface ArrowProps {
  x1: number; y1: number;
  x2: number; y2: number;
  active: boolean;
  color: string;
  reverse?: boolean;
}

// Draws a line with an arrowhead at the destination end (or source end if reverse)
const Arrow = ({ x1, y1, x2, y2, active, color, reverse = false }: ArrowProps): JSX.Element => {
  if (!active) return <></>;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len;
  const uy = dy / len;

  // Arrow tip and base
  const tipX = reverse ? x1 : x2;
  const tipY = reverse ? y1 : y2;
  const baseX = reverse ? x1 + ux * 12 : x2 - ux * 12;
  const baseY = reverse ? y1 + uy * 12 : y2 - uy * 12;
  const perpX = -uy * 5;
  const perpY = ux * 5;

  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={2} strokeDasharray={active ? 'none' : '4 4'} opacity={0.7} />
      <polygon
        points={`${tipX},${tipY} ${baseX + perpX},${baseY + perpY} ${baseX - perpX},${baseY - perpY}`}
        fill={color}
        opacity={0.85}
      />
    </g>
  );
};

export const FlowDiagram = ({ live }: Props): JSX.Element => {
  const pvW = live.pvPower * 1000;
  const batW = live.batPower * 1000;   // positive = charging, negative = discharging
  const gridW = live.gridPower * 1000; // positive = importing, negative = exporting
  const loadW = live.loadsPower * 1000;

  const isGenerating = pvW > 20;
  const isCharging = batW > 20;
  const isDischarging = batW < -20;
  const isImporting = gridW > 20;
  const isExporting = gridW < -20;

  // SVG layout: 340×240, nodes at fixed positions
  // Solar: top-center (170, 50)
  // Home:  center (170, 140)
  // Battery: bottom-left (70, 230)
  // Grid: bottom-right (270, 230)

  const solar = { x: 170, y: 50 };
  const home = { x: 170, y: 148 };
  const battery = { x: 68, y: 230 };
  const grid = { x: 272, y: 230 };

  // Node edges (top/bottom/left/right of 104×88 box, centre-aligned)
  const solarBottom = { x: solar.x, y: solar.y + 44 };
  const homeTop = { x: home.x, y: home.y - 44 };
  const homeBottomL = { x: home.x - 30, y: home.y + 44 };
  const homeBottomR = { x: home.x + 30, y: home.y + 44 };
  const battTop = { x: battery.x, y: battery.y - 44 };
  const gridTop = { x: grid.x, y: grid.y - 44 };

  return (
    <svg viewBox="0 0 340 290" width="100%" style={{ maxHeight: 260 }}>
      {/* Solar → Home */}
      <Arrow x1={solarBottom.x} y1={solarBottom.y} x2={homeTop.x} y2={homeTop.y} active={isGenerating} color="#fbbf24" />

      {/* Home → Battery (charging) or Battery → Home (discharging) */}
      <Arrow
        x1={homeBottomL.x} y1={homeBottomL.y}
        x2={battTop.x} y2={battTop.y}
        active={isCharging || isDischarging}
        color="#34d399"
        reverse={isDischarging}
      />

      {/* Home → Grid (exporting) or Grid → Home (importing) */}
      <Arrow
        x1={homeBottomR.x} y1={homeBottomR.y}
        x2={gridTop.x} y2={gridTop.y}
        active={isImporting || isExporting}
        color={isExporting ? '#34d399' : '#94a3b8'}
        reverse={isImporting}
      />

      {/* Nodes */}
      <Node
        x={solar.x} y={solar.y}
        icon="☀️" label="Solar" value={fmtW(pvW)}
        color={isGenerating ? '#fbbf24' : '#475569'}
      />
      <Node
        x={home.x} y={home.y}
        icon="🏠" label="Home" value={fmtW(loadW)}
        color="#e2e8f0"
      />
      <Node
        x={battery.x} y={battery.y}
        icon="🔋" label="Battery" value={`${Math.round(live.batSoc)}%`}
        sub={isCharging ? `+${fmtW(batW)}` : isDischarging ? `−${fmtW(-batW)}` : 'idle'}
        color={live.batSoc > 20 ? '#34d399' : '#f87171'}
      />
      <Node
        x={grid.x} y={grid.y}
        icon="⚡" label="Grid" value={isExporting ? `−${fmtW(-gridW)}` : fmtW(gridW)}
        sub={isExporting ? 'exporting' : isImporting ? 'importing' : 'balanced'}
        color={isExporting ? '#34d399' : isImporting ? '#94a3b8' : '#475569'}
      />
    </svg>
  );
};
