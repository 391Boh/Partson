type AnyVoidFunction<Args extends unknown[] = unknown[]> = (...args: Args) => void;

export type Debounced<T extends AnyVoidFunction> = ((...args: Parameters<T>) => void) & {
  cancel: () => void;
};

export function debounce<T extends AnyVoidFunction>(
  fn: T,
  wait: number
): Debounced<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = ((...args: Parameters<T>) => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      fn(...args);
    }, wait);
  }) as Debounced<T>;

  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}
