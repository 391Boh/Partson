"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { brands } from "app/components/brandsData";

export default function BrandCarousel() {
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(timeout);
  }, []);

  const filteredBrands = brands.filter((brand) =>
    brand.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
   <motion.section
  initial={{
    background: "linear-gradient(135deg, #dbe9fb 0%, #f1f6f9 100%)",
  }}
  whileHover={{
    background: "linear-gradient(135deg, #c0d8ff 0%, #a8c8f84a 100%)",
   
    boxShadow: "0px 15px 40px rgba(63, 90, 133, 0.25)",
  }}
  transition={{ duration: 0.6, ease: "easeInOut" }}
  className="w-full px-6 py-10 rounded-3xl transition-all"
>

      {/* Заголовок + пошук */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <h2 className="m-4 text-2xl md:text-3xl font-semibold text-gray-800 text-center md:text-left">
          Список брендів виробників автозапчастин
        </h2>
        <div className="w-full md:w-80">
       <input
  type="text"
  placeholder="Наприклад Bosch..."
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  className="w-full max-w-md px-4 py-3 rounded-2xl border border-gray-200 
             bg-white/90 shadow-md placeholder-gray-400 text-gray-700 
             focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400
             transition-all duration-300 ease-in-out hover:shadow-xl hover:border-blue-300
             text-base ml-0"
/>

        </div>
      </div>

      {/* Список брендів */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={mounted ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
        className="overflow-x-auto w-full"
      >
        <div className="flex gap-8 w-max">
          {filteredBrands.map((brand, idx) => (
            <FlipCard key={idx} brand={brand} />
          ))}
        </div>
      </motion.div>
    </motion.section>
  );
}

function FlipCard({ brand }: { brand: typeof brands[number] }) {
  const [flipped, setFlipped] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 768);
    }
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return (
    <motion.div
      className="w-56 h-56 sm:w-64 sm:h-48 perspective mt-10 mb-10"
      whileHover={{
        scale: 1.08,
        rotateZ: 1,
        boxShadow: "0px 12px 28px rgba(176, 97, 97, 0.18)",
      }}
      transition={{ duration: 0.3 }}
      onHoverStart={() => !isMobile && setFlipped(true)}
      onHoverEnd={() => !isMobile && setFlipped(false)}
      onClick={() => isMobile && setFlipped((prev) => !prev)}
    >
      <motion.div
        className="relative w-full h-full rounded-3xl bg-white border border-transparent shadow-lg cursor-pointer select-none"
        animate={{ rotateY: flipped ? 180 : 0, scale: flipped ? 1.02 : 1 }}
        transition={{
          duration: 0.8,
          ease: "easeInOut",
          type: "spring",
          stiffness: 100,
          damping: 15,
        }}
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Front Side */}
        <div
          className="absolute inset-0 bg-white/80 rounded-3xl flex items-center justify-center p-6"
          style={{ backfaceVisibility: "hidden" }}
        >
          <img
            src={brand.logo}
            alt={brand.name}
            className="max-h-28 object-contain"
            draggable={false}
          />
        </div>

        {/* Back Side */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-200 
                     rounded-3xl flex items-center justify-center p-6 
                     text-center text-base text-gray-700"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            overflowY: "auto",
          }}
        >
          <p>{brand.description}</p>
        </div>
      </motion.div>
    </motion.div>
  );
}
