/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['leaflet', 'react-leaflet'],
  // rewrites видаляємо, бо вони викликають 404 при авторизації
};

module.exports = nextConfig;
