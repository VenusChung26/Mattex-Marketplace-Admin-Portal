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

const stroke = {
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function StepIcon({ children }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
      {children}
    </svg>
  );
}

function SearchIcon() {
  return (
    <StepIcon>
      <circle cx="10.5" cy="10.5" r="5.25" {...stroke} />
      <path d="m14.6 14.6 3.9 3.9" {...stroke} />
    </StepIcon>
  );
}

function QuoteIcon() {
  return (
    <StepIcon>
      <path d="M6 6.5h11.2A1.6 1.6 0 0 1 18.8 8.1v6.2a1.6 1.6 0 0 1-1.6 1.6H10l-2.4 2.5V15.9H6A1.6 1.6 0 0 1 4.4 14.3V8.1A1.6 1.6 0 0 1 6 6.5z" {...stroke} />
      <path d="M8.2 10.4h6.6M8.2 13.1h4.2" {...stroke} />
    </StepIcon>
  );
}

function BuyIcon() {
  return (
    <StepIcon>
      <path d="M7.2 8.2h9.6l-.7 8.6a1.4 1.4 0 0 1-1.4 1.3H9.3a1.4 1.4 0 0 1-1.4-1.3l-.7-8.6z" {...stroke} />
      <path d="M9.6 8.2V7a2.4 2.4 0 0 1 4.8 0v1.2" {...stroke} />
    </StepIcon>
  );
}

function CartIcon() {
  return (
    <StepIcon>
      <path d="M4.2 6.2h2.1l1.2 8.1a1.5 1.5 0 0 0 1.5 1.2h7.2a1.5 1.5 0 0 0 1.5-1.2L19.2 8.4H7.4" {...stroke} />
      <circle cx="10" cy="18.4" r="1.15" fill="currentColor" />
      <circle cx="16" cy="18.4" r="1.15" fill="currentColor" />
    </StepIcon>
  );
}

function SpecIcon() {
  return (
    <StepIcon>
      <path d="M8 4.8h5.2L18 9.4V18.6A1.4 1.4 0 0 1 16.6 20H8.4A1.4 1.4 0 0 1 7 18.6V6.2A1.4 1.4 0 0 1 8.4 4.8H8z" {...stroke} />
      <path d="M13 4.8V9.2h4.8M9.4 12.6h5.4M9.4 15.6h3.4" {...stroke} />
    </StepIcon>
  );
}

const ICONS = {
  search: SearchIcon,
  quote: QuoteIcon,
  buy: BuyIcon,
  cart: CartIcon,
  spec: SpecIcon,
};

export function HowStepIcon({ name }) {
  const Icon = ICONS[name] || SearchIcon;
  return (
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-800 text-white">
      <Icon />
    </span>
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
