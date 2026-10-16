"use client";

import { useAvatarMotion } from "app/lib/use-avatar-motion";
import { usePanelTransition } from "app/lib/use-panel-transition";
import { useCustomerDialog } from "app/lib/use-customer-dialog";
import { fetchPartnerStatus, getPartnerStatusPreview } from "app/lib/partner-status-client";
import {
  ProfileAvatar,
  ProfileAvatarPicker,
  ProfileAvatarFramesPicker,
  canUseAvatarTier,
  findProfileAvatar,
} from "app/components/ProfileAvatar";
import { ProfileBackgroundPicker } from "app/components/ProfileBackgroundPicker";
import { writeCachedProfileBackground } from "app/components/WindowHubCover";
import { findAvatarFrame, findProfileBackground, PROFILE_BACKGROUNDS } from "app/lib/profile-appearance";
import React, { useEffect, useState, useRef } from "react";
import {
  signOut,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import { auth, db } from "../../firebase";
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  query,
  collection,
  where,
  getDocs,
} from "firebase/firestore";
import {
  AlertCircle,
  ArrowRight,
  CarFront,
  ImageIcon,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  EyeOff,
  LogOut,
  Key,
  Mail,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  X,
  Trash2,
  UserRound,
} from "lucide-react";

interface User {
  email: string | null;
  uid: string;
}

interface AccountInfoProps {
  user: User | null;
  onClose: () => void;
  initialTab?: "profile" | "vins" | "security" | null;
}

const avatarCacheKey = (uid: string) => `partson:avatar:${uid}`;

const readCachedAvatar = (uid: string | undefined) => {
  if (!uid || typeof window === "undefined") return null;
  try {
    return localStorage.getItem(avatarCacheKey(uid));
  } catch {
    return null;
  }
};

const writeCachedAvatar = (uid: string, id: string | null) => {
  try {
    if (id) localStorage.setItem(avatarCacheKey(uid), id);
    else localStorage.removeItem(avatarCacheKey(uid));
  } catch {
    // Only an instant-paint cache; Firestore holds the real value.
  }
};

const readRememberedAdmin = (uid: string | undefined) => {
  if (!uid || typeof window === "undefined") return false;
  try {
    return localStorage.getItem(`partson:isAdmin:${uid}`) === "1";
  } catch {
    return false;
  }
};

const AccountInfo: React.FC<AccountInfoProps> = ({
  user,
  onClose,
  initialTab = null,
}) => {
  const [phone, setPhone] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [profileEmail, setProfileEmail] = useState<string | null>(null);
  const [vins, setVins] = useState<string[]>([]);
  const [newVin, setNewVin] = useState<string>("");
  const [isVinFieldVisible, setIsVinFieldVisible] = useState(false);
  const [vinError, setVinError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [tempName, setTempName] = useState<string | null>(null);
  const [tempPhone, setTempPhone] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [successField, setSuccessField] = useState<"name" | "phone" | null>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "vins" | "security">(
    initialTab ?? "profile"
  );
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const coverMotionRef = useAvatarMotion(true);
  useCustomerDialog(modalRef, onClose);
  usePanelTransition(modalRef, activeTab, ".customer-profile-fields");
  const userId = user?.uid ?? null;
  const [avatarId, setAvatarId] = useState<string | null>(() => readCachedAvatar(user?.uid));
  const [initialPartnerStatus] = useState(() => user?.uid ? getPartnerStatusPreview(user.uid) : null);
  const [profileBackground, setProfileBackground] = useState<string | null>(null);
  const [avatarFrame, setAvatarFrame] = useState<string | null>(null);
  const [appearanceStatusError, setAppearanceStatusError] = useState(false);
  const [appearanceStatusRetry, setAppearanceStatusRetry] = useState(0);
  const [totalSpent, setTotalSpent] = useState<number | null>(() => initialPartnerStatus?.totalSpent ?? null);
  const [appearanceTab, setAppearanceTab] = useState<"avatar" | "frame" | "background">("avatar");
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [isPartner, setIsPartner] = useState<boolean | null>(() => initialPartnerStatus?.isPartner ?? null);
  const [isAdmin, setIsAdmin] = useState(() => readRememberedAdmin(user?.uid));
  const [profileIsAdmin, setProfileIsAdmin] = useState(false);
  const hasAdminAccess = isAdmin || profileIsAdmin;

  const normalizeVins = (raw: unknown): string[] => {
    if (!raw) return [];

    if (typeof raw === "string") {
      return raw
        .split(/[,;\n]/)
        .map((vin) => vin.trim())
        .filter(Boolean);
    }

    if (Array.isArray(raw)) {
      return raw
        .filter((vin): vin is string => typeof vin === "string")
        .map((vin) => vin.trim())
        .filter(Boolean);
    }

    if (typeof raw === "object") {
      return Object.values(raw as Record<string, unknown>)
        .map((vin) => {
          if (typeof vin === "string") return vin.trim();
          if (typeof vin === "number" && Number.isFinite(vin)) return String(vin);
          return "";
        })
        .filter(Boolean);
    }

    return [];
  };

  useEffect(() => {
    if (!userId) return;

    const fetchUserData = async () => {
      try {
        const docRef = doc(db, "users", userId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setPhone(data.phone || "Номер телефону не вказаний");
          setName(data.name || "Ім'я не вказане");
          setProfileEmail(
            typeof data.email === "string" && data.email.trim()
              ? data.email.trim()
              : user?.email || null
          );
          const userVins = normalizeVins(
            (data as Record<string, unknown>).vins ??
              (data as Record<string, unknown>).VIN ??
              (data as Record<string, unknown>).vin
          );
          setVins(
            userVins.filter((vin, index) => userVins.indexOf(vin) === index)
          );
        } else {
          setPhone("Номер телефону не знайдено");
          setName("Ім'я не знайдено");
          setProfileEmail(user?.email || null);
        }
      } catch (error) {
        console.error("Помилка отримання даних з Firestore:", error);
        setPhone("Помилка завантаження телефону");
        setName("Помилка завантаження імені");
        setProfileEmail(user?.email || null);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [userId, user?.email]);

  useEffect(() => {
    if (!userId) return;
    const docRef = doc(db, "users", userId);
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (!docSnap.exists()) {
          setVins([]);
          setProfileEmail(user?.email || null);
          return;
        }
        const data = docSnap.data();
        setPhone(data.phone || "Номер телефону не вказаний");
        setName(data.name || "Ім'я не вказане");
        setProfileEmail(
          typeof data.email === "string" && data.email.trim()
            ? data.email.trim()
            : user?.email || null
        );
        const storedAvatar =
          typeof data.avatar === "string" && findProfileAvatar(data.avatar)
            ? data.avatar
            : null;
        setAvatarId(storedAvatar);
        setAvatarFrame(findAvatarFrame(data.avatarFrame)?.id ?? null);
        setProfileBackground(findProfileBackground(data.profileBackground)?.id ?? null);
        setProfileIsAdmin(data.role === "admin");
        writeCachedAvatar(userId, storedAvatar);
        const cleanedVins = normalizeVins(
          (data as Record<string, unknown>).vins ??
            (data as Record<string, unknown>).VIN ??
            (data as Record<string, unknown>).vin
        );
        const uniqueVins = cleanedVins.filter(
          (vin, index) => cleanedVins.indexOf(vin) === index
        );
        setVins(uniqueVins);
      },
      (error) => {
        console.error("Помилка отримання VIN з Firestore:", error);
      }
    );

    return () => unsubscribe();
  }, [userId, user?.email]);

  // Partner avatars unlock with partner status, admin ones with the admin
  // role LayoutAccountRuntime already resolves and announces.
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!userId || !currentUser || currentUser.uid !== userId) return;
    let cancelled = false;
    setAppearanceStatusError(false);
    fetchPartnerStatus(currentUser)
      .then((status) => {
        if (!cancelled) { setIsPartner(status.isPartner); setTotalSpent(status.totalSpent); }
      })
      .catch(() => { if (!cancelled) setAppearanceStatusError(true); });
    return () => {
      cancelled = true;
    };
  }, [userId, appearanceStatusRetry]);

  useEffect(() => {
    setIsAdmin(readRememberedAdmin(userId ?? undefined));
    const onAdminState = (event: Event) => {
      setIsAdmin((event as CustomEvent<{ isAdmin?: boolean }>).detail?.isAdmin === true);
    };
    window.addEventListener("partson:adminStateChange", onAdminState);
    return () => window.removeEventListener("partson:adminStateChange", onAdminState);
  }, [userId]);

  useEffect(() => {
    if (loading) return;
    writeCachedProfileBackground(userId, profileBackground);
  }, [loading, userId, profileBackground]);

  const saveAppearance = async (patch: { avatar?: string | null; avatarFrame?: string | null; profileBackground?: string | null }) => {
    const currentUser = auth.currentUser;
    if (!userId || avatarSaving || currentUser?.uid !== userId) return;
    const previousAvatar = avatarId;
    const previousFrame = avatarFrame;
    const previousBackground = profileBackground;
    if ("avatar" in patch) setAvatarId(patch.avatar ?? null);
    if ("avatarFrame" in patch) setAvatarFrame(patch.avatarFrame ?? null);
    if ("profileBackground" in patch) setProfileBackground(patch.profileBackground ?? null);
    setAvatarSaving(true);
    try {
      const response = await fetch("/api/profile-appearance", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await currentUser.getIdToken()}` },
        body: JSON.stringify(patch),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Не вдалося зберегти стиль.");
      if ("avatar" in patch) writeCachedAvatar(userId, patch.avatar ?? null);
      showToast("success", "Стиль збережено");
    } catch (error) {
      setAvatarId(previousAvatar);
      setAvatarFrame(previousFrame);
      setProfileBackground(previousBackground);
      showToast("error", error instanceof Error ? error.message : "Не вдалося зберегти стиль. Спробуйте ще раз.");
    } finally {
      setAvatarSaving(false);
    }
  };
  const handleSelectAvatar = (id: string | null) => saveAppearance({ avatar: id });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-overlay-toggle]')) return;
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  useEffect(() => {
    if (!successField) return;
    const timer = setTimeout(() => setSuccessField(null), 1000);
    return () => clearTimeout(timer);
  }, [successField]);

  useEffect(() => {
    if (!initialTab) return;
    setActiveTab(initialTab);
  }, [initialTab]);


  const showToast = (type: "success" | "error", text: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ type, text });
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      onClose();
    } catch (error) {
      console.error("Помилка виходу:", error);
    }
  };

  const validatePassword = (password: string) => {
    if (password.length < 6) {
      setPasswordError("Пароль має містити щонайменше 6 символів.");
      return false;
    }
    setPasswordError(null);
    return true;
  };

  const validateVin = (vin: string) => {
    if (vin.length !== 17 || !/^[A-Za-z0-9]+$/.test(vin)) {
      setVinError("VIN має містити рівно 17 символів (латинські літери та цифри).");
      return false;
    }
    setVinError(null);
    return true;
  };

  const formatPhoneNumber = (phone: string) => {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.startsWith("380")) {
      return `+${cleaned}`;
    }
    return `+380${cleaned.slice(-9)}`;
  };

  const handleChangePassword = async () => {
    if (!validatePassword(newPassword)) return;
    if (!currentPassword.trim()) {
      setPasswordError("Введіть поточний пароль для підтвердження.");
      return;
    }

    try {
      if (auth.currentUser) {
        const email = auth.currentUser.email;
        if (!email) { showToast("error", "Користувач не авторизований."); return; }

        const credential = EmailAuthProvider.credential(email, currentPassword);
        await reauthenticateWithCredential(auth.currentUser, credential);
        await updatePassword(auth.currentUser, newPassword);
        showToast("success", "Пароль успішно змінено");
        setShowPasswordField(false);
        setNewPassword("");
        setCurrentPassword("");
        setPasswordError(null);
      } else {
        showToast("error", "Користувач не авторизований.");
      }
    } catch (error) {
      console.error("Помилка зміни паролю:", error);
      const code = (error as { code?: string }).code ?? "";
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setPasswordError("Неправильний поточний пароль.");
      } else {
        showToast("error", "Не вдалося змінити пароль. Спробуйте ще раз.");
      }
    }
  };

  const handleAddVin = async () => {
    if (!validateVin(newVin)) return;
    if (vins.includes(newVin)) {
      setVinError("Цей VIN уже збережено.");
      return;
    }

    try {
      const updatedVins = [...vins, newVin];
      const docRef = doc(db, "users", user?.uid || "");
      await setDoc(docRef, { vins: updatedVins }, { merge: true });
      setVins(updatedVins);
      setNewVin("");
      setIsVinFieldVisible(false);
      showToast("success", "VIN успішно додано");
    } catch (error) {
      console.error("Помилка збереження VIN:", error);
      showToast("error", "Не вдалося додати VIN.");
    }
  };

  const handleDeleteVin = async (index: number) => {
    try {
      const updatedVins = vins.filter((_, i) => i !== index);
      const docRef = doc(db, "users", user?.uid || "");
      await setDoc(docRef, { vins: updatedVins }, { merge: true });
      setVins(updatedVins);
      showToast("success", "VIN видалено");
    } catch (error) {
      console.error("Помилка видалення VIN:", error);
      showToast("error", "Не вдалося видалити VIN.");
    }
  };

  const [pendingVinDelete, setPendingVinDelete] = useState<number | null>(null);
  const [copiedVin, setCopiedVin] = useState<string | null>(null);
  const copyVin = async (vin: string) => {
    try {
      await navigator.clipboard.writeText(vin);
      setCopiedVin(vin);
      setTimeout(() => setCopiedVin((current) => (current === vin ? null : current)), 1600);
    } catch {
      showToast("error", "Не вдалося скопіювати VIN.");
    }
  };
  const closePasswordForm = () => {
    setShowPasswordField(false);
    setNewPassword("");
    setCurrentPassword("");
    setPasswordError(null);
  };
  const authUser = auth.currentUser;
  const providerIds = authUser?.providerData?.map((entry) => entry.providerId) ?? [];
  const signInMethods = providerIds
    .map((id) => (id === "google.com" ? "Google" : id === "password" ? "Email і пароль" : id === "apple.com" ? "Apple" : null))
    .filter((label) => label !== null);
  // Unknown providers (e.g. a token-only session) keep the password form available.
  const canChangePassword = providerIds.length === 0 || providerIds.includes("password");
  const emailVerified = authUser && "emailVerified" in authUser ? authUser.emailVerified : null;
  const lastSignInTime = authUser?.metadata?.lastSignInTime;
  const lastSignInLabel = lastSignInTime
    ? new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(lastSignInTime))
    : null;
  const passwordStrength = (() => {
    const value = newPassword;
    const score = (value.length >= 6 ? 1 : 0) + (value.length >= 10 ? 1 : 0)
      + (/\d/.test(value) && /[a-zа-яіїєґ]/i.test(value) ? 1 : 0) + (/[A-ZА-ЯІЇЄҐ]/.test(value) && /[a-zа-яіїєґ]/.test(value) ? 1 : 0);
    if (!value) return { level: "none", label: "" };
    if (value.length < 6) return { level: "weak", label: `Ще ${6 - value.length} симв. до мінімуму` };
    if (score >= 4) return { level: "strong", label: "Надійний пароль" };
    if (score >= 2) return { level: "medium", label: "Непоганий пароль — додайте довжину або великі літери" };
    return { level: "weak", label: "Слабкий пароль — додайте цифри й довжину" };
  })();

  const hasNameValue = Boolean(name && !/не вказ|не знайден|помилка/i.test(name));
  const startEditingName = () => {
    setActiveTab("profile");
    setTempName(hasNameValue ? name : "");
    setIsEditingName(true);
  };
  const startEditingPhone = () => {
    setActiveTab("profile");
    setTempPhone(phone);
    setPhoneError(null);
    setIsEditingPhone(true);
  };

  const handleSaveName = async () => {
    if (!tempName || tempName.trim() === "") {
      showToast("error", "Ім’я не може бути порожнім.");
      return;
    }

    if (!/^[A-Za-zА-Яа-яЁёІіЇїЄєҐґ’’\-\s]+$/.test(tempName.trim())) {
      showToast("error", "Ім’я може містити лише літери, пробіли та дефіси.");
      return;
    }

    try {
      const docRef = doc(db, "users", user?.uid || "");
      await setDoc(docRef, { name: tempName }, { merge: true });
      setName(tempName);
      setIsEditingName(false);
      setSuccessField("name");
      showToast("success", "Ім’я збережено");
    } catch (error) {
      console.error("Помилка збереження імені:", error);
      showToast("error", "Не вдалося зберегти ім’я.");
    }
  };

  const handleSavePhone = async () => {
    if (!tempPhone || tempPhone.trim() === "") {
      showToast("error", "Номер телефону не може бути порожнім.");
      return;
    }

    if (!/^\+380\d{9}$/.test(tempPhone.trim())) {
      setPhoneError("Формат: +380XXXXXXXXX");
      return;
    }

    const formattedPhone = formatPhoneNumber(tempPhone);

    try {
      const phoneQuery = query(collection(db, "users"), where("phone", "==", formattedPhone));
      const phoneSnapshot = await getDocs(phoneQuery);

      const phoneIsUsedByAnotherUser = phoneSnapshot.docs.some(
        (snapshot) => snapshot.id !== user?.uid
      );

      if (phoneIsUsedByAnotherUser) {
        setPhoneError("Цей номер вже використовується.");
        return;
      }

      const docRef = doc(db, "users", user?.uid || "");
      await setDoc(docRef, { phone: formattedPhone }, { merge: true });
      setPhone(formattedPhone);
      setIsEditingPhone(false);
      setPhoneError(null);
      setSuccessField("phone");
      showToast("success", "Телефон збережено");
    } catch (error) {
      console.error("Помилка збереження телефону:", error);
      showToast("error", "Не вдалося зберегти телефон.");
    }
  };

  const emailValue = profileEmail || user?.email || "Не вказано";
  const hasEmailValue = emailValue !== "Не вказано";
  const displayName =
    !name || /не вказ|не знайден|помилка/i.test(name)
      ? (hasEmailValue ? emailValue.split("@")[0] : "Гість")
      : name;
  const hasPhoneValue = Boolean(phone && !/не вказ|не знайден|помилка/i.test(phone));
  const profileInitial = (displayName || "Г").trim().charAt(0).toUpperCase();
  const chosenAvatar = findProfileAvatar(avatarId);
  // A partner avatar stays on show while the status check is in flight; it
  // falls back to the letter only for an account that has lost the status.
  const shownAvatarId =
    chosenAvatar &&
    canUseAvatarTier(chosenAvatar.tier, { isPartner: isPartner !== false, isAdmin: hasAdminAccess })
      ? avatarId
      : null;
  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label="Профіль клієнта"
      data-appearance-open={isAvatarPickerOpen}
      className="customer-window customer-overlay-panel customer-overlay-panel--profile soft-modal-shell soft-panel-glow app-overlay-panel app-overlay-panel--wide app-panel-enter flex min-h-0 flex-col overflow-y-auto overflow-x-hidden select-none"
    >
      <div className="soft-panel-content flex min-h-0 flex-1 flex-col gap-2 p-2 sm:gap-2.5 sm:p-4">
        <div className="soft-panel-accent h-1 rounded-full" />

        {toast && (
          <div
            className={`flex items-center gap-2 rounded-[14px] px-3 py-2.5 text-[13px] font-semibold ${
              toast.type === "success"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border border-rose-200 bg-rose-50 text-rose-600"
            }`}
            style={{ animation: "adminEditFadeIn 0.2s ease-out" }}
          >
            {toast.type === "success" ? <CheckCircle2 size={15} className="shrink-0" /> : <AlertCircle size={15} className="shrink-0" />}
            {toast.text}
          </div>
        )}

        <div className="soft-panel-header profile-cover-header profile-hub" data-profile-background={profileBackground ?? "default"}>
          <span ref={coverMotionRef} className="profile-cover-background" aria-hidden="true"
            style={{ backgroundImage: `url("${(findProfileBackground(profileBackground) ?? PROFILE_BACKGROUNDS[0]).image}")` }} />
          <div className="customer-profile-identity profile-cover-identity">
            <button type="button" className="profile-avatar-trigger relative shrink-0"
              aria-expanded={isAvatarPickerOpen && appearanceTab === "avatar"} aria-controls="profile-avatar-picker"
              aria-label="Змінити аватар" title="Змінити аватар"
              onClick={() => { setAppearanceTab("avatar"); setIsAvatarPickerOpen(open => appearanceTab !== "avatar" || !open); }}>
              <ProfileAvatar avatarId={shownAvatarId} frameId={avatarFrame}
                motionTier={hasAdminAccess ? "admin" : isPartner ? "partner" : "basic"}
                initial={profileInitial} className="profile-cover-avatar" />
              <span className="profile-avatar-trigger-edit" aria-hidden="true"><Pencil size={9} strokeWidth={2.6} /></span>
            </button>
            <div className="profile-cover-details">
              <h2 className="profile-cover-name" title={displayName}>{displayName}</h2>
              <p className="profile-cover-email" title={emailValue}>{emailValue}</p>
              <span className="profile-cover-role"><ShieldCheck size={11} />{hasAdminAccess ? "Адміністратор" : isPartner ? "Партнер" : "Клієнт PartsON"}</span>
            </div>
            <div className="profile-cover-actions">
              <button type="button" className="profile-cover-edit" aria-label="Змінити фон профілю" title="Змінити фон профілю"
                aria-expanded={isAvatarPickerOpen && appearanceTab === "background"} aria-controls="profile-avatar-picker"
                onClick={() => { setAppearanceTab("background"); setIsAvatarPickerOpen(true); }}>
                <ImageIcon size={16} /><span>Фон</span>
              </button>
              <button type="button" className="profile-cover-edit profile-cover-logout" onClick={handleSignOut}
                aria-label="Вийти з акаунту" title="Вийти з акаунту">
                <LogOut size={16} /><span>Вийти</span>
              </button>
              <button type="button" onClick={onClose} className="app-panel-close-button h-9 w-9 shrink-0 sm:h-10 sm:w-10"
                aria-label="Закрити" title="Закрити"><X size={20} strokeWidth={2.3} /></button>
            </div>
          </div>
          {!isAvatarPickerOpen && <div className="profile-hub-dock">
            {!loading && (() => {
              const isNameFilled = hasNameValue;
              const items = [
                { label: "Телефон", done: hasPhoneValue, open: startEditingPhone },
                { label: "Email", done: hasEmailValue, open: () => setActiveTab("profile") },
                { label: "Ім'я", done: isNameFilled, open: startEditingName },
                { label: "VIN", done: vins.length > 0, open: () => setActiveTab("vins") },
              ];
              const pct = Math.round(
                (items.filter((item) => item.done).length / items.length) * 100
              );
              const missing = items.filter((item) => !item.done);
              return (
                <div className="profile-hub-progress" data-level={pct >= 75 ? "high" : pct >= 50 ? "mid" : "low"}>
                  <span className="profile-hub-progress-label">Заповнено <strong>{pct}%</strong></span>
                  <span className="profile-hub-progress-track" role="progressbar" aria-label="Заповненість профілю"
                    aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <span style={{ width: `${pct}%` }} />
                  </span>
                  {missing.length > 0 ? (
                    <span className="profile-hub-missing">
                      {missing.map((item) => (
                        <button key={item.label} type="button" onClick={item.open}
                          aria-label={`Додати: ${item.label}`}>
                          <Plus size={10} strokeWidth={2.6} />
                          {item.label}
                        </button>
                      ))}
                    </span>
                  ) : (
                    <span className="profile-hub-complete"><Check size={11} strokeWidth={2.6} />Усе заповнено</span>
                  )}
                </div>
              );
            })()}
            <div className="soft-panel-tabs profile-hub-tabs grid grid-cols-3">
              <button
                aria-pressed={activeTab === "profile"}
                onClick={() => setActiveTab("profile")}
                className={`min-w-0 flex flex-1 items-center justify-center gap-1.5 rounded-[14px] px-2 py-2 text-[12px] font-semibold leading-tight transition sm:rounded-[16px] sm:px-3 sm:py-2.5 sm:text-sm ${
                  activeTab === "profile"
                    ? "soft-segment soft-segment--active"
                    : "soft-segment"
                }`}
              >
                <UserRound size={13} strokeWidth={2} />
                Профіль
              </button>
              <button
                aria-pressed={activeTab === "vins"}
                onClick={() => setActiveTab("vins")}
                className={`min-w-0 flex flex-1 items-center justify-center gap-1.5 rounded-[14px] px-2 py-2 text-[12px] font-semibold leading-tight transition sm:rounded-[16px] sm:px-3 sm:py-2.5 sm:text-sm ${
                  activeTab === "vins"
                    ? "soft-segment soft-segment--active"
                    : "soft-segment"
                }`}
              >
                <CarFront size={13} strokeWidth={2} />
                VIN
              </button>
              <button
                aria-pressed={activeTab === "security"}
                onClick={() => setActiveTab("security")}
                className={`min-w-0 flex flex-1 items-center justify-center gap-1.5 rounded-[14px] px-2 py-2 text-[12px] font-semibold leading-tight transition sm:rounded-[16px] sm:px-3 sm:py-2.5 sm:text-sm ${
                  activeTab === "security"
                    ? "soft-segment soft-segment--active"
                    : "soft-segment"
                }`}
              >
                <ShieldCheck size={13} strokeWidth={2} />
                Безпека
              </button>
            </div>
          </div>}
        </div>

        {isAvatarPickerOpen && (
          <div id="profile-avatar-picker" className="profile-avatar-panel">
            <div className="profile-avatar-panel-head">
              <span>Ваш стиль</span>
              <button
                type="button"
                className="profile-avatar-panel-close"
                onClick={() => setIsAvatarPickerOpen(false)}
                aria-label="Закрити вибір аватара"
              >
                <X size={16} strokeWidth={2.4} />
              </button>
            </div>
            <div className="profile-appearance-tabs" role="group" aria-label="Налаштування аватара">
              <button type="button" aria-pressed={appearanceTab === "avatar"} onClick={() => setAppearanceTab("avatar")}>Аватар</button>
              <button type="button" aria-pressed={appearanceTab === "frame"} onClick={() => setAppearanceTab("frame")}>Рамки</button>
              <button type="button" aria-pressed={appearanceTab === "background"} onClick={() => setAppearanceTab("background")}>Фони</button>
            </div>
            <div className="profile-appearance-options">
              {appearanceTab === "avatar" ? <ProfileAvatarPicker
                selectedId={avatarId} initial={profileInitial} isPartner={isPartner === true}
                isAdmin={hasAdminAccess} saving={avatarSaving} onSelect={handleSelectAvatar}
              /> : appearanceTab === "background" ? <ProfileBackgroundPicker selectedId={profileBackground}
                totalSpent={totalSpent} saving={avatarSaving} onSelect={id => saveAppearance({ profileBackground: id })} /> : <ProfileAvatarFramesPicker selectedId={avatarFrame} avatarId={shownAvatarId}
                initial={profileInitial} totalSpent={totalSpent} saving={avatarSaving} statusError={appearanceStatusError}
                motionTier={hasAdminAccess ? "admin" : isPartner ? "partner" : "basic"}
                onSelect={id => saveAppearance({ avatarFrame: id })} />}
              {appearanceStatusError && <p className="profile-frame-hint" role="alert">Не вдалося перевірити досягнення. <button type="button" className="underline" onClick={() => setAppearanceStatusRetry(value => value + 1)}>Спробувати ще раз</button></p>}
            </div>
            <div className="profile-appearance-footer">
              <span role="status">{avatarSaving ? "Зберігаємо…" : "Зміни зберігаються автоматично"}</span>
              <button type="button" onClick={() => setIsAvatarPickerOpen(false)}>Готово</button>
            </div>
          </div>
        )}

        {!isAvatarPickerOpen && <>
        <div className="app-panel-scroll min-h-0 flex-1 overflow-y-auto pr-0 sm:pr-1">

          <div className="customer-profile-fields grid grid-cols-1 gap-2 pb-1 md:col-span-full md:grid-cols-2 md:gap-2.5">
        {activeTab === "profile" && <section
          className="soft-surface-card profile-details md:col-span-2"
          aria-labelledby="profile-details-title"
        >
          <h3 id="profile-details-title" className="profile-details-title">Дані профілю</h3>
          <ul className="profile-details-list">
            <li className="profile-detail" data-editing={isEditingName || undefined} data-saved={successField === "name" || undefined}>
              <span className="profile-detail-icon" aria-hidden="true"><UserRound size={16} /></span>
              <div className="profile-detail-body">
                <span className="profile-detail-label" id="profile-name-label">
                  {"Ім'я"}
                  {successField === "name" && <span className="profile-detail-saved"><Check size={11} strokeWidth={2.6} />Збережено</span>}
                </span>
                {loading ? (
                  <span className="profile-detail-value is-empty">Завантаження…</span>
                ) : isEditingName ? (
                  <form className="profile-detail-form" onSubmit={(e) => { e.preventDefault(); void handleSaveName(); }}>
                    <input
                      type="text"
                      value={tempName || ""}
                      onChange={(e) => setTempName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Escape") return;
                        e.stopPropagation();
                        setIsEditingName(false);
                      }}
                      className="profile-detail-input"
                      aria-labelledby="profile-name-label"
                      aria-invalid={tempName?.trim() === ""}
                      autoComplete="name"
                      placeholder="Введіть ім'я"
                      autoFocus
                    />
                    <p className="profile-detail-hint">Як до вас звертатися в замовленнях і чаті.</p>
                    <div className="profile-detail-form-actions">
                      <button type="button" className="profile-detail-cancel" onClick={() => setIsEditingName(false)}>Скасувати</button>
                      <button type="submit" className="profile-detail-save" aria-label="Зберегти ім'я"><Check size={14} strokeWidth={2.5} />Зберегти</button>
                    </div>
                  </form>
                ) : (
                  <span className={`profile-detail-value ${hasNameValue ? "" : "is-empty"}`}>{hasNameValue ? name : "Не вказано"}</span>
                )}
              </div>
              {!loading && !isEditingName && (
                <button type="button" className="profile-detail-edit" aria-label="Редагувати ім'я" title="Редагувати ім'я" onClick={startEditingName}>
                  <Pencil size={14} strokeWidth={2.2} /><span>Змінити</span>
                </button>
              )}
            </li>

            <li className="profile-detail" data-editing={isEditingPhone || undefined} data-saved={successField === "phone" || undefined}>
              <span className="profile-detail-icon" aria-hidden="true"><Phone size={16} /></span>
              <div className="profile-detail-body">
                <span className="profile-detail-label" id="profile-phone-label">
                  Телефон
                  {successField === "phone" && <span className="profile-detail-saved"><Check size={11} strokeWidth={2.6} />Збережено</span>}
                </span>
                {loading ? (
                  <span className="profile-detail-value is-empty">Завантаження…</span>
                ) : isEditingPhone ? (
                  <form className="profile-detail-form" onSubmit={(e) => { e.preventDefault(); void handleSavePhone(); }}>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={tempPhone || ""}
                      onChange={(e) => setTempPhone(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Escape") return;
                        e.stopPropagation();
                        setIsEditingPhone(false);
                        setPhoneError(null);
                      }}
                      className="profile-detail-input"
                      aria-labelledby="profile-phone-label"
                      aria-invalid={Boolean(phoneError)}
                      aria-describedby="profile-phone-hint"
                      autoComplete="tel"
                      placeholder="+380 ХХХ ХХХ ХХ ХХ"
                      autoFocus
                    />
                    <p id="profile-phone-hint" className={`profile-detail-hint ${phoneError ? "is-error" : ""}`} role={phoneError ? "alert" : undefined}>
                      {phoneError || "Формат +380XXXXXXXXX — для звʼязку з менеджером."}
                    </p>
                    <div className="profile-detail-form-actions">
                      <button type="button" className="profile-detail-cancel" onClick={() => { setIsEditingPhone(false); setPhoneError(null); }}>Скасувати</button>
                      <button type="submit" className="profile-detail-save" aria-label="Зберегти телефон"><Check size={14} strokeWidth={2.5} />Зберегти</button>
                    </div>
                  </form>
                ) : (
                  <span className={`profile-detail-value tabular-nums ${phone ? "" : "is-empty"}`}>{phone || "Не вказано"}</span>
                )}
              </div>
              {!loading && !isEditingPhone && (
                <button type="button" className="profile-detail-edit" aria-label="Редагувати телефон" title="Редагувати телефон" onClick={startEditingPhone}>
                  <Pencil size={14} strokeWidth={2.2} /><span>Змінити</span>
                </button>
              )}
            </li>

            <li className="profile-detail">
              <span className="profile-detail-icon" aria-hidden="true"><Mail size={16} /></span>
              <div className="profile-detail-body">
                <span className="profile-detail-label">Email<span className="profile-detail-note">для входу</span></span>
                <span className="profile-detail-value profile-detail-value--truncate" title={emailValue}>{emailValue}</span>
              </div>
            </li>

            <li className="profile-detail">
              <span className="profile-detail-icon" aria-hidden="true"><CarFront size={16} /></span>
              <div className="profile-detail-body">
                <span className="profile-detail-label">VIN-коди{vins.length > 0 && <span className="profile-detail-note">{vins.length}</span>}</span>
                {loading ? (
                  <span className="profile-detail-value is-empty">Завантаження…</span>
                ) : vins.length === 0 ? (
                  <span className="profile-detail-value is-empty">Ще не додано</span>
                ) : (
                  <span className="profile-detail-vins">
                    {vins.map((vin, idx) => <span key={vin + idx}>{vin}</span>)}
                  </span>
                )}
              </div>
              <button type="button" className="profile-detail-edit" aria-label="Керувати VIN-кодами" title="Керувати VIN-кодами" onClick={() => setActiveTab("vins")}>
                {vins.length === 0 ? <Plus size={14} strokeWidth={2.4} /> : <ArrowRight size={14} strokeWidth={2.2} />}
                <span>{vins.length === 0 ? "Додати" : "Керувати"}</span>
              </button>
            </li>
          </ul>
        </section>}

        {activeTab === "vins" && <section className="soft-surface-card profile-details md:col-span-2" aria-labelledby="profile-vins-title">
          <div className="profile-details-head">
            <h3 id="profile-vins-title" className="profile-details-title">Мої VIN-коди{vins.length > 0 && <span className="profile-detail-note">{vins.length}</span>}</h3>
            {!isVinFieldVisible && vins.length > 0 && (
              <button type="button" className="profile-details-head-action" onClick={() => setIsVinFieldVisible(true)} aria-label="Додати VIN">
                <Plus size={14} strokeWidth={2.4} />Додати
              </button>
            )}
          </div>
          {loading ? (
            <p className="profile-details-empty">Завантаження…</p>
          ) : vins.length === 0 && !isVinFieldVisible ? (
            <div className="profile-details-empty">
              <span className="profile-detail-icon" aria-hidden="true"><CarFront size={16} /></span>
              <div>
                <p className="profile-details-empty-title">Збережіть VIN свого авто</p>
                <p>Менеджер підбере сумісні деталі без уточнень, а код буде під рукою в наступних замовленнях.</p>
              </div>
              <button type="button" className="profile-detail-primary" onClick={() => setIsVinFieldVisible(true)} aria-label="Додати VIN">
                <Plus size={14} strokeWidth={2.4} />Додати VIN
              </button>
            </div>
          ) : (
            <ul className="profile-details-list">
              {vins.map((vin, idx) => (
                <li key={vin + idx} className="profile-detail" data-confirming={pendingVinDelete === idx || undefined}>
                  <span className="profile-detail-icon profile-detail-index" aria-hidden="true">{idx + 1}</span>
                  <div className="profile-detail-body">
                    <span className="profile-detail-label">{pendingVinDelete === idx ? "Видалити цей VIN?" : `Авто ${idx + 1}`}</span>
                    <span className="profile-detail-value profile-detail-mono">{vin}</span>
                  </div>
                  {pendingVinDelete === idx ? (
                    <span className="profile-detail-row-actions">
                      <button type="button" className="profile-detail-ghost" onClick={() => setPendingVinDelete(null)}>Ні</button>
                      <button type="button" className="profile-detail-danger" onClick={() => { setPendingVinDelete(null); void handleDeleteVin(idx); }}
                        aria-label={`Підтвердити видалення VIN ${vin}`}>Видалити</button>
                    </span>
                  ) : (
                    <span className="profile-detail-row-actions">
                      <button type="button" className="profile-detail-icon-button" onClick={() => void copyVin(vin)}
                        aria-label={`Скопіювати VIN ${vin}`} title="Скопіювати">
                        {copiedVin === vin ? <Check size={15} strokeWidth={2.5} /> : <Copy size={15} />}
                      </button>
                      <button type="button" className="profile-detail-icon-button is-danger" onClick={() => setPendingVinDelete(idx)}
                        aria-label={`Видалити VIN ${vin}`} title="Видалити">
                        <Trash2 size={15} />
                      </button>
                    </span>
                  )}
                </li>
              ))}
              {isVinFieldVisible && (
                <li className="profile-detail" data-editing>
                  <span className="profile-detail-icon" aria-hidden="true"><Plus size={16} /></span>
                  <div className="profile-detail-body">
                    <span className="profile-detail-label" id="profile-new-vin-label">
                      Новий VIN<span className="profile-detail-note tabular-nums">{newVin.length}/17</span>
                    </span>
                    <form className="profile-detail-form" onSubmit={(e) => { e.preventDefault(); void handleAddVin(); }}>
                      <input
                        type="text"
                        value={newVin}
                        onChange={(e) => { setNewVin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); setVinError(null); }}
                        onKeyDown={(e) => {
                          if (e.key !== "Escape") return;
                          e.stopPropagation();
                          setIsVinFieldVisible(false);
                          setNewVin("");
                          setVinError(null);
                        }}
                        maxLength={17}
                        className="profile-detail-input profile-detail-mono"
                        aria-labelledby="profile-new-vin-label"
                        aria-describedby="profile-new-vin-hint"
                        aria-invalid={Boolean(vinError)}
                        autoCapitalize="characters"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="Наприклад, WVWZZZ1JZXW000001"
                        autoFocus
                      />
                      <p id="profile-new-vin-hint" className={`profile-detail-hint ${vinError ? "is-error" : ""}`} role={vinError ? "alert" : undefined}>
                        {vinError || "17 символів, латиниця й цифри. Шукайте у техпаспорті або під лобовим склом."}
                      </p>
                      <div className="profile-detail-form-actions">
                        <button type="button" className="profile-detail-cancel" onClick={() => { setIsVinFieldVisible(false); setNewVin(""); setVinError(null); }} aria-label="Скасувати">Скасувати</button>
                        <button type="submit" className="profile-detail-save" aria-label="Зберегти VIN" disabled={newVin.length !== 17}>
                          <Check size={14} strokeWidth={2.5} />Зберегти
                        </button>
                      </div>
                    </form>
                  </div>
                </li>
              )}
            </ul>
          )}
        </section>}

        {activeTab === "security" && <section className="soft-surface-card profile-details md:col-span-2" aria-labelledby="profile-security-title">
          <h3 id="profile-security-title" className="profile-details-title">Безпека входу</h3>
          <ul className="profile-details-list">
            <li className="profile-detail">
              <span className="profile-detail-icon" aria-hidden="true"><ShieldCheck size={16} /></span>
              <div className="profile-detail-body">
                <span className="profile-detail-label">Спосіб входу</span>
                <span className="profile-detail-value">{signInMethods.length ? signInMethods.join(" · ") : "Email і пароль"}</span>
              </div>
            </li>
            <li className="profile-detail">
              <span className="profile-detail-icon" aria-hidden="true"><Mail size={16} /></span>
              <div className="profile-detail-body">
                <span className="profile-detail-label">
                  Email
                  {emailVerified !== null && (
                    <span className={`profile-detail-status ${emailVerified ? "is-ok" : "is-warn"}`}>
                      {emailVerified ? <><Check size={11} strokeWidth={2.6} />Підтверджено</> : "Не підтверджено"}
                    </span>
                  )}
                </span>
                <span className="profile-detail-value profile-detail-value--truncate" title={emailValue}>{emailValue}</span>
              </div>
            </li>
            {canChangePassword ? (
              <li className="profile-detail" data-editing={showPasswordField || undefined}>
                <span className="profile-detail-icon" aria-hidden="true"><Key size={16} /></span>
                <div className="profile-detail-body">
                  <span className="profile-detail-label" id="profile-password-label">Пароль</span>
                  {showPasswordField ? (
                    <form className="profile-detail-form" onSubmit={(e) => { e.preventDefault(); void handleChangePassword(); }}
                      onKeyDown={(e) => {
                        if (e.key !== "Escape") return;
                        if (!(e.target instanceof HTMLInputElement)) return;
                        e.stopPropagation();
                        closePasswordForm();
                      }}>
                      <div className="profile-detail-password">
                        <input
                          type={showCurrentPassword ? "text" : "password"}
                          value={currentPassword}
                          onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(null); }}
                          className="profile-detail-input"
                          aria-label="Поточний пароль"
                          aria-invalid={passwordError === "Неправильний поточний пароль." || passwordError === "Введіть поточний пароль для підтвердження."}
                          autoComplete="current-password"
                          placeholder="Поточний пароль"
                          autoFocus
                        />
                        <button type="button" className="customer-password-toggle" onClick={() => setShowCurrentPassword((p) => !p)}
                          aria-label={showCurrentPassword ? "Приховати поточний пароль" : "Показати поточний пароль"}>
                          {showCurrentPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                      <div className="profile-detail-password">
                        <input
                          type={showNewPassword ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => { setNewPassword(e.target.value); setPasswordError(null); }}
                          className="profile-detail-input"
                          aria-label="Новий пароль"
                          aria-describedby="profile-password-hint"
                          autoComplete="new-password"
                          placeholder="Новий пароль"
                        />
                        <button type="button" className="customer-password-toggle" onClick={() => setShowNewPassword((p) => !p)}
                          aria-label={showNewPassword ? "Приховати новий пароль" : "Показати новий пароль"}>
                          {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                      <span className="profile-password-meter" data-strength={passwordStrength.level} aria-hidden="true"><span /><span /><span /></span>
                      <p id="profile-password-hint" className={`profile-detail-hint ${passwordError ? "is-error" : ""}`} role={passwordError ? "alert" : undefined}>
                        {passwordError || (newPassword ? passwordStrength.label : "Щонайменше 6 символів. Надійніше — 10+ з цифрами й літерами різного регістру.")}
                      </p>
                      <div className="profile-detail-form-actions">
                        <button type="button" className="profile-detail-cancel" onClick={closePasswordForm}>Скасувати</button>
                        <button type="submit" className="profile-detail-save" aria-label="Зберегти пароль"><Check size={14} strokeWidth={2.5} />Зберегти</button>
                      </div>
                    </form>
                  ) : (
                    <span className="profile-detail-value profile-detail-dots" aria-label="Пароль встановлено">••••••••</span>
                  )}
                </div>
                {!showPasswordField && (
                  <button type="button" className="profile-detail-edit" onClick={() => setShowPasswordField(true)} aria-label="Змінити пароль" title="Змінити пароль">
                    <Pencil size={14} strokeWidth={2.2} /><span>Змінити</span>
                  </button>
                )}
              </li>
            ) : (
              <li className="profile-detail">
                <span className="profile-detail-icon" aria-hidden="true"><Key size={16} /></span>
                <div className="profile-detail-body">
                  <span className="profile-detail-label">Пароль</span>
                  <span className="profile-detail-value is-muted">Не потрібен — вхід через {signInMethods.join(" і ")}</span>
                </div>
              </li>
            )}
            {lastSignInLabel && (
              <li className="profile-detail">
                <span className="profile-detail-icon" aria-hidden="true"><Clock size={16} /></span>
                <div className="profile-detail-body">
                  <span className="profile-detail-label">Останній вхід</span>
                  <span className="profile-detail-value">{lastSignInLabel}</span>
                </div>
              </li>
            )}
          </ul>
        </section>}
          </div>
        </div>
        </>}
      </div>
    </div>
  );
};

export default AccountInfo;
