import { getLocale } from "../i18n/core";

/** UI centimetres; geometry and the existing engineering export retain millimetres. */
export function cmValue(mm: number) { return Math.round(mm * 1000) / 10000; }
export function formatCm(mm: number) {
  return new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 4, useGrouping: false }).format(cmValue(mm));
}
export function dimensionFromCm(value: string) {
  if (!value.trim()) return "";
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? String(Math.round(n * 100000) / 10000) : value;
}
export function dimensionInCm(value: string) {
  return value.trim() && Number.isFinite(Number(value)) ? formatCm(Number(value)) : value;
}
export function heightPercent(mm: number, heightMm: number) { return heightMm > 0 ? mm / heightMm * 100 : 0; }
export function formatPercent(mm: number, heightMm: number) {
  return new Intl.NumberFormat(getLocale(), {maximumFractionDigits: 2, useGrouping: false}).format(heightPercent(mm,heightMm));
}
export function formatLevel(mm: number, heightMm: number) { return `${formatCm(mm)} cm · ${formatPercent(mm,heightMm)} %`; }
export function dimensionFromPercent(value: string, heightMm: number) {
  if(!value.trim()) return "";
  const n=Number(value.replace(",","."));
  return Number.isFinite(n) ? String(Math.round(n*heightMm*100)/10000) : value;
}
