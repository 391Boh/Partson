import Link from "next/link";
import {
  FaFacebookF,
  FaInstagram,
  FaTelegramPlane,
  FaPhoneAlt,
  FaEnvelope,
} from "react-icons/fa";

export default function Footer() {
  return (
    <footer
      className="bg-blue-100 text-gray-900 py-10 select-none"
      onCopy={(event) => event.preventDefault()}
      onCut={(event) => event.preventDefault()}
    >
      <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-4 lg:px-6">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div>
            <div className="flex items-baseline gap-3">
              <h2 className="shrink-0 text-2xl font-bold">PartsON</h2>
              <p className="min-w-0 flex-1 truncate text-sm text-gray-500">
                Найкращий інтернет-магазин з автозапчастинами
              </p>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold text-gray-700">Інформація</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/Inform?tab=about">Про нас</Link>
              </li>
              <li>
                <Link href="/Inform?tab=delivery">Доставка</Link>
              </li>
              <li>
                <Link href="/groups">Групи товарів</Link>
              </li>
              <li>
                <Link href="/manufacturers">Виробники</Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold text-gray-700">Контакти</h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <FaPhoneAlt />
                <a href="tel:+380634211851">+38 (063) 421-18-51</a>
              </li>
              <li className="flex items-center gap-2">
                <FaEnvelope />
                <a href="mailto:romaniukbboogg@gmail.com">romaniukbboogg@gmail.com</a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold text-gray-700">Ми в соцмережах</h3>
            <div className="flex space-x-4">
              <FaFacebookF />
              <FaInstagram />
              <FaTelegramPlane />
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-gray-300 pt-5 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} PartsON. Всі права захищені.
        </div>
      </div>
    </footer>
  );
}
