import type { Metadata } from "next";
import { notFound } from "next/navigation";

import InformationPageClient from "../InformationPageClient";
import {
  getInformationMetadata,
  getInformationSection,
  informationSections,
  type InformationSectionKey,
} from "../section-config";

interface InformationSectionPageProps {
  params: Promise<{
    section: string;
  }>;
}

export function generateStaticParams() {
  return informationSections.map((section) => ({ section: section.key }));
}

export async function generateMetadata({
  params,
}: InformationSectionPageProps): Promise<Metadata> {
  const { section } = await params;
  const resolvedSection = getInformationSection(section);

  if (!resolvedSection) {
    return {};
  }

  return getInformationMetadata(resolvedSection.key);
}

export default async function InformationSectionPage({
  params,
}: InformationSectionPageProps) {
  const { section } = await params;
  const resolvedSection = getInformationSection(section);

  if (!resolvedSection) {
    notFound();
  }

  return (
    <InformationPageClient
      initialSectionKey={resolvedSection.key as InformationSectionKey}
    />
  );
}