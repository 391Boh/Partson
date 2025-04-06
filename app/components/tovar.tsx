import Image from "next/image";
import { motion } from "framer-motion";

const products = [
  {
    name: "Ходова частина",
    image: "/Parts/amort.png",
    description:
      "Запчастини підвіски: амортизатори, пружини, ричаги, сайлентблоки, шарові та інші."
  },
  {
    name: "Фільтри для заміни",
    image: "/Parts/filtr.png",
    description: "Повітряні та салонні фільтри у наявності."
  },
  {
    name: "Компоненти двигуна",
    image: "/Parts/grm.png",
    description: "Ремні, ролики, прокладки."
  },
  {
    name: "Гальмівна система",
    image: "/Parts/kol.png",
    description: "Супорти, гальмівні диски та колодки."
  },
  {
    name: "Масла",
    image: "/Parts/masl.png",
    description: "Моторні масла та масляний фільтр перевірених брендів."
  },
  {
    name: "Рульова система",
    image: "/Parts/nakon.png",
    description: "Кермові наконечники та тяги для точного управління."
  },
  {
    name: "Подушки двигуна",
    image: "/Parts/podush.png",
    description: "Опори та подушки двигуна для стабільної роботи."
  },
  {
    name: "Та багато іншого",
    image: "/Katlogo/to.png",
    description: "..."
  }
];

export default function ProductShowcase() {
  return (
    <section className="w-full px-4 py-16 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-800 mb-4">
          Великий асортимент товарів
        </h2>
        <p className="text-center text-gray-600 mb-12">
          В нас ви знайдете всі необхідні запчастини для вашого авто
        </p>

        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={{
            visible: {
              transition: {
                staggerChildren: 0.1
              }
            }
          }}
        >
          {products.map((product, index) => (
            <motion.div
              key={index}
              className="bg-white rounded-2xl shadow-md p-5 flex flex-col items-center text-center hover:shadow-xl transition-all"
              whileHover={{ scale: 1.03 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
            >
              <div className="relative w-24 h-24 mb-4">
                <Image
                  src={product.image}
                  alt={product.name}
                  layout="fill"
                  objectFit="contain"
                />
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                {product.name}
              </h3>
              <p className="text-gray-600 text-sm">{product.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}