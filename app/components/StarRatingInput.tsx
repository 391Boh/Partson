"use client";

import { Star } from "lucide-react";
import { useState } from "react";

interface StarRatingInputProps {
  value: number;
  onChange: (value: number) => void;
  size?: number;
  disabled?: boolean;
}

export default function StarRatingInput({
  value,
  onChange,
  size = 28,
  disabled = false,
}: StarRatingInputProps) {
  const [hovered, setHovered] = useState(0);
  const active = hovered || value;

  return (
    <div
      className="flex items-center gap-1"
      role="radiogroup"
      aria-label="Оцінка від 1 до 5 зірок"
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} ${star === 1 ? "зірка" : star < 5 ? "зірки" : "зірок"}`}
          disabled={disabled}
          onMouseEnter={() => !disabled && setHovered(star)}
          onMouseLeave={() => !disabled && setHovered(0)}
          onClick={() => !disabled && onChange(star)}
          className="rounded p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:cursor-not-allowed"
        >
          <Star
            size={size}
            className={`transition-colors duration-100 ${
              star <= active
                ? "fill-amber-400 text-amber-400"
                : "fill-transparent text-slate-300"
            } ${disabled ? "opacity-60" : ""}`}
          />
        </button>
      ))}
    </div>
  );
}
