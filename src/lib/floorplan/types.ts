import type { ComponentType } from "react";

export type Tool =
  | "select"
  | "hand"
  | "rect"
  | "line"
  | "arrow"
  | "polygon"
  | "pen"
  | "text"
  | "measure"
  | "eraser"
  | "area"
  | "object";

export type Layer = {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
};

export type LayerRow = {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
};

export type ToolItem = {
  id: Tool;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

/** Grid size in scene units. */
export const GRID = 20;
