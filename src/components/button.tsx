import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const base =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40";

export const buttonClass = {
  primary: cn(base, "btn-grad text-white transition-opacity duration-150 hover:opacity-95"),
  ghost: cn(
    base,
    "border border-line bg-white text-ink transition-colors duration-150 hover:border-tide",
  ),
  danger: cn(
    base,
    "border border-line bg-white text-danger transition-colors duration-150 hover:border-danger",
  ),
};

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof buttonClass }) {
  return <button type={type} className={cn(buttonClass[variant], className)} {...props} />;
}

export const fieldClass =
  "h-12 w-full rounded-md border border-line bg-white px-4 text-base text-ink outline-none placeholder:text-mist";
