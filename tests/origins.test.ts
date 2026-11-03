import { expect, it } from 'vitest';
import { allowedOrigins } from '../apps/api/src/origins.js';

it('accepts both local frontend addresses in development', () => {
  for (const configured of ['http://localhost:5173', 'http://127.0.0.1:5173']) {
    expect(allowedOrigins(configured, 'development')).toEqual(
      new Set(['http://localhost:5173', 'http://127.0.0.1:5173']),
    );
  }
});
it('keeps other ports, schemes and hosts rejected', () => {
  const origins = allowedOrigins('http://localhost:5173', 'development');
  for (const origin of [
    'http://localhost:5174',
    'http://127.0.0.1:4000',
    'https://localhost:5173',
    'http://localhost.evil.test:5173',
    'null',
    '',
  ]) {
    expect(origins.has(origin)).toBe(false);
  }
});
it.each(['production', 'test'])('keeps %s restricted to the configured origin', (mode) => {
  expect(allowedOrigins('https://localhost:5173', mode)).toEqual(
    new Set(['https://localhost:5173']),
  );
});
it('does not add local aliases to a remote development origin', () => {
  expect(allowedOrigins('https://forms.example.com', 'development')).toEqual(
    new Set(['https://forms.example.com']),
  );
});
