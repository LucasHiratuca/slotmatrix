import React from 'react';
import {
  formatAuditAction,
  formatAuditDetails,
  formatDateTimeBR,
  formatRole,
} from './labels';
import { ShieldCheck } from 'lucide-react';

export interface AuditEntryItem {
  id: string;
  tenantId: string;
  actorId: string | null;
  action: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

interface AuditViewProps {
  logs: AuditEntryItem[];
  role?: string | null;
}

export const AuditView: React.FC<AuditViewProps> = ({ logs, role }) => {
  const canViewAudit = role === 'OWNER' || role === 'ADMIN';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-ink-primary">Auditoria</h1>
        <p className="text-xs text-ink-secondary mt-0.5">
          Registro histórico protegido contra edição ou exclusão de todas as operações realizadas na clínica.
        </p>
      </div>

      <div className="bg-surface border border-border-subtle rounded-xl overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 bg-canvas border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-brand" />
            <h2 className="text-sm font-semibold text-ink-primary">Registro de auditoria</h2>
          </div>
          <span className="text-xs text-ink-secondary tabular-nums">
            {logs.length} evento(s) listado(s)
          </span>
        </div>

        {!canViewAudit ? (
          <div className="p-6 text-xs text-ink-secondary">
            A consulta ao registro de auditoria está disponível apenas para perfis de Proprietário(a) ou Administrador(a)
            (seu perfil atual: {formatRole(role)}).
          </div>
        ) : logs.length === 0 ? (
          <div className="p-6 text-xs text-ink-secondary">
            Nenhum evento registrado no histórico até o momento.
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {logs.map((log) => (
              <div
                key={log.id}
                className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-sunken/40 transition"
              >
                <div className="space-y-0.5">
                  <div className="text-[13px] font-medium text-ink-primary">
                    {formatAuditAction(log.action)}
                  </div>
                  <div className="text-xs text-ink-secondary">
                    {formatAuditDetails(log.metadata)}
                  </div>
                </div>
                <div className="text-xs text-ink-secondary tabular-nums shrink-0">
                  {formatDateTimeBR(log.occurredAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
