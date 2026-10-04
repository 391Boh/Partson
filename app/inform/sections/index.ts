import type { ComponentType } from 'react';

import type { InformationSectionKey } from '../section-config';
import type { TocItem } from '../ui';
import AboutSection, { toc as aboutToc } from './about';
import DeliverySection, { toc as deliveryToc } from './delivery';
import DiagnosticsSection, { toc as diagnosticsToc } from './diagnostics';
import LocationSection, { toc as locationToc } from './location';
import PaymentSection, { toc as paymentToc } from './payment';
import PrivacySection, { toc as privacyToc } from './privacy';
import ReturnsSection, { toc as returnsToc } from './returns';
import WarrantySection, { toc as warrantyToc } from './warranty';

export const sectionContent: Record<InformationSectionKey, { Content: ComponentType; toc: TocItem[] }> = {
  delivery: { Content: DeliverySection, toc: deliveryToc },
  payment: { Content: PaymentSection, toc: paymentToc },
  about: { Content: AboutSection, toc: aboutToc },
  location: { Content: LocationSection, toc: locationToc },
  privacy: { Content: PrivacySection, toc: privacyToc },
  warranty: { Content: WarrantySection, toc: warrantyToc },
  returns: { Content: ReturnsSection, toc: returnsToc },
  diagnostics: { Content: DiagnosticsSection, toc: diagnosticsToc },
};
