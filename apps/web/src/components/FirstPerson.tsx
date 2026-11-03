import type { CSSProperties } from 'react';
import { DEFAULT_CONFIG, cigaretteBurnedMs, type Cigarette, type Config, type Snapshot } from '@open-toilet/protocol';
import type { Effect } from '../connection/client';

interface FirstPersonProps {
  snapshot: Snapshot;
  selfId: string;
  /** 서버 시각 기준 현재 시각(ms) */
  serverNow: number;
  bubbles: Record<string, { id: string; text: string }>;
  effects: Effect[];
  config: Config | null;
}

const DOOR_GREEN = '#2f9373';
const SELF = '#ffa94d';
const SELF_SHADE = '#e8913a';

// 문 위치 (viewBox 1000 x 700)
const DOOR = { x: 330, y: 100, w: 340, h: 486 };
const FLOOR_Y = 600;

// 담배를 든 손의 위치와 담배 기울기 (오른쪽 아래 버튼들에 가리지 않게 무릎 위쪽에 둔다)
const HAND_X = 660;
const HAND_Y = 520;
const CIG_ANGLE = 25;
const FILTER = 34;
/** 필터를 뺀 담뱃잎 부분의 길이 */
const TOBACCO = 96;
/** 재는 이 길이 넘게는 매달리지 않는다 (그 이상은 처진다) */
const ASH_MAX = 34;

// 끄기 연출이 향하는 곳
const WALL_SPOT = { x: 140, y: 400 };
const FLOOR_SPOT = { x: 110, y: 660 };

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** 효과 id로 항상 같은 난수열을 만든다 (Scene과 같은 방식) */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

interface CigaretteShape {
  lit: boolean;
  /** 아직 타지 않은 종이 부분 길이 */
  paper: number;
  /** 끝에 매달린 재 길이 */
  ash: number;
}

/** 서버가 준 담배 상태와 현재 시각으로 화면에 그릴 길이를 정한다 */
function cigaretteShape(cigarette: Cigarette, now: number, config: Config): CigaretteShape {
  const burned = Math.min(cigaretteBurnedMs(cigarette, now, config), config.cigaretteBurnMs);
  const toLength = (ms: number) => (ms / config.cigaretteBurnMs) * TOBACCO;
  return {
    lit: cigarette.litAt !== null,
    paper: TOBACCO - toLength(burned),
    ash: Math.min(ASH_MAX, toLength(Math.max(0, burned - cigarette.ashClearedAt))),
  };
}

/** 손 기준 좌표에서 담배 축을 따라 distance만큼 간 화면 좌표 */
function alongCigarette(distance: number): { x: number; y: number } {
  const rad = (CIG_ANGLE * Math.PI) / 180;
  return { x: HAND_X - distance * Math.cos(rad), y: HAND_Y - 18 - distance * Math.sin(rad) };
}

/** 칸막이 안쪽: 천장·양옆 벽·바닥과 정면의 닫힌 문 */
function Stall({ occupiedLabel, waiting, knocking }: { occupiedLabel: string; waiting: number; knocking: boolean }) {
  const feet = Array.from({ length: Math.min(3, waiting) }, (_, i) => DOOR.x + 70 + i * 100);
  return (
    <g>
      {/* 천장과 조명 */}
      <polygon points="0,0 1000,0 800,70 200,70" fill="#0d2a20" />
      <ellipse cx="500" cy="30" rx="70" ry="14" fill="#fff4c2" opacity="0.85" />
      <ellipse cx="500" cy="30" rx="140" ry="40" fill="#fff4c2" opacity="0.08" />

      {/* 양옆 벽 */}
      <polygon points="0,0 200,70 200,600 0,700" fill="#14402f" />
      <polygon points="1000,0 800,70 800,600 1000,700" fill="#14402f" />
      <polygon points="0,0 200,70 200,600 0,700" fill="#000" opacity="0.18" />

      {/* 바닥 타일 */}
      <polygon points="0,700 200,600 800,600 1000,700" fill="#1f2b26" />
      {[1, 2, 3].map((i) => (
        <line key={`h${i}`} x1={200 - i * 66} y1={600 + i * 33} x2={800 + i * 66} y2={600 + i * 33} stroke="#2c3a34" strokeWidth="2" />
      ))}
      {[-3, -2, -1, 0, 1, 2, 3].map((i) => (
        <line key={`v${i}`} x1={500 + i * 100} y1="600" x2={500 + i * 167} y2="700" stroke="#2c3a34" strokeWidth="2" />
      ))}

      {/* 뒷벽 */}
      <rect x="200" y="70" width="600" height="530" fill="#1a5240" />

      {/* 왼쪽 벽: 금연 표지판 */}
      <g transform="translate(105 270) skewY(16)">
        <rect x="-46" y="-52" width="92" height="104" rx="6" fill="#f8f9fa" />
        <text y="-6" textAnchor="middle" fontSize="40">
          🚭
        </text>
        <text y="38" textAnchor="middle" fontSize="20" fontWeight="800" fill="#c92a2a">
          금연
        </text>
      </g>

      {/* 오른쪽 벽: 휴지걸이 */}
      <g transform="translate(895 430) skewY(-16)">
        <rect x="-40" y="-26" width="80" height="12" rx="4" fill="#adb5bd" />
        <rect x="-32" y="-16" width="64" height="46" rx="10" fill="#f8f9fa" />
        <rect x="-32" y="22" width="22" height="40" fill="#f1f3f5" />
      </g>

      {/* 문 */}
      <g className={knocking ? 'fp-door fp-door--knock' : 'fp-door'}>
        <rect x={DOOR.x - 10} y={DOOR.y - 10} width={DOOR.w + 20} height={DOOR.h + 10} fill="#cfd5d2" />
        <rect x={DOOR.x} y={DOOR.y} width={DOOR.w} height={DOOR.h} fill={DOOR_GREEN} />
        <rect x={DOOR.x + 18} y={DOOR.y + 18} width={DOOR.w - 36} height={DOOR.h - 36} fill="none" stroke="#5fb99b" strokeWidth="2" />
        {/* 옷걸이 */}
        <path d="M500 128 v14 q0 14 -14 14" fill="none" stroke="#cfd5d2" strokeWidth="5" strokeLinecap="round" />
        <circle cx="500" cy="126" r="6" fill="#cfd5d2" />
        {/* 잠금장치: 안에서 보면 빨간 '사용중' */}
        <rect x={DOOR.x + DOOR.w - 72} y="318" width="52" height="34" rx="6" fill="#cfd5d2" />
        <rect x={DOOR.x + DOOR.w - 66} y="324" width="40" height="22" rx="3" fill="#e03131" />
        <text x={DOOR.x + DOOR.w - 46} y="340" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff">
          사용중
        </text>
        {/* 낙서 */}
        <g className="fp-graffiti">
          <text x="372" y="230" transform="rotate(-6 372 230)">
            여기 다녀감 ✌
          </text>
          <text x="520" y="430" transform="rotate(4 520 430)">
            휴지 확인하고 앉기
          </text>
          <text x="380" y="520" transform="rotate(-3 380 520)">
            ♡ 똥은 인생 ♡
          </text>
        </g>
        {/* 잠금장치 아래 타이머 (화면 위쪽은 채팅창에 가려질 수 있다) */}
        <text className="fp-timer" x={DOOR.x + DOOR.w - 46} y="374" textAnchor="middle">
          {occupiedLabel}
        </text>
      </g>

      {/* 문 아래 틈: 밖의 빛, 줄 선 사람의 발 그림자 */}
      <rect x={DOOR.x} y={DOOR.y + DOOR.h} width={DOOR.w} height={FLOOR_Y - DOOR.y - DOOR.h} fill="#e9f5ee" opacity="0.55" />
      {feet.map((x) => (
        <g key={x} fill="#0b0f0d">
          <rect x={x - 26} y={DOOR.y + DOOR.h + 2} width="22" height="12" rx="5" />
          <rect x={x + 4} y={DOOR.y + DOOR.h + 2} width="22" height="12" rx="5" />
        </g>
      ))}
    </g>
  );
}

/** 내려다보이는 내 무릎 (나 캐릭터와 같은 주황색 픽토그램) */
function Legs({ shake }: { shake: boolean }) {
  return (
    <g className={shake ? 'fp-legs fp-legs--shake' : 'fp-legs'}>
      {/* 발목에 걸친 바지 */}
      <rect x="300" y="586" width="150" height="34" rx="14" fill="#343a40" />
      <rect x="550" y="586" width="150" height="34" rx="14" fill="#343a40" />
      {/* 허벅지 */}
      <path d="M150 700 L 330 640 Q 395 590 460 640 L 490 700 Z" fill={SELF} />
      <path d="M850 700 L 670 640 Q 605 590 540 640 L 510 700 Z" fill={SELF} />
      {/* 무릎 */}
      <ellipse cx="395" cy="638" rx="70" ry="44" fill={SELF} />
      <ellipse cx="605" cy="638" rx="70" ry="44" fill={SELF} />
      <ellipse cx="395" cy="628" rx="40" ry="16" fill="#ffc078" opacity="0.6" />
      <ellipse cx="605" cy="628" rx="40" ry="16" fill="#ffc078" opacity="0.6" />
    </g>
  );
}

/** 손에 든 담배: 필터 → 남은 종이 → 불씨 → 매달린 재 */
function CigaretteBody({ shape, inhaling }: { shape: CigaretteShape; inhaling: boolean }) {
  const tip = -FILTER - shape.paper;
  // 재가 길어지면 무게 때문에 아래로 처진다
  const droop = Math.max(0, shape.ash - 18) * 0.5;
  return (
    <g>
      <rect x={-FILTER} y="-6" width={FILTER} height="12" rx="2" fill="#e8913a" />
      <rect x={-FILTER + 4} y="-6" width="2" height="12" fill="#d9480f" opacity="0.5" />
      <rect x={tip} y="-6" width={shape.paper} height="12" fill="#f8f9fa" />
      {shape.lit && shape.ash > 0 && (
        <g transform={`translate(${tip} 0) rotate(${-droop})`}>
          <rect x={-shape.ash} y="-5.5" width={shape.ash} height="11" rx="2" fill="#adb5bd" />
          <rect x={-shape.ash} y="-5.5" width={shape.ash} height="11" rx="2" fill="url(#fp-ash-grain)" />
        </g>
      )}
      {shape.lit && (
        <rect
          className={inhaling ? 'fp-ember fp-ember--hot' : 'fp-ember'}
          x={tip - 3}
          y="-6"
          width="6"
          height="12"
          rx="2"
        />
      )}
    </g>
  );
}

/** 담배를 든 오른손 */
function Hand({
  shape,
  inhaling,
  motion,
}: {
  shape: CigaretteShape;
  inhaling: boolean;
  motion: 'puff' | 'ash' | 'take' | null;
}) {
  return (
    <g className={motion ? `fp-hand fp-hand--${motion}` : 'fp-hand'}>
      <g transform={`translate(${HAND_X} ${HAND_Y})`}>
        <g transform={`translate(0 -18) rotate(${CIG_ANGLE})`}>
          <CigaretteBody shape={shape} inhaling={inhaling} />
        </g>
        {/* 주먹과 엄지 */}
        <rect x="-36" y="-34" width="84" height="76" rx="30" fill={SELF} />
        <rect x="-44" y="-26" width="40" height="22" rx="11" fill={SELF_SHADE} />
        <path d="M-20 4 h40 M-16 20 h36" stroke={SELF_SHADE} strokeWidth="4" strokeLinecap="round" />
      </g>
    </g>
  );
}

/** 담뱃불에서 계속 가늘게 피어오르는 연기 */
function TipSmoke({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} filter="url(#fp-blur)" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} className="fp-tip-smoke" r="7" style={{ animationDelay: `${i * 0.55}s` }} />
      ))}
    </g>
  );
}

function Sfx({ text, x = 500, y = 330, tone, delay = 0 }: { text: string; x?: number; y?: number; tone: string; delay?: number }) {
  return (
    <text className={`fp-sfx fp-sfx--${tone}`} x={x} y={y} textAnchor="middle" style={{ animationDelay: `${delay}s` }}>
      {text}
    </text>
  );
}

function burst(rand: () => number, count: number, className: string, spread: number, delay = 0) {
  return Array.from({ length: count }, (_, i) => (
    <circle
      key={i}
      className={className}
      r={2 + rand() * 2}
      style={{ '--dx': `${(rand() - 0.5) * spread}px`, '--dy': `${(rand() - 0.65) * spread}px`, animationDelay: `${delay + rand() * 0.15}s` } as CSSProperties}
    />
  ));
}

/** 끄는 동안만 보이는 손과 담배. 상태에서는 이미 꺼졌으므로 효과가 따로 그린다 */
function GhostHand({ className, style }: { className: string; style?: CSSProperties }) {
  return (
    <g transform={`translate(${HAND_X} ${HAND_Y})`}>
      <g className={className} style={style}>
        <g transform={`translate(0 -18) rotate(${CIG_ANGLE})`}>
          <CigaretteBody shape={{ lit: true, paper: 40, ash: 0 }} inhaling={false} />
        </g>
        <rect x="-36" y="-34" width="84" height="76" rx="30" fill={SELF} />
        <rect x="-44" y="-26" width="40" height="22" rx="11" fill={SELF_SHADE} />
      </g>
    </g>
  );
}

/** 손에서 떨어지는 꽁초 */
function FallingButt({ to }: { to: { x: number; y: number } }) {
  const from = alongCigarette(FILTER + 20);
  return (
    <g transform={`translate(${from.x} ${from.y})`}>
      <g className="fp-butt-fall" style={{ '--dx': `${to.x - from.x}px`, '--dy': `${to.y - from.y}px` } as CSSProperties}>
        <rect x="-18" y="-5" width="16" height="10" rx="2" fill="#e8913a" />
        <rect x="-2" y="-5" width="20" height="10" fill="#f8f9fa" />
        <rect x="16" y="-5" width="5" height="10" rx="2" fill="#ff6b35" />
      </g>
    </g>
  );
}

/** 담배갑: 아래에서 올라와 뚜껑이 열리고 한 개비가 쏙 빠진다 */
function CigarettePack() {
  return (
    <g transform={`translate(${HAND_X + 20} ${HAND_Y + 40})`} aria-hidden="true">
      <g className="fp-pack">
        <rect x="-36" y="-60" width="72" height="110" rx="5" fill="#f8f9fa" />
        <rect x="-36" y="-10" width="72" height="44" fill="#c92a2a" />
        <text y="18" textAnchor="middle" fontSize="13" fontWeight="900" fill="#fff">
          TOILET
        </text>
        <text y="44" textAnchor="middle" fontSize="8" fill="#868e96">
          흡연은 건강에 해롭습니다
        </text>
        {/* 갑 속 담배 필터들 */}
        {[-22, -8, 6, 20].map((x) => (
          <rect key={x} x={x - 6} y="-66" width="12" height="10" rx="2" fill="#e8913a" />
        ))}
        <rect className="fp-pack-pull" x="-6" y="-66" width="12" height="60" rx="2" fill="#f8f9fa" />
        <rect className="fp-pack-lid" x="-36" y="-80" width="72" height="22" rx="4" fill="#f1f3f5" stroke="#dee2e6" />
      </g>
    </g>
  );
}

/** 액션별 1인칭 연출 */
function FpEffect({ effect, ember }: { effect: Effect; ember: { x: number; y: number } | null }) {
  const rand = seededRandom(effect.id);
  switch (effect.action) {
    case 'fart':
      return (
        <g aria-hidden="true">
          <rect className="fp-tint fp-tint--gas" width="1000" height="700" />
          <g filter="url(#fp-blur)">
            {Array.from({ length: 12 }, (_, i) => (
              <circle
                key={i}
                className="fp-rise fp-rise--gas"
                cx={380 + rand() * 240}
                cy={700}
                r={30 + rand() * 40}
                style={{ '--dy': `${-(200 + rand() * 260)}px`, '--dx': `${(rand() - 0.5) * 200}px`, animationDelay: `${rand() * 0.4}s` } as CSSProperties}
              />
            ))}
          </g>
          <Sfx text="뿌우웅~" tone="gas" />
        </g>
      );
    case 'poop':
      return (
        <g aria-hidden="true">
          {Array.from({ length: 16 }, (_, i) => (
            <circle
              key={i}
              className="fp-splash"
              cx={500 + (rand() - 0.5) * 60}
              cy={690}
              r={4 + rand() * 7}
              style={{ '--dx': `${(rand() - 0.5) * 420}px`, '--dy': `${-(120 + rand() * 260)}px`, animationDelay: `${0.25 + rand() * 0.1}s` } as CSSProperties}
            />
          ))}
          <Sfx text="뿌지직…" y={300} tone="poop" />
          <Sfx text="퐁당!" y={400} tone="splash" delay={0.3} />
        </g>
      );
    case 'bidet':
      return (
        <g aria-hidden="true">
          <rect className="fp-tint fp-tint--water" width="1000" height="700" />
          {Array.from({ length: 30 }, (_, i) => (
            <ellipse
              key={i}
              className="fp-splash fp-splash--water"
              cx={500 + (rand() - 0.5) * 40}
              cy={700}
              rx={3 + rand() * 3}
              ry={6 + rand() * 5}
              style={{ '--dx': `${(rand() - 0.5) * 300}px`, '--dy': `${-(160 + rand() * 300)}px`, animationDelay: `${rand() * 1}s` } as CSSProperties}
            />
          ))}
          <Sfx text="쏴아아~ 💦" tone="water" />
        </g>
      );
    case 'flush':
      return (
        <g aria-hidden="true">
          <rect className="fp-tint fp-tint--water" width="1000" height="700" />
          <circle className="fp-swirl" cx="500" cy="700" r="120" />
          <circle className="fp-swirl fp-swirl--inner" cx="500" cy="700" r="70" />
          {Array.from({ length: 14 }, (_, i) => (
            <circle
              key={`b${i}`}
              className="fp-bubble"
              cx={460 + rand() * 80}
              cy={690}
              r={4 + rand() * 8}
              style={{ '--dx': `${(rand() - 0.5) * 160}px`, '--dy': `${-(120 + rand() * 220)}px`, animationDelay: `${0.2 + rand() * 1.2}s` } as CSSProperties}
            />
          ))}
          {Array.from({ length: 10 }, (_, i) => (
            <circle
              key={`s${i}`}
              className="fp-splash fp-splash--water"
              cx={500}
              cy={695}
              r={3 + rand() * 4}
              style={{ '--dx': `${(rand() - 0.5) * 260}px`, '--dy': `${-(80 + rand() * 160)}px`, animationDelay: `${0.1 + rand() * 0.4}s` } as CSSProperties}
            />
          ))}
          <Sfx text="콰르르르…" tone="water" />
        </g>
      );
    case 'knock':
      return <Sfx text="똑! 똑! 똑!" y={260} tone="knock" />;
    case 'take':
      return (
        <g aria-hidden="true">
          <CigarettePack />
          <Sfx text="바스락" x={HAND_X} y={HAND_Y - 120} tone="smoke" />
        </g>
      );
    case 'light':
      return ember ? (
        <g aria-hidden="true" transform={`translate(${ember.x - 6} ${ember.y + 26})`}>
          {/* 라이터 */}
          <g className="fp-lighter">
            <rect x="-16" y="0" width="32" height="56" rx="6" fill="#c92a2a" />
            <rect x="-12" y="-10" width="24" height="12" rx="2" fill="#adb5bd" />
            <circle cx="8" cy="-4" r="5" fill="#868e96" />
            <path className="fp-flame" d="M0 -48 C 14 -30 12 -16 0 -10 C -12 -16 -14 -30 0 -48 Z" />
            <g transform="translate(0 -14)">{burst(rand, 8, 'fp-spark', 80)}</g>
          </g>
          <Sfx text="칙, 칙… 화르륵" x={0} y={-70} tone="smoke" />
        </g>
      ) : null;
    case 'puff':
      return (
        <g aria-hidden="true">
          <rect className="fp-tint fp-tint--puff" width="1000" height="700" />
          <Sfx text="스으읍…" y={250} tone="smoke" />
        </g>
      );
    case 'exhale':
      return (
        <g aria-hidden="true">
          <g filter="url(#fp-blur)">
            {Array.from({ length: 16 }, (_, i) => (
              <circle
                key={i}
                className="fp-rise fp-rise--smoke"
                cx={500 + (rand() - 0.5) * 80}
                cy={720}
                r={30 + rand() * 50}
                style={{ '--dx': `${(rand() - 0.5) * 600}px`, '--dy': `${-(300 + rand() * 300)}px`, animationDelay: `${i * 0.05}s` } as CSSProperties}
              />
            ))}
          </g>
          <Sfx text="후우우~" y={280} tone="smoke" />
        </g>
      );
    case 'ash':
      // 털린 재 덩어리가 바닥으로 떨어져 부서진다
      return ember ? (
        <g aria-hidden="true" transform={`translate(${ember.x - 10} ${ember.y})`}>
          <rect className="fp-ash-chunk" x="-14" y="-5" width="16" height="10" rx="2" fill="#adb5bd" />
          {Array.from({ length: 8 }, (_, i) => (
            <rect
              key={i}
              className="fp-ash"
              width={3 + rand() * 4}
              height={2 + rand() * 2}
              style={{ '--sway': `${(rand() - 0.5) * 50}px`, animationDelay: `${0.15 + rand() * 0.3}s` } as CSSProperties}
            />
          ))}
          <Sfx text="톡톡" x={-10} y={-40} tone="smoke" />
        </g>
      ) : null;
    case 'snuff_wall': {
      const from = alongCigarette(FILTER + 40);
      return (
        <g aria-hidden="true">
          <ellipse className="fp-burn-mark" cx={WALL_SPOT.x} cy={WALL_SPOT.y} rx="12" ry="9" />
          <GhostHand
            className="fp-ghost fp-ghost--wall"
            style={{ '--tx': `${WALL_SPOT.x - from.x}px`, '--ty': `${WALL_SPOT.y - from.y}px` } as CSSProperties}
          />
          <g transform={`translate(${WALL_SPOT.x} ${WALL_SPOT.y})`}>
            {burst(rand, 10, 'fp-spark', 70, 0.35)}
            <g filter="url(#fp-blur)">
              <circle className="fp-poof" r="16" style={{ animationDelay: '0.4s' }} />
            </g>
          </g>
          <Sfx text="치이익—" x={WALL_SPOT.x + 120} y={WALL_SPOT.y - 60} tone="smoke" delay={0.35} />
        </g>
      );
    }
    case 'snuff_toilet':
      return (
        <g aria-hidden="true">
          <FallingButt to={{ x: 500, y: 720 }} />
          {Array.from({ length: 8 }, (_, i) => (
            <circle
              key={i}
              className="fp-splash fp-splash--water"
              cx={500}
              cy={695}
              r={3 + rand() * 3}
              style={{ '--dx': `${(rand() - 0.5) * 160}px`, '--dy': `${-(60 + rand() * 120)}px`, animationDelay: `${0.5 + rand() * 0.1}s` } as CSSProperties}
            />
          ))}
          <Sfx text="퐁… 치익" y={430} tone="water" delay={0.45} />
        </g>
      );
    case 'snuff_floor':
      return (
        <g aria-hidden="true">
          <FallingButt to={FLOOR_SPOT} />
          <g transform={`translate(${FLOOR_SPOT.x} ${FLOOR_SPOT.y})`}>
            {burst(rand, 8, 'fp-spark', 60, 0.45)}
            {/* 신발로 비벼 끈다 */}
            <g className="fp-shoe">
              <ellipse cx="0" cy="0" rx="58" ry="24" fill="#212529" />
              <ellipse cx="-6" cy="-6" rx="44" ry="14" fill="#343a40" />
              <rect x="-58" y="6" width="116" height="8" rx="4" fill="#f1f3f5" />
            </g>
          </g>
          <Sfx text="비비적" x={FLOOR_SPOT.x + 150} y={FLOOR_SPOT.y - 80} tone="smoke" delay={0.6} />
        </g>
      );
    case 'spit':
      return (
        <g aria-hidden="true">
          <ellipse className="fp-spit-splat" cx="520" cy="596" rx="14" ry="4" fill="#d0ebff" />
          <g transform="translate(500 700)">
            <circle className="fp-spit" r="8" fill="#e7f5ff" style={{ '--dx': '20px', '--dy': '-104px' } as CSSProperties} />
          </g>
          <Sfx text="퉤!" y={420} tone="water" />
        </g>
      );
    case 'phlegm':
      return (
        <g aria-hidden="true">
          <Sfx text="카아아악…" y={300} tone="phlegm-pre" />
          {/* 문에 철썩 붙어서 천천히 흘러내린다 */}
          {/* 위치는 바깥 g에, 애니메이션은 안쪽 g에: CSS transform이 transform 속성을 덮어쓰지 않게 */}
          <g transform="translate(470 380)">
            <g className="fp-phlegm-stick">
              <path d="M-20 0 C -24 -16 -4 -22 8 -16 C 24 -10 26 8 12 14 C 0 20 -18 14 -20 0 Z" fill="#a9c23f" />
              <rect className="fp-phlegm-drip" x="-4" y="8" width="9" height="40" rx="4.5" fill="#a9c23f" />
              <circle cx="-4" cy="-6" r="4" fill="#d8f5a2" opacity="0.8" />
            </g>
          </g>
          <g transform="translate(500 700)">
            <circle className="fp-phlegm-fly" r="14" fill="#a9c23f" style={{ '--dx': '-30px', '--dy': '-320px' } as CSSProperties} />
          </g>
          <Sfx text="퉷!" y={520} tone="gas" delay={1.05} />
        </g>
      );
    default:
      return null;
  }
}

// CCTV 화면 (viewBox 400 x 300): 문에 달린 카메라가 밖에 줄 선 사람들을 마주 본다
const CAM_W = 400;
const CAM_H = 300;
const HORIZON = 120;
const VANISH_X = CAM_W / 2;

/** 이름으로 항상 같은 0~1 값을 만든다 (배경 사람 자리를 고정하려고) */
function hash01(text: string): number {
  return seededRandom(text)();
}

/** 카메라를 마주 보고 선 사람 픽토그램. (x, y)는 발 위치, scale은 거리에 따른 크기 */
function CamPerson({ x, y, scale, name, label, dim }: { x: number; y: number; scale: number; name: string; label?: string; dim: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={dim ? 0.35 : 1}>
      <ellipse cx="0" cy="2" rx="26" ry="6" fill="#000" opacity="0.35" />
      <g fill="#f1f3f5">
        <circle cx="0" cy="-120" r="17" />
        <rect x="-30" y="-98" width="60" height="26" rx="13" />
        <rect x="-19" y="-98" width="38" height="66" rx="6" />
        <rect x="-30" y="-90" width="9" height="56" rx="4.5" />
        <rect x="21" y="-90" width="9" height="56" rx="4.5" />
        <rect x="-19" y="-40" width="16" height="42" rx="6" />
        <rect x="3" y="-40" width="16" height="42" rx="6" />
      </g>
      <text className="cam-name" y="-146" textAnchor="middle" style={{ fontSize: `${Math.max(16, 12 / scale)}px` }}>
        {label && <tspan className="cam-label">{label} </tspan>}
        {name}
      </text>
    </g>
  );
}

/** 문에 달린 CCTV: 문 바로 앞에 줄 선 사람들을 지직거리는 화면으로 보여 준다 */
function Cctv({ snapshot, serverNow, effects }: Pick<FirstPersonProps, 'snapshot' | 'serverNow' | 'effects'>) {
  const time = new Date(serverNow).toLocaleTimeString('ko-KR', { hour12: false });
  const byId = new Map(snapshot.participants.map((p) => [p.userId, p]));
  const queued = new Set(snapshot.queue);
  // 줄 서지 않은 사람들은 멀리 뒤쪽에서 서성인다
  const idle = snapshot.participants.filter((p) => p.userId !== snapshot.booth.occupantId && !queued.has(p.userId));
  // 줄은 카메라 바로 앞에서 소실점 쪽으로 멀어진다. 맨 앞 사람이 가장 크다
  const line = snapshot.queue.map((userId, index) => {
    const depth = 1 + index * 0.75;
    const scale = 1 / depth;
    // 사람들이 앞사람 어깨 너머로 보이도록 좌우로 엇갈려 선다
    const side = index % 2 === 0 ? -1 : 1;
    return {
      userId,
      index,
      scale,
      x: VANISH_X + side * 95 * scale,
      y: HORIZON + (CAM_H - HORIZON - 14) * scale,
    };
  });
  const has = (action: Effect['action']) => effects.some((e) => e.action === action);

  return (
    <figure className="fp-cctv" aria-label={`문에 달린 CCTV. 문 앞에 ${snapshot.queue.length}명 대기 중`}>
      <div className="fp-cctv-screen">
        <svg viewBox={`0 0 ${CAM_W} ${CAM_H}`} preserveAspectRatio="xMidYMid slice" className="cam-view">
          {/* 화장실 바깥: 벽과 바닥 타일이 소실점으로 모인다 */}
          <rect width={CAM_W} height={HORIZON} fill="#2b3a33" />
          <rect y={HORIZON} width={CAM_W} height={CAM_H - HORIZON} fill="#3d4a44" />
          {[-3, -2, -1, 0, 1, 2, 3].map((i) => (
            <line key={i} x1={VANISH_X + i * 18} y1={HORIZON} x2={VANISH_X + i * 160} y2={CAM_H} stroke="#55635c" strokeWidth="1.5" />
          ))}
          {[0.15, 0.35, 0.6, 1].map((t) => (
            <line key={t} x1="0" y1={HORIZON + (CAM_H - HORIZON) * t} x2={CAM_W} y2={HORIZON + (CAM_H - HORIZON) * t} stroke="#55635c" strokeWidth="1.5" />
          ))}
          <rect x={VANISH_X - 30} y={HORIZON - 46} width="60" height="46" fill="#1f2a25" />
          <text x={VANISH_X} y={HORIZON - 52} textAnchor="middle" className="cam-sign">
            EXIT
          </text>

          {idle.map((p) => (
            <CamPerson
              key={p.userId}
              x={20 + hash01(p.userId) * (CAM_W - 40)}
              y={HORIZON + 6 + hash01(`${p.userId}:y`) * 10}
              scale={0.24}
              name={p.name}
              dim={p.status === 'disconnected'}
            />
          ))}

          {/* 먼 사람부터 그려야 가까운 사람이 앞을 가린다 */}
          {[...line].reverse().map((q) => {
            const p = byId.get(q.userId);
            return (
              <CamPerson
                key={q.userId}
                x={q.x}
                y={q.y}
                scale={q.scale}
                name={p?.name ?? '?'}
                label={snapshot.priority?.userId === q.userId ? '입장 차례!' : `${q.index + 1}번`}
                dim={p?.status === 'disconnected'}
              />
            );
          })}

          {snapshot.queue.length === 0 && (
            <text x={VANISH_X} y={HORIZON + 70} textAnchor="middle" className="cam-empty">
              문 앞에 아무도 없음
            </text>
          )}

          {/* 문 아래에서 새어 나간 방귀, 문틈으로 튄 침이 카메라 바로 아래에 보인다 */}
          {has('fart') && <rect className="fp-tint fp-tint--gas" y={CAM_H - 90} width={CAM_W} height="90" />}
          {(has('spit') || has('phlegm')) && (
            <ellipse
              className="fp-spit-splat"
              cx={VANISH_X + 30}
              cy={CAM_H - 24}
              rx={has('phlegm') ? 26 : 14}
              ry={has('phlegm') ? 8 : 5}
              fill={has('phlegm') ? '#a9c23f' : '#d0ebff'}
              style={{ animationDelay: has('phlegm') ? '1.1s' : '0s' }}
            />
          )}

          {/* 광각 렌즈처럼 가장자리를 어둡게 */}
          <radialGradient id="cam-vignette" cx="50%" cy="50%" r="70%">
            <stop offset="55%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.8" />
          </radialGradient>
          <rect width={CAM_W} height={CAM_H} fill="url(#cam-vignette)" />
        </svg>
      </div>
      <div className="fp-cctv-noise" aria-hidden="true" />
      <div className="fp-cctv-scan" aria-hidden="true" />
      <figcaption className="fp-cctv-label">
        <span className="fp-cctv-rec">● REC</span> CAM-01 문
      </figcaption>
      <span className="fp-cctv-time" aria-hidden="true">
        {time}
      </span>
    </figure>
  );
}

/** 부스 안에 앉아서 문을 바라보는 1인칭 화면 */
export function FirstPerson({ snapshot, selfId, serverNow, bubbles, effects, config }: FirstPersonProps) {
  const byId = new Map(snapshot.participants.map((p) => [p.userId, p]));
  const cfg = config ?? DEFAULT_CONFIG;
  const cigarette = snapshot.booth.cigarette;
  const shape = cigarette ? cigaretteShape(cigarette, serverNow, cfg) : null;
  // 불씨 위치: 필터 + 남은 종이 끝
  const ember = shape?.lit ? alongCigarette(FILTER + shape.paper) : null;
  const has = (action: Effect['action']) => effects.some((e) => e.action === action);
  const motion = has('take') ? 'take' : has('puff') ? 'puff' : has('ash') ? 'ash' : null;

  const since = snapshot.booth.occupiedSince;
  const occupiedLabel = since === null ? '00:00' : formatElapsed(serverNow - since);
  const waiting = snapshot.queue.length;

  // 밖에서 들리는 말(다른 사람 말풍선)과 내 혼잣말
  const voices = Object.entries(bubbles).map(([userId, bubble]) => ({
    key: `${userId}:${bubble.id}`,
    self: userId === selfId,
    name: byId.get(userId)?.name ?? '누군가',
    text: bubble.text,
  }));

  const smoking = !cigarette ? '' : cigarette.litAt === null ? '. 담배를 들고 있음' : '. 담배 피우는 중';

  return (
    <div className={has('poop') ? 'fp fp--quake' : 'fp'}>
      <svg
        className="fp-view"
        viewBox="0 0 1000 700"
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label={`부스 안 1인칭 화면. ${occupiedLabel} 경과. 밖에 ${waiting}명 대기 중${smoking}`}
      >
        <defs>
          <filter id="fp-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <radialGradient id="fp-vignette" cx="50%" cy="45%" r="75%">
            <stop offset="60%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.65" />
          </radialGradient>
          <pattern id="fp-ash-grain" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1" fill="#6c757d" />
            <circle cx="4.5" cy="4" r="0.8" fill="#dee2e6" />
          </pattern>
        </defs>

        <Stall occupiedLabel={occupiedLabel} waiting={waiting} knocking={has('knock')} />
        <Legs shake={has('poop') || has('fart') || has('phlegm')} />
        {shape && <Hand shape={shape} inhaling={cigarette?.inhaling ?? false} motion={motion} />}
        {ember && <TipSmoke x={ember.x} y={ember.y} />}

        {effects.map((effect) => (
          <FpEffect key={effect.id} effect={effect} ember={ember} />
        ))}

        <rect width="1000" height="700" fill="url(#fp-vignette)" pointerEvents="none" />
      </svg>

      <Cctv snapshot={snapshot} serverNow={serverNow} effects={effects} />

      {waiting > 0 && (
        <p className="fp-waiting" role="status">
          문 밖에 {waiting}명이 기다리고 있어요
        </p>
      )}

      <ul className="fp-voices" aria-live="polite">
        {voices.map((v) => (
          <li key={v.key} className={v.self ? 'fp-voice fp-voice--self' : 'fp-voice'}>
            {!v.self && <span className="fp-voice-name">{v.name} (밖에서)</span>}
            {v.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
