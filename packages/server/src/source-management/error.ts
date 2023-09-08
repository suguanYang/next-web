import { ErrorPayload } from 'vite';

const errors: Map<string, ErrorPayload['err']> = new Map();

export const setError = (id: string, msg: ErrorPayload['err']) => {
  errors.set(id, msg);
};

export const consumeError = (id: string) => {
  const err = errors.get(id);
  err && errors.delete(id);
  return err;
};
