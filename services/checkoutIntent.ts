// Persist only an opaque key, payload digest and local submission flag; never tokens,
// addresses, Stripe credentials or customer/payment identifiers.
export type StoredCheckoutIntent = { key: string; fingerprint: string; submitted: boolean };
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> };
export function createCheckoutIntentStore(storage: Storage, randomKey: () => string, digest: (payload: string) => Promise<string>) {
  let queue: Promise<unknown> = Promise.resolve();
  const storageKey = (uid: string) => `alaia.checkout-intent.v1:${uid}`;
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const result = queue.then(fn); queue = result.catch(() => {}); return result;
  }
  async function load(uid: string): Promise<StoredCheckoutIntent | null> {
    const raw = await storage.getItem(storageKey(uid));
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!/^[a-zA-Z0-9_-]{20,128}$/.test(value?.key || '') || typeof value.fingerprint !== 'string') throw new Error('Intención local inválida; revisa el historial antes de pagar.');
    return value;
  }
  return {
    load,
    get: (uid: string, normalizedPayload: unknown) => serial(async () => {
      const fingerprint = await digest(JSON.stringify(normalizedPayload));
      const previous = await load(uid);
      // Payload edits keep the key: Mongo rejects changes to a bound intention. Only
      // an explicitly finalized/canceled intention can get a fresh key.
      const intent = previous ? { ...previous, fingerprint: previous.submitted ? previous.fingerprint : fingerprint } : { key: randomKey(), fingerprint, submitted: false };
      await storage.setItem(storageKey(uid), JSON.stringify(intent));
      return { ...intent, matchesPayload: !previous || previous.fingerprint === fingerprint };
    }),
    submitted: (uid: string, key: string) => serial(async () => {
      const intent = await load(uid);
      if (intent?.key === key) await storage.setItem(storageKey(uid), JSON.stringify({ ...intent, submitted: true }));
    }),
    complete: (uid: string, key: string) => serial(async () => {
      if ((await load(uid))?.key === key) await storage.removeItem(storageKey(uid));
    }),
  };
}
