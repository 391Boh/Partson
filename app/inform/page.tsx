import { redirect } from "next/navigation";

import {
  DEFAULT_INFORMATION_SECTION,
  getInformationPath,
  getInformationSection,
} from "./section-config";

interface InformationRedirectPageProps {
  searchParams?: Promise<{
    tab?: string | string[];
  }>;
}

const normalizeTabValue = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return (value[0] || "").trim().toLowerCase();
  return (value || "").trim().toLowerCase();
};

export default async function InformationRedirectPage({
  searchParams,
}: InformationRedirectPageProps) {
  const resolvedSearchParams = await (
    searchParams ??
    Promise.resolve({
      tab: undefined,
    })
  );

  const tab = normalizeTabValue(resolvedSearchParams.tab);
  const resolvedSection =
    getInformationSection(tab) ?? getInformationSection(DEFAULT_INFORMATION_SECTION);

  redirect(getInformationPath(resolvedSection?.key || DEFAULT_INFORMATION_SECTION));
}
