"use client";
import type { ReactNode } from "react";

/** A select that saves as soon as it changes, by submitting its form. */
export function AutoSelect(props: { name: string; defaultValue: string | number; label: string; className?: string; children: ReactNode }) {
  return (
    <select
      name={props.name}
      defaultValue={props.defaultValue}
      aria-label={props.label}
      className={props.className}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
    >
      {props.children}
    </select>
  );
}
