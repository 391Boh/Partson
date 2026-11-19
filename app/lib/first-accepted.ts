// Resolve with the first accepted result in priority order, without waiting
// for the slower lookups behind it.
//
// Same answer as `for (const v of await Promise.all(tasks)) if (accept(v)) …`:
// task i wins only once every task before it has settled without an accepted
// result. But it returns as soon as that prefix is known, so one slow 1C
// lookup (up to its timeout) no longer holds back a match that already
// arrived. A rejected task, or an `accept` that throws, counts as "no match".
export function firstAcceptedInOrder<T, R>(
  tasks: ReadonlyArray<Promise<T>>,
  accept: (value: T) => R | null | undefined,
): Promise<R | null> {
  if (tasks.length === 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    const done: boolean[] = tasks.map(() => false);
    const values: Array<R | null> = tasks.map(() => null);
    let next = 0;
    let finished = false;
    const advance = () => {
      while (next < tasks.length && done[next]) {
        if (values[next] != null) {
          finished = true;
          resolve(values[next]);
          return;
        }
        next += 1;
      }
      if (next >= tasks.length) {
        finished = true;
        resolve(null);
      }
    };
    tasks.forEach((task, index) => {
      Promise.resolve(task)
        .then((value) => {
          try {
            return accept(value) ?? null;
          } catch {
            return null;
          }
        }, () => null)
        .then((value) => {
          done[index] = true;
          values[index] = value;
          if (!finished) advance();
        });
    });
  });
}
