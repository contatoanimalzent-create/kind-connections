import * as fabric from "fabric";
import {
  DEFAULT_LAYER_ID,
  getObjectData,
  makeId,
  setObjectData,
  type EditableData,
} from "@/lib/floorplan-render";
import { GRID } from "./types";

/** Returns the editable metadata of a fabric object, creating a fallback if missing. */
export function dataOf(object: fabric.Object): EditableData {
  const data = getObjectData(object);
  if (data) return data;
  const fallback: EditableData = {
    id: makeId("obj"),
    name: object.type ?? "Objeto",
    type: "object",
    layerId: DEFAULT_LAYER_ID,
  };
  setObjectData(object, fallback);
  return fallback;
}

/** Applies the editor selection/handle styling to a fabric object. */
export function applyEditorControls(object: fabric.Object) {
  object.set({
    cornerColor: "#2563eb",
    cornerStrokeColor: "#ffffff",
    borderColor: "#2563eb",
    cornerStyle: "circle",
    transparentCorners: false,
  });
}

function normalizedAngle(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Reads the absolute bounds (scene coordinates) of an object. */
export function objectBounds(object: fabric.Object) {
  return {
    x: Math.round(object.left ?? 0),
    y: Math.round(object.top ?? 0),
    width: Math.round((object.width ?? 0) * (object.scaleX ?? 1)),
    height: Math.round((object.height ?? 0) * (object.scaleY ?? 1)),
    rotation: Math.round(normalizedAngle(object.angle)),
  };
}

/** Locks/unlocks all transform handles and persists the flag in metadata. */
export function setObjectLock(object: fabric.Object, locked: boolean) {
  object.set({
    selectable: !locked,
    evented: !locked,
    lockMovementX: locked,
    lockMovementY: locked,
    lockScalingX: locked,
    lockScalingY: locked,
    lockRotation: locked,
  });
  const data = dataOf(object);
  setObjectData(object, { ...data, locked });
}

/** Snaps a value to the grid when snapping is enabled. */
export function snap(value: number, enabled: boolean) {
  return enabled ? Math.round(value / GRID) * GRID : value;
}

/** Applies fill/stroke to an object and its group children. */
export function setPaint(object: fabric.Object, patch: { fill?: string; stroke?: string }) {
  object.set(patch);
  if (object instanceof fabric.Group) {
    object.getObjects().forEach((child) => {
      if (patch.fill && child.type !== "text" && child.type !== "i-text")
        child.set("fill", patch.fill);
      if (patch.stroke && "stroke" in child) child.set("stroke", patch.stroke);
    });
  }
}

/** Calls a fabric stacking-order method that may not be typed on the object. */
export function callFabricOrder(
  object: fabric.Object,
  method: "bringToFront" | "sendToBack" | "bringForward" | "sendBackwards",
) {
  const ordered = object as unknown as Record<string, (() => void) | undefined>;
  ordered[method]?.();
}

/** Computes the bounding box (scene coords) of all non-guide objects. */
export function contentBounds(canvas: fabric.Canvas) {
  const objects = canvas
    .getObjects()
    .filter((object) => dataOf(object).layerId !== "guides" && object.visible !== false);
  if (objects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const object of objects) {
    const rect = object.getBoundingRect();
    minX = Math.min(minX, rect.left);
    minY = Math.min(minY, rect.top);
    maxX = Math.max(maxX, rect.left + rect.width);
    maxY = Math.max(maxY, rect.top + rect.height);
  }
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}
