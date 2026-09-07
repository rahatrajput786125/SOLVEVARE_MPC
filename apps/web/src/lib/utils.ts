import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// ShadCN's cn() utility — merges Tailwind classes safely
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format large numbers: 1234567 → "1.2M"
export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

// Format USD cost: 0.00123 → "$0.001"
export function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

// SEO score → color class
export function scoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  if (score >= 40) return "text-orange-500";
  return "text-red-500";
}

// SEO score → badge variant
export function scoreBadge(score: number): "default" | "secondary" | "destructive" | "outline" {
  if (score >= 80) return "default";
  if (score >= 60) return "secondary";
  return "destructive";
}

// Truncate string
export function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

// Page status → badge color
export function statusColor(status: string): string {
  const map: Record<string, string> = {
    PUBLISHED: "bg-green-100 text-green-800",
    GENERATED: "bg-blue-100 text-blue-800",
    GENERATING: "bg-yellow-100 text-yellow-800",
    PUBLISHING: "bg-purple-100 text-purple-800",
    DRAFT: "bg-gray-100 text-gray-800",
    FAILED: "bg-red-100 text-red-800",
    ARCHIVED: "bg-gray-100 text-gray-500",
  };
  return map[status] ?? "bg-gray-100 text-gray-800";
}
