import { Decimal } from './number.js';

export function money(value: number | string) {
  return Math.round(Number(value) * 100) / 100;
}

export function converted(amount: number | string, rate: number | string) {
  return money(Number(amount) * Number(rate));
}

export function splitEqual(total: number, count: number) {
  const base = Math.floor((total * 100) / count) / 100;
  const values = Array.from({ length: count }, () => base);
  let remainder = Math.round((total - base * count) * 100);
  for (let i = 0; i < values.length && remainder > 0; i++, remainder--) values[i] = money(values[i] + 0.01);
  return values;
}

export function reconcile(total: number, values: number[]) {
  const diff = money(total - values.reduce((sum, value) => money(sum + value), 0));
  if (values.length && diff !== 0) values[0] = money(values[0] + diff);
  return values;
}

