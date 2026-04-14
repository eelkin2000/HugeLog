import type { WeightUnit } from './constants';

/**
 * Format weight with unit suffix.
 */
export function formatWeight(value: number, unit: WeightUnit = 'lb'): string {
  if (value % 1 === 0) return `${value} ${unit}`;
  return `${value.toFixed(1)} ${unit}`;
}

/**
 * Format duration in seconds to "1h 23m" or "45m" or "23m 15s".
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) return `${h}h ${m}m`;
  if (m > 0 && s > 0) return `${m}m ${s}s`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/**
 * Format a large number with commas: 12345 -> "12,345".
 */
export function formatNumber(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * Format a date to a short display string: "Apr 12" or "Apr 12, 2025".
 */
export function formatDate(dateStr: string, includeYear = false): string {
  const d = new Date(dateStr);
  const month = d.toLocaleString('en-US', { month: 'short' });
  const day = d.getDate();
  if (includeYear) return `${month} ${day}, ${d.getFullYear()}`;
  return `${month} ${day}`;
}

/**
 * Format time of day: "2:30 PM".
 */
export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Format reps target: could be "5" or "8-12".
 */
export function formatRepsTarget(target: string): string {
  return target;
}

/**
 * Format volume: "12,450 lb".
 */
export function formatVolume(volume: number, unit: WeightUnit = 'lb'): string {
  return `${formatNumber(Math.round(volume))} ${unit}`;
}
