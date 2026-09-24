"use client";

import { useEffect, useMemo, useState } from "react";
import { productPersonalizationOptions } from "@/lib/store-personalization";

const money = (c) => (Number(c || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const field = { width: "100%", border: "1px solid rgba(242,203,98,.22)", borderRadius: 10, background: "#101615", color: "#f5f3ed", padding: "10px 11px", outline: "none" };

export function StorefrontPersonalizationPreview({ config, productPersonalization, productPriceCents = 0, onSelectionChange }) {
  const [selected, setSelected] = useState("");
  const options = useMemo(() => productPersonalizationOptions(config, productPersonalization), [config, productPersonalization]);
  useEffect(() => {
    if (selected && !options.some((x) => x.id === selected)) {
      setSelected("");
      onSelectionChange?.(null);
    }
  }, [options, selected, onSelectionChange]);
  if (!options.length) return null;
  const chosen = options.find((x) => x.id === selected);
  return <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800, marginTop: 9 }}>
    Personalização da gravação
    <select value={selected} onChange={(e) => {
      const x = options.find((v) => v.id === e.target.value) || null;
      setSelected(e.target.value);
      onSelectionChange?.(x ? { id: x.id, label: x.label, price_cents: Number(x.price || 0) } : null);
    }} style={field}>
      <option value="">Sem personalização</option>
      {options.map((x) => <option key={x.id} value={x.id}>{x.label} · +{money(x.price)}</option>)}
    </select>
    {chosen && <small style={{ opacity: .65 }}>Total por unidade: {money(Number(productPriceCents || 0) + Number(chosen.price || 0))}</small>}
  </label>;
}
