import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { installIntersectionObserverMock, resetIntersectionObserverMock } from './intersection-observer.mock';

installIntersectionObserverMock();
beforeEach(resetIntersectionObserverMock);
afterEach(cleanup);

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }),
});
Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: () => {} });
