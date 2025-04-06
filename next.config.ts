/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/getData', // локальний маршрут
        destination: 'http://192.168.0.101/RetailShopAuto1/hs/serv/getdata', // зовнішній сервер
      },
    ];
  },
};

module.exports = {
  // ...інші налаштування
  transpilePackages: ['leaflet', 'react-leaflet']
}


module.exports = nextConfig;





