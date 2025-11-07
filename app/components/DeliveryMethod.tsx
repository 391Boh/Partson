'use client';

import { ArrowLeft, Check } from "lucide-react";
import { useEffect, useState, useCallback } from "react";

// Debounce function
function debounce<T extends (...args: any[]) => void>(func: T, delay: number) {
  let timer: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => func(...args), delay);
  };
}

interface CityOrWarehouse {
  Description: string;
  Ref: string;
}

interface Props {
  deliveryMethod: 'Нова Пошта' | 'Самовивіз' | 'Доставка у Львові' | '';
  setDeliveryMethod: (method: 'Нова Пошта' | 'Самовивіз' | 'Доставка у Львові' | '') => void;
  onBack: () => void;
  onSubmit: () => void;

  selectedCity: CityOrWarehouse | null;
  setSelectedCity: (value: CityOrWarehouse | null) => void;

  selectedWarehouse: CityOrWarehouse | null;
  setSelectedWarehouse: (value: CityOrWarehouse | null) => void;

  selectedLvivStreet: string | null;
  setSelectedLvivStreet: (value: string | null) => void;
}

const options: { value: 'Нова Пошта' | 'Самовивіз' | 'Доставка у Львові'; label: string }[] = [
  { value: 'Нова Пошта', label: 'Нова Пошта' },
  { value: 'Самовивіз', label: 'Самовивіз' },
  { value: 'Доставка у Львові', label: 'Доставка у Львові' }
];

const DeliveryMethod: React.FC<Props> = ({
  deliveryMethod,
  setDeliveryMethod,
  onBack,
  onSubmit,

  selectedCity,
  setSelectedCity,
  selectedWarehouse,
  setSelectedWarehouse,
  selectedLvivStreet,
  setSelectedLvivStreet,
}) => {
  const [cityInput, setCityInput] = useState('');
  const [cities, setCities] = useState<CityOrWarehouse[]>([]);

  const [warehouseInput, setWarehouseInput] = useState('');
  const [warehouses, setWarehouses] = useState<CityOrWarehouse[]>([]);

  const [lvivStreet, setLvivStreet] = useState('');
  const [lvivStreets, setLvivStreets] = useState<string[]>([]);

  useEffect(() => {
    if (deliveryMethod === 'Нова Пошта') {
      fetch('/api/novaposhta', {
        method: 'POST',
        body: JSON.stringify({
          modelName: 'Address',
          calledMethod: 'getCities'
        })
      })
        .then(res => res.json())
        .then(data => {
          if (data?.data) setCities(data.data);
        });

      setSelectedCity(null);
      setCityInput('');
      setSelectedWarehouse(null);
      setWarehouseInput('');
      setWarehouses([]);
    } else {
      setCities([]);
      setWarehouses([]);
      setSelectedCity(null);
      setSelectedWarehouse(null);
      setCityInput('');
      setWarehouseInput('');
    }
  }, [deliveryMethod, setSelectedCity, setSelectedWarehouse]);

  useEffect(() => {
    if (selectedCity) {
      fetch('/api/novaposhta', {
        method: 'POST',
        body: JSON.stringify({
          modelName: 'Address',
          calledMethod: 'getWarehouses',
          methodProperties: { CityRef: selectedCity.Ref }
        })
      })
        .then(res => res.json())
        .then(data => {
          if (data?.data) setWarehouses(data.data);
        });

      setSelectedWarehouse(null);
      setWarehouseInput('');
    } else {
      setWarehouses([]);
      setSelectedWarehouse(null);
      setWarehouseInput('');
    }
  }, [selectedCity, setSelectedWarehouse]);

  const filteredCities = cityInput
    ? cities.filter(city =>
        city.Description.replace(/\(.*?\)/g, '').toLowerCase().includes(cityInput.toLowerCase())
      )
    : [];

  const filteredWarehouses = warehouseInput
    ? warehouses.filter(wh =>
        wh.Description.toLowerCase().includes(warehouseInput.toLowerCase())
      )
    : [];

  const fetchLvivStreets = async (value: string) => {
    if (value.length < 2) return;

    try {
      const res = await fetch(`/api/photon/streets?street=${encodeURIComponent(value)}`);
      const data = await res.json();

      if (Array.isArray(data)) {
        const filtered = data.filter((street: string) =>
          street.toLowerCase().includes(value.toLowerCase())
        );
        setLvivStreets(filtered);
      }
    } catch (error) {
      console.error("Помилка при завантаженні вулиць:", error);
      setLvivStreets([]);
    }
  };

  const debouncedFetchLvivStreets = useCallback(debounce(fetchLvivStreets, 400), []);

  const handleLvivStreetInput = (value: string) => {
    setLvivStreet(value);
    setSelectedLvivStreet(null);
    if (value.length >= 2) {
      debouncedFetchLvivStreets(value);
    } else {
      setLvivStreets([]);
    }
  };

  const handleSubmit = () => {
    if (deliveryMethod === 'Нова Пошта' && (!selectedCity || !selectedWarehouse)) {
      alert('Будь ласка, оберіть місто та відділення.');
      return;
    }

    if (deliveryMethod === 'Доставка у Львові' && !selectedLvivStreet) {
      alert('Будь ласка, оберіть вулицю зі списку.');
      return;
    }

    onSubmit();
  };

  return (
    <div className="mt-6 text-slate-200 space-y-5">
      <p>Оберіть спосіб доставки:</p>

      <div className="flex flex-col gap-3">
        {options.map(option => (
          <label
            key={option.value}
            className={`cursor-pointer px-4 py-3 rounded-lg border ${
              deliveryMethod === option.value ? 'bg-emerald-700 border-emerald-500' : 'bg-slate-700 border-slate-600'
            }`}
          >
            <input
              type="radio"
              value={option.value}
              checked={deliveryMethod === option.value}
              onChange={() => setDeliveryMethod(option.value)}
              className="mr-2"
            />
            {option.label}
          </label>
        ))}
      </div>

      {deliveryMethod === 'Нова Пошта' && (
        <div className="space-y-3 mt-4 relative">
          <div className="relative">
            {cityInput && filteredCities.length > 0 && (
              <ul className="absolute z-10 bg-slate-700 w-full max-h-48 overflow-y-auto rounded-lg mb-1 border border-slate-600 top-auto bottom-full">
                {filteredCities.map(city => (
                  <li
                    key={city.Ref}
                    onClick={() => {
                      setSelectedCity(city);
                      setCityInput(city.Description);
                      setCities([]);
                    }}
                    className="px-4 py-2 cursor-pointer hover:bg-slate-600"
                  >
                    {city.Description}
                  </li>
                ))}
              </ul>
            )}
            <label className="block mb-1 text-sm">Населений пункт</label>
            <input
              type="text"
              value={cityInput}
              onChange={(e) => {
                setCityInput(e.target.value);
                setSelectedCity(null);
              }}
              placeholder="Введіть назву міста"
              className="w-full px-4 py-2 rounded-lg bg-slate-600 text-white border border-slate-500"
              autoComplete="off"
            />
          </div>

          <div className="relative">
            {warehouseInput && filteredWarehouses.length > 0 && (
              <ul className="absolute z-10 bg-slate-700 w-full max-h-48 overflow-y-auto rounded-lg mb-1 border border-slate-600 top-auto bottom-full">
                {filteredWarehouses.map(wh => (
                  <li
                    key={wh.Ref}
                    onClick={() => {
                      setSelectedWarehouse(wh);
                      setWarehouseInput(wh.Description);
                      setWarehouses([]);
                    }}
                    className="px-4 py-2 cursor-pointer hover:bg-slate-600"
                  >
                    {wh.Description}
                  </li>
                ))}
              </ul>
            )}
            <label className="block mb-1 text-sm">Номер відділення</label>
            <input
              type="text"
              value={warehouseInput}
              onChange={(e) => {
                setWarehouseInput(e.target.value);
                setSelectedWarehouse(null);
              }}
              placeholder="Введіть номер відділення"
              className="w-full px-4 py-2 rounded-lg bg-slate-600 text-white border border-slate-500"
              autoComplete="off"
              disabled={!selectedCity}
            />
          </div>
        </div>
      )}

      {deliveryMethod === 'Самовивіз' && (
        <div className="mt-4 text-sm text-slate-300">
          <p><strong>Адреса самовивозу:</strong></p>
          <p>м. Львів, вул. Перфецького 10, офіс 307</p>
        </div>
      )}

      {deliveryMethod === 'Доставка у Львові' && (
        <div className="mt-4 relative">
          <label className="block mb-1 text-sm">Вулиця у Львові</label>
          <input
            type="text"
            value={lvivStreet}
            onChange={(e) => handleLvivStreetInput(e.target.value)}
            placeholder="Введіть назву вулиці"
            className="w-full px-4 py-2 rounded-lg bg-slate-600 text-white border border-slate-500"
            autoComplete="off"
          />
          {lvivStreets.length > 0 && (
            <ul className="absolute z-10 bg-slate-700 w-full max-h-48 overflow-y-auto rounded-lg mb-1 border border-slate-600 top-auto bottom-full">
              {lvivStreets.map((street, index) => (
                <li
                  key={index}
                  onClick={() => {
                    setSelectedLvivStreet(street);
                    setLvivStreet(street);
                    setLvivStreets([]);
                  }}
                  className="px-4 py-2 cursor-pointer hover:bg-slate-600"
                >
                  {street}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex justify-between mt-6">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 bg-slate-700 rounded-lg hover:bg-slate-600"
        >
          <ArrowLeft className="inline mr-2" size={16} />
          Назад
        </button>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={
            (deliveryMethod === 'Нова Пошта' && (!selectedCity || !selectedWarehouse)) ||
            (deliveryMethod === 'Доставка у Львові' && !selectedLvivStreet) ||
            deliveryMethod === ''
          }
          className={`px-4 py-2 rounded-lg ${
            ((deliveryMethod === 'Нова Пошта' && (!selectedCity || !selectedWarehouse)) ||
            (deliveryMethod === 'Доставка у Львові' && !selectedLvivStreet) ||
            deliveryMethod === '') ? 'bg-slate-700 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'
          }`}
        >
          Підтвердити
          <Check className="inline ml-2" size={16} />
        </button>
      </div>
    </div>
  );
};

export default DeliveryMethod;
