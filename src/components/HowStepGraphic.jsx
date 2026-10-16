const frame = "flex h-[4.5rem] w-full items-center justify-center bg-[#eef3f0] min-[752px]:h-[7.5rem]";

function Art({ children }) {
  return (
    <div className={frame} aria-hidden>
      <svg viewBox="0 0 168 108" className="h-14 w-auto min-[752px]:h-[6.5rem] min-[752px]:w-36" fill="none">
        {children}
      </svg>
    </div>
  );
}

function SearchArt() {
  return (
    <Art>
      <rect x="24" y="22" width="120" height="26" rx="13" fill="#fff" stroke="#c9d7ce" />
      <circle cx="40" cy="35" r="6" stroke="#245a41" strokeWidth="1.8" />
      <path d="M45 40l5 5" stroke="#245a41" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="52" y="32" width="72" height="6" rx="3" fill="#d7e4dc" />
      <rect x="32" y="58" width="104" height="12" rx="6" fill="#fff" stroke="#c9d7ce" />
      <rect x="40" y="62" width="48" height="4" rx="2" fill="#245a41" />
      <rect x="32" y="76" width="88" height="12" rx="6" fill="#fff" stroke="#c9d7ce" />
      <rect x="40" y="80" width="36" height="4" rx="2" fill="#d7e4dc" />
    </Art>
  );
}

function QuoteArt() {
  return (
    <Art>
      <path
        d="M40 16h64a14 14 0 0 1 14 14v22a14 14 0 0 1-14 14H62l-8 14-8-14H40a14 14 0 0 1-14-14V30a14 14 0 0 1 14-14z"
        fill="#fff"
        stroke="#c9d7ce"
        strokeLinejoin="round"
      />
      <rect x="40" y="30" width="44" height="6" rx="3" fill="#d7e4dc" />
      <rect x="40" y="44" width="52" height="6" rx="3" fill="#245a41" />
      <rect x="112" y="58" width="32" height="20" rx="10" fill="#245a41" />
      <path d="M122 68h12" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M132 64l4 4-4 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Art>
  );
}

function BuyArt() {
  return (
    <Art>
      <rect x="50" y="12" width="68" height="84" rx="10" fill="#fff" stroke="#c9d7ce" />
      <rect x="60" y="22" width="48" height="36" rx="6" fill="#d7e4dc" />
      <rect x="66" y="32" width="18" height="16" rx="2" fill="#fff" />
      <rect x="60" y="66" width="48" height="16" rx="8" fill="#245a41" />
    </Art>
  );
}

function CartArt() {
  return (
    <Art>
      <rect x="28" y="26" width="36" height="32" rx="6" fill="#d7e4dc" />
      <rect x="70" y="18" width="42" height="40" rx="6" fill="#fff" stroke="#c9d7ce" />
      <path d="M34 78h78l8-22H52" stroke="#245a41" strokeWidth="2" strokeLinejoin="round" />
      <path d="M52 56h18" stroke="#245a41" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="58" cy="86" r="4" fill="#245a41" />
      <circle cx="96" cy="86" r="4" fill="#245a41" />
    </Art>
  );
}

function SpecArt() {
  return (
    <Art>
      <path d="M52 14h34l20 20v48a8 8 0 0 1-8 8H52a8 8 0 0 1-8-8V22a8 8 0 0 1 8-8z" fill="#fff" stroke="#c9d7ce" />
      <path d="M86 14v20h20" stroke="#c9d7ce" />
      <rect x="56" y="46" width="36" height="5" rx="2.5" fill="#d7e4dc" />
      <rect x="56" y="58" width="24" height="5" rx="2.5" fill="#245a41" />
      <circle cx="118" cy="70" r="14" fill="#245a41" />
      <path d="M118 63v14M111 70h14" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </Art>
  );
}

const ARTS = {
  search: SearchArt,
  quote: QuoteArt,
  buy: BuyArt,
  cart: CartArt,
  spec: SpecArt,
};

export default function HowStepGraphic({ name }) {
  const Graphic = ARTS[name] || SearchArt;
  return <Graphic />;
}
