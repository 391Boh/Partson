import dynamic from 'next/dynamic';

// Динамічно імпортуємо компонент карти з параметром ssr: false
const MapComponent = dynamic(() => import('app/components/Map'), {
  ssr: false, // Вимикаємо серверний рендеринг для цього компонента
  loading: () => (
    <div className="w-full h-96 flex items-center justify-center">
      {/* Спінер завантаження */}
      <div className="w-16 h-16 border-t-4 border-blue-500 border-solid rounded-full animate-spin"></div>
    <div className="flex justify-center items-center mt-4">
  <div className="loader"></div>
</div>

    </div>
  ),
});

const MapWrapper = () => {
  return (
    <div className="w-full h-screen flex flex-col items-center justify-center bg-gradient-to-b from-white to-blue-100 p-6">
      <h1 className="text-4xl font-semibold text-indigo-600 mb-6">Мій магазин на карті</h1>
      <div className="w-full h-[60vh] max-w-4xl rounded-xl overflow-hidden shadow-lg bg-white">
        {/* Динамічна карта */}
        <MapComponent />
      </div>
    </div>
  );
};

export default MapWrapper;
