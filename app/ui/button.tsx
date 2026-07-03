"use client";

import type { ComponentProps } from "react";

type Variant = "outline" | "solid" | "destructive";

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-full transition-colors disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  outline: "border border-white/25 bg-transparent text-white hover:bg-white/10",
  solid: "bg-white text-black border border-white hover:bg-white/90",
  destructive:
    "border border-red-500/40 bg-transparent text-red-400 hover:bg-red-500/10",
};

type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  loading?: boolean;
};

export function Button({
  variant = "outline",
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${className ?? ""}`}
    >
      {loading ? (
        <svg
          className="animate-spin"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="3"
            strokeOpacity="0.25"
          />
          <path
            d="M21 12a9 9 0 0 0-9-9"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      ) : null}
      {children}
    </button>
  );
}
