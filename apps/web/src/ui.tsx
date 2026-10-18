import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
export function Button({
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={`ui-button ${className}`} {...props} />;
}
export function Panel({
  className = "",
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <section className={`ui-panel ${className}`} {...props} />;
}
