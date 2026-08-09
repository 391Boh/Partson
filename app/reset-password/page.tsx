import { Suspense } from "react";

import { buildPageMetadata } from "app/lib/seo-metadata";
import ResetPasswordClient from "./ResetPasswordClient";

export const metadata = buildPageMetadata({
  title: "Відновлення пароля",
  description: "Встановіть новий пароль до вашого акаунта PartsON.",
  canonicalPath: "/reset-password",
  index: false,
});

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-[70svh] w-full max-w-md items-center px-4 py-12 sm:px-6">
      <Suspense fallback={null}>
        <ResetPasswordClient />
      </Suspense>
    </main>
  );
}
