import { CarFront } from "lucide-react";
import CatalogHubHero from "./CatalogHubHero";
import type { DirectorySection } from "app/lib/directory-appearance";

const labels = {
  auto: { title: "Підбір автозапчастин за маркою і моделлю авто", status: "Завантаження автомобілів" },
  groups: { title: "Категорії автозапчастин", status: "Завантаження категорій" },
  manufacturers: { title: "Виробники автозапчастин", status: "Завантаження виробників" },
};

/** The navigation remains usable while directory data streams from the server. */
export default function CatalogDirectoryLoading({ current }: { current: DirectorySection }) {
  const { title, status } = labels[current];
  return (
    <main className="catalog-directory-page directory-loading-page" aria-busy="true">
      <div role="status" className="sr-only">{status}</div>
      <div className="catalog-hub-stage">
        <CatalogHubHero current={current} title={title}
          titleAccent={current === "auto" ? "за маркою і моделлю авто" : undefined}
          description="Готуємо список. Ви можете одразу перейти до іншого розділу каталогу."
          badge="" icon={CarFront} warmNavigation={false} />
      </div>
      <div className="page-shell-inline directory-loading-list" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => <span key={index} />)}
      </div>
    </main>
  );
}
