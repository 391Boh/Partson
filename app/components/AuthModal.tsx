"use client";

import { useEffect, useRef, useState } from "react";
import AuthForm from "app/components/AuthForm";
import AccountInfo from "app/components/AccountInfo";

type AuthMode = "login" | "register" | "account";

interface AuthModalProps {
  isOpen: boolean;
  user: any | null;
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
