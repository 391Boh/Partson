'use client';

import { ArrowLeft, Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

// Debounce function
function debounce<TArgs extends unknown[]>(func: (...args: TArgs) => void, delay: number) {
  let timer: NodeJS.Timeout;
  return (...args: TArgs) => {
    clearTimeout(timer);
    timer = setTimeout(() => func(...args), delay);
  };
}

interface CityOrWarehouse {
  Description: string;
  Ref: string;
}

export type DeliveryMethodValue =
  | 'Нова Пошта'
  | 'Самовивіз'
  | 'Доставка у Львові'
  | '';

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
    if (deliveryMethod !== 'Нова Пошта') return;

    let isCancelled = false;

    fetch('/api/novaposhta', {
      method: 'POST',
      body: JSON.stringify({
        modelName: 'Address',
        calledMethod: 'getCities'
      })
    })
      .then(res => res.json())
      .then(data => {
        if (!isCancelled && data?.data) {
          setCities(data.data);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [deliveryMethod]);

  useEffect(() => {
    if (!selectedCity) return;

    let isCancelled = false;

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
        if (!isCancelled && data?.data) {
          setWarehouses(data.data);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedCity]);

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

  const debouncedFetchLvivStreets = useMemo(
    () =>
      debounce((value: string) => {
        void fetchLvivStreets(value);
      }, 400),
    []
  );

  const handleDeliveryMethodChange = (
    method: 'Нова Пошта' | 'Самовивіз' | 'Доставка у Львові'
  ) => {
    setDeliveryMethod(method);
    setSelectedCity(null);
    setCityInput('');
    setCities([]);
    setSelectedWarehouse(null);
    setWarehouseInput('');
    setWarehouses([]);
    setSelectedLvivStreet(null);
    setLvivStreet('');
    setLvivStreets([]);
  };

  const handleCityInputChange = (value: string) => {
    setCityInput(value);
    setSelectedCity(null);
    setSelectedWarehouse(null);
    setWarehouseInput('');
    setWarehouses([]);
  };

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
    <div className="mt-5 space-y-4 text-slate-700">
      <p>Оберіть спосіб доставки:</p>

      <div className="flex flex-col gap-3">
        {options.map(option => (
          <label
            key={option.value}
            className={`cursor-pointer rounded-[16px] border px-3.5 py-2.5 transition ${
              deliveryMethod === option.value
                ? 'soft-segment soft-segment--active'
                : 'soft-surface-card text-slate-700 hover:bg-white/70'
            }`}
          >
            <input
              type="radio"
              value={option.value}
              checked={deliveryMethod === option.value}
              onChange={() => handleDeliveryMethodChange(option.value)}
              className="mr-2"
            />
            {option.label}
          </label>
        ))}
      </div>

      {deliveryMethod === 'Нова Пошта' && (
        <div className="relative mt-3.5 space-y-3">
          <div className="relative">
            {cityInput && filteredCities.length > 0 && (
              <ul className="soft-surface-card absolute bottom-full top-auto z-10 mb-1 max-h-48 w-full overflow-y-auto rounded-[16px]">
                {filteredCities.map(city => (
                  <li
                    key={city.Ref}
                    onClick={() => {
                      setSelectedCity(city);
                      setCityInput(city.Description);
                      setSelectedWarehouse(null);
                      setWarehouseInput('');
                      setWarehouses([]);
                      setCities([]);
                    }}
                    className="cursor-pointer px-4 py-2 text-slate-700 hover:bg-sky-50"
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
              onChange={(e) => handleCityInputChange(e.target.value)}
              placeholder="Введіть назву міста"
              className="soft-field px-4 py-2.5"
              autoComplete="off"
            />
          </div>

          <div className="relative">
            {warehouseInput && filteredWarehouses.length > 0 && (
              <ul className="soft-surface-card absolute bottom-full top-auto z-10 mb-1 max-h-48 w-full overflow-y-auto rounded-[16px]">
                {filteredWarehouses.map(wh => (
                  <li
                    key={wh.Ref}
                    onClick={() => {
                      setSelectedWarehouse(wh);
                      setWarehouseInput(wh.Description);
                      setWarehouses([]);
                    }}
                    className="cursor-pointer px-4 py-2 text-slate-700 hover:bg-sky-50"
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
              className="soft-field px-4 py-2.5 disabled:bg-slate-100 disabled:text-slate-400"
              autoComplete="off"
              disabled={!selectedCity}
            />
          </div>
        </div>
      )}

      {deliveryMethod === 'Самовивіз' && (
        <div className="soft-surface-card mt-3.5 rounded-[16px] p-3.5 text-sm text-slate-600">
          <p><strong>Адреса самовивозу:</strong></p>
           <p>м. Львів, вул. Перфецького, 8</p>
        </div>
      )}

      {deliveryMethod === 'Доставка у Львові' && (
        <div className="relative mt-3.5">
          <label className="block mb-1 text-sm">Вулиця у Львові</label>
          <input
            type="text"
            value={lvivStreet}
            onChange={(e) => handleLvivStreetInput(e.target.value)}
            placeholder="Введіть назву вулиці"
            className="soft-field px-4 py-2.5"
            autoComplete="off"
          />
          {lvivStreets.length > 0 && (
            <ul className="soft-surface-card absolute bottom-full top-auto z-10 mb-1 max-h-48 w-full overflow-y-auto rounded-[16px]">
              {lvivStreets.map((street, index) => (
                <li
                  key={index}
                  onClick={() => {
                    setSelectedLvivStreet(street);
                    setLvivStreet(street);
                    setLvivStreets([]);
                  }}
                  className="cursor-pointer px-4 py-2 text-slate-700 hover:bg-sky-50"
                >
                  {street}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-5 flex justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="soft-secondary-button px-4 py-2.5 text-sm font-medium"
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
          className={`px-4 py-2.5 text-sm font-medium ${
            ((deliveryMethod === 'Нова Пошта' && (!selectedCity || !selectedWarehouse)) ||
            (deliveryMethod === 'Доставка у Львові' && !selectedLvivStreet) ||
            deliveryMethod === '') ? 'soft-primary-button cursor-not-allowed opacity-60' : 'soft-primary-button'
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
