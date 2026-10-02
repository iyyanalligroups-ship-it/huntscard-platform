// Original vector illustrations for the public site (white / Artivive-style theme).
// One visual language: soft pastel shapes (peach, pink, blue), crisp near-black outlines, white
// "paper" cards with a soft shadow. Every illustration is a plain inline SVG so it scales to any
// size, needs no image files and can be recoloured from CSS. Decorative only (aria-hidden).

const INK = '#111111';
const PEACH = '#FBE3D5';
const PINK = '#DDA6C2';
const BLUE = '#5FA2C9';
const SOFT_BLUE = '#D8E9F4';
const SOFT_PINK = '#F4DCE8';
const WARM = '#E8E4E1';
const LINE = { stroke: INK, strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' };

function Svg({ viewBox, className = '', children }) {
  return (
    <svg className={`av-illo ${className}`} viewBox={viewBox} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

// 4-point sparkle
function Spark({ x, y, s = 14, fill = INK, className = '' }) {
  return (
    <path
      className={className}
      d={`M${x} ${y - s} C${x + s * 0.18} ${y - s * 0.18} ${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} C${x + s * 0.18} ${y + s * 0.18} ${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} C${x - s * 0.18} ${y + s * 0.18} ${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} C${x - s * 0.18} ${y - s * 0.18} ${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s}Z`}
      fill={fill}
    />
  );
}

// NFC "tap" wave glyph
function Wave({ x, y, scale = 1, stroke = INK }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} stroke={stroke} strokeWidth="3" strokeLinecap="round" fill="none">
      <path d="M-14 6a20 20 0 0 1 28 0" opacity="0.45" />
      <path d="M-8 13a11 11 0 0 1 16 0" />
      <circle cx="0" cy="20" r="2.4" fill={stroke} stroke="none" />
    </g>
  );
}

// small QR-like tile
const QR_ROWS = [
  '1110110111', '1010011101', '1110101011', '0001110010', '1101001111',
  '0110100101', '1011011100', '0100110111', '1110001010', '1010111001',
];
function QrGrid({ x, y, size = 100, fill = INK }) {
  const cell = size / QR_ROWS.length;
  return (
    <g>
      {QR_ROWS.map((row, r) =>
        row.split('').map((v, c) => (v === '1' ? <rect key={`${r}-${c}`} x={x + c * cell} y={y + r * cell} width={cell - 1} height={cell - 1} rx="1.5" fill={fill} /> : null))
      )}
    </g>
  );
}

// a white card with the HuntsTAG chip + wave. Drawn on a fixed 320 x 200 grid and scaled to the
// requested width, so the proportions stay right at every size.
function NfcCard({ x = 0, y = 0, w = 320, rot = 0, tint = PEACH }) {
  const k = w / 320;
  const h = 200 * k;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot} ${w / 2} ${h / 2}) scale(${k})`}>
      <rect x="6" y="10" width="320" height="200" rx="24" fill="#111" opacity="0.08" />
      <rect width="320" height="200" rx="24" fill="#fff" {...LINE} />
      <rect x="26" y="28" width="54" height="42" rx="10" fill={tint} {...LINE} />
      <path d="M26 49h54M53 28v42" stroke={INK} strokeWidth="1.6" opacity="0.5" />
      <Wave x={276} y={34} scale={1.25} />
      <rect x="26" y="128" width="130" height="12" rx="6" fill={INK} />
      <rect x="26" y="152" width="88" height="9" rx="4.5" fill={INK} opacity="0.35" />
      <circle cx="282" cy="164" r="14" fill={PINK} {...LINE} />
    </g>
  );
}

function Phone({ x = 0, y = 0, w = 220, h = 430, rot = 0, children }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot} ${w / 2} ${h / 2})`}>
      <rect x="8" y="12" width={w} height={h} rx="38" fill="#111" opacity="0.08" />
      <rect width={w} height={h} rx="38" fill={INK} />
      <rect x="10" y="10" width={w - 20} height={h - 20} rx="30" fill="#fff" />
      <rect x={w / 2 - 28} y="20" width="56" height="9" rx="4.5" fill={INK} />
      {children}
    </g>
  );
}

// ---------------------------------------------------------------------------------------------
// HERO: card tapping a phone, floating QR / AR cube / contact chip / sparkles
export function HeroScene({ className = '' }) {
  return (
    <Svg viewBox="0 0 1200 560" className={`av-hero-scene ${className}`}>
      <ellipse cx="260" cy="340" rx="270" ry="190" fill={PEACH} />
      <circle cx="930" cy="270" r="200" fill={SOFT_PINK} />
      <ellipse cx="640" cy="500" rx="360" ry="46" fill={SOFT_BLUE} />

      {/* phone with a profile page on screen */}
      <g className="av-float-slow">
        <Phone x={640} y={50} rot={5}>
          <circle cx="110" cy="96" r="34" fill={PEACH} {...LINE} />
          <circle cx="110" cy="88" r="11" fill={INK} />
          <path d="M92 112a18 14 0 0 1 36 0" fill={INK} />
          <rect x="62" y="148" width="96" height="11" rx="5.5" fill={INK} />
          <rect x="80" y="168" width="60" height="8" rx="4" fill={INK} opacity="0.35" />
          <rect x="34" y="198" width="152" height="40" rx="12" fill={INK} />
          <rect x="34" y="248" width="152" height="40" rx="12" fill="#fff" {...LINE} />
          <rect x="34" y="298" width="152" height="40" rx="12" fill={SOFT_BLUE} {...LINE} />
          {[58, 96, 134, 172].map((cx) => (
            <circle key={cx} cx={cx} cy="372" r="12" fill={cx % 2 ? PINK : PEACH} {...LINE} />
          ))}
        </Phone>
      </g>

      {/* signal arcs */}
      <g className="av-pulse" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none">
        <path d="M600 214c24 14 34 38 34 62" opacity="0.9" />
        <path d="M578 190c38 22 56 58 56 96" opacity="0.55" />
        <path d="M556 166c52 30 78 80 78 130" opacity="0.28" />
      </g>

      {/* the card */}
      <g className="av-float">
        <NfcCard x={250} y={190} rot={-11} />
      </g>

      {/* floating tiles */}
      <g className="av-float-slow">
        <rect x="120" y="70" width="118" height="118" rx="22" fill="#fff" {...LINE} />
        <QrGrid x={138} y={88} size={82} />
      </g>
      <g className="av-float">
        <g transform="translate(985 92)">
          <polygon points="0,30 52,0 104,30 52,60" fill={PEACH} {...LINE} />
          <polygon points="0,30 52,60 52,122 0,92" fill={PINK} {...LINE} />
          <polygon points="104,30 52,60 52,122 104,92" fill={BLUE} {...LINE} />
        </g>
      </g>
      <g className="av-float-slow">
        <rect x="965" y="380" width="190" height="62" rx="31" fill="#fff" {...LINE} />
        <circle cx="1000" cy="411" r="18" fill={PEACH} {...LINE} />
        <rect x="1032" y="398" width="86" height="10" rx="5" fill={INK} />
        <rect x="1032" y="416" width="56" height="8" rx="4" fill={INK} opacity="0.35" />
      </g>
      <Spark x={78} y={300} s={16} className="av-twinkle" />
      <Spark x={560} y={70} s={12} fill={PINK} className="av-twinkle" />
      <Spark x={1150} y={250} s={15} className="av-twinkle" />
      <Spark x={470} y={470} s={11} fill={BLUE} className="av-twinkle" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------------------------
// STEP 1: choose a card -- three fanned cards + a price tag
export function IlloChooseCard({ className = '' }) {
  return (
    <Svg viewBox="0 0 480 340" className={className}>
      <circle cx="250" cy="170" r="140" fill={PEACH} />
      <g>
        <NfcCard x={74} y={92} w={230} h={146} rot={-14} tint={SOFT_BLUE} />
        <NfcCard x={150} y={72} w={230} h={146} rot={-2} tint={PINK} />
        <NfcCard x={196} y={118} w={230} h={146} rot={11} tint={PEACH} />
      </g>
      <g transform="translate(360 48) rotate(8)">
        <path d="M0 0h86l18 22-18 22H0z" fill={INK} />
        <circle cx="14" cy="22" r="5" fill="#fff" />
        <text x="30" y="28" fontFamily="Montserrat, sans-serif" fontSize="17" fontWeight="700" fill="#fff">₹</text>
      </g>
      <Spark x={60} y={64} s={13} className="av-twinkle" />
      <Spark x={430} y={290} s={10} fill={PINK} className="av-twinkle" />
    </Svg>
  );
}

// STEP 2: set up your profile -- a profile page
export function IlloProfile({ className = '' }) {
  return (
    <Svg viewBox="0 0 480 340" className={className}>
      <circle cx="240" cy="176" r="138" fill={SOFT_PINK} />
      <g className="av-float-slow">
        <rect x="130" y="34" width="220" height="276" rx="26" fill="#fff" {...LINE} />
        <rect x="130" y="34" width="220" height="86" rx="26" fill={PEACH} {...LINE} />
        <circle cx="240" cy="124" r="36" fill="#fff" {...LINE} />
        <circle cx="240" cy="114" r="12" fill={INK} />
        <path d="M221 136a19 15 0 0 1 38 0" fill={INK} />
        <rect x="196" y="172" width="88" height="11" rx="5.5" fill={INK} />
        <rect x="214" y="191" width="52" height="8" rx="4" fill={INK} opacity="0.35" />
        <rect x="156" y="216" width="168" height="34" rx="11" fill={INK} />
        <rect x="156" y="258" width="168" height="34" rx="11" fill={SOFT_BLUE} {...LINE} />
      </g>
      <g transform="translate(340 70)">
        <circle r="26" fill="#fff" {...LINE} />
        <path d="M-8 2 -2 8 10 -6" {...LINE} />
      </g>
      <g transform="translate(96 232)">
        <circle r="22" fill={PINK} {...LINE} />
        <path d="M-7 0h14M0 -7v14" {...LINE} />
      </g>
      <Spark x={410} y={250} s={13} className="av-twinkle" />
      <Spark x={72} y={110} s={11} fill={BLUE} className="av-twinkle" />
    </Svg>
  );
}

// STEP 3 / NFC tap: card meets phone with signal arcs
export function IlloTap({ className = '' }) {
  return (
    <Svg viewBox="0 0 480 340" className={className}>
      <circle cx="240" cy="172" r="140" fill={SOFT_BLUE} />
      <Phone x={246} y={34} w={168} h={290} rot={6}>
        <circle cx="84" cy="74" r="24" fill={PEACH} {...LINE} />
        <rect x="42" y="116" width="84" height="9" rx="4.5" fill={INK} />
        <rect x="30" y="140" width="108" height="30" rx="10" fill={INK} />
        <rect x="30" y="178" width="108" height="30" rx="10" fill="#fff" {...LINE} />
      </Phone>
      <g className="av-pulse" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none">
        <path d="M222 170c14 8 20 22 20 38" opacity="0.9" />
        <path d="M206 154c26 14 38 38 38 62" opacity="0.5" />
      </g>
      <g className="av-float">
        <NfcCard x={46} y={118} w={200} h={126} rot={-12} />
      </g>
      <Spark x={420} y={60} s={13} className="av-twinkle" />
      <Spark x={52} y={58} s={11} fill={PINK} className="av-twinkle" />
    </Svg>
  );
}

// phone-to-phone sync
export function IlloSync({ className = '' }) {
  return (
    <Svg viewBox="0 0 480 340" className={className}>
      <circle cx="240" cy="170" r="140" fill={SOFT_PINK} />
      <Phone x={70} y={44} w={140} h={252} rot={-8}>
        <circle cx="70" cy="70" r="20" fill={PEACH} {...LINE} />
        <rect x="26" y="108" width="88" height="28" rx="9" fill={INK} />
        <rect x="26" y="144" width="88" height="28" rx="9" fill="#fff" {...LINE} />
      </Phone>
      <Phone x={270} y={44} w={140} h={252} rot={8}>
        <circle cx="70" cy="70" r="20" fill={SOFT_BLUE} {...LINE} />
        <rect x="26" y="108" width="88" height="28" rx="9" fill="#fff" {...LINE} />
        <rect x="26" y="144" width="88" height="28" rx="9" fill={INK} />
      </Phone>
      <g className="av-pulse" {...LINE} fill="none">
        <path d="M222 140h36M246 124l16 16-16 16" />
        <path d="M258 196h-36M234 180l-16 16 16 16" />
      </g>
      <Spark x={240} y={52} s={12} className="av-twinkle" />
    </Svg>
  );
}

// augmented reality: floating layers
export function IlloAR({ className = '' }) {
  return (
    <Svg viewBox="0 0 480 340" className={className}>
      <circle cx="240" cy="172" r="140" fill={PEACH} />
      <g className="av-float-slow">
        <polygon points="240,176 372,226 240,276 108,226" fill={SOFT_BLUE} {...LINE} />
        <polygon points="240,130 372,180 240,230 108,180" fill="#fff" {...LINE} />
        <polygon points="240,84 372,134 240,184 108,134" fill={PINK} {...LINE} />
      </g>
      <g className="av-float" transform="translate(240 92)">
        <circle r="30" fill="#fff" {...LINE} />
        <path d="M-14 4l14-14 14 14M-14 16l14-14 14 14" {...LINE} />
      </g>
      <path d="M240 128v54" {...LINE} strokeDasharray="2 9" />
      <Spark x={92} y={92} s={14} className="av-twinkle" />
      <Spark x={398} y={252} s={12} fill={BLUE} className="av-twinkle" />
    </Svg>
  );
}

// QR scanner
export function IlloQR({ className = '' }) {
  return (
    <Svg viewBox="0 0 480 340" className={className}>
      <circle cx="240" cy="172" r="140" fill={SOFT_BLUE} />
      <rect x="150" y="62" width="180" height="180" rx="26" fill="#fff" {...LINE} />
      <QrGrid x={172} y={84} size={136} />
      {[[138, 50], [342, 50], [138, 254], [342, 254]].map(([cx, cy], i) => (
        <path key={i} d={`M${cx + (cx < 240 ? 0 : 0)} ${cy}`} />
      ))}
      <path d="M130 86V52a8 8 0 0 1 8-8h34M350 86V52a8 8 0 0 0-8-8h-34M130 218v34a8 8 0 0 0 8 8h34M350 218v34a8 8 0 0 1-8 8h-34" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <g className="av-scan"><rect x="146" y="150" width="188" height="6" rx="3" fill={PINK} opacity="0.9" /></g>
      <Spark x={400} y={90} s={13} className="av-twinkle" />
      <Spark x={78} y={270} s={11} fill={PEACH} className="av-twinkle" />
    </Svg>
  );
}

// shield + lock
export function IlloLock({ className = '' }) {
  return (
    <Svg viewBox="0 0 480 340" className={className}>
      <circle cx="240" cy="172" r="140" fill={SOFT_PINK} />
      <g className="av-float-slow">
        <path d="M240 50 356 92v82c0 66-48 104-116 130C172 278 124 240 124 174V92z" fill="#fff" {...LINE} />
        <rect x="196" y="160" width="88" height="68" rx="14" fill={PEACH} {...LINE} />
        <path d="M212 160v-20a28 28 0 0 1 56 0v20" {...LINE} />
        <circle cx="240" cy="192" r="8" fill={INK} />
        <path d="M240 198v14" {...LINE} />
      </g>
      <Spark x={392} y={72} s={13} className="av-twinkle" />
      <Spark x={86} y={238} s={11} fill={BLUE} className="av-twinkle" />
    </Svg>
  );
}

// update anytime: circular arrows around a link
export function IlloUpdate({ className = '' }) {
  return (
    <Svg viewBox="0 0 480 340" className={className}>
      <circle cx="240" cy="172" r="140" fill={SOFT_BLUE} />
      <g className="av-spin">
        <path d="M148 150a96 96 0 0 1 172-34" {...LINE} strokeWidth="4" />
        <path d="M322 84v38h-38" {...LINE} strokeWidth="4" />
        <path d="M332 194a96 96 0 0 1-172 34" {...LINE} strokeWidth="4" />
        <path d="M158 260v-38h38" {...LINE} strokeWidth="4" />
      </g>
      <rect x="182" y="132" width="116" height="80" rx="16" fill="#fff" {...LINE} />
      <path d="M214 172h52M214 154h30M214 190h40" {...LINE} />
      <Spark x={396} y={248} s={13} className="av-twinkle" />
      <Spark x={78} y={96} s={11} fill={PINK} className="av-twinkle" />
    </Svg>
  );
}

// design / customise: a card with a colour palette
export function IlloDesign({ className = '' }) {
  return (
    <Svg viewBox="0 0 480 340" className={className}>
      <circle cx="240" cy="172" r="140" fill={PEACH} />
      <g className="av-float-slow"><NfcCard x={120} y={80} w={250} h={158} rot={-6} tint={PINK} /></g>
      {[[104, 270, PINK], [150, 286, BLUE], [200, 278, SOFT_BLUE], [248, 288, INK]].map(([cx, cy, f], i) => (
        <circle key={i} cx={cx} cy={cy} r="17" fill={f} {...LINE} />
      ))}
      <Spark x={400} y={70} s={14} className="av-twinkle" />
    </Svg>
  );
}

// HuntsWorld listing / marketplace storefront
export function IlloListing({ className = '' }) {
  return (
    <Svg viewBox="0 0 480 340" className={className}>
      <circle cx="240" cy="172" r="140" fill={SOFT_PINK} />
      <g className="av-float-slow">
        <rect x="108" y="130" width="264" height="150" rx="16" fill="#fff" {...LINE} />
        <path d="M96 130 120 70h240l24 60z" fill={PEACH} {...LINE} />
        {[0, 1, 2, 3].map((i) => (
          <path key={i} d={`M${96 + i * 72} 130a36 36 0 0 0 72 0`} fill={i % 2 ? '#fff' : PINK} {...LINE} />
        ))}
        <rect x="150" y="190" width="70" height="90" rx="10" fill={SOFT_BLUE} {...LINE} />
        <rect x="244" y="188" width="96" height="46" rx="10" fill="#fff" {...LINE} />
        <rect x="256" y="200" width="46" height="8" rx="4" fill={INK} />
        <rect x="256" y="216" width="30" height="7" rx="3.5" fill={INK} opacity="0.35" />
      </g>
      <g transform="translate(386 78)">
        <circle r="26" fill="#fff" {...LINE} />
        <path d="M-9 2l7 7 13-14" {...LINE} />
      </g>
      <Spark x={78} y={112} s={13} className="av-twinkle" />
    </Svg>
  );
}

// contact: paper plane + envelope
export function IlloMail({ className = '' }) {
  return (
    <Svg viewBox="0 0 480 340" className={className}>
      <circle cx="240" cy="172" r="140" fill={SOFT_BLUE} />
      <rect x="110" y="132" width="230" height="150" rx="18" fill="#fff" {...LINE} />
      <path d="M110 148l115 80 115-80" {...LINE} />
      <g className="av-float" transform="translate(300 40) rotate(-12)">
        <path d="M0 40 120 0 84 110 56 68z" fill={PEACH} {...LINE} />
        <path d="M56 68 120 0" {...LINE} />
      </g>
      <path d="M120 96c-30 20-40 60-20 86" stroke={INK} strokeWidth="2.5" strokeDasharray="2 9" strokeLinecap="round" />
      <Spark x={78} y={250} s={12} fill={PINK} className="av-twinkle" />
    </Svg>
  );
}

// FAQ: speech bubbles with a question mark
export function IlloQuestion({ className = '' }) {
  return (
    <Svg viewBox="0 0 480 340" className={className}>
      <circle cx="240" cy="172" r="140" fill={PEACH} />
      <g className="av-float-slow">
        <path d="M110 80h190a20 20 0 0 1 20 20v100a20 20 0 0 1-20 20H190l-44 40v-40h-36a20 20 0 0 1-20-20V100a20 20 0 0 1 20-20z" fill="#fff" {...LINE} />
        <text x="188" y="190" fontFamily="Montserrat, sans-serif" fontSize="96" fontWeight="800" textAnchor="middle" fill={INK}>?</text>
      </g>
      <g className="av-float" transform="translate(300 170)">
        <rect width="132" height="84" rx="18" fill={PINK} {...LINE} />
        <rect x="20" y="24" width="70" height="9" rx="4.5" fill={INK} />
        <rect x="20" y="44" width="92" height="9" rx="4.5" fill={INK} opacity="0.4" />
      </g>
      <Spark x={410} y={80} s={13} className="av-twinkle" />
    </Svg>
  );
}

// chat support
export function IlloChat({ className = '' }) {
  return (
    <Svg viewBox="0 0 480 340" className={className}>
      <circle cx="240" cy="172" r="140" fill={SOFT_PINK} />
      <g className="av-float-slow">
        <rect x="100" y="72" width="200" height="82" rx="24" fill="#fff" {...LINE} />
        <rect x="126" y="100" width="120" height="10" rx="5" fill={INK} />
        <rect x="126" y="120" width="82" height="9" rx="4.5" fill={INK} opacity="0.35" />
        <path d="M130 154v30l30-30" fill="#fff" {...LINE} />
      </g>
      <g className="av-float">
        <rect x="190" y="178" width="200" height="82" rx="24" fill={INK} />
        <rect x="216" y="204" width="120" height="10" rx="5" fill="#fff" />
        <rect x="216" y="224" width="82" height="9" rx="4.5" fill="#fff" opacity="0.5" />
        <path d="M350 260v28l-30-28" fill={INK} />
      </g>
      <circle cx="104" cy="250" r="20" fill={PEACH} {...LINE} />
      <Spark x={416} y={92} s={13} className="av-twinkle" />
    </Svg>
  );
}

// empty / no-photo placeholder: a card outline
export function IlloCardEmpty({ className = '' }) {
  return (
    <Svg viewBox="0 0 320 200" className={className}>
      <rect x="40" y="36" width="240" height="140" rx="20" fill={WARM} />
      <rect x="40" y="36" width="240" height="140" rx="20" stroke={INK} strokeWidth="2.5" strokeDasharray="3 10" strokeLinecap="round" />
      <rect x="66" y="62" width="46" height="36" rx="9" fill={PEACH} {...LINE} />
      <Wave x={246} y={70} scale={1.1} />
      <rect x="66" y="128" width="104" height="10" rx="5" fill={INK} opacity="0.4" />
    </Svg>
  );
}

// floating decorative "petals": concentric tap rings (Artivive-style flourish around hero text)
export function TapRings({ className = '', tone = PINK }) {
  return (
    <Svg viewBox="0 0 400 400" className={className}>
      {[180, 140, 100, 60].map((r, i) => (
        <circle key={r} cx="200" cy="200" r={r} stroke={tone} strokeWidth={i === 3 ? 0 : 2} fill={i === 3 ? tone : 'none'} opacity={0.25 + i * 0.18} />
      ))}
    </Svg>
  );
}
