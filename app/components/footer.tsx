import { FaFacebookF, FaInstagram, FaTelegramPlane, FaPhoneAlt, FaEnvelope } from 'react-icons/fa';

export default function Footer() {
  return (
    <footer className="bg-blue-100 text-gray-900 py-10 px-6 lg:px-24">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Логотип і короткий опис */}
        <div>
          <h2 className="text-2xl font-bold text-gray mb-3">PartsON</h2>
          <p className="text-sm text-gray-400">Найкращий інтернет-магазин з автозапчастинами</p>
        </div>

        {/* Посилання */}
        <div>
          <h3 className="text-lg font-semibold mb-3 text-gray-700">Інформація</h3>
          <ul className="space-y-2 text-sm">
            <li><a href="/about" className="hover:text-white">Про нас</a></li>
            <li><a href="/delivery" className="hover:text-white">Доставка</a></li>
            <li><a href="/returns" className="hover:text-white">Повернення</a></li>
            <li><a href="/contacts" className="hover:text-white">Контакти</a></li>
          </ul>
        </div>

        {/* Контакти */}
        <div>
          <h3 className="text-lg font-semibold mb-3 text-gray-700">Контакти</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <FaPhoneAlt className="text-gray-400" />
              <a href="tel:+380961234567" className="hover:text-white">+38 (063) 421-18-51</a>
            </li>
            <li className="flex items-center gap-2">
              <FaEnvelope className="text-gray-400" />
              <a href="mailto:info@myshop.ua" className="hover:text-white">romaniukbboogg@gmail.com</a>
            </li>
          </ul>
        </div>

        {/* Соцмережі */}
        <div>
          <h3 className="text-lg font-semibold mb-3 text-gray-700">Ми в соцмережах</h3>
          <div className="flex space-x-4">
            <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white">
              <FaFacebookF size={20} />
            </a>
            <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white">
              <FaInstagram size={20} />
            </a>
            <a href="https://t.me/myshop" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white">
              <FaTelegramPlane size={20} />
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-700 mt-10 pt-5 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} PartsON. Всі права захищені.
      </div>
    </footer>
  );
}
