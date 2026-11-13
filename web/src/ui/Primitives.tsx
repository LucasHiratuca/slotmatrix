import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Cpu,
  DoorOpen,
  Stethoscope,
  UserCheck,
  UserX,
  XCircle,
} from 'lucide-react';
import { formatBookingStatus } from '../labels';

const AVATAR_MINERAL_PALETTES = [
  'bg-[#E4ECEA] text-[#1D3B36] border-[#C5D6D2] dark:bg-[#1B2E2B] dark:text-[#B8D8D2] dark:border-[#2C4742]',
  'bg-[#E6EEF5] text-[#233D54] border-[#C7D7E6] dark:bg-[#1C2A38] dark:text-[#BDD1E4] dark:border-[#2E4358]',
  'bg-[#EFECE6] text-[#4A3F31] border-[#D8D0C4] dark:bg-[#29241D] dark:text-[#DCD0BE] dark:border-[#40382D]',
  'bg-[#ECEAF2] text-[#38304C] border-[#D2CEE0] dark:bg-[#242031] dark:text-[#CFC9E2] dark:border-[#39334D]',
  'bg-[#EAECEF] text-[#323B47] border-[#CFD5DE] dark:bg-[#212730] dark:text-[#C7D0DC] dark:border-[#353E4C]',
];

export function getInitials(name: string): string {
  const cleaned = (name || '')
    .replace(/^(Dra?\.|Prof\.|Sr\.|Sra\.)\s+/i, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CL';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h;
}

export const Avatar: React.FC<{
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  src?: string | null;
}> = ({ name, size = 'sm', className = '', src }) => {
  const [imageError, setImageError] = useState(false);
  const initials = getInitials(name);
  const palette = AVATAR_MINERAL_PALETTES[hashName(name || 'User') % AVATAR_MINERAL_PALETTES.length];
  const sizeClass =
    size === 'xs'
      ? 'w-6 h-6 text-[11px]'
      : size === 'sm'
      ? 'w-8 h-8 text-[12px]'
      : size === 'md'
      ? 'w-9 h-9 text-[13px]'
      : 'w-11 h-11 text-[14px]';

  if (src && !imageError) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setImageError(true)}
        className={`inline-flex items-center justify-center rounded-full border border-border-subtle object-cover select-none shrink-0 ${sizeClass} ${className}`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded-full border font-semibold tracking-tight select-none shrink-0 ${sizeClass} ${palette} ${className}`}
    >
      {initials}
    </span>
  );
};

/**
 * Tile de Recurso: diferencia Especialista (círculo), Sala (quadrado rounded-md) e Equipamento (octogonal/chanfrado)
 * usando tons minerais neutros que jamais colidem com as cores de status das reservas.
 */
export const ResourceTile: React.FC<{
  category: 'SPECIALIST' | 'ROOM' | 'EQUIPMENT' | string;
  name?: string;
  size?: 'sm' | 'md';
}> = ({ category, name, size = 'md' }) => {
  const boxSize = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9';
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  if (category === 'SPECIALIST') {
    if (name) {
      return <Avatar name={name} size={size === 'sm' ? 'xs' : 'md'} />;
    }
    return (
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center rounded-full border shrink-0 ${boxSize} bg-[var(--res-specialist-bg)] text-[var(--res-specialist-text)] border-[var(--res-specialist-border)]`}
      >
        <Stethoscope className={iconSize} strokeWidth={1.6} />
      </span>
    );
  }

  if (category === 'ROOM') {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center rounded-md border shrink-0 ${boxSize} bg-[var(--res-room-bg)] text-[var(--res-room-text)] border-[var(--res-room-border)]`}
      >
        <DoorOpen className={iconSize} strokeWidth={1.6} />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded-lg border shrink-0 ${boxSize} bg-[var(--res-equipment-bg)] text-[var(--res-equipment-text)] border-[var(--res-equipment-border)]`}
    >
      <Cpu className={iconSize} strokeWidth={1.6} />
    </span>
  );
};

export function getStatusTokenStyles(status: string): {
  bg: string;
  border: string;
  text: string;
  dot: string;
  isCancelled?: boolean;
} {
  switch (status) {
    case 'CONFIRMED':
      return {
        bg: 'var(--status-confirmed-bg)',
        border: 'var(--status-confirmed-border)',
        text: 'var(--status-confirmed-text)',
        dot: 'var(--status-confirmed-dot)',
      };
    case 'PENDING_DEPOSIT':
      return {
        bg: 'var(--status-pending-bg)',
        border: 'var(--status-pending-border)',
        text: 'var(--status-pending-text)',
        dot: 'var(--status-pending-dot)',
      };
    case 'CHECKED_IN':
      return {
        bg: 'var(--status-arrived-bg)',
        border: 'var(--status-arrived-border)',
        text: 'var(--status-arrived-text)',
        dot: 'var(--status-arrived-dot)',
      };
    case 'COMPLETED':
      return {
        bg: 'var(--status-completed-bg)',
        border: 'var(--status-completed-border)',
        text: 'var(--status-completed-text)',
        dot: 'var(--status-completed-dot)',
      };
    case 'NO_SHOW':
      return {
        bg: 'var(--status-noshow-bg)',
        border: 'var(--status-noshow-border)',
        text: 'var(--status-noshow-text)',
        dot: 'var(--status-noshow-dot)',
      };
    case 'CANCELLED':
    case 'EXPIRED':
      return {
        bg: 'var(--status-cancelled-bg)',
        border: 'var(--status-cancelled-border)',
        text: 'var(--status-cancelled-text)',
        dot: 'var(--status-cancelled-dot)',
        isCancelled: true,
      };
    default:
      return {
        bg: 'var(--status-completed-bg)',
        border: 'var(--status-completed-border)',
        text: 'var(--status-completed-text)',
        dot: 'var(--status-completed-dot)',
      };
  }
}

export const BookingStatusBadge: React.FC<{
  status: string;
  size?: 'sm' | 'md';
}> = ({ status, size = 'md' }) => {
  const st = getStatusTokenStyles(status);
  const label = formatBookingStatus(status);
  const iconClass = 'w-3.5 h-3.5 shrink-0';

  const renderIcon = () => {
    switch (status) {
      case 'CONFIRMED':
        return <CheckCircle2 className={iconClass} strokeWidth={1.75} />;
      case 'PENDING_DEPOSIT':
        return <Clock className={iconClass} strokeWidth={1.75} />;
      case 'CHECKED_IN':
        return <UserCheck className={iconClass} strokeWidth={1.75} />;
      case 'COMPLETED':
        return <Check className={iconClass} strokeWidth={1.75} />;
      case 'NO_SHOW':
        return <UserX className={iconClass} strokeWidth={1.75} />;
      case 'CANCELLED':
      case 'EXPIRED':
        return <XCircle className={iconClass} strokeWidth={1.75} />;
      default:
        return <AlertTriangle className={iconClass} strokeWidth={1.75} />;
    }
  };

  return (
    <span
      style={{
        backgroundColor: st.bg,
        borderColor: st.border,
        color: st.text,
      }}
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${
        size === 'sm' ? 'px-2 py-0.5 text-[12px]' : 'px-2.5 py-0.5 text-[13px]'
      } ${st.isCancelled ? 'line-through opacity-85' : ''}`}
    >
      {renderIcon()}
      <span>{label}</span>
    </span>
  );
};

/**
 * React Bits — CountUp (MIT + Commons Clause v1.0)
 * Anima números uma única vez ao montar, respeitando prefers-reduced-motion.
 */
export const CountUp: React.FC<{
  to: number;
  from?: number;
  durationMs?: number;
  formatter?: (val: number) => string;
  className?: string;
}> = ({ to, from = 0, durationMs = 700, formatter, className = '' }) => {
  const [value, setValue] = useState<number>(to);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    if (hasAnimatedRef.current) {
      setValue(to);
      return;
    }
    hasAnimatedRef.current = true;

    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced || from === to || durationMs <= 0) {
      setValue(to);
      return;
    }

    let rafId = 0;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        setValue(to);
      }
    };

    setValue(from);
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [to, from, durationMs]);

  return (
    <span className={`tabular-nums ${className}`}>
      {formatter ? formatter(value) : String(value)}
    </span>
  );
};

/**
 * React Bits — Stepper (MIT + Commons Clause v1.0)
 * Indicador de etapas limpo para "Novo agendamento" e Portal Público.
 */
export const Stepper: React.FC<{
  steps: { id: number; label: string; summary?: string }[];
  currentStep: number;
  onSelectStep?: (stepId: number) => void;
}> = ({ steps, currentStep, onSelectStep }) => {
  return (
    <ol className="flex items-center gap-2 sm:gap-4 w-full" aria-label="Etapas do agendamento">
      {steps.map((s, idx) => {
        const isDone = s.id < currentStep;
        const isCurrent = s.id === currentStep;
        return (
          <li key={s.id} className="flex items-center gap-2 flex-1 min-w-0">
            <button
              type="button"
              disabled={!onSelectStep || s.id > currentStep}
              onClick={() => onSelectStep?.(s.id)}
              className={`flex items-center gap-2.5 text-left min-w-0 group ${
                onSelectStep && s.id <= currentStep ? 'cursor-pointer' : 'cursor-default'
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0 transition-colors tabular-nums ${
                  isCurrent
                    ? 'bg-brand text-brand-contrast'
                    : isDone
                    ? 'bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-text)] border border-[var(--status-confirmed-border)]'
                    : 'bg-sunken text-ink-muted border border-border-subtle'
                }`}
              >
                {isDone ? <Check className="w-3.5 h-3.5" /> : s.id}
              </span>
              <span className="truncate">
                <span
                  className={`block text-[13px] truncate ${
                    isCurrent
                      ? 'font-semibold text-ink-primary'
                      : isDone
                      ? 'font-medium text-ink-primary'
                      : 'text-ink-muted'
                  }`}
                >
                  {s.label}
                </span>
                {s.summary && (
                  <span className="block text-[12px] text-ink-secondary truncate">
                    {s.summary}
                  </span>
                )}
              </span>
            </button>
            {idx < steps.length - 1 && (
              <div
                aria-hidden="true"
                className={`h-px flex-1 min-w-[16px] ${
                  isDone ? 'bg-[var(--status-confirmed-border)]' : 'bg-border-subtle'
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
};

/**
 * React Bits — AnimatedList (MIT + Commons Clause v1.0)
 * Usado exclusivamente para novas ofertas da lista de espera e eventos de auditoria.
 */
export const AnimatedList: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => {
  return <div className={`space-y-2.5 ${className}`}>{children}</div>;
};

/**
 * Ilustração SVG Própria (Motivo da Matriz: 3 raias + blocos conectados + hachura) para estados vazios.
 */
export const EmptyStateMatrix: React.FC<{
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ title, description, actionLabel, onAction }) => {
  return (
    <div className="py-10 px-6 text-center max-w-md mx-auto flex flex-col items-center">
      <svg
        width="160"
        height="76"
        viewBox="0 0 160 76"
        fill="none"
        aria-hidden="true"
        className="mb-4 text-ink-muted"
      >
        <defs>
          <pattern
            id="empty-hatch"
            width="6"
            height="6"
            patternTransform="rotate(-45 0 0)"
            patternUnits="userSpaceOnUse"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              stroke="currentColor"
              strokeOpacity="0.3"
              strokeWidth="2"
            />
          </pattern>
        </defs>
        {/* 3 Raias */}
        <line x1="8" y1="16" x2="152" y2="16" stroke="currentColor" strokeOpacity="0.18" strokeDasharray="3 3" />
        <line x1="8" y1="38" x2="152" y2="38" stroke="currentColor" strokeOpacity="0.18" strokeDasharray="3 3" />
        <line x1="8" y1="60" x2="152" y2="60" stroke="currentColor" strokeOpacity="0.18" strokeDasharray="3 3" />
        {/* Conector vertical */}
        <line x1="58" y1="16" x2="58" y2="60" stroke="var(--accent-primary)" strokeOpacity="0.45" strokeWidth="1.5" />
        {/* 3 Blocos */}
        <rect x="42" y="9" width="46" height="14" rx="4" fill="var(--accent-tint)" stroke="var(--accent-primary)" strokeOpacity="0.5" />
        <rect x="42" y="31" width="46" height="14" rx="4" fill="var(--accent-tint)" stroke="var(--accent-primary)" strokeOpacity="0.5" />
        <rect x="88" y="31" width="18" height="14" rx="3" fill="url(#empty-hatch)" stroke="currentColor" strokeOpacity="0.25" />
        <rect x="42" y="53" width="46" height="14" rx="4" fill="var(--accent-tint)" stroke="var(--accent-primary)" strokeOpacity="0.5" />
      </svg>
      <h3 className="text-[15px] font-semibold text-ink-primary">{title}</h3>
      <p className="text-[13px] text-ink-secondary mt-1 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium bg-brand hover:bg-brand-hover text-brand-contrast transition"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
