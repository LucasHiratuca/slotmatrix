import { describe, expect, it } from 'vitest';
import {
  evaluateBookingState,
  getBookingActionAvailability,
} from '../booking-state-machine';

describe('Booking State Machine (Domain Rules SSOT)', () => {
  const baseStart = new Date(Date.now() + 3600_000).toISOString(); // 1h in future
  const pastStart = new Date(Date.now() - 3600_000).toISOString(); // 1h in past

  describe('CONFIRMED status', () => {
    it('allows reschedule, check-in, cancel, and cancel-recreate for COORDINATOR', () => {
      const evalResult = evaluateBookingState('CONFIRMED', 'COORDINATOR', baseStart);
      expect(evalResult.primaryAction?.action).toBe('check-in');
      expect(evalResult.primaryAction?.allowed).toBe(true);
      expect(evalResult.actions.reschedule.allowed).toBe(true);
      expect(evalResult.actions.cancel.allowed).toBe(true);
      expect(evalResult.actions['cancel-recreate'].allowed).toBe(true);
    });

    it('disallows no-show if now < serviceSlot.startAt with informative reason', () => {
      const futureTime = new Date('2026-11-13T15:00:00Z').toISOString();
      const nowBefore = new Date('2026-11-13T14:30:00Z').getTime();

      const avail = getBookingActionAvailability(
        'CONFIRMED',
        'no-show',
        'COORDINATOR',
        futureTime,
        nowBefore,
      );
      expect(avail.allowed).toBe(false);
      expect(avail.reason).toContain('Falta só pode ser registrada a partir do horário de início');
    });

    it('allows no-show if now >= serviceSlot.startAt', () => {
      const avail = getBookingActionAvailability(
        'CONFIRMED',
        'no-show',
        'COORDINATOR',
        pastStart,
      );
      expect(avail.allowed).toBe(true);
      expect(avail.reason).toBeUndefined();
    });
  });

  describe('CHECKED_IN status (e.g. Henrique Fontes)', () => {
    it('sets primary action to complete and disallows reschedule, no-show, and cancel with clear reasons', () => {
      const evalResult = evaluateBookingState('CHECKED_IN', 'COORDINATOR', pastStart);
      expect(evalResult.primaryAction?.action).toBe('complete');
      expect(evalResult.primaryAction?.label).toBe('Concluir atendimento');
      expect(evalResult.primaryAction?.allowed).toBe(true);

      // Reschedule must be disallowed with reason
      expect(evalResult.actions.reschedule.allowed).toBe(false);
      expect(evalResult.actions.reschedule.reason).toBe(
        'Reagendamento disponível apenas antes do atendimento iniciar',
      );

      // No-show must be disallowed because patient already checked in
      expect(evalResult.actions['no-show'].allowed).toBe(false);
      expect(evalResult.actions['no-show'].reason).toBe(
        'Paciente já realizou check-in / atendimento em andamento',
      );

      // Cancel must be disallowed because service is in progress
      expect(evalResult.actions.cancel.allowed).toBe(false);
      expect(evalResult.actions.cancel.reason).toBe(
        'Não é possível cancelar: atendimento já em andamento',
      );
      expect(evalResult.actions['cancel-recreate'].allowed).toBe(false);
    });
  });

  describe('PENDING_DEPOSIT status', () => {
    it('sets primary action to confirm-deposit, allows reschedule and cancel, but disallows no-show', () => {
      const evalResult = evaluateBookingState('PENDING_DEPOSIT', 'ADMIN', baseStart);
      expect(evalResult.primaryAction?.action).toBe('confirm-deposit');
      expect(evalResult.primaryAction?.allowed).toBe(true);
      expect(evalResult.actions.reschedule.allowed).toBe(true);
      expect(evalResult.actions.cancel.allowed).toBe(true);

      // No-show is disallowed before deposit confirmation
      expect(evalResult.actions['no-show'].allowed).toBe(false);
      expect(evalResult.actions['no-show'].reason).toBe(
        'Falta só pode ser registrada após confirmação do sinal',
      );
    });
  });

  describe('Terminal statuses (COMPLETED, NO_SHOW, CANCELLED, EXPIRED)', () => {
    const terminals = ['COMPLETED', 'NO_SHOW', 'CANCELLED', 'EXPIRED'] as const;

    terminals.forEach((status) => {
      it(`disallows all actions for terminal status ${status}`, () => {
        const evalResult = evaluateBookingState(status, 'OWNER', pastStart);
        expect(evalResult.primaryAction).toBeNull();
        expect(evalResult.actions.reschedule.allowed).toBe(false);
        expect(evalResult.actions.reschedule.reason).toBe('Reserva em estado final');
        expect(evalResult.actions['no-show'].allowed).toBe(false);
        expect(evalResult.actions.cancel.allowed).toBe(false);
      });
    });
  });

  describe('RBAC: SPECIALIST read-only enforcement', () => {
    it('disallows all mutating actions for SPECIALIST role with coordinator reason', () => {
      const evalResult = evaluateBookingState('CONFIRMED', 'SPECIALIST', baseStart);
      expect(evalResult.primaryAction?.allowed).toBe(false);
      expect(evalResult.primaryAction?.reason).toBe(
        'Somente a coordenação altera reservas',
      );
      expect(evalResult.actions.reschedule.allowed).toBe(false);
      expect(evalResult.actions.reschedule.reason).toBe(
        'Somente a coordenação altera reservas',
      );
      expect(evalResult.actions.cancel.allowed).toBe(false);
      expect(evalResult.actions['no-show'].allowed).toBe(false);
    });
  });
});
