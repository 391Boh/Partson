'use client';

import React, { useEffect } from 'react';
import { COPY_PROTECTION_ENABLED, isEditableTarget } from 'app/lib/copy-protection';
import { CartProvider } from './context/CartContext';

export default function ClientWrapper({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!COPY_PROTECTION_ENABLED || typeof document === 'undefined') {
      return;
    }

    let isAdmin = false;
    const setAdmin = (value: boolean) => {
      isAdmin = value;
      document.documentElement.dataset.adminCopy = value ? 'true' : 'false';
    };
    try {
      const uid = localStorage.getItem('user_id');
      setAdmin(Boolean(uid && localStorage.getItem(`partson:isAdmin:${uid}`) === '1'));
    } catch { setAdmin(false); }
    const onAdminState = (event: Event) => {
      setAdmin((event as CustomEvent<{ isAdmin?: boolean }>).detail?.isAdmin === true);
    };
    window.addEventListener('partson:adminStateChange', onAdminState);
    const allowAdmin = (event: Event) => {
      if (!isAdmin) return false;
      // Skip component-level copy blockers while preserving the browser default.
      event.stopPropagation();
      return true;
    };

    const isAdminCopyTarget = (target: EventTarget | null) => {
      const element =
        target instanceof Element
          ? target
          : target instanceof Node
            ? target.parentElement
            : null;

      return Boolean(
        element?.closest('[data-admin-copy="true"], .admin-panel-shell')
      );
    };

    const handleCopy = (event: ClipboardEvent) => {
      if (allowAdmin(event)) return;
      if (isAdminCopyTarget(event.target)) {
        return;
      }
      event.preventDefault();
    };

    const handleCut = (event: ClipboardEvent) => {
      if (allowAdmin(event)) return;
      if (isAdminCopyTarget(event.target)) {
        return;
      }
      event.preventDefault();
    };

    const handleSelectStart = (event: Event) => {
      if (allowAdmin(event)) return;
      if (!isEditableTarget(event.target)) {
        event.preventDefault();
      }
    };

    const handleContextMenu = (event: MouseEvent) => {
      if (allowAdmin(event)) return;
      if (!isEditableTarget(event.target)) {
        event.preventDefault();
      }
    };

    const handleDragStart = (event: DragEvent) => {
      if (isAdmin) return;
      event.preventDefault();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isAdmin) return;
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
      window.removeEventListener('partson:adminStateChange', onAdminState);
      delete document.documentElement.dataset.adminCopy;
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
