import dynamic from 'next/dynamic';

// Динамічно імпортуємо компонент карти з параметром ssr: false
const MapComponent = dynamic(() => import('app/components/Map'), {
  ssr: false, // Вимикаємо серверний рендеринг для цього компонента
});

const MapWrapper = () => {
  return (
    <div>
      <h1>Мій магазин на карті</h1>
      <MapComponent />
    </div>
  );
};

export default MapWrapper;
