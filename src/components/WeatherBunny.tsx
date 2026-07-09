// 날씨에 반응하는 토끼 캐릭터 — 비(우산), 눈(목도리+눈송이), 뇌우(놀람+번개),
// 맑음(해+감은 눈웃음), 흐림(구름), idle(기본)
export type BunnyKind = "sun" | "cloud" | "rain" | "snow" | "thunder" | "idle";

const OUTLINE = "#52465e";
const PINK = "#ffd1de";
const BLUSH = "#ffc2d1";
const YELLOW = "#ffd166";
const YELLOW_DEEP = "#f2b94a";
const BLUE = "#5b8def";

function Eyes({ kind }: { kind: BunnyKind }) {
  if (kind === "sun") {
    // 기분 좋은 눈웃음
    return (
      <g stroke={OUTLINE} strokeWidth={4.5} strokeLinecap="round" fill="none">
        <path d="M71 116 Q80 107 89 116" />
        <path d="M111 116 Q120 107 129 116" />
      </g>
    );
  }
  if (kind === "thunder") {
    // 깜짝 놀란 눈
    return (
      <g>
        <circle cx={80} cy={115} r={7} fill={OUTLINE} />
        <circle cx={120} cy={115} r={7} fill={OUTLINE} />
        <circle cx={82.5} cy={112.5} r={2.4} fill="#fff" />
        <circle cx={122.5} cy={112.5} r={2.4} fill="#fff" />
      </g>
    );
  }
  return (
    <g>
      <circle cx={80} cy={115} r={5.5} fill={OUTLINE} />
      <circle cx={120} cy={115} r={5.5} fill={OUTLINE} />
      <circle cx={82} cy={113} r={1.8} fill="#fff" />
      <circle cx={122} cy={113} r={1.8} fill="#fff" />
    </g>
  );
}

export default function WeatherBunny({
  kind,
  size = 150,
}: {
  kind: BunnyKind;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label="날씨 토끼"
    >
      {/* 그림자 */}
      <ellipse cx={100} cy={187} rx={42} ry={7} fill="#3d3652" opacity={0.08} />

      {/* 배경 소품 (캐릭터 뒤) */}
      {kind === "sun" && (
        <g>
          <circle cx={162} cy={38} r={15} fill={YELLOW} />
          <g stroke={YELLOW} strokeWidth={4} strokeLinecap="round">
            <line x1={162} y1={12} x2={162} y2={19} />
            <line x1={162} y1={57} x2={162} y2={64} />
            <line x1={136} y1={38} x2={143} y2={38} />
            <line x1={181} y1={38} x2={188} y2={38} />
            <line x1={144} y1={20} x2={149} y2={25} />
            <line x1={175} y1={51} x2={180} y2={56} />
            <line x1={180} y1={20} x2={175} y2={25} />
            <line x1={149} y1={51} x2={144} y2={56} />
          </g>
        </g>
      )}
      {kind === "cloud" && (
        <g fill="#ffffff" opacity={0.95} stroke="#dfe8f2" strokeWidth={2}>
          <circle cx={30} cy={46} r={11} />
          <circle cx={48} cy={40} r={14} />
          <ellipse cx={42} cy={50} rx={24} ry={12} />
        </g>
      )}
      {kind === "thunder" && (
        <path
          d="M156 40 L138 76 L150 76 L134 112 L160 70 L147 70 Z"
          fill={YELLOW}
          stroke={YELLOW_DEEP}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      )}
      {kind === "snow" && (
        <g stroke="#8fb3ff" strokeWidth={3} strokeLinecap="round" opacity={0.9}>
          {[
            [36, 58],
            [166, 74],
            [44, 148],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <line x1={x - 7} y1={y} x2={x + 7} y2={y} />
              <line x1={x} y1={y - 7} x2={x} y2={y + 7} />
              <line x1={x - 5} y1={y - 5} x2={x + 5} y2={y + 5} />
              <line x1={x - 5} y1={y + 5} x2={x + 5} y2={y - 5} />
            </g>
          ))}
        </g>
      )}
      {kind === "rain" && (
        <g stroke={BLUE} strokeWidth={4.5} strokeLinecap="round" opacity={0.85}>
          <line x1={38} y1={86} x2={32} y2={100} />
          <line x1={166} y1={80} x2={160} y2={94} />
          <line x1={28} y1={126} x2={22} y2={140} />
          <line x1={174} y1={120} x2={168} y2={134} />
        </g>
      )}

      {/* 귀 (머리 뒤) */}
      <g>
        <ellipse cx={74} cy={52} rx={15} ry={40} fill="#fff" transform="rotate(-10 74 52)" />
        <ellipse cx={126} cy={52} rx={15} ry={40} fill="#fff" transform="rotate(10 126 52)" />
        <ellipse cx={74} cy={56} rx={7} ry={26} fill={PINK} transform="rotate(-10 74 56)" />
        <ellipse cx={126} cy={56} rx={7} ry={26} fill={PINK} transform="rotate(10 126 56)" />
      </g>

      {/* 우산대 (머리 위로 살짝 보이게, 캐노피보다 먼저) */}
      {kind === "rain" && (
        <line x1={100} y1={50} x2={100} y2={78} stroke="#b98a3a" strokeWidth={4} strokeLinecap="round" />
      )}

      {/* 머리 */}
      <circle cx={100} cy={122} r={56} fill="#fff" />

      {/* 얼굴 */}
      <Eyes kind={kind} />
      <circle cx={66} cy={138} r={9} fill={BLUSH} opacity={0.75} />
      <circle cx={134} cy={138} r={9} fill={BLUSH} opacity={0.75} />
      <circle cx={100} cy={127} r={3.5} fill="#f4a0b5" />
      <path
        d="M92 135 Q100 142 108 135"
        stroke={OUTLINE}
        strokeWidth={3}
        strokeLinecap="round"
        fill="none"
      />

      {/* 목도리 (머리 위에 겹치게) */}
      {kind === "snow" && (
        <g>
          <rect x={72} y={160} width={56} height={15} rx={7.5} fill="#9db7f5" />
          <rect x={108} y={168} width={13} height={22} rx={6} fill="#9db7f5" />
        </g>
      )}

      {/* 우산 캐노피 (맨 위 레이어 — 귀를 살짝 덮어 쓰고 있는 느낌) */}
      {kind === "rain" && (
        <g>
          <path
            d="M52 52 A48 42 0 0 1 148 52 Q136 44 124 52 Q112 44 100 52 Q88 44 76 52 Q64 44 52 52 Z"
            fill={YELLOW}
            stroke={YELLOW_DEEP}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          <line x1={100} y1={10} x2={100} y2={17} stroke={YELLOW_DEEP} strokeWidth={4} strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
