import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Loader2, Sparkles, User, X } from 'lucide-react';
import { Avatar } from './ui/Primitives';

export interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  workspaceName?: string;
  initialBio?: string;
  initialPhotoUrl?: string | null;
  onProfileUpdated: (newBio: string, newPhotoUrl?: string | null) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  userId,
  userName,
  userEmail,
  userRole,
  workspaceName,
  initialBio = '',
  initialPhotoUrl = null,
  onProfileUpdated,
}) => {
  const [bio, setBio] = useState(initialBio);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(initialPhotoUrl);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setBio(initialBio);
      setPhotoFile(null);
      setPhotoPreview(initialPhotoUrl);
      setErrorMsg(null);
      setSuccessMsg(null);

      fetch('/api/me/profile', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) {
            if (data.bio !== undefined && !initialBio) setBio(data.bio);
            if (data.fotoUrl) {
              const urlWithBuster = `${data.fotoUrl}?t=${Date.now()}`;
              setPhotoPreview(urlWithBuster);
              onProfileUpdated(data.bio || initialBio, urlWithBuster);
            }
          }
        })
        .catch(() => undefined);
    }
  }, [isOpen]);

  // Fechar com Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSaving) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSaving, onClose]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const validMimes = [
      'image/jpeg',
      'image/jpg',
      'image/pjpeg',
      'image/png',
      'image/x-png',
      'image/gif',
      'image/webp',
    ];
    const isMimeValid = !file.type || validMimes.includes(file.type.toLowerCase());
    const isExtValid = validExtensions.includes(ext);

    if (!isExtValid && !isMimeValid) {
      setErrorMsg('Tipo de arquivo inválido. Formatos aceitos: JPEG, PNG, GIF ou WebP.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Arquivo muito grande. O limite máximo permitido é de 5 MB.');
      return;
    }

    setErrorMsg(null);
    setPhotoFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPhotoPreview(objectUrl);
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const formData = new FormData();
      formData.append('bio', bio);
      if (photoFile) {
        formData.append('foto', photoFile, photoFile.name);
      }

      const targetEndpoint = userId ? `/api/perfil/${userId}/editar` : '/api/me/profile';
      const res = await fetch(targetEndpoint, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || 'Falha ao salvar as alterações do perfil.');
      }

      setSuccessMsg('Perfil e foto atualizados com sucesso no Garage S3!');

      const cacheBuster = `?t=${Date.now()}`;
      let finalPhotoUrl: string | null = null;
      if (data.fotoUrl) {
        finalPhotoUrl = `${data.fotoUrl}${cacheBuster}`;
      } else if (photoFile) {
        const targetId = userId || data.userId;
        finalPhotoUrl = targetId ? `/api/perfil/${targetId}/foto${cacheBuster}` : photoPreview;
      } else {
        finalPhotoUrl = photoPreview;
      }

      setPhotoPreview(finalPhotoUrl);
      onProfileUpdated(bio, finalPhotoUrl);

      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar. Verifique sua conexão e tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
    >
      <div
        className="w-full max-w-lg bg-surface border border-border-subtle rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-elevated shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 id="profile-modal-title" className="text-[15px] font-semibold text-ink-primary">
                Meu Perfil
              </h2>
              <p className="text-[12px] text-ink-muted">
                Gerencie sua bio e foto de perfil (Garage S3 Object Storage)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-sunken transition disabled:opacity-50"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-[var(--status-error-bg)] border border-[var(--status-error-border)] text-[var(--status-error-text)] text-[13px] flex items-start gap-2">
              <span className="font-semibold shrink-0">Erro:</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-[var(--status-success-bg)] border border-[var(--status-success-border)] text-[var(--status-success-text)] text-[13px] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Cartão de Identificação */}
          <div className="p-4 rounded-xl bg-sunken/60 border border-border-subtle flex items-center gap-4">
            <div className="relative group shrink-0">
              <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-border-subtle shadow-sm bg-canvas flex items-center justify-center">
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt={userName}
                    className="w-full h-full object-cover"
                    onError={() => setPhotoPreview(null)}
                  />
                ) : (
                  <Avatar name={userName} size="lg" className="w-full h-full text-xl" />
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white"
                title="Alterar foto"
              >
                <Camera className="w-5 h-5 drop-shadow" />
              </button>
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold text-ink-primary truncate">
                {userName}
              </div>
              <div className="text-[13px] text-ink-secondary truncate">
                {userRole}
              </div>
              <div className="text-[12px] text-ink-muted truncate mt-0.5">
                {userEmail}
              </div>
              {workspaceName && (
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 mt-2 rounded-md bg-canvas border border-border-subtle text-[11px] font-medium text-ink-secondary">
                  <span>Clínica: {workspaceName}</span>
                </div>
              )}
            </div>
          </div>

          {/* Upload de Foto de Perfil */}
          <div className="space-y-2">
            <label className="block text-[12px] font-semibold text-ink-secondary uppercase tracking-wider">
              Foto de Perfil
            </label>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
                onChange={handleFileChange}
                className="hidden"
                id="profile-photo-input"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-canvas hover:bg-sunken border border-border-subtle text-[13px] font-medium text-ink-primary transition shadow-xs cursor-pointer"
              >
                <Camera className="w-4 h-4 text-ink-secondary" />
                <span>{photoPreview ? 'Trocar foto...' : 'Escolher foto...'}</span>
              </button>

              {photoFile && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  disabled={isSaving}
                  className="px-2.5 py-2 rounded-lg text-[12px] text-[var(--status-error-text)] hover:bg-[var(--status-error-bg)] transition font-medium"
                >
                  Cancelar seleção
                </button>
              )}
            </div>
            <p className="text-[11px] text-ink-muted leading-relaxed">
              Formatos aceitos: JPEG, PNG, GIF ou WebP — tamanho máximo de 5 MB. O arquivo será armazenado de forma isolada e persistente no bucket do Garage S3.
            </p>
          </div>

          {/* Campo de Bio / Descrição */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="profile-bio-input"
                className="block text-[12px] font-semibold text-ink-secondary uppercase tracking-wider"
              >
                Bio / Descrição
              </label>
              <span className={`text-[11px] ${bio.length >= 500 ? 'text-[var(--status-error-text)] font-semibold' : 'text-ink-muted'}`}>
                {bio.length} / 500
              </span>
            </div>
            <textarea
              id="profile-bio-input"
              rows={4}
              maxLength={500}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              disabled={isSaving}
              placeholder="Descreva sua formação, especialidade clínica ou atuação na clínica..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-canvas border border-border-subtle text-ink-primary placeholder:text-ink-muted text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] resize-none transition"
            />
          </div>

          {/* Modal Footer */}
          <div className="pt-3 border-t border-border-subtle flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg border border-border-subtle text-[13px] font-medium text-ink-secondary hover:text-ink-primary hover:bg-sunken transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[var(--primary)] hover:opacity-90 text-[var(--primary-contrast)] text-[13px] font-semibold transition shadow-sm disabled:opacity-60"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Salvar Alterações</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
