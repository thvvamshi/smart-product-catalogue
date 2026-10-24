type ObserverRecord = {
  observer: MockIntersectionObserver;
  callback: IntersectionObserverCallback;
};

let records: ObserverRecord[] = [];

export class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly thresholds: readonly number[];
  readonly targets = new Set<Element>();

  constructor(
    private readonly callback: IntersectionObserverCallback,
    options: IntersectionObserverInit = {},
  ) {
    this.root = options.root ?? null;
    this.rootMargin = options.rootMargin ?? "0px";
    this.thresholds = Array.isArray(options.threshold)
      ? [...options.threshold]
      : [options.threshold ?? 0];
    records.push({ observer: this, callback });
  }

  observe(target: Element) {
    this.targets.add(target);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
  }

  disconnect() {
    this.targets.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

export function installIntersectionObserverMock() {
  Object.defineProperty(globalThis, "IntersectionObserver", {
    configurable: true,
    writable: true,
    value: MockIntersectionObserver,
  });
}

export function resetIntersectionObserverMock() {
  records = [];
}

export function getLastIntersectionObserver(): MockIntersectionObserver {
  const record = records.at(-1);
  if (!record) throw new Error("No IntersectionObserver has been created");
  return record.observer;
}

export function triggerIntersection(isIntersecting = true) {
  const record = records.at(-1);
  if (!record) throw new Error("No IntersectionObserver has been created");
  const target = record.observer.targets.values().next().value as Element | undefined;
  if (!target) throw new Error("The IntersectionObserver is not observing a target");
  const entry = {
    target,
    isIntersecting,
    intersectionRatio: isIntersecting ? 1 : 0,
    boundingClientRect: target.getBoundingClientRect(),
    intersectionRect: target.getBoundingClientRect(),
    rootBounds: null,
    time: 0,
  } as IntersectionObserverEntry;
  record.callback([entry], record.observer);
}
