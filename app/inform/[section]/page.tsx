import type { Metadata } from "next";
import { notFound } from "next/navigation";

import InformationPageClient from "../InformationPageClient";
import {
  getInformationMetadata,
  getInformationSection,
  informationSections,
} from "../section-config";

export const revalidate = 3600;

interface InformationSectionPageParams {
  section: string;
}

interface InformationSectionPageProps {
  params: Promise<InformationSectionPageParams>;
}

export function generateStaticParams() {
  return informationSections.map((section) => ({
    section: section.key,
  }));
}

export async function generateMetadata({
  params,
}: InformationSectionPageProps): Promise<Metadata> {
  const { section } = await params;
  const resolvedSection = getInformationSection(section);

  if (!resolvedSection) {
    return {
      title: "Інформаційну сторінку не знайдено",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  return getInformationMetadata(resolvedSection.key);
}

export default async function InformationSectionPage({
  params,
}: InformationSectionPageProps) {
  const { section } = await params;
  const resolvedSection = getInformationSection(section);
  if (!resolvedSection) notFound();

  return (
    <>
      <h1 className="sr-only">Інформація PartsON: {resolvedSection.title}</h1>
      <InformationPageClient initialSectionKey={resolvedSection.key} />
    </>
  );
}
