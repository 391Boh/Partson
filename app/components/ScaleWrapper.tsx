import React, { useEffect, useState } from 'react';

interface ScaleWrapperProps {
  children: React.ReactNode;
  baseWidth?: number;  // базова ширина дизайну, за замовчуванням 1440px
  baseHeight?: number; // базова висота (якщо потрібно)
}

export default function ScaleWrapper({
  children,
  baseWidth = 1440,
  baseHeight,
}: ScaleWrapperProps) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    function updateScale() {
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;

      let scaleRatio = screenWidth / baseWidth;

      // Якщо хочеш врахувати висоту, розкоментуй нижче
      /*
      if (baseHeight) {
        const heightRatio = screenHeight / baseHeight;
        scaleRatio = Math.min(scaleRatio, heightRatio);
      }
      */

      setScale(scaleRatio < 1 ? scaleRatio : 1);
    }

    updateScale();

    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [baseWidth, baseHeight]);

  return (
    <div
      style={{
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        width: `${100 / scale}%`,
        height: baseHeight ? `${100 / scale}%` : undefined,
        overflowX: 'hidden',
      }}
    >
      {children}
    </div>
  );
}
