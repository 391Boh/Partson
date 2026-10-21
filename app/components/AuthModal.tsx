"use client";

import { useEffect, useRef, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import AuthForm from "app/components/AuthForm";
import dynamic from "next/dynamic";
import { loadAccountInfoModule } from "app/lib/auth-modal-loader";

// Guests only need AuthForm. The profile editor, avatars and account data
// must not be parsed/evaluated on their first login interaction.
const AccountInfo = dynamic(loadAccountInfoModule, { ssr: false });

type AuthMode = "login" | "register" | "account";

interface AuthModalProps {
  isOpen: boolean;
  user: FirebaseUser | null;
  onClose: () => void;
  initialMode?: "login" | "register";
  initialAccountTab?: "profile" | "vins" | "security" | null;
}

const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  user,
  onClose,
  initialMode,
  initialAccountTab = null,
}) => {
  const [mode, setMode] = useState<AuthMode>(
    user ? "account" : initialMode ?? "login"
  );
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }

    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      if (user) {
        setMode("account");
        return;
      }
      setMode(initialMode ?? "login");
      return;
    }

    if (user && mode !== "account") {
      setMode("account");
    }
  }, [isOpen, user, initialMode, mode]);

  if (!isOpen) return null;

  if (user && mode === "account") {
    return (
      <AccountInfo
        user={user}
        onClose={onClose}
        initialTab={initialAccountTab}
      />
    );
  }

  return (
    <AuthForm
      mode={mode === "account" ? "login" : mode}
      onModeChange={(nextMode) => setMode(nextMode)}
      onClose={onClose}
      onRegisterSuccess={() => setMode("account")}
    />
  );
};

export default AuthModal;
