'use client';

import React, { useEffect } from 'react';
import { COPY_PROTECTION_ENABLED, isEditableTarget } from 'app/lib/copy-protection';
import { CartProvider } from './context/CartContext';

export default function ClientWrapper({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!COPY_PROTECTION_ENABLED || typeof document === 'undefined') {
      return;
    }

    const handleCopy = (event: ClipboardEvent) => {
      event.preventDefault();
    };

    const handleCut = (event: ClipboardEvent) => {
      event.preventDefault();
    };

    const handleSelectStart = (event: Event) => {
      if (!isEditableTarget(event.target)) {
        event.preventDefault();
      }
    };

    const handleContextMenu = (event: MouseEvent) => {
      if (!isEditableTarget(event.target)) {
        event.preventDefault();
      }
    };

    const handleDragStart = (event: DragEvent) => {
      event.preventDefault();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'c' || key === 'x') {
        event.preventDefault();
        return;
      }

      if (key === 'a' && !isEditableTarget(event.target)) {
        event.preventDefault();
      }
    };

    document.addEventListener('copy', handleCopy, true);
    document.addEventListener('cut', handleCut, true);
    document.addEventListener('selectstart', handleSelectStart, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('dragstart', handleDragStart, true);
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('copy', handleCopy, true);
      document.removeEventListener('cut', handleCut, true);
      document.removeEventListener('selectstart', handleSelectStart, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('dragstart', handleDragStart, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  return <CartProvider>{children}</CartProvider>;
}
