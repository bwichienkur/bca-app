import type { CSSProperties, ReactNode } from "react";

export function Card({
  children,
  className,
  interactive = false,
  style,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      style={style}
      className={[
        "ui-card block w-full text-left",
        interactive || onClick ? "ui-card-interactive cursor-pointer" : "",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </Tag>
  );
}
