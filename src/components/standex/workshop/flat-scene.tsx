import { magnetSize } from "@/lib/standex/magnetic-workshop";
import type { WorkshopConfig, CycleSample } from "@/lib/standex/magnetic-workshop";
import { sensorById, formatMm } from "@/lib/standex/sensor-catalog";
import { SensorPlan } from "./sensor-plan";

export default function FlatScene({
  config,
  sample,
  samples,
  xray = true,
  dimensions = true,
  zones = true,
  focus = "assembly",
}: {
  config: WorkshopConfig;
  sample: CycleSample;
  samples: CycleSample[];
  xray?: boolean;
  dimensions?: boolean;
  zones?: boolean;
  focus?: "assembly" | "sensor";
}) {
  const model = sensorById(config.sensorId),
    [l, , w] = model.body,
    [ml, , mw] = magnetSize(config);
  const axial = config.magnetization === "axial";
  const extent = focus === "sensor" ? Math.max(12, l * 1.6) : 180;
  const cx = focus === "sensor" ? config.mountX : 10,
    cy = focus === "sensor" ? config.mountZ : 18;
  const part = samples.filter((s) => (sample.t > 0.5 ? s.t >= 0.5 : s.t <= 0.5));
  return (
    <svg
      viewBox={`${cx - extent / 2} ${cy - extent * 0.36} ${extent} ${extent * 0.72}`}
      role="img"
      aria-label={`Vue plane à l'échelle · ${model.name}`}
      className="mw-flat"
    >
      <defs>
        <pattern id="mw-grid" width="5" height="5" patternUnits="userSpaceOnUse">
          <path d="M 5 0 L 0 0 0 5" fill="none" stroke="#d5dfe6" strokeWidth=".2" />
        </pattern>
      </defs>
      <rect
        x={cx - extent / 2}
        y={cy - extent * 0.36}
        width={extent}
        height={extent * 0.72}
        fill="url(#mw-grid)"
      />
      <g transform={`translate(${config.mountX} ${config.mountZ}) rotate(${config.mountAngle})`}>
        {part.slice(1).map((s, i) => (
          <path
            key={i}
            d={`M${part[i]!.position[0]} ${part[i]!.position[2]} L${s.position[0]} ${s.position[2]}`}
            fill="none"
            stroke={
              zones
                ? { closed: "#009d78", open: "#8497a6", unknown: "#c18b39" }[s.contact]
                : "#9aabb7"
            }
            strokeWidth={zones ? 0.65 : 0.3}
          />
        ))}
        <g transform={`rotate(${config.sensorAngle})`}>
          <SensorPlan model={model} contact={sample.contact} xray={xray} />
          <text
            x="0"
            y={-w / 2 - 3}
            textAnchor="middle"
            fontSize={Math.min(3, l * 0.19)}
            fill="#254061"
          >
            {model.name}
          </text>
          {dimensions && (
            <g fill="#577287" stroke="#577287" strokeWidth=".2">
              <path d={`M${-l / 2} ${w / 2 + 3} v2 H${l / 2} v-2`} fill="none" />
              <text
                x="0"
                y={w / 2 + 8}
                textAnchor="middle"
                fontSize={Math.min(2.6, l * 0.2)}
                stroke="none"
              >
                {formatMm(l)} mm · corps
              </text>
            </g>
          )}
        </g>
        <g
          transform={`translate(${sample.position[0]} ${sample.position[2]}) rotate(${sample.angle}) scale(${Math.max(0.08, Math.abs(Math.cos((config.magnetTilt * Math.PI) / 180)))} 1)`}
        >
          {config.magnetization === "thickness" ? (
            <g>
              <rect
                x={-ml / 2}
                y={-mw / 2}
                width={ml}
                height={mw}
                fill={config.polarity === 1 ? "#e14242" : "#237dd0"}
              />
              <text y="0" fontSize="2.4" fill="white" textAnchor="middle">
                {config.polarity === 1 ? "N dessus / S dessous" : "S dessus / N dessous"}
              </text>
            </g>
          ) : (
            [-1, 1].map((sign) => {
              const north = sign * config.polarity === 1;
              return (
                <g
                  key={sign}
                  transform={
                    axial ? `translate(${(sign * ml) / 4} 0)` : `translate(0 ${(sign * mw) / 4})`
                  }
                >
                  <rect
                    x={axial ? -ml / 4 : -ml / 2}
                    y={axial ? -mw / 2 : -mw / 4}
                    width={axial ? ml / 2 : ml}
                    height={axial ? mw : mw / 2}
                    fill={north ? "#e14242" : "#237dd0"}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={Math.min(4, mw * 0.45)}
                    fontWeight="800"
                    fill="white"
                  >
                    {north ? "N" : "S"}
                  </text>
                </g>
              );
            })
          )}
          <text y={mw / 2 + 4} textAnchor="middle" fontSize="2.6" fill="#536b80">
            {config.mode === "reference" ? "M02 · pôles symboliques" : "Aimant"}
          </text>
        </g>
      </g>
      {dimensions && (
        <g transform={`translate(${cx - extent * 0.39} ${cy + extent * 0.27})`} fill="#577287">
          <path
            d="M0 -1 V1 M0 0 H10 M5 -1 V1 M10 -1 V1"
            fill="none"
            stroke="#577287"
            strokeWidth=".35"
          />
          <text x="5" y={extent * 0.025} textAnchor="middle" fontSize={extent * 0.016}>
            10 mm
          </text>
        </g>
      )}
    </svg>
  );
}
