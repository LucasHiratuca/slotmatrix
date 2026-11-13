import { BookingDto } from './api';
import { formatTimeBR } from './labels';

export type BookingAction =
  | 'reschedule'
  | 'no-show'
  | 'cancel'
  | 'cancel-recreate'
  | 'check-in'
  | 'complete'
  | 'confirm-deposit';

export interface ActionAvailability {
  allowed: boolean;
  reason?: string;
}

export interface BookingStateEvaluation {
  primaryAction: {
    action: 'confirm-deposit' | 'check-in' | 'complete';
    label: string;
    allowed: boolean;
    reason?: string;
  } | null;
  actions: Record<BookingAction, ActionAvailability>;
}

const TERMINAL_STATUSES: Set<BookingDto['status']> = new Set([
  'COMPLETED',
  'NO_SHOW',
  'CANCELLED',
  'EXPIRED',
]);

/**
 * Avalia se uma ação sobre a reserva é permitida, segundo as regras estritas
 * do agregado de domínio Booking do backend (Domain Driven Design) e do RBAC.
 */
export function getBookingActionAvailability(
  status: BookingDto['status'],
  action: BookingAction,
  role?: 'OWNER' | 'ADMIN' | 'COORDINATOR' | 'SPECIALIST' | string | null,
  serviceStartAt?: string | null,
  nowMs: number = Date.now(),
): ActionAvailability {
  // Regra 1: Especialista tem acesso somente leitura
  if (role === 'SPECIALIST') {
    return {
      allowed: false,
      reason: 'Somente a coordenação altera reservas',
    };
  }

  // Regra 2: Status terminais não permitem mutações no ciclo de vida
  if (TERMINAL_STATUSES.has(status)) {
    return {
      allowed: false,
      reason: 'Reserva em estado final',
    };
  }

  switch (action) {
    case 'reschedule': {
      if (status === 'CONFIRMED' || status === 'PENDING_DEPOSIT') {
        return { allowed: true };
      }
      if (status === 'CHECKED_IN') {
        return {
          allowed: false,
          reason: 'Reagendamento disponível apenas antes do atendimento iniciar',
        };
      }
      return { allowed: false, reason: 'Reagendamento não permitido para este status' };
    }

    case 'cancel':
    case 'cancel-recreate': {
      if (status === 'CONFIRMED' || status === 'PENDING_DEPOSIT') {
        return { allowed: true };
      }
      if (status === 'CHECKED_IN') {
        return {
          allowed: false,
          reason: 'Não é possível cancelar: atendimento já em andamento',
        };
      }
      return { allowed: false, reason: 'Cancelamento não permitido para este status' };
    }

    case 'no-show': {
      if (status === 'PENDING_DEPOSIT') {
        return {
          allowed: false,
          reason: 'Falta só pode ser registrada após confirmação do sinal',
        };
      }
      if (status === 'CHECKED_IN') {
        return {
          allowed: false,
          reason: 'Paciente já realizou check-in / atendimento em andamento',
        };
      }
      if (status === 'CONFIRMED') {
        // Validação temporal: Booking.ts exige now >= serviceSlot.startAt
        if (serviceStartAt) {
          const startTimeMs = new Date(serviceStartAt).getTime();
          if (!Number.isNaN(startTimeMs) && nowMs < startTimeMs) {
            return {
              allowed: false,
              reason: `Falta só pode ser registrada a partir do horário de início: ${formatTimeBR(serviceStartAt)}`,
            };
          }
        }
        return { allowed: true };
      }
      return { allowed: false, reason: 'Falta não permitida para este status' };
    }

    case 'check-in': {
      if (status === 'CONFIRMED') {
        return { allowed: true };
      }
      if (status === 'PENDING_DEPOSIT') {
        return {
          allowed: false,
          reason: 'Necessário confirmar o sinal antes de registrar chegada',
        };
      }
      if (status === 'CHECKED_IN') {
        return {
          allowed: false,
          reason: 'Paciente já realizou check-in',
        };
      }
      return { allowed: false, reason: 'Check-in não permitido para este status' };
    }

    case 'complete': {
      if (status === 'CHECKED_IN') {
        return { allowed: true };
      }
      if (status === 'CONFIRMED') {
        return {
          allowed: false,
          reason: 'Necessário registrar a chegada do paciente antes de concluir',
        };
      }
      return { allowed: false, reason: 'Conclusão não permitida para este status' };
    }

    case 'confirm-deposit': {
      if (status === 'PENDING_DEPOSIT') {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: 'Sinal já confirmado ou não aplicável',
      };
    }

    default:
      return { allowed: false, reason: 'Ação não reconhecida' };
  }
}

/**
 * Avalia o estado completo da reserva para alimentar a UI com fonte única da verdade.
 */
export function evaluateBookingState(
  status: BookingDto['status'],
  role?: 'OWNER' | 'ADMIN' | 'COORDINATOR' | 'SPECIALIST' | string | null,
  serviceStartAt?: string | null,
  nowMs: number = Date.now(),
): BookingStateEvaluation {
  const actions: Record<BookingAction, ActionAvailability> = {
    reschedule: getBookingActionAvailability(status, 'reschedule', role, serviceStartAt, nowMs),
    'no-show': getBookingActionAvailability(status, 'no-show', role, serviceStartAt, nowMs),
    cancel: getBookingActionAvailability(status, 'cancel', role, serviceStartAt, nowMs),
    'cancel-recreate': getBookingActionAvailability(status, 'cancel-recreate', role, serviceStartAt, nowMs),
    'check-in': getBookingActionAvailability(status, 'check-in', role, serviceStartAt, nowMs),
    complete: getBookingActionAvailability(status, 'complete', role, serviceStartAt, nowMs),
    'confirm-deposit': getBookingActionAvailability(status, 'confirm-deposit', role, serviceStartAt, nowMs),
  };

  let primaryAction: BookingStateEvaluation['primaryAction'] = null;
  if (status === 'PENDING_DEPOSIT') {
    primaryAction = {
      action: 'confirm-deposit',
      label: 'Confirmar sinal',
      allowed: actions['confirm-deposit'].allowed,
      reason: actions['confirm-deposit'].reason,
    };
  } else if (status === 'CONFIRMED') {
    primaryAction = {
      action: 'check-in',
      label: 'Registrar chegada',
      allowed: actions['check-in'].allowed,
      reason: actions['check-in'].reason,
    };
  } else if (status === 'CHECKED_IN') {
    primaryAction = {
      action: 'complete',
      label: 'Concluir atendimento',
      allowed: actions.complete.allowed,
      reason: actions.complete.reason,
    };
  }

  return { primaryAction, actions };
}
