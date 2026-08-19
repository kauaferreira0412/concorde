/**
 * Icone set minimalista (estilo "linha fina", inspirado em Feather/Lucide) usado em toda
 * a UI no lugar de emoji - emoji renderiza com estilo/tamanho inconsistente entre SO e
 * navegador, o que fica "amador"; SVG com stroke="currentColor" herda a cor do botao
 * (inclusive nos estados hover/ativo/perigo) e fica nitido em qualquer resolução.
 */
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function MicIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

export function MicOffIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M9 9v3a3 3 0 0 0 4.6 2.55" />
      <path d="M15 6.5V5a3 3 0 0 0-5.94-.6" />
      <path d="M5 10a7 7 0 0 0 10.6 6" />
      <path d="M18.9 13A7 7 0 0 0 19 10" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

export function HeadphonesIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <path d="M3 13a9 9 0 0 1 18 0" />
      <rect x="3" y="13" width="4" height="7" rx="1.5" />
      <rect x="17" y="13" width="4" height="7" rx="1.5" />
    </svg>
  );
}

export function HeadphonesOffIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M3 13a9 9 0 0 1 15.5-6.3" />
      <path d="M21 13a9 9 0 0 0-1.2-4.5" />
      <rect x="3" y="13" width="4" height="7" rx="1.5" />
      <path d="M17 13.6V20a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5v-2.6" />
    </svg>
  );
}

export function ScreenShareIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <polyline points="8 12 12 8 16 12" />
      <line x1="12" y1="8" x2="12" y2="14" />
    </svg>
  );
}

export function PhoneOffIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M10.5 6.5a2 2 0 0 1 2-1.7l1.3.2a2 2 0 0 1 1.6 1.6l.4 2a2 2 0 0 1-.6 1.9l-1 1" />
      <path d="M7.4 9.6a2 2 0 0 0-.4 2.2c.9 2.1 2.3 4.1 4.2 5.7.5.4 1.3.4 1.8-.1l1.4-1.4" />
      <path d="M4.3 4.3 19.7 19.7" />
    </svg>
  );
}

export function ShieldIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <path d="M12 2 4 5v6c0 5 3.4 8.7 8 11 4.6-2.3 8-6 8-11V5l-8-3z" />
    </svg>
  );
}

export function SettingsIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

export function LogOutIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function MaximizeIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
      <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
    </svg>
  );
}

/** "Ampliar" (modo largo/teatro) - estagio intermediario antes da tela cheia de verdade,
    ocupa a largura toda da area central sem sair da pagina. */
export function WidenIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <polyline points="7 8 3 12 7 16" />
      <polyline points="17 8 21 12 17 16" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  );
}

export function ImageIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

export function CameraIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

export function ZoomInIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

export function ZoomOutIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

export function CameraOffIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M21 19a2 2 0 0 1-2 2H5.5" />
      <path d="M3.5 15.5A2 2 0 0 1 3 15V8a2 2 0 0 1 2-2h4l2-3h4.2" />
      <path d="M17.5 6H19a2 2 0 0 1 2 2v9.5" />
      <path d="M14.5 13.4a4 4 0 0 1-5.9 2.1" />
      <path d="M9.2 9.2A4 4 0 0 1 16 12" />
    </svg>
  );
}

export function PencilIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

export function TrashIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

export function CheckIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function XIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function ChevronsLeftIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <polyline points="11 17 6 12 11 7" />
      <polyline points="18 17 13 12 18 7" />
    </svg>
  );
}

export function VolumeIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <polygon points="4 9 8 9 12 5 12 19 8 15 4 15 4 9" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" />
      <path d="M19 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  );
}

export function EyeIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOffIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <path d="M9.9 5.2A10.9 10.9 0 0 1 12 5c7 0 10.5 7 10.5 7a13.2 13.2 0 0 1-3 3.9" />
      <path d="M6.3 6.7C3.4 8.6 1.5 12 1.5 12s3.5 7 10.5 7a10.4 10.4 0 0 0 4.4-.9" />
      <path d="M9.5 10a3 3 0 0 0 4.2 4.2" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

export function HashIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <line x1="5" y1="9" x2="19" y2="9" />
      <line x1="5" y1="15" x2="19" y2="15" />
      <line x1="10" y1="4" x2="8" y2="20" />
      <line x1="16" y1="4" x2="14" y2="20" />
    </svg>
  );
}

export function ReplyIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

export function UserIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function KeyboardIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="6" y1="9" x2="6" y2="9" />
      <line x1="10" y1="9" x2="10" y2="9" />
      <line x1="14" y1="9" x2="14" y2="9" />
      <line x1="18" y1="9" x2="18" y2="9" />
      <line x1="6" y1="13" x2="6" y2="13" />
      <line x1="18" y1="13" x2="18" y2="13" />
      <line x1="8" y1="16" x2="16" y2="16" />
    </svg>
  );
}

export function BellIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
      <path d="M10.5 20a1.5 1.5 0 0 0 3 0" />
    </svg>
  );
}

export function LockIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function ChevronDownIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function UsersIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function ChevronsRightIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <polyline points="13 17 18 12 13 7" />
      <polyline points="6 17 11 12 6 7" />
    </svg>
  );
}

export function MenuIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

export function DownloadIcon(props) {
  return (
    <svg {...base} width={props.size || 18} height={props.size || 18} className={props.className}>
      <path d="M12 3v12" />
      <polyline points="7 11 12 16 17 11" />
      <path d="M4 19h16" />
    </svg>
  );
}
