import React from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button = ({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) => {
  const variants = {
    primary: "bg-primary dark:bg-white text-white dark:text-black hover:opacity-90 shadow-[0_0_20px_rgba(196,110,86,0.15)] dark:shadow-[0_0_20px_rgba(255,255,255,0.1)]",
    secondary: "bg-surface-container-high dark:bg-zinc-900 text-on-surface dark:text-zinc-300 hover:bg-surface-variant dark:hover:bg-zinc-800 border border-outline-variant/50",
    outline: "bg-transparent border border-outline-variant/50 text-on-surface dark:text-zinc-300 hover:bg-surface-container-low dark:hover:bg-zinc-900",
    ghost: "bg-transparent text-on-surface-variant dark:text-zinc-400 hover:text-primary dark:hover:text-white hover:bg-primary/5",
  };

  const sizes = {
    sm: "px-4 py-1.5 text-xs font-mono uppercase tracking-widest",
    md: "px-6 py-2.5 text-sm font-medium",
    lg: "px-10 py-3.5 text-base font-medium",
  };

  return (
    <button
      className={cn(
        "rounded-xl transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
};
