import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { EditableData } from "@/lib/floorplan-render";

export type Volume = {
  id: string;
  type: EditableData["type"];
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
};

/** Extrusion height (scene units) per object type. */
const HEIGHT_BY_TYPE: Partial<Record<EditableData["type"], number>> = {
  stage: 60,
  tent: 90,
  bathroom: 70,
  food_truck: 80,
  generator: 50,
  ambulance: 70,
  medical: 70,
  wall: 70,
  gate: 60,
  emergency_exit: 8,
  fire_extinguisher: 30,
  area: 2,
  rectangle: 40,
  polygon: 40,
  object: 40,
};

function heightFor(type: EditableData["type"]) {
  return HEIGHT_BY_TYPE[type] ?? 40;
}

function safeColor(value: string | undefined, fallback = "#3b82f6") {
  if (!value || value === "transparent" || value.startsWith("rgba(0")) return fallback;
  try {
    return new THREE.Color(value).getStyle();
  } catch {
    return fallback;
  }
}

/**
 * Lightweight Three.js floor-plan viewer. Converts 2D objects into extruded
 * volumes on a ground plane. Self-contained: mount, build, dispose.
 */
export class FloorplanScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private frame = 0;
  private group = new THREE.Group();
  private disposed = false;

  constructor(private container: HTMLElement) {
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#0b1220");

    this.camera = new THREE.PerspectiveCamera(55, width / height, 1, 20000);
    this.camera.position.set(600, 700, 900);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    const ambient = new THREE.AmbientLight(0xffffff, 0.65);
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(400, 800, 300);
    dir.castShadow = true;
    this.scene.add(ambient, dir);

    this.scene.add(this.group);
    this.animate();
    window.addEventListener("resize", this.onResize);
  }

  private onResize = () => {
    if (this.disposed) return;
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private animate = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  /** Rebuilds the 3D scene from a list of 2D volumes. */
  build(volumes: Volume[]) {
    this.clearGroup();

    if (volumes.length === 0) {
      this.addGround(1400, 900, 0, 0);
      this.frameCamera(0, 0, 1400, 900);
      return;
    }

    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const v of volumes) {
      minX = Math.min(minX, v.x);
      minZ = Math.min(minZ, v.y);
      maxX = Math.max(maxX, v.x + v.width);
      maxZ = Math.max(maxZ, v.y + v.height);
    }
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const planW = maxX - minX + 200;
    const planH = maxZ - minZ + 200;

    this.addGround(planW, planH, cx, cz);

    for (const v of volumes) {
      const depth = heightFor(v.type);
      const geometry = new THREE.BoxGeometry(Math.max(2, v.width), depth, Math.max(2, v.height));
      const material = new THREE.MeshStandardMaterial({
        color: safeColor(v.color),
        roughness: 0.7,
        metalness: 0.05,
      });
      const mesh = new THREE.Mesh(geometry, material);
      // Fabric Y grows downward -> map to Z; center on the box.
      mesh.position.set(v.x + v.width / 2 - cx, depth / 2, v.y + v.height / 2 - cz);
      mesh.rotation.y = -(v.rotation * Math.PI) / 180;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: 0x0b1220, transparent: true, opacity: 0.35 }),
      );
      mesh.add(edges);
      this.group.add(mesh);
    }

    this.frameCamera(0, 0, planW, planH);
  }

  private addGround(width: number, height: number, cx: number, cz: number) {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 0);
    ground.receiveShadow = true;
    const grid = new THREE.GridHelper(Math.max(width, height), Math.max(width, height) / 20, 0x334155, 0x1e293b);
    this.group.add(ground, grid);
    void cx;
    void cz;
  }

  private frameCamera(_x: number, _y: number, width: number, height: number) {
    const radius = Math.max(width, height);
    this.camera.position.set(radius * 0.6, radius * 0.7, radius * 0.9);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  private clearGroup() {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry?.dispose?.();
        const material = child.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose?.();
      }
    });
    this.group.clear();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.onResize);
    this.clearGroup();
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
