import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

const isBrowser = typeof window !== 'undefined';

const resolveInitialValue = <T,>(initialValue: T | (() => T)): T =>
  typeof initialValue === 'function'
    ? (initialValue as () => T)()
    : initialValue;

export interface UsePersistentStateOptions<T> {
  /**
   * Optional serializer for persisting complex values. Defaults to JSON.stringify
   */
  serialize?: (value: T) => string;
  /**
   * Optional parser for restoring values. Defaults to JSON.parse
   */
  deserialize?: (value: string) => T;
  /**
   * Storage implementation. Defaults to window.localStorage when available.
   */
  storage?: Storage;
}

/**
 * A small helper around useState that keeps the state in sync with localStorage.
 * It gracefully handles server-side rendering and JSON parse failures.
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T | (() => T),
  options: UsePersistentStateOptions<T> = {}
): readonly [T, Dispatch<SetStateAction<T>>, () => void] {
  const { storage = isBrowser ? window.localStorage : undefined, serialize, deserialize } = options;

  const parse = useCallback(
    (raw: string): T => {
      if (deserialize) {
        return deserialize(raw);
      }
      return JSON.parse(raw) as T;
    },
    [deserialize]
  );

  const stringify = useCallback(
    (value: T): string => {
      if (serialize) {
        return serialize(value);
      }
      return JSON.stringify(value);
    },
    [serialize]
  );

  const initialRef = useRef<T>();
  if (initialRef.current === undefined) {
    if (storage) {
      try {
        const storedValue = storage.getItem(key);
        if (storedValue !== null) {
          initialRef.current = parse(storedValue);
        }
      } catch (error) {
        console.warn(`Failed to read persistent state for key "${key}"`, error);
      }
    }

    if (initialRef.current === undefined) {
      initialRef.current = resolveInitialValue(initialValue);
    }
  }

  const [state, setState] = useState<T>(initialRef.current as T);

  useEffect(() => {
    if (!storage) return;

    try {
      storage.setItem(key, stringify(state));
    } catch (error) {
      console.warn(`Failed to write persistent state for key "${key}"`, error);
    }
  }, [key, state, storage, stringify]);

  const reset = useCallback(() => {
    const nextValue = resolveInitialValue(initialValue);
    setState(nextValue);
    if (!storage) return;
    try {
      storage.setItem(key, stringify(nextValue));
    } catch (error) {
      console.warn(`Failed to reset persistent state for key "${key}"`, error);
    }
  }, [initialValue, key, storage, stringify]);

  return [state, setState, reset] as const;
}
