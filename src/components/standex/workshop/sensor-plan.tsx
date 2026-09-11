import type { SensorModel } from "@/lib/standex/sensor-catalog";
import { bladeLength, bladeOffsetZ } from "@/lib/standex/sensor-catalog";
import type { Contact } from "@/lib/standex/magnetic-workshop";

/** Plan projection in real body mm, reused by catalogue and flat scene. */
export function SensorPlan({
  model,
  contact = "open",
  xray = true,
  showCable = true,
}: {
  model: SensorModel;
  contact?: Contact;
  xray?: boolean;
  showCable?: boolean;
}) {
  const [l, , w] = model.body,
    length = bladeLength(model),
    z = bladeOffsetZ(model);
  const closed = contact === "closed",
    color = closed ? "#009d78" : contact === "unknown" ? "#b78035" : "#79909e";
  const cableSide = model.cableSide ?? -1;
  if (model.shape === "glass")
    return (
      <g>
        <path
          d={`M${-l / 2 - 8} 0 H${-l / 2 + 1} M${l / 2 - 1} 0 H${l / 2 + 8}`}
          stroke="#8b999e"
          strokeWidth="0.35"
        />
        <rect
          x={-l / 2}
          y={-w / 2}
          width={l}
          height={w}
          rx={w / 2}
          fill="#d4e7e0"
          fillOpacity="0.6"
          stroke="#72998b"
          strokeWidth="0.15"
        />
        <path
          d={`M${-l / 2} 0 L1 ${closed ? 0 : -0.22} M${l / 2} 0 L-1 ${closed ? 0 : 0.22}`}
          stroke={color}
          strokeWidth="0.3"
        />
        {[-1, 1].map((sign) => (
          <ellipse
            key={sign}
            cx={sign * (l / 2 - 0.45)}
            cy="0"
            rx="0.5"
            ry={w * 0.4}
            fill="#81a596"
          />
        ))}
      </g>
    );
  return (
    <g>
      {model.shape === "smd" ? (
        [-1, 1].map((sign) => (
          <rect
            key={sign}
            x={sign < 0 ? -(model.terminalSpan ?? l) / 2 : l / 2 - 0.4}
            y={-w * 0.32}
            width={Math.max(0.65, ((model.terminalSpan ?? l) - l) / 2 + 0.4)}
            height={w * 0.64}
            rx={0.08}
            fill="#aab5be"
          />
        ))
      ) : showCable ? (
        <path
          d={`M${(cableSide * l) / 2} ${-w * 0.17} h${cableSide * 7} M${(cableSide * l) / 2} ${w * 0.17} h${cableSide * 7}`}
          stroke="#8394a1"
          strokeWidth={Math.min(0.65, w * 0.12)}
        />
      ) : null}
      <rect
        x={-l / 2}
        y={-w / 2}
        width={l}
        height={w}
        rx={
          model.shape === "cylinder" || model.shape === "pressfit" ? 0.4 : Math.min(0.5, w * 0.12)
        }
        fill={model.color}
        fillOpacity={xray ? 0.28 : 1}
        stroke={model.color}
        strokeWidth={0.28}
      />
      {model.shape === "flange" && (
        <path
          d={`M${-l / 2} ${-w / 2 + (model.raisedDepth ?? w)} H${l / 2}`}
          stroke={model.color}
          strokeWidth={0.3}
        />
      )}
      {model.holes?.map(([x, z, hl, hw], i) => (
        <rect
          key={i}
          x={x - hl / 2}
          y={z - hw / 2}
          width={hl}
          height={hw}
          rx={Math.min(hl, hw) / 2}
          fill="#f2f6f8"
          stroke={model.color}
          strokeWidth={0.22}
        />
      ))}
      {model.shape === "threaded" && (
        <>
          {Array.from({ length: Math.floor(l / 1.5) }, (_, i) => (
            <path
              key={i}
              d={`M${-l / 2 + i * 1.5} ${-w / 2} l.6 ${w}`}
              stroke={model.color}
              strokeOpacity={0.5}
              strokeWidth={0.3}
            />
          ))}
          {[-0.24, 0.24].map((x) => (
            <rect
              key={x}
              x={l * x - 1.2}
              y={-(model.nutWidth ?? w) / 2}
              width={2.4}
              height={model.nutWidth ?? w}
              fill={model.color}
              fillOpacity={0.6}
            />
          ))}
        </>
      )}
      {model.shape === "pressfit" && (
        <rect
          x={l / 2 - 0.8}
          y={-(model.collarDiameter ?? w) / 2}
          width={0.8}
          height={model.collarDiameter ?? w}
          rx={0.15}
          fill={model.color}
          fillOpacity={0.6}
        />
      )}
      {xray && (
        <g transform={`translate(0 ${z})`}>
          <path
            d={`M${-length / 2} ${closed ? 0 : -w * 0.12} L${length * 0.03} ${closed ? 0 : -w * 0.12} M${length / 2} ${closed ? 0 : w * 0.12} L${-length * 0.03} ${closed ? 0 : w * 0.12}`}
            stroke={color}
            strokeWidth={Math.max(0.12, Math.min(0.8, w * 0.12))}
            strokeLinecap="round"
          />
          <circle r={Math.max(0.12, w * 0.1)} fill={color} />
        </g>
      )}
    </g>
  );
}
