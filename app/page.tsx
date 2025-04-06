"use client";

import Image from "next/image";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import Data from "app/components/Data";
import Footer from "app/components/footer";
import ProductShowcase from "app/components/tovar";




import React from "react";

import Auto from "app/components/autochose";
import Category from "app/components/katkomp";

// Дані для секції кроків
const carBrands = [
  { id: 1, name: "AUDI", logo: "/Carlogo/audi.svg" },
  { id: 2, name: "BMW", logo: "/Carlogo/bmw.svg" },
  { id: 3, name: "CHERY", logo: "/Carlogo/Chery.svg" },
  { id: 4, name: "CHRYSLER", logo: "/Carlogo/Chrysler.svg" },
  { id: 5, name: "CITROEN", logo: "/Carlogo/Citroen.svg" },
  { id: 6, name: "CADILLAC", logo: "/Carlogo/Cadillac.svg" },
  { id: 7, name: "DACIA", logo: "Carlogo/Dacia.svg" },
  { id: 8, name: "DAEWOO", logo: "/Carlogo/Daewoo.svg" },
  { id: 9, name: "DAF", logo: "/Carlogo/Daf.svg" },
  { id: 10, name: "DODGE", logo: "/Carlogo/Dodge.svg" },
  { id: 11, name: "FERRARI", logo: "/Carlogo/Ferrari.svg" },
  { id: 12, name: "FIAT", logo: "/Carlogo/Fiat.svg" },
  { id: 13, name: "FORD", logo: "/Carlogo/Ford.svg" },
  { id: 14, name: "FORD USA", logo: "/Carlogo/Ford.svg" },
  { id: 15, name: "GEELY", logo: "/Carlogo/Geely.svg" },
  { id: 16, name: "HONDA", logo: "/Carlogo/Honda.svg" },
  { id: 17, name: "HUMMER", logo: "/Carlogo/Hummer.svg" },
  { id: 18, name: "HYUNDAI", logo: "/Carlogo/Hyunndai.svg" },
  { id: 19, name: "INFINITI", logo: "/Carlogo/Infiniti.svg" },
  { id: 20, name: "ISUZU", logo: "/Carlogo/Isuzu.svg" },
  { id: 21, name: "IVECO", logo: "/Carlogo/Iveco.svg" },
  { id: 22, name: "JAGUAR", logo: "/Carlogo/Jaguar.svg" },
  { id: 23, name: "JEEP", logo: "/Carlogo/Jeep.svg" },
  { id: 24, name: "KIA", logo: "/Carlogo/KIA.svg" },
  { id: 25, name: "LADA", logo: "/Carlogo/Lada.svg" },
  { id: 26, name: "LAMBORGHINI", logo: "/Carlogo/Lamborghini.svg" },
  { id: 27, name: "LANCIA", logo: "/Carlogo/Lancia.svg" },
  { id: 28, name: "LAND ROVER", logo: "/Carlogo/Landrover.svg" },
  { id: 29, name: "LEXUS", logo: "/Carlogo/Lexus.svg" },
  { id: 30, name: "LINCOLN", logo: "/Carlogo/Lincoln.svg" },
  { id: 31, name: "LOTUS", logo: "/Carlogo/Lotus.svg" },
  { id: 32, name: "MAN", logo: "/Carlogo/man.png" },
  { id: 33, name: "MASERATI", logo: "/Carlogo/Maserati.svg" },
  { id: 34, name: "MAYBACH", logo: "/Carlogo/Maybach.svg" },
  { id: 35, name: "MAZDA", logo: "/Carlogo/Mazda.svg" },
  { id: 36, name: "MERCEDES-BENZ", logo: "/Carlogo/Mercedes.svg" },
  { id: 37, name: "MINI", logo: "/Carlogo/Mini.svg" },
  { id: 38, name: "MITSUBISHI", logo: "/Carlogo/Mitsubishi.svg" },
  { id: 39, name: "NISSAN", logo: "/Carlogo/Nissan.svg" },
  { id: 40, name: "OPEL", logo: "/Carlogo/Opel.svg" },
  { id: 41, name: "PEUGEOT", logo: "/Carlogo/Peugeot.svg" },
  { id: 42, name: "PONTIAC", logo: "/Carlogo/Pontiac.png" },
  { id: 43, name: "PORSCHE", logo: "/Carlogo/Porsche.svg" },
  { id: 44, name: "RAM", logo: "/Carlogo/Ram.png" },
  { id: 45, name: "RENAULT", logo: "/Carlogo/Renault.svg" },
  { id: 46, name: "ROLLS-ROYCE", logo: "/Carlogo/Rollsroyce.svg" },
  { id: 47, name: "ROVER", logo: "/Carlogo/Rover.png" },
  { id: 48, name: "SAAB", logo: "/Carlogo/Saab.png" },
  { id: 49, name: "SEAT", logo: "/Carlogo/Seat.svg" },
  { id: 50, name: "SKODA", logo: "/Carlogo/Skoda.png" },
  { id: 51, name: "SMART", logo: "/Carlogo/Smart.svg" },
  { id: 52, name: "SSANGYONG", logo: "/Carlogo/Ssangyong.svg" },
  { id: 53, name: "SUBARU", logo: "/Carlogo/Subaru.svg" },
  { id: 54, name: "SUZUKI", logo: "/Carlogo/Suzuki.svg" },
  { id: 55, name: "TESLA", logo: "/Carlogo/Tesla.svg" },
  { id: 56, name: "TOYOTA", logo: "/Carlogo/Toyota.svg" },
  { id: 57, name: "VOLVO", logo: "/Carlogo/Volvo.svg" },
  { id: 58, name: "VOLKSWAGEN", logo: "/Carlogo/Volkswagen.svg" },
  { id: 59, name: "ACURA", logo: "/Carlogo/Acura.svg" },
  { id: 60, name: "ALFA ROMEO", logo: "/Carlogo/Alfaromeo.svg" },
  { id: 61, name: "ASTON MARTIN", logo: "/Carlogo/Astonmartin.svg" },
  { id: 62, name: "BENTLEY", logo: "/Carlogo/Bentley.svg" }


];

const partsCategories = [
    { id: 1, name: "Кузовні елементи" , logo: "/Katlogo/kyzov.svg" },
    { id: 2, name: "Деталі підвіски" , logo: "/Katlogo/suspension.png"},
    { id: 3, name: "Привід та коробка передач" , logo: "/Katlogo/transmition.svg"},
    { id: 4, name: "Деталі двигуна" , logo: "/Katlogo/engine.png"},
    { id: 5, name: "Гальмівна система" , logo: "/Katlogo/brake.svg"},
    { id: 6, name: "Система охолодження" , logo: "/Katlogo/ohol.svg"},
    { id: 7, name: "Освітлення" , logo: "/Katlogo/osv.svg"} ,
    { id: 8, name: "Аксесуари для авто" , logo: "/Katlogo/accessories.png"},
    { id: 9, name: "Паливна система" , logo: "/Katlogo/fuel.png"},
    { id: 10, name: "Вихлопна система" , logo: "/Katlogo/exhaust.png"},
    { id: 11, name: "Рідини та мастила"  , logo: "/Katlogo/oil.svg"},
    { id: 12, name: "Кондиціонування та обігрів" , logo: "/Katlogo/ohol.svg"},
    { id: 13, name: "Датчики та електроніка" , logo: "/Katlogo/datchuk.svg"},
    { id: 14, name: "Деталі для ТО" , logo: "/Katlogo/to.png"}
  ];
  
  

export default function Home() {

  const [searchTerm, setSearchTerm] = useState("");
const filteredBrands = carBrands.filter(brand =>
  brand.name.toLowerCase().includes(searchTerm.toLowerCase())
);
const [search, setSearch] = useState("");

const filteredCategories = partsCategories.filter((category) =>
  category.name.toLowerCase().includes(search.toLowerCase())
);

  
  
 
  

return (
  <div className="relative min-h-screen  overflow-hidden">
    {/* Fixed background gradient */}
    <motion.div
      className="fixed inset-0 bg-gradient-to-b from-blue-300 via-blue-300 to-red-300 opacity-10 z-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.1 }}
      transition={{ duration: 1, ease: "easeInOut" }}
    />
    
    {/* Main content */}
    <main className="max-w-screen relative pt-22 bg-white">
      {/* Top section with welcome, logo and registration */}
      <section className="py-5 px-5 sm:px-6 relative">
      <motion.div 
        className="absolute inset-0 bg-gradient-to-br from-gray-800 via-blue-500 to-gray-800 opacity-0"
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2 }}
      />
      <div className="max-w mx-auto relative ">
        <div className="flex flex-col lg:flex-row items-stretch gap-2 ">
          {/* Welcome block */}
        {/* Welcome block */}
<motion.div
  className="w-full"
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
>
  <div className="w-full bg-gradient-to-br from-indigo-700 via-blue-900 to-gray-900 p-8 rounded-3xl border border-gray-800 shadow-2xl flex flex-col">
    <div className="flex items-start justify-start">
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
      >
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white">
          <span className="bg-gradient-to-r from-blue-300 to-indigo-400 bg-clip-text text-transparent">
            Ласкаво просимо!
          </span>
          <span className="text-white mt-3 block text-xl sm:text-2xl">
            Знайдеться все для вашого авто
          </span>
        </h1>
      </motion.div>
    </div>
    <motion.p
      className="text-xl text-blue-200 mt-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.6 }}
    >
      Кожна <span className="text-2xl font-semibold text-red-400">деталь</span> має значення...
    </motion.p>
  </div>
</motion.div>

          {/* Car parts illustration */}
          <motion.div
            className="hidden lg:flex items-center justify-center w-180"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <div className="relative w-full h-full min-h-[100px]">
              <Image
                src="/Car-parts.svg"
                alt="Автозапчастини"
                fill
                className="object-contain p-2"
                priority
              />
            </div>
          </motion.div>

          {/* Registration block */}
          <motion.div
  className="w-full"
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.6, delay: 0.4 }}
>
  <div className="h-full rounded-xl shadow-lg border border-blue-400/20 bg-gradient-to-br from-blue-300 via-blue-500 to-blue-700 backdrop-blur-lg relative overflow-hidden h-64"> {/* Фіксована висота */}
    <motion.div
      className="absolute inset-0 bg-gradient-to-r from-blue-200 via-white/30 to-blue-400 opacity-50 blur-xl"
      animate={{ scale: [1, 1.02, 1] }}
      transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
    />
    <div className="relative z-10 w-full flex flex-col justify-center px-6 py-4"> {/* Компактніші відступи */}
      <h2 className="text-2xl font-extrabold text-white text-center mb-3 tracking-tight"> {/* Компактніший текст */}
        <span className="text-yellow-400">🎁</span> <span className="drop-shadow-sm">Отримайте бонуси!</span>
      </h2>
      <ul className="space-y-2 my-3 text-white text-base w-full max-h-md mx-auto"> {/* Менший текст і відступи */}
        {[
          "5% знижки на перше замовлення",
          "Ексклюзивні пропозиції",
          "Пріоритетна підтримка"
        ].map((item, index) => (
          <motion.li
            key={index}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 + index * 0.1 }}
            className="flex items-center font-medium tracking-normal" /* Компактніший шрифт */
          >
            <span className="text-green-400 mr-2 text-lg">✓</span> {/* Менша галочка */}
            <span className="drop-shadow-sm">{item}</span>
          </motion.li>
        ))}
      </ul>
      <div className="flex flex-col space-y-2 absolute bottom-4 right-4">
        <motion.button
          className="py-2 px-6 rounded-full text-white font-medium text-base shadow-md 
                    bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-300 
                    hover:from-blue-500 hover:to-blue-700 hover:shadow-lg"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
        >
          Увійти
        </motion.button>
        <motion.button
          className="py-2 px-6 rounded-full text-white font-medium text-base shadow-md 
                    bg-gradient-to-r from-red-400 to-orange-600 transition-all duration-300 
                    hover:from-red-500 hover:to-orange-700 hover:shadow-lg"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
        >
          Швидка реєстрація
        </motion.button>
      </div>
    </div>
  </div>
</motion.div>



        </div>
      </div>
    </section>

  {/* Steps section */}
<section className="py-10 relative overflow-hidden w-full">
  {/* Background gradient with smoother animation */}
  <motion.div
    className="absolute inset-0 bg-gradient-to-br from-gray-00 to-gray-200 "
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{
      duration: 1.2,
      ease: [0.16, 1, 0.3, 1], // Custom cubic bezier for smoother animation
    }}
  />

  <div className="relative w-full h-full">
    {/* Section title with refined animation */}
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.8,
        delay: 0.2,
        ease: [0.16, 1, 0.3, 1],
      }}
      viewport={{ once: true, margin: "120px" }}
      className="text-center mb-4"
    >
      <h2 className="text-5xl font-bold text-gray-900">
        Один , два , три - <span className="text-blue-600">Замовлення</span> у вас !
      </h2>
    </motion.div>

    <motion.div
      className="bg-white rounded-2xl shadow-xl p-6 grid grid-cols-1 md:grid-cols-3 gap-8 w-full h-[500px]"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-100px" }}
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: 0.15,
            delayChildren: 0.3,
          },
        },
      }}
    >
      <Auto />
      <Category />

      {/* Step 3: Order */}
      <motion.div
  className="p-6 rounded-xl border border-blue-200/20 bg-gradient-to-br from-blue-150 via-blue-300 to-blue-400 backdrop-blur-lg hover:border-purple-200 transition-all hover:shadow-lg"
  variants={{
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        delay: 0.3,
        ease: [0.16, 1, 0.3, 1],
      },
    },
  }}
  whileHover={{
    y: -8,
    transition: { duration: 0.3 },
  }}
>
  <div className="flex items-center justify-start mb-4">
    <div className="bg-purple-100 w-12 h-12 rounded-full flex items-center justify-center mr-3">
      <span className="text-xl font-bold text-purple-600">3</span>
    </div>
    <h3 className="text-2xl font-extrabold text-gray-900 w-full text-left">Оформлення</h3>
  </div>

  <motion.div
    className="space-y-4 font-bold"
    initial="hidden"
    animate="visible"
    variants={{
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: {
          staggerChildren: 0.1,
          delayChildren: 0.7,
        },
      },
    }}
  >
    {[
      { color: "blue", text: "Швидке cтворення замовлення", desc: "Лише 3 кліки ", icon: "M5 13l4 4L19 7" },
      { color: "green", text: "Уточнення даних", desc: "Про доставку", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
      { color: "purple", text: "Зручна оплата", desc: "Готівка та карта", icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" }
    ].map((feature, idx) => (
      <motion.div
        key={idx}
        className="flex items-center space-x-3"
        variants={{
          hidden: { opacity: 0, y: 20 },
          visible: {
            opacity: 1,
            y: 0,
            transition: {
              duration: 0.6,
              ease: [0.16, 1, 0.3, 1],
            },
          },
        }}
      >
        <div className={`bg-${feature.color}-100 p-3 rounded-full`}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`w-6 h-6 text-${feature.color}-600`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="2"
          >
            <path d={feature.icon} />
          </svg>
        </div>
        <div className="w-full">
          <h4 className="text-lg font-semibold text-gray-800 text-left">{feature.text}</h4>
          <p className="text-md text-gray-700">{feature.desc}</p>
        </div>
      </motion.div>
    ))}
  </motion.div>
</motion.div>
</motion.div>

  </div>
</section>

<ProductShowcase/>

      {/* Advantages section */}
<section className="py-1 px-1 relative min-w-full ">
  {/* М'який градієнтний фон з анімацією */}
  <motion.div
    className="absolute inset-0 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ duration: 1.5, ease: "easeInOut" }}
  />

  <div className="container mx-auto px-4 relative z-10 w-full">
    {/* Заголовок з анімацією */}
    <motion.h2
      className="text-5xl font-bold text-center mb-12 text-gray-900"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      viewport={{ once: true, margin: "-100px" }}
    >
      Наші <span className="text-blue-600">переваги</span>
    </motion.h2>

    <motion.div
  className="bg-white rounded-2xl shadow-2xl p-5 flex gap-6 w-full  overflow-x-auto scroll-smooth"
  initial={{ opacity: 0, scale: 0.95 }}
  whileInView={{ opacity: 1, scale: 1 }}
  transition={{ duration: 0.6 }}
  viewport={{ once: true }}
>
  {/* Перевага 1 */}
  <motion.div
    className="p-5 rounded-lg border border-gray-100 bg-gradient-to-br from-gray-100 to-gray-200 border-gray-200 hover:border-blue-200 transition-all hover:shadow-md min-w-max"
    whileHover={{ y: -5 }}
    initial={{ opacity: 0 }}
    whileInView={{ opacity: 1 }}
    transition={{ duration: 0.5, delay: 0.1 }}
    viewport={{ once: true }}
  >
    <div className="bg-blue-100 w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto">
      <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
    </div>
    <h3 className="text-lg font-semibold text-center text-gray-800 mb-2">Швидка доставка</h3>
    <p className="text-gray-600 text-center text-sm">1-3 дні по всій Україні</p>
  </motion.div>

  {/* Перевага 2 */}
  <motion.div
    className="bg-gradient-to-br from-gray-100 to-gray-200 border-gray-200 p-5 rounded-lg border border-gray-100 hover:border-green-200 transition-all hover:shadow-md min-w-max"
    whileHover={{ y: -5 }}
    initial={{ opacity: 0 }}
    whileInView={{ opacity: 1 }}
    transition={{ duration: 0.5, delay: 0.2 }}
    viewport={{ once: true }}
  >
    <div className="bg-green-100 w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto">
      <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
    </div>
    <h3 className="text-lg font-semibold text-center text-gray-800 mb-2">Гарантія якості</h3>
    <p className="text-gray-600 text-center text-sm">Перевірка перед відправкою</p>
  </motion.div>

  {/* Перевага 3 */}
  <motion.div
    className="bg-gradient-to-br from-gray-100 to-gray-200 border-gray-200 p-5 rounded-lg border border-gray-100 hover:border-purple-200 transition-all hover:shadow-md min-w-max"
    whileHover={{ y: -5 }}
    initial={{ opacity: 0 }}
    whileInView={{ opacity: 1 }}
    transition={{ duration: 0.5, delay: 0.3 }}
    viewport={{ once: true }}
  >
    <div className="bg-purple-100 w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto">
      <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path>
      </svg>
    </div>
    <h3 className="text-lg font-semibold text-center text-gray-800 mb-2">Гнучкі оплати</h3>
    <p className="text-gray-600 text-center text-sm">Готівка, карта, розстрочка</p>
  </motion.div>

  {/* Перевага 4 */}
  <motion.div
    className="bg-gradient-to-br from-gray-100 to-gray-200 border-gray-200 p-5 rounded-lg border border-gray-100 hover:border-yellow-200 transition-all hover:shadow-md min-w-max"
    whileHover={{ y: -5 }}
    initial={{ opacity: 0 }}
    whileInView={{ opacity: 1 }}
    transition={{ duration: 0.5, delay: 0.4 }}
    viewport={{ once: true }}
  >
    <div className="bg-yellow-100 w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto">
      <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
    </div>
    <h3 className="text-lg font-semibold text-center text-gray-800 mb-2">Вигідні ціни</h3>
    <p className="text-gray-600 text-center text-sm">На 10-15% нижчі за ринок</p>
  </motion.div>

  {/* Перевага 5 */}
  <motion.div
    className="bg-gradient-to-br from-gray-100 to-gray-200 border-gray-200 p-5 rounded-lg border border-gray-100 hover:border-red-200 transition-all hover:shadow-md min-w-max"
    whileHover={{ y: -5 }}
    initial={{ opacity: 0 }}
    whileInView={{ opacity: 1 }}
    transition={{ duration: 0.5, delay: 0.1 }}
    viewport={{ once: true }}
  >
    <div className="bg-red-100 w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto">
      <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
      </svg>
    </div>
    <h3 className="text-lg font-semibold text-center text-gray-800 mb-2">Легкий повернення</h3>
    <p className="text-gray-600 text-center text-sm">Мінімум формальностей</p>
  </motion.div>

  {/* Перевага 6 */}
  <motion.div
    className="bg-gradient-to-br from-gray-100 to-gray-200 border-gray-200 p-5 rounded-lg border border-gray-100 hover:border-indigo-200 transition-all hover:shadow-md min-w-max"
    whileHover={{ y: -5 }}
    initial={{ opacity: 0 }}
    whileInView={{ opacity: 1 }}
    transition={{ duration: 0.5, delay: 0.2 }}
    viewport={{ once: true }}
  >
    <div className="bg-indigo-100 w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto">
      <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path>
      </svg>
    </div>
    <h3 className="text-lg font-semibold text-center text-gray-800 mb-2">Підтримка 24/7</h3>
    <p className="text-gray-600 text-center text-sm">Завжди на зв'язку</p>
  </motion.div>

  {/* Перевага 7 */}
  <motion.div
    className="bg-gradient-to-br from-gray-100 to-gray-200 border-gray-200 p-5 rounded-lg border border-gray-100 hover:border-pink-200 transition-all hover:shadow-md min-w-max"
    whileHover={{ y: -5 }}
    initial={{ opacity: 0 }}
    whileInView={{ opacity: 1 }}
    transition={{ duration: 0.5, delay: 0.3 }}
    viewport={{ once: true }}
  >
    <div className="bg-pink-100 w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto">
      <svg className="w-6 h-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.929C7.595 3.53 5 6.06 5 9c0 4.41 3.59 8 8 8s8-3.59 8-8c0-2.833-1.556-5.406-3.969-6.687"></path>
      </svg>
    </div>
    <h3 className="text-lg font-semibold text-center text-gray-800 mb-2">Надійність</h3>
    <p className="text-gray-600 text-center text-sm">Перевірено тисячами клієнтів</p>
  </motion.div>

  {/* Перевага 8 */}
  <motion.div
    className="bg-gradient-to-br from-gray-100 to-gray-200 border-gray-200 p-5 rounded-lg border border-gray-100 hover:border-orange-200 transition-all hover:shadow-md min-w-max"
    whileHover={{ y: -5 }}
    initial={{ opacity: 0 }}
    whileInView={{ opacity: 1 }}
    transition={{ duration: 0.5, delay: 0.4 }}
    viewport={{ once: true }}
  >
    <div className="bg-orange-100 w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto">
      <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10-4.48-10-10-10zm0 14c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z"></path>
      </svg>
    </div>
    <h3 className="text-lg font-semibold text-center text-gray-800 mb-2">Доступність</h3>
    <p className="text-gray-600 text-center text-sm">Найнижчі ціни на ринку</p>
  </motion.div>
</motion.div>


  </div>
  

  
 
  
</section>


<Footer/>
      </main>
    </div>
    
  );
  

  
} 