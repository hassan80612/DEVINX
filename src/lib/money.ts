export type CurrencyCode = 'BRL' | 'USD' | 'EUR' | string;

export function toMinorUnits(value: number): number {
  return Math.round(value * 100);
}

export function fromMinorUnits(value: number): number {
  return value / 100;
}

export function formatMoney(minorUnits: number, locale = 'pt-BR', currency: CurrencyCode = 'BRL'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(fromMinorUnits(minorUnits));
}
