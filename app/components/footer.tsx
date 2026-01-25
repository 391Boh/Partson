import {
  FaFacebookF,
  FaInstagram,
  FaTelegramPlane,
  FaPhoneAlt,
  FaEnvelope,
} from "react-icons/fa";

export default function Footer() {
  return (
    <footer className="bg-blue-100 text-gray-900 py-10">
      <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-4 lg:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Логотип і короткий опис */}
          <div>
            <div className="flex items-baseline gap-3">
              <h2 className="text-2xl font-bold shrink-0">PartsON</h2>
              <p className="text-sm text-gray-400 truncate flex-1 min-w-0">
              Найкращий інтернет-магазин з автозапчастинами
              </p>
            </div>
          </div>

          {/* Посилання */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-gray-700">
              Інформація
            </h3>
            <ul className="space-y-2 text-sm">
              <li><a href="/about">Про нас</a></li>
              <li><a href="/delivery">Доставка</a></li>
              <li><a href="/returns">Повернення</a></li>
              <li><a href="/contacts">Контакти</a></li>
            </ul>
          </div>

          {/* Контакти */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-gray-700">
              Контакти
            </h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <FaPhoneAlt />
                <a href="tel:+380634211851">+38 (063) 421-18-51</a>
              </li>
              <li className="flex items-center gap-2">
                <FaEnvelope />
                <a href="mailto:romaniukbboogg@gmail.com">
                  romaniukbboogg@gmail.com
                </a>
              </li>
            </ul>
          </div>

          {/* Соцмережі */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-gray-700">
              Ми в соцмережах
            </h3>
            <div className="flex space-x-4">
              <FaFacebookF />
              <FaInstagram />
              <FaTelegramPlane />
            </div>
          </div>
        </div>

        {/* ⬇️ ОСЬ ЦЕЙ DIV БУВ ВІДСУТНІЙ */}
        <div className="border-t border-gray-300 mt-10 pt-5 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} PartsON. Всі права захищені.
        </div>
      </div>
    </footer>
  );
}
