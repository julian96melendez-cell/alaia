export type ShippingAddress = {
  fullName: string; phone: string; street: string; city: string; state: string; zip: string;
};
export type CheckoutPricing = { subtotal: number; tax: number; shipping: number; discount: number; total: number };
export type CheckoutPayment = { clientSecret: string; ordenId: string; pricing: CheckoutPricing };
export class CheckoutError extends Error {
  constructor(public code: string, message: string, public orderId?: string) { super(message); }
}
export function validateShippingAddress(address: ShippingAddress): ShippingAddress {
  const cleaned = {} as ShippingAddress;
  for (const field of ['fullName', 'phone', 'street', 'city', 'state', 'zip'] as const) {
    const value = typeof address?.[field] === 'string' ? address[field].trim() : '';
    if (!value || value.length > 200) throw new CheckoutError('ADDRESS', 'Completa una dirección de entrega válida.');
    cleaned[field] = value;
  }
  return cleaned;
}
export function pricingChanged(a: CheckoutPricing, b: CheckoutPricing): boolean {
  return (Object.keys(a) as (keyof CheckoutPricing)[]).some(key => Math.round(a[key] * 100) !== Math.round(b[key] * 100));
}
export function normalizeCheckoutInput(input: { items: { producto: string; cantidad: number }[]; couponCode: string; shippingAddress: ShippingAddress }) {
  const shippingAddress = validateShippingAddress(input.shippingAddress);
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 100 || input.items.some(item => !/^[a-f\d]{24}$/i.test(item.producto) || !Number.isSafeInteger(item.cantidad) || item.cantidad < 1 || item.cantidad > 100)) {
    throw new CheckoutError('PRODUCT', 'Revisa los productos y cantidades del carrito.');
  }
  const combined = new Map<string, number>();
  for (const item of input.items) {
    const id = item.producto.toLowerCase();
    const quantity = (combined.get(id) || 0) + item.cantidad;
    if (quantity > 100) throw new CheckoutError('PRODUCT', 'Revisa las cantidades del carrito.');
    combined.set(id, quantity);
  }
  return { items: [...combined].sort(([a], [b]) => a.localeCompare(b)).map(([producto, cantidad]) => ({ producto, cantidad })), couponCode: input.couponCode.trim().toUpperCase(), shippingAddress };
}
export async function requestCheckout(
  user: { uid: string; getIdToken(forceRefresh?: boolean): Promise<string> } | null,
  url: string,
  input: { items: { producto: string; cantidad: number }[]; couponCode: string; shippingAddress: ShippingAddress; idempotencyKey: string },
  fetcher: typeof fetch = fetch,
): Promise<CheckoutPayment> {
  if (!user) throw new CheckoutError('SESSION', 'Inicia sesión de nuevo para continuar.');
  const normalized = normalizeCheckoutInput(input);
  if (!/^[a-zA-Z0-9_-]{20,128}$/.test(input.idempotencyKey || '')) throw new CheckoutError('INTENT_KEY', 'No se pudo recuperar la intención de compra.');
  let token: string;
  try { token = await user.getIdToken(true); } catch { throw new CheckoutError('SESSION', 'Tu sesión expiró. Inicia sesión de nuevo.'); }
  if (!token) throw new CheckoutError('SESSION', 'Inicia sesión de nuevo para continuar.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let response: Response;
  try {
    response = await fetcher(url, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': input.idempotencyKey },
      body: JSON.stringify(normalized),
    });
  } catch { throw new CheckoutError('NETWORK', 'No pudimos contactar al backend. No reintentes un pago sin revisar tus órdenes.'); }
  finally { clearTimeout(timeout); }
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const message = String(json?.message || '').toLowerCase();
    const intentErrors: Record<string, string> = {
      INTENT_PAYLOAD_CONFLICT: 'La compra preparada contiene otros datos. Cancela definitivamente esa intención antes de cambiar productos, dirección o cupón.',
      INTENT_CONFLICT: 'La intención está en conflicto. Consulta su estado antes de volver a pagar.',
      INTENT_PENDING: 'La intención sigue preparándose. Puedes reintentar con la misma intención.',
      INTENT_EXPIRED: 'La reserva expiró. Consulta su estado o cancela definitivamente la intención.',
      INTENT_TERMINAL: 'La intención terminó. Consulta la orden antes de iniciar una compra nueva.',
      PAYMENT_VERIFYING: 'Pago recibido / verificando. Consulta el seguimiento.',
      INTENT_KEY: 'No se pudo recuperar la intención de compra.',
    };
    if (Object.hasOwn(intentErrors, String(json?.code))) throw new CheckoutError(json.code, intentErrors[json.code]);
    if (json?.code === 'STRIPE_ERROR') throw new CheckoutError('STRIPE', 'Stripe no pudo preparar el pago. Revisa tus órdenes antes de reintentar.');
    if (response.status === 401 || response.status === 403) throw new CheckoutError('SESSION', 'Tu sesión expiró. Inicia sesión de nuevo.');
    if (response.status === 404) throw new CheckoutError('PRODUCT', 'Un producto ya no está disponible. Revisa el carrito.');
    if (response.status === 409) throw new CheckoutError('STOCK', 'No hay stock suficiente. Revisa las cantidades.');
    if (message.includes('cupón')) throw new CheckoutError('COUPON', 'El cupón no es válido o no cumple sus condiciones.');
    if (message.includes('dirección')) throw new CheckoutError('ADDRESS', 'Revisa la dirección de entrega.');
    if (response.status === 400) throw new CheckoutError('PRODUCT', 'Revisa los productos, cantidades y datos del checkout.');
    throw new CheckoutError('SERVER', 'No se pudo preparar el pago. Intenta más tarde.');
  }
  const data = json?.data || json;
  const pricing = data?.pricing;
  const ordenId = data?.ordenId;
  if (!json?.ok || !/^[a-f\d]{24}$/i.test(ordenId || '') || typeof data?.clientSecret !== 'string' || !data.clientSecret || !pricing || ['subtotal', 'tax', 'shipping', 'discount', 'total'].some(key => typeof pricing[key] !== 'number' || !Number.isFinite(pricing[key]) || pricing[key] < 0) || pricing.total <= 0) {
    throw new CheckoutError('RESPONSE', 'El backend no pudo preparar una orden válida. Revisa tus órdenes antes de reintentar.');
  }
  return { clientSecret: data.clientSecret, ordenId, pricing };
}

export type CheckoutIntentView = { order: { _id: string; estadoPago: string }; reservationState: string; needsReconciliation: boolean };
export async function manageCheckoutIntent(
  user: { getIdToken(forceRefresh?: boolean): Promise<string> } | null,
  url: string, key: string, cancel = false, fetcher: typeof fetch = fetch,
): Promise<CheckoutIntentView | null> {
  if (!user) throw new CheckoutError('SESSION', 'Inicia sesión de nuevo.');
  let token: string;
  try { token = await user.getIdToken(true); } catch { throw new CheckoutError('SESSION', 'Tu sesión expiró.'); }
  if (!token) throw new CheckoutError('SESSION', 'Tu sesión expiró.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let response: Response;
  try { response = await fetcher(url, { method: cancel ? 'POST' : 'GET', signal: controller.signal, headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': key } }); }
  catch { throw new CheckoutError('NETWORK', 'No pudimos recuperar la intención. Se conserva su clave para reintentar.'); }
  finally { clearTimeout(timeout); }
  if (response.status === 404) return null;
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok || !/^[a-f\d]{24}$/i.test(json?.data?.order?._id || '')) throw new CheckoutError('INTENT_PENDING', 'La intención requiere verificación. Reintenta sin crear una nueva compra.');
  return json.data;
}
