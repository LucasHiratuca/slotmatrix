/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProfileModal } from '../ProfileModal';

describe('ProfileModal — Edição de Perfil e Upload de Foto (Garage S3)', () => {
  it('1. Renderiza dados do usuário, campo de bio e controles de foto', () => {
    const handleClose = vi.fn();
    const handleUpdated = vi.fn();

    render(
      <ProfileModal
        isOpen={true}
        onClose={handleClose}
        userId="user-123"
        userName="Dra. Renata Silveira"
        userEmail="owner@vitascan.test"
        userRole="Proprietário(a)"
        workspaceName="VitaScan Diagnósticos"
        initialBio="Bio inicial"
        initialPhotoUrl={null}
        onProfileUpdated={handleUpdated}
      />,
    );

    expect(screen.getByText('Meu Perfil')).toBeTruthy();
    expect(screen.getByText('Dra. Renata Silveira')).toBeTruthy();
    expect(screen.getByText('owner@vitascan.test')).toBeTruthy();
    expect(screen.getByText('Proprietário(a)')).toBeTruthy();
    expect(screen.getByText('Clínica: VitaScan Diagnósticos')).toBeTruthy();

    const textarea = screen.getByLabelText(/Bio \/ Descrição/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe('Bio inicial');
    expect(screen.getByText('11 / 500')).toBeTruthy();
  });

  it('2. Atualiza a contagem de caracteres ao digitar na bio', () => {
    const handleClose = vi.fn();
    const handleUpdated = vi.fn();

    render(
      <ProfileModal
        isOpen={true}
        onClose={handleClose}
        userId="user-123"
        userName="Dra. Renata Silveira"
        userEmail="owner@vitascan.test"
        userRole="Proprietário(a)"
        initialBio=""
        onProfileUpdated={handleUpdated}
      />,
    );

    const textarea = screen.getByLabelText(/Bio \/ Descrição/i) as HTMLTextAreaElement;
    const testText = 'Nova descrição profissional com mais de vinte caracteres.';
    fireEvent.change(textarea, { target: { value: testText } });

    expect(textarea.value).toBe(testText);
    expect(screen.getByText(`${testText.length} / 500`)).toBeTruthy();
  });

  it('3. Valida tamanho máximo de foto (> 5 MB) exibindo mensagem de erro', () => {
    const handleClose = vi.fn();
    const handleUpdated = vi.fn();

    render(
      <ProfileModal
        isOpen={true}
        onClose={handleClose}
        userId="user-123"
        userName="Dra. Renata Silveira"
        userEmail="owner@vitascan.test"
        userRole="Proprietário(a)"
        initialBio=""
        onProfileUpdated={handleUpdated}
      />,
    );

    const input = document.getElementById('profile-photo-input') as HTMLInputElement;
    expect(input).toBeTruthy();

    // 6 MB dummy file
    const bigFile = new File([''], 'huge.png', { type: 'image/png' });
    Object.defineProperty(bigFile, 'size', { value: 6 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [bigFile] } });

    expect(screen.getByText(/limite máximo permitido é de 5 MB/i)).toBeTruthy();
  });

  it('4. Fecha com a tecla Escape', () => {
    const handleClose = vi.fn();
    const handleUpdated = vi.fn();

    render(
      <ProfileModal
        isOpen={true}
        onClose={handleClose}
        userId="user-123"
        userName="Dra. Renata Silveira"
        userEmail="owner@vitascan.test"
        userRole="Proprietário(a)"
        initialBio=""
        onProfileUpdated={handleUpdated}
      />,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalled();
  });
});
