export type ShippingAddress = {
  fullName: string; phone: string; street: string; city: string; state: string; zip: string;
};
export type CheckoutPricing = { subtotal: number; tax: number; shipping: number; discount: number; total: number };
export type CheckoutPayment = { clientSecret: string; ordenId: string; pricing: CheckoutPricing };
export class CheckoutError extends Error {
  constructor(public code: string, message: string) { super(message); }
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
export async function requestCheckout(
  user: { uid: string; getIdToken(forceRefresh?: boolean): Promise<string> } | null,
  url: string,
  input: { items: { producto: string; cantidad: number }[]; couponCode: string; shippingAddress: ShippingAddress },
  fetcher: typeof fetch = fetch,
): Promise<CheckoutPayment> {
  if (!user) throw new CheckoutError('SESSION', 'Inicia sesión de nuevo para continuar.');
  const shippingAddress = validateShippingAddress(input.shippingAddress);
  if (!input.items.length || input.items.some(item => !/^[a-f\d]{24}$/i.test(item.producto) || !Number.isSafeInteger(item.cantidad) || item.cantidad < 1 || item.cantidad > 100)) {
    throw new CheckoutError('PRODUCT', 'Revisa los productos y cantidades del carrito.');
  }
  let token: string;
  try { token = await user.getIdToken(true); } catch { throw new CheckoutError('SESSION', 'Tu sesión expiró. Inicia sesión de nuevo.'); }
  if (!token) throw new CheckoutError('SESSION', 'Inicia sesión de nuevo para continuar.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let response: Response;
  try {
    response = await fetcher(url, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ items: input.items.map(({ producto, cantidad }) => ({ producto, cantidad })), couponCode: input.couponCode.trim(), shippingAddress }),
    });
  } catch { throw new CheckoutError('NETWORK', 'No pudimos contactar al backend. No reintentes un pago sin revisar tus órdenes.'); }
  finally { clearTimeout(timeout); }
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const message = String(json?.message || '').toLowerCase();
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
