"use client";

import React from "react";

interface MonoTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
}

export function MonoText({ children, style, ...props }: MonoTextProps) {
  return (
    <span
      {...props}
      style={{
        fontFamily: "monospace",
        ...(style as React.CSSProperties),
      }}
    >
      {children}
    </span>
  );
}