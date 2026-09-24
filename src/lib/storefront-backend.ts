const DEFAULT_STORE_BACKEND_ORIGIN = "https://www.vetorizeai.com.br";

export function storeBackendOrigin() {
  return String(process.env.STORE_BACKEND_ORIGIN || DEFAULT_STORE_BACKEND_ORIGIN).replace(/\/$/, "");
}

export async function fetchPublicStorefront(slug: string) {
  const normalized = String(slug || "").trim().toLowerCase();
  if (!normalized) return null;
  const response = await fetch(`${storeBackendOrigin()}/api/public-storefront/${encodeURIComponent(normalized)}`, {
    cache: "no-store",
    headers: { "Accept": "application/json" }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`storefront_backend_${response.status}`);
  return response.json();
}

export async function proxyStorefrontRequest(path: string, init?: RequestInit) {
  const response = await fetch(`${storeBackendOrigin()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Accept": "application/json",
      ...(init?.headers || {})
    }
  });
  const body = await response.arrayBuffer();
  return new Response(body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") || "application/json",
      "Cache-Control": response.headers.get("cache-control") || "no-store"
    }
  });
}
