// 날씨에 반응하는 토끼 캐릭터 2.1 — 날씨별 전용 모션
// - idle: 손 흔들기 / sun: 폴짝폴짝 / cloud: 고개 갸웃 / rain: 우산 살랑 + 앞발 까딱
// - snow: 부르르 떨기 / thunder: 벌벌 떨기(빠른 미세 진동)
// - 공통: 눈 깜빡임, 빗방울/눈송이 낙하, 햇살 회전, prefers-reduced-motion 대응
export type BunnyKind = "sun" | "cloud" | "rain" | "snow" | "thunder" | "idle";

const OUTLINE = "#4a3f55";
const PINK_INNER = "#ffd3df";
const BLUSH = "#ffc2d1";
const NOSE = "#f49ab1";
// 흰 카드 위에서도 형태가 보이도록 몸통은 살짝 진하게 + 연보라 테두리
const BODY = "#ede2f7";
const SOFT_EDGE = "#ddcfee";
const WHISKER = "#d8cce2";
const YELLOW = "#ffd166";
const YELLOW_DEEP = "#eab54a";
const BLUE = "#5b8def";

function Eyes({ kind }: { kind: BunnyKind }) {
  if (kind === "sun") {
    // 행복한 눈웃음
    return (
      <g stroke={OUTLINE} strokeWidth={5} strokeLinecap="round" fill="none">
        <path d="M69 118 Q78 108 87 118" />
        <path d="M113 118 Q122 108 131 118" />
      </g>
    );
  }
  if (kind === "thunder") {
    // 깜짝 놀란 왕눈이
    return (
      <g>
        <circle cx={78} cy={117} r={8.5} fill={OUTLINE} />
        <circle cx={122} cy={117} r={8.5} fill={OUTLINE} />
        <circle cx={81} cy={114} r={3} fill="#fff" />
        <circle cx={125} cy={114} r={3} fill="#fff" />
        <circle cx={75.5} cy={120} r={1.4} fill="#fff" opacity={0.8} />
        <circle cx={119.5} cy={120} r={1.4} fill="#fff" opacity={0.8} />
      </g>
    );
  }
  // 기본: 반짝이 두 개 + 깜빡임
  return (
    <g className="wfb-eye-blink">
      <circle cx={78} cy={118} r={7.5} fill={OUTLINE} />
      <circle cx={122} cy={118} r={7.5} fill={OUTLINE} />
      <circle cx={80.5} cy={115.5} r={2.8} fill="#fff" />
      <circle cx={124.5} cy={115.5} r={2.8} fill="#fff" />
      <circle cx={76} cy={121} r={1.3} fill="#fff" opacity={0.85} />
      <circle cx={120} cy={121} r={1.3} fill="#fff" opacity={0.85} />
    </g>
  );
}

function Mouth({ kind }: { kind: BunnyKind }) {
  if (kind === "thunder") {
    // 놀라서 벌어진 입
    return (
      <ellipse cx={100} cy={134} rx={4} ry={5} fill="none" stroke={OUTLINE} strokeWidth={2.6} />
    );
  }
  if (kind === "sun") {
    return (
      <path
        d="M90 130 Q100 140 110 130"
        stroke={OUTLINE}
        strokeWidth={2.8}
        strokeLinecap="round"
        fill="none"
      />
    );
  }
  // 기본 ω 입
  return (
    <path
      d="M91 131 Q95.5 138 100 131 Q104.5 138 109 131"
      stroke={OUTLINE}
      strokeWidth={2.6}
      strokeLinecap="round"
      fill="none"
    />
  );
}

export default function WeatherBunny({
  kind,
  size = 150,
}: {
  kind: BunnyKind;
  size?: number;
}) {
  // 바깥 그룹: 기본 둥실 / 맑음은 폴짝폴짝
  const outerMotion = kind === "sun" ? "wfb-hop" : "wfb-float";
  // 안쪽 그룹: 눈=부르르, 뇌우=벌벌
  const innerMotion =
    kind === "snow" ? "wfb-shiver" : kind === "thunder" ? "wfb-tremble" : "";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label="날씨 토끼"
    >
      <style>{`
        .wfb-float { animation: wfb-float 3.4s ease-in-out infinite; }
        .wfb-hop { animation: wfb-hop 2.4s ease-in-out infinite; }
        .wfb-shiver { animation: wfb-shake .5s ease-in-out infinite; }
        .wfb-tremble { animation: wfb-shake .16s linear infinite; }
        .wfb-tilt { transform-box: fill-box; transform-origin: 50% 95%; animation: wfb-tilt 4.2s ease-in-out infinite; }
        .wfb-wave { transform-box: fill-box; transform-origin: 50% 90%; animation: wfb-wave 1s ease-in-out infinite; }
        .wfb-tap { animation: wfb-tap .9s ease-in-out infinite; }
        .wfb-eye-blink { transform-box: fill-box; transform-origin: center; animation: wfb-blink 4.6s ease-in-out infinite; }
        .wfb-umb { transform-box: fill-box; transform-origin: 50% 100%; animation: wfb-sway 3.4s ease-in-out infinite; }
        .wfb-drop { animation: wfb-fall 1.5s linear infinite; }
        .wfb-drop-b { animation-delay: .5s; }
        .wfb-drop-c { animation-delay: .9s; }
        .wfb-drop-d { animation-delay: 1.2s; }
        .wfb-snowf { animation: wfb-snowfall 3.2s ease-in infinite; }
        .wfb-snowf-b { animation-delay: 1.1s; }
        .wfb-snowf-c { animation-delay: 2.2s; }
        .wfb-rays { transform-box: fill-box; transform-origin: center; animation: wfb-spin 26s linear infinite; }
        .wfb-twinkle { animation: wfb-twinkle 2.4s ease-in-out infinite; }
        .wfb-twinkle-b { animation-delay: 1.2s; }
        @keyframes wfb-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes wfb-hop {
          0%, 62%, 100% { transform: translateY(0); }
          12% { transform: translateY(-14px); }
          24% { transform: translateY(0); }
          36% { transform: translateY(-9px); }
          48% { transform: translateY(0); }
        }
        @keyframes wfb-shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-1.8px); } 75% { transform: translateX(1.8px); } }
        @keyframes wfb-tilt {
          0%, 22%, 78%, 100% { transform: rotate(0deg); }
          38%, 62% { transform: rotate(8deg); }
        }
        @keyframes wfb-wave { 0%,100% { transform: rotate(-6deg); } 50% { transform: rotate(26deg); } }
        @keyframes wfb-tap { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3.5px); } }
        @keyframes wfb-blink { 0%,91%,100% { transform: scaleY(1); } 94% { transform: scaleY(.08); } }
        @keyframes wfb-sway { 0%,100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
        @keyframes wfb-fall { 0% { transform: translateY(-8px); opacity: 0; } 25% { opacity: .9; } 100% { transform: translateY(16px); opacity: 0; } }
        @keyframes wfb-snowfall { 0% { transform: translateY(-6px); opacity: 0; } 30% { opacity: .9; } 100% { transform: translateY(18px); opacity: 0; } }
        @keyframes wfb-spin { to { transform: rotate(360deg); } }
        @keyframes wfb-twinkle { 0%,100% { opacity: .25; transform: scale(.85); } 50% { opacity: 1; transform: scale(1.08); } }
        @media (prefers-reduced-motion: reduce) {
          .wfb-float, .wfb-hop, .wfb-shiver, .wfb-tremble, .wfb-tilt, .wfb-wave, .wfb-tap,
          .wfb-eye-blink, .wfb-umb, .wfb-drop, .wfb-snowf, .wfb-rays, .wfb-twinkle { animation: none !important; }
        }
      `}</style>

      {/* 바닥 그림자 (고정 — 폴짝 뛸 때 바닥 기준이 됨) */}
      <ellipse cx={100} cy={189} rx={42} ry={6} fill="#3d3652" opacity={0.08} />

      {/* 배경 소품 */}
      {kind === "sun" && (
        <g>
          <circle cx={160} cy={36} r={14} fill={YELLOW} />
          <g className="wfb-rays" stroke={YELLOW} strokeWidth={4} strokeLinecap="round">
            <line x1={160} y1={12} x2={160} y2={18} />
            <line x1={160} y1={54} x2={160} y2={60} />
            <line x1={136} y1={36} x2={142} y2={36} />
            <line x1={178} y1={36} x2={184} y2={36} />
            <line x1={143} y1={19} x2={147.5} y2={23.5} />
            <line x1={172.5} y1={48.5} x2={177} y2={53} />
            <line x1={177} y1={19} x2={172.5} y2={23.5} />
            <line x1={147.5} y1={48.5} x2={143} y2={53} />
          </g>
        </g>
      )}
      {kind === "cloud" && (
        <g fill="#ffffff" opacity={0.95} stroke="#dfe8f2" strokeWidth={2}>
          <circle cx={30} cy={44} r={10} />
          <circle cx={46} cy={38} r={13} />
          <ellipse cx={42} cy={48} rx={24} ry={11} />
        </g>
      )}
      {kind === "thunder" && (
        <path
          d="M154 38 L136 74 L148 74 L132 110 L158 66 L145 66 Z"
          fill={YELLOW}
          stroke={YELLOW_DEEP}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      )}
      {kind === "snow" && (
        <g stroke="#a8c4ff" strokeWidth={2.6} strokeLinecap="round">
          {[
            ["", 34, 52],
            ["wfb-snowf-b", 166, 66],
            ["wfb-snowf-c", 40, 140],
          ].map(([extra, x, y]) => (
            <g key={`${x}-${y}`} className={`wfb-snowf ${extra}`}>
              <line x1={Number(x) - 6} y1={y} x2={Number(x) + 6} y2={y} />
              <line x1={x} y1={Number(y) - 6} x2={x} y2={Number(y) + 6} />
              <line x1={Number(x) - 4.2} y1={Number(y) - 4.2} x2={Number(x) + 4.2} y2={Number(y) + 4.2} />
              <line x1={Number(x) - 4.2} y1={Number(y) + 4.2} x2={Number(x) + 4.2} y2={Number(y) - 4.2} />
            </g>
          ))}
        </g>
      )}
      {kind === "rain" && (
        <g stroke={BLUE} strokeWidth={4.5} strokeLinecap="round">
          <line className="wfb-drop" x1={34} y1={90} x2={29} y2={102} />
          <line className="wfb-drop wfb-drop-b" x1={168} y1={84} x2={163} y2={96} />
          <line className="wfb-drop wfb-drop-c" x1={24} y1={130} x2={19} y2={142} />
          <line className="wfb-drop wfb-drop-d" x1={176} y1={126} x2={171} y2={138} />
        </g>
      )}
      {kind === "idle" && (
        <g fill="#c9b8f0">
          <path className="wfb-twinkle" d="M36 52 L38.5 58 L44.5 60.5 L38.5 63 L36 69 L33.5 63 L27.5 60.5 L33.5 58 Z" />
          <path className="wfb-twinkle wfb-twinkle-b" d="M164 74 L166 79 L171 81 L166 83 L164 88 L162 83 L157 81 L162 79 Z" />
        </g>
      )}

      {/* ---- 캐릭터 ---- */}
      <g className={outerMotion}>
        <g className={innerMotion || undefined}>
          {/* 몸통 + 앞발 */}
          <ellipse cx={100} cy={163} rx={40} ry={27} fill={BODY} stroke={SOFT_EDGE} strokeWidth={2} />
          <ellipse
            className={kind === "rain" ? "wfb-tap" : undefined}
            cx={82}
            cy={184}
            rx={11}
            ry={7.5}
            fill="#fff"
            stroke={SOFT_EDGE}
            strokeWidth={1.5}
          />
          {kind !== "idle" && (
            <ellipse cx={118} cy={184} rx={11} ry={7.5} fill="#fff" stroke={SOFT_EDGE} strokeWidth={1.5} />
          )}

          {/* 머리 그룹 — 흐림이면 갸웃갸웃 */}
          <g className={kind === "cloud" ? "wfb-tilt" : undefined}>
            {/* 귀 — 왼쪽은 쫑긋, 오른쪽은 살짝 기울어서 장난스럽게 */}
            <ellipse cx={74} cy={46} rx={14} ry={34} fill="#fff" stroke={SOFT_EDGE} strokeWidth={2} transform="rotate(-8 74 46)" />
            <ellipse cx={74} cy={50} rx={6.5} ry={21} fill={PINK_INNER} transform="rotate(-8 74 50)" />
            <ellipse cx={126} cy={48} rx={14} ry={31} fill="#fff" stroke={SOFT_EDGE} strokeWidth={2} transform="rotate(17 126 48)" />
            <ellipse cx={126} cy={52} rx={6.5} ry={19} fill={PINK_INNER} transform="rotate(17 126 52)" />

            {/* 우산 (비): 캐노피가 귀를 살짝 덮게, 통째로 살랑살랑 */}
            {kind === "rain" && (
              <g className="wfb-umb">
                <line x1={100} y1={44} x2={100} y2={58} stroke="#b98a3a" strokeWidth={4} strokeLinecap="round" />
                <path
                  d="M52 46 A48 40 0 0 1 148 46 Q136 38 124 46 Q112 38 100 46 Q88 38 76 46 Q64 38 52 46 Z"
                  fill={YELLOW}
                  stroke={YELLOW_DEEP}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                />
                <line x1={100} y1={8} x2={100} y2={14} stroke={YELLOW_DEEP} strokeWidth={4} strokeLinecap="round" />
              </g>
            )}

            {/* 머리 — 옆으로 통통한 아기 비율 */}
            <ellipse cx={100} cy={108} rx={58} ry={52} fill="#fff" stroke={SOFT_EDGE} strokeWidth={2} />

            {/* 수염 점 */}
            <g fill={WHISKER}>
              <circle cx={46} cy={119} r={1.7} />
              <circle cx={52} cy={126} r={1.7} />
              <circle cx={44} cy={128} r={1.7} />
              <circle cx={154} cy={119} r={1.7} />
              <circle cx={148} cy={126} r={1.7} />
              <circle cx={156} cy={128} r={1.7} />
            </g>

            {/* 볼터치 */}
            <ellipse cx={62} cy={131} rx={11} ry={7} fill={BLUSH} opacity={0.8} />
            <ellipse cx={138} cy={131} rx={11} ry={7} fill={BLUSH} opacity={0.8} />

            {/* 얼굴 */}
            <Eyes kind={kind} />
            <ellipse cx={100} cy={126} rx={4.2} ry={3.2} fill={NOSE} />
            <Mouth kind={kind} />
          </g>

          {/* 목도리 (눈) — 머리 아래 목 위치에 겹치게 */}
          {kind === "snow" && (
            <g fill="#9db7f5">
              <rect x={72} y={146} width={56} height={13} rx={6.5} />
              <rect x={108} y={156} width={12} height={20} rx={6} />
            </g>
          )}

          {/* 손 흔들기 (대기 상태): 오른팔을 들어 인사 */}
          {kind === "idle" && (
            <ellipse
              className="wfb-wave"
              cx={147}
              cy={143}
              rx={8.5}
              ry={13}
              fill="#fff"
              stroke={SOFT_EDGE}
              strokeWidth={1.5}
              transform="rotate(-18 147 143)"
            />
          )}
        </g>
      </g>
    </svg>
  );
}
