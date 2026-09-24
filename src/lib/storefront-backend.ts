const DEFAULT_STORE_BACKEND_ORIGIN = "https://www.vetorizeai.com.br";

export function storeBackendOrigin() {
  return String(process.env.STORE_BACKEND_ORIGIN || DEFAULT_STORE_BACKEND_ORIGIN).replace(/\/$/, "");
}

export async function fetchPublicStorefront(slug: string) {
  const normalized = String(slug || "").trim().toLowerCase();
  if (!normalized) return null;
  const response = await fetch(`${storeBackendOrigin()}/api/public-storefront/${encodeURIComponent(normalized)}`, {
    cache: "force-cache",
    next: { revalidate: 30 },
    signal: AbortSignal.timeout(8_000),
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


export async function fetchPublicStorePlans() {
  const response = await fetch(`${storeBackendOrigin()}/api/public-store-plans`, {
    cache: "force-cache",
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(8_000),
    headers: { "Accept": "application/json" }
  });
  if (!response.ok) throw new Error(`store_plans_backend_${response.status}`);
  return response.json() as Promise<{
    schema_version: number;
    plans: Array<{
      id: string;
      name: string;
      priceCents: number;
      products: number;
      photos: number;
      photosPerProduct: number;
      links: number;
      videos: number;
      collaborators: number;
      whatsappContacts: number;
    }>;
  }>;
}
