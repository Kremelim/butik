import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import type { ModelPreset, ProductDTO } from '../core/types.ts';

interface BoutiqueStudio3DProps {
  products: ProductDTO[];
  activeProduct: ProductDTO;
  selectedRackDigit: number;
  onSelectProduct: (productId: number) => void;
  onSelectRackDigit: (digit: number) => void;
}

type FabricFinishKey = 'satin' | 'wool' | 'knit' | 'chiffon';
type CameraPresetKey = 'showcase' | 'detail' | 'racks';

const FABRIC_FINISHES: Record<
  FabricFinishKey,
  { label: string; roughness: number; sheen: number; sheenRoughness: number }
> = {
  satin: { label: 'Saten İpek', roughness: 0.28, sheen: 0.85, sheenRoughness: 0.25 },
  wool: { label: 'Kaşe Yün', roughness: 0.82, sheen: 0.35, sheenRoughness: 0.7 },
  knit: { label: 'Fitilli Triko', roughness: 0.72, sheen: 0.4, sheenRoughness: 0.6 },
  chiffon: { label: 'Piliseli Şifon', roughness: 0.52, sheen: 0.55, sheenRoughness: 0.45 },
};

const CAMERA_PRESETS: Record<
  CameraPresetKey,
  { label: string; pos: [number, number, number]; target: [number, number, number] }
> = {
  showcase: { label: 'Vitrin Açısı', pos: [0.55, 2.15, 5.25], target: [0.65, 1.0, 0] },
  detail: { label: 'Detay Yakın', pos: [-0.85, 1.78, 2.65], target: [-0.35, 1.4, 0] },
  racks: { label: '0-9 Raf Genel', pos: [2.4, 2.35, 5.2], target: [1.55, 1.05, 0] },
};

function createFabricBumpTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 4) {
      ctx.fillStyle = y % 8 === 0 ? '#969696' : '#6c6c6c';
      ctx.fillRect(0, y, 256, 2);
    }
    for (let x = 0; x < 256; x += 6) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, 0, 1, 256);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 126);
    grad.addColorStop(0, 'rgba(20, 20, 24, 0.45)');
    grad.addColorStop(0.55, 'rgba(20, 20, 24, 0.16)');
    grad.addColorStop(1, 'rgba(20, 20, 24, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  return new THREE.CanvasTexture(canvas);
}

function createTagTexture(sku: string, priceText: string, maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#fcfaf6';
    ctx.fillRect(0, 0, 256, 384);
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 8;
    ctx.strokeRect(12, 12, 232, 360);
    ctx.fillStyle = '#0f5132';
    ctx.fillRect(12, 12, 232, 74);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KREMELİM', 128, 58);

    ctx.fillStyle = '#18181b';
    ctx.font = 'bold 34px monospace';
    ctx.fillText(sku, 128, 160);

    ctx.fillStyle = '#52525b';
    ctx.font = '24px sans-serif';
    ctx.fillText('CANLI YAYIN', 128, 215);

    ctx.fillStyle = '#0f5132';
    ctx.font = 'bold 38px monospace';
    ctx.fillText(priceText, 128, 295);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function createDigitPlateTexture(digit: number, active: boolean, maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = active ? '#0f5132' : '#f4f2ed';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = active ? '#0f5132' : '#d4d0c8';
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, 116, 116);
    ctx.fillStyle = active ? '#ffffff' : '#18181b';
    ctx.font = 'bold 64px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(digit), 64, 66);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function presetToDefaultFinish(preset: ModelPreset): FabricFinishKey {
  if (preset === 'coat') return 'wool';
  if (preset === 'knitset') return 'knit';
  if (preset === 'tunic') return 'chiffon';
  return 'satin';
}

export function BoutiqueStudio3D({
  products,
  activeProduct,
  selectedRackDigit,
  onSelectProduct,
  onSelectRackDigit,
}: BoutiqueStudio3DProps) {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const [explodedAmount, setExplodedAmount] = useState(0);
  const [fabricFinish, setFabricFinish] = useState<FabricFinishKey>(() =>
    presetToDefaultFinish(activeProduct.modelPreset)
  );
  const [cameraPreset, setCameraPreset] = useState<CameraPresetKey>('showcase');
  const [dockCollapsed, setDockCollapsed] = useState(false);

  const sceneStateRef = useRef({
    explodedTarget: 0,
    colorHex: activeProduct.colorHex,
    modelPreset: activeProduct.modelPreset,
    fabricFinish: presetToDefaultFinish(activeProduct.modelPreset),
    sku: activeProduct.sku,
    priceText: `${activeProduct.salePrice} TL`,
    selectedRackDigit,
    cameraPreset: 'showcase' as CameraPresetKey,
    cameraTransitionActive: false,
  });

  const triggerUpdateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const nextFinish = presetToDefaultFinish(activeProduct.modelPreset);
    setFabricFinish(nextFinish);
    sceneStateRef.current.colorHex = activeProduct.colorHex;
    sceneStateRef.current.modelPreset = activeProduct.modelPreset;
    sceneStateRef.current.fabricFinish = nextFinish;
    sceneStateRef.current.sku = activeProduct.sku;
    sceneStateRef.current.priceText = `${activeProduct.salePrice} TL`;
    triggerUpdateRef.current?.();
  }, [activeProduct]);

  useEffect(() => {
    sceneStateRef.current.explodedTarget = explodedAmount;
    triggerUpdateRef.current?.();
  }, [explodedAmount]);

  useEffect(() => {
    sceneStateRef.current.fabricFinish = fabricFinish;
    triggerUpdateRef.current?.();
  }, [fabricFinish]);

  useEffect(() => {
    sceneStateRef.current.selectedRackDigit = selectedRackDigit;
    triggerUpdateRef.current?.();
  }, [selectedRackDigit]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H') {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          setDockCollapsed((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = mount.clientWidth || 1000;
    const height = mount.clientHeight || 620;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f3f1ec');
    scene.fog = new THREE.Fog('#f3f1ec', 11, 28);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 60);
    camera.position.set(...CAMERA_PRESETS.showcase.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_PRESETS.showcase.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.0;
    controls.maxDistance = 9.0;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.update();

    // 3-Point Warm/Cool Studio Lighting
    const hemiLight = new THREE.HemisphereLight(0xdce8f7, 0x8f8273, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1de, 1.85);
    keyLight.position.set(4.5, 6.5, 4.5);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.left = -4.5;
      keyLight.shadow.camera.right = 4.5;
      keyLight.shadow.camera.top = 4.5;
      keyLight.shadow.camera.bottom = -4.5;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xcbe2ff, 0.9);
    rimLight.position.set(-4.5, 3.5, -4.0);
    scene.add(rimLight);

    if (!isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      const softbox = new THREE.RectAreaLight(0xffffff, 2.2, 2.6, 3.4);
      softbox.position.set(-2.8, 2.4, 2.5);
      softbox.lookAt(-0.3, 1.4, 0);
      scene.add(softbox);
    }

    // Studio Floor & Grounding Shadow
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xebe8e1,
      roughness: 0.88,
      metalness: 0.0,
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 48), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = !isSoftwareGl;
    scene.add(floor);

    const contactTex = createContactShadowTexture();
    const contactMat = new THREE.MeshBasicMaterial({
      map: contactTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.42,
    });
    const pedestalShadow = new THREE.Mesh(new THREE.CircleGeometry(1.15, 32), contactMat);
    pedestalShadow.rotation.x = -Math.PI / 2;
    pedestalShadow.position.set(-0.35, 0.015, 0);
    scene.add(pedestalShadow);

    const rackShadow = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.2), contactMat);
    rackShadow.rotation.x = -Math.PI / 2;
    rackShadow.position.set(2.3, 0.015, -0.3);
    scene.add(rackShadow);

    // Pedestal + Brass Boutique Stand (Composite Group)
    const standGroup = new THREE.Group();
    standGroup.position.set(-0.35, 0, 0);
    scene.add(standGroup);

    const travertineMat = new THREE.MeshStandardMaterial({
      color: 0xd5cec2,
      roughness: 0.72,
      metalness: 0.02,
    });
    const plinthPoints = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.88, 0),
      new THREE.Vector2(0.88, 0.14),
      new THREE.Vector2(0.82, 0.18),
      new THREE.Vector2(0.76, 0.18),
      new THREE.Vector2(0.76, 0.24),
      new THREE.Vector2(0, 0.24),
    ];
    const plinthGeo = new THREE.LatheGeometry(plinthPoints, 48);
    const plinthMesh = new THREE.Mesh(plinthGeo, travertineMat);
    plinthMesh.castShadow = !isSoftwareGl;
    plinthMesh.receiveShadow = !isSoftwareGl;
    standGroup.add(plinthMesh);

    const plinthRingMat = new THREE.MeshStandardMaterial({
      color: 0x5c3d28,
      roughness: 0.52,
      metalness: 0.08,
    });
    const plinthRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.89, 0.89, 0.035, 48),
      plinthRingMat
    );
    plinthRing.position.set(0, 0.018, 0);
    standGroup.add(plinthRing);

    const brassMat = new THREE.MeshPhysicalMaterial({
      color: 0xc5a25b,
      metalness: 0.92,
      roughness: 0.22,
      anisotropy: 0.75,
    });
    const poleGeo = new THREE.CylinderGeometry(0.024, 0.028, 2.25, 20);
    const poleMesh = new THREE.Mesh(poleGeo, brassMat);
    poleMesh.position.set(0, 1.35, -0.18);
    poleMesh.castShadow = !isSoftwareGl;
    standGroup.add(poleMesh);

    const armCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 2.42, -0.18),
      new THREE.Vector3(0, 2.52, -0.06),
      new THREE.Vector3(0, 2.46, 0.04),
    ]);
    const armMesh = new THREE.Mesh(new THREE.TubeGeometry(armCurve, 16, 0.018, 12, false), brassMat);
    standGroup.add(armMesh);

    // Garment Composite Assembly (6-9 parts)
    const garmentGroup = new THREE.Group();
    garmentGroup.position.set(-0.35, 1.52, 0.04);
    scene.add(garmentGroup);

    const bumpTex = createFabricBumpTexture();
    const primaryFabricMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(sceneStateRef.current.colorHex),
      roughness: 0.35,
      metalness: 0.04,
      bumpMap: bumpTex,
      bumpScale: 0.012,
      sheen: 0.75,
      sheenRoughness: 0.3,
      sheenColor: new THREE.Color(0xffffff),
      side: THREE.DoubleSide,
    });

    const trimFabricMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(sceneStateRef.current.colorHex).multiplyScalar(0.78),
      roughness: 0.55,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });

    const walnutMat = new THREE.MeshStandardMaterial({
      color: 0x5c3d28,
      roughness: 0.58,
      metalness: 0.05,
    });

    // Hanger part group
    const hangerPart = new THREE.Group();
    const hangerShape = new THREE.Shape();
    hangerShape.moveTo(-0.34, -0.02);
    hangerShape.quadraticCurveTo(0, 0.14, 0.34, -0.02);
    hangerShape.lineTo(0.32, -0.06);
    hangerShape.quadraticCurveTo(0, 0.06, -0.32, -0.06);
    hangerShape.closePath();
    const hangerGeo = new THREE.ExtrudeGeometry(hangerShape, {
      depth: 0.03,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.008,
      bevelSegments: 2,
    });
    hangerGeo.translate(0, 0, -0.015);
    const hangerBody = new THREE.Mesh(hangerGeo, walnutMat);
    hangerBody.position.set(0, 0.74, 0);
    hangerBody.castShadow = !isSoftwareGl;
    hangerPart.add(hangerBody);

    const hookCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.8, 0),
      new THREE.Vector3(0, 0.89, 0),
      new THREE.Vector3(0.035, 0.93, 0),
      new THREE.Vector3(0.01, 0.96, 0),
    ]);
    const hookMesh = new THREE.Mesh(new THREE.TubeGeometry(hookCurve, 14, 0.009, 10, false), brassMat);
    hangerPart.add(hookMesh);
    garmentGroup.add(hangerPart);

    // Main Silhouette Group (rebuilt cleanly on preset switch)
    const silhouettePart = new THREE.Group();
    const trimDetailPart = new THREE.Group();
    garmentGroup.add(silhouettePart);
    garmentGroup.add(trimDetailPart);

    // Price / SKU Hanging Tag
    const tagMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: createTagTexture(
        sceneStateRef.current.sku,
        sceneStateRef.current.priceText,
        maxAniso
      ),
      roughness: 0.7,
      metalness: 0.0,
    });
    const tagPart = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.27, 0.008), tagMat);
    tagPart.position.set(0.32, 0.45, 0.14);
    tagPart.rotation.y = -0.25;
    garmentGroup.add(tagPart);

    const buildGarmentGeometry = (preset: ModelPreset) => {
      silhouettePart.clear();
      trimDetailPart.clear();

      if (preset === 'dress') {
        const skirtPts = [
          new THREE.Vector2(0.19, 0.08),
          new THREE.Vector2(0.24, -0.15),
          new THREE.Vector2(0.33, -0.45),
          new THREE.Vector2(0.42, -0.78),
          new THREE.Vector2(0.44, -0.82),
        ];
        const skirt = new THREE.Mesh(new THREE.LatheGeometry(skirtPts, 32), primaryFabricMat);
        skirt.scale.set(1.0, 1.0, 0.62);
        skirt.castShadow = !isSoftwareGl;
        silhouettePart.add(skirt);

        const bodicePts = [
          new THREE.Vector2(0.26, 0.66),
          new THREE.Vector2(0.23, 0.42),
          new THREE.Vector2(0.18, 0.12),
        ];
        const bodice = new THREE.Mesh(new THREE.LatheGeometry(bodicePts, 28), primaryFabricMat);
        bodice.scale.set(1.0, 1.0, 0.58);
        bodice.castShadow = !isSoftwareGl;
        silhouettePart.add(bodice);

        for (const side of [-1, 1]) {
          const sleeve = new THREE.Mesh(
            new THREE.CylinderGeometry(0.085, 0.072, 0.32, 16),
            primaryFabricMat
          );
          sleeve.position.set(side * 0.29, 0.54, 0);
          sleeve.rotation.z = side * 0.48;
          silhouettePart.add(sleeve);
        }

        const belt = new THREE.Mesh(
          new THREE.TorusGeometry(0.195, 0.025, 12, 32),
          trimFabricMat
        );
        belt.rotation.x = Math.PI / 2;
        belt.scale.set(1.0, 0.62, 1.0);
        belt.position.set(0, 0.11, 0);
        trimDetailPart.add(belt);
      } else if (preset === 'coat') {
        const coatPts = [
          new THREE.Vector2(0.28, 0.68),
          new THREE.Vector2(0.26, 0.35),
          new THREE.Vector2(0.29, -0.15),
          new THREE.Vector2(0.35, -0.72),
        ];
        const coatBody = new THREE.Mesh(new THREE.LatheGeometry(coatPts, 28), primaryFabricMat);
        coatBody.scale.set(1.0, 1.0, 0.64);
        coatBody.castShadow = !isSoftwareGl;
        silhouettePart.add(coatBody);

        for (const side of [-1, 1]) {
          const sleeve = new THREE.Mesh(
            new THREE.CylinderGeometry(0.088, 0.075, 0.58, 16),
            primaryFabricMat
          );
          sleeve.position.set(side * 0.33, 0.4, 0);
          sleeve.rotation.z = side * 0.32;
          silhouettePart.add(sleeve);

          const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.36, 0.03), trimFabricMat);
          lapel.position.set(side * 0.075, 0.48, 0.16);
          lapel.rotation.z = side * -0.18;
          trimDetailPart.add(lapel);
        }

        const belt = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.028, 12, 32), trimFabricMat);
        belt.rotation.x = Math.PI / 2;
        belt.scale.set(1.0, 0.66, 1.0);
        belt.position.set(0, 0.14, 0);
        trimDetailPart.add(belt);

        for (let r = 0; r < 2; r++) {
          for (const side of [-1, 1]) {
            const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.015, 16), brassMat);
            btn.rotation.x = Math.PI / 2;
            btn.position.set(side * 0.08, 0.34 - r * 0.14, 0.17);
            trimDetailPart.add(btn);
          }
        }
      } else if (preset === 'knitset') {
        const sweaterPts = [
          new THREE.Vector2(0.27, 0.66),
          new THREE.Vector2(0.25, 0.36),
          new THREE.Vector2(0.24, 0.12),
        ];
        const sweater = new THREE.Mesh(new THREE.LatheGeometry(sweaterPts, 26), primaryFabricMat);
        sweater.scale.set(1.0, 1.0, 0.62);
        sweater.castShadow = !isSoftwareGl;
        silhouettePart.add(sweater);

        for (const side of [-1, 1]) {
          const sleeve = new THREE.Mesh(
            new THREE.CylinderGeometry(0.082, 0.07, 0.56, 16),
            primaryFabricMat
          );
          sleeve.position.set(side * 0.32, 0.4, 0);
          sleeve.rotation.z = side * 0.35;
          silhouettePart.add(sleeve);

          const leg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.14, 0.86, 18),
            primaryFabricMat
          );
          leg.position.set(side * 0.13, -0.35, 0);
          silhouettePart.add(leg);
        }

        const collar = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.028, 12, 24), trimFabricMat);
        collar.rotation.x = Math.PI / 2;
        collar.position.set(0, 0.66, 0);
        trimDetailPart.add(collar);
      } else {
        const tunicPts = [
          new THREE.Vector2(0.25, 0.66),
          new THREE.Vector2(0.24, 0.36),
          new THREE.Vector2(0.31, -0.35),
        ];
        const tunic = new THREE.Mesh(new THREE.LatheGeometry(tunicPts, 30), primaryFabricMat);
        tunic.scale.set(1.0, 1.0, 0.6);
        tunic.castShadow = !isSoftwareGl;
        silhouettePart.add(tunic);

        for (const side of [-1, 1]) {
          const sleeve = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.068, 0.58, 16),
            primaryFabricMat
          );
          sleeve.position.set(side * 0.31, 0.4, 0);
          sleeve.rotation.z = side * 0.38;
          silhouettePart.add(sleeve);

          const cuff = new THREE.Mesh(
            new THREE.CylinderGeometry(0.072, 0.072, 0.08, 16),
            trimFabricMat
          );
          cuff.position.set(side * 0.41, 0.15, 0);
          cuff.rotation.z = side * 0.38;
          trimDetailPart.add(cuff);
        }

        const placket = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.72, 0.02), trimFabricMat);
        placket.position.set(0, 0.28, 0.16);
        trimDetailPart.add(placket);
      }
    };

    buildGarmentGeometry(sceneStateRef.current.modelPreset);

    // 0-9 Modular Sorting Rack Group
    const rackBayGroup = new THREE.Group();
    rackBayGroup.position.set(2.3, 0, -0.3);
    scene.add(rackBayGroup);

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x27272a,
      roughness: 0.42,
      metalness: 0.78,
    });
    const shelfMat = new THREE.MeshStandardMaterial({
      color: 0xdfd9ce,
      roughness: 0.75,
      metalness: 0.05,
    });

    const rackBase = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 0.85), frameMat);
    rackBase.position.set(0, 0.04, 0);
    rackBayGroup.add(rackBase);

    for (const sx of [-1.2, 1.2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.9, 14), frameMat);
      post.position.set(sx, 0.99, 0);
      rackBayGroup.add(post);
    }

    const topRail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 2.45, 14), brassMat);
    topRail.rotation.z = Math.PI / 2;
    topRail.position.set(0, 1.9, 0);
    rackBayGroup.add(topRail);

    const midShelf = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.04, 0.76), shelfMat);
    midShelf.position.set(0, 0.96, 0);
    rackBayGroup.add(midShelf);

    const plateMeshes: THREE.Mesh[] = [];
    const plateTextures: THREE.CanvasTexture[] = [];
    for (let d = 0; d < 10; d++) {
      const row = d < 5 ? 0 : 1;
      const col = d % 5;
      const x = -0.96 + col * 0.48;
      const y = row === 0 ? 1.48 : 0.56;
      const tex = createDigitPlateTexture(d, d === sceneStateRef.current.selectedRackDigit, maxAniso);
      plateTextures.push(tex);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: tex,
        roughness: 0.45,
        metalness: 0.08,
      });
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.04), mat);
      plate.position.set(x, y, 0.18);
      plate.userData.rackDigit = d;
      plateMeshes.push(plate);
      rackBayGroup.add(plate);
    }

    // State Tracking & Damped Rendering Loop
    let currentExploded = 0;
    let lastPreset = sceneStateRef.current.modelPreset;
    let lastSku = sceneStateRef.current.sku;
    let lastPrice = sceneStateRef.current.priceText;
    let lastRackDigit = sceneStateRef.current.selectedRackDigit;
    const desiredCamPos = new THREE.Vector3(...CAMERA_PRESETS.showcase.pos);
    const desiredTarget = new THREE.Vector3(...CAMERA_PRESETS.showcase.target);

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTickMs = performance.now();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function syncVisualProps() {
      const s = sceneStateRef.current;
      const finishCfg = FABRIC_FINISHES[s.fabricFinish];
      primaryFabricMat.color.set(s.colorHex);
      primaryFabricMat.roughness = finishCfg.roughness;
      primaryFabricMat.sheen = finishCfg.sheen;
      primaryFabricMat.sheenRoughness = finishCfg.sheenRoughness;
      trimFabricMat.color.set(s.colorHex).multiplyScalar(0.75);

      if (s.modelPreset !== lastPreset) {
        lastPreset = s.modelPreset;
        buildGarmentGeometry(s.modelPreset);
      }
      if (s.sku !== lastSku || s.priceText !== lastPrice) {
        lastSku = s.sku;
        lastPrice = s.priceText;
        tagMat.map?.dispose();
        tagMat.map = createTagTexture(s.sku, s.priceText, maxAniso);
        tagMat.needsUpdate = true;
      }
      if (s.selectedRackDigit !== lastRackDigit) {
        lastRackDigit = s.selectedRackDigit;
        plateMeshes.forEach((mesh, idx) => {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.map?.dispose();
          mat.map = createDigitPlateTexture(idx, idx === lastRackDigit, maxAniso);
          mat.needsUpdate = true;
          mesh.position.z = idx === lastRackDigit ? 0.28 : 0.18;
        });
      }
    }

    function requestRender() {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        renderDirty = false;
        const now = performance.now();
        const delta = Math.min((now - lastTickMs) / 1000, 0.1);
        lastTickMs = now;
        syncVisualProps();

        const targetExploded = sceneStateRef.current.explodedTarget;
        let needsAnother = false;

        if (Math.abs(currentExploded - targetExploded) > 0.002) {
          currentExploded = THREE.MathUtils.damp(currentExploded, targetExploded, 8, delta);
          needsAnother = true;
        } else {
          currentExploded = targetExploded;
        }

        hangerPart.position.y = currentExploded * 0.34;
        trimDetailPart.position.z = currentExploded * 0.28;
        tagPart.position.x = 0.32 + currentExploded * 0.34;
        tagPart.position.z = 0.14 + currentExploded * 0.22;

        if (sceneStateRef.current.cameraTransitionActive) {
          const preset = CAMERA_PRESETS[sceneStateRef.current.cameraPreset];
          desiredCamPos.set(...preset.pos);
          desiredTarget.set(...preset.target);
          camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredCamPos.x, 7, delta);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, desiredCamPos.y, 7, delta);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, desiredCamPos.z, 7, delta);
          controls.target.x = THREE.MathUtils.damp(controls.target.x, desiredTarget.x, 7, delta);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, desiredTarget.y, 7, delta);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, desiredTarget.z, 7, delta);

          if (
            camera.position.distanceTo(desiredCamPos) < 0.02 &&
            controls.target.distanceTo(desiredTarget) < 0.02
          ) {
            camera.position.copy(desiredCamPos);
            controls.target.copy(desiredTarget);
            sceneStateRef.current.cameraTransitionActive = false;
          } else {
            needsAnother = true;
          }
        }

        controls.update();
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty || needsAnother) {
            requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    triggerUpdateRef.current = requestRender;

    controls.addEventListener('change', requestRender);
    controls.addEventListener('start', () => {
      sceneStateRef.current.cameraTransitionActive = false;
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const handlePointerClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(plateMeshes, false);
      if (hits.length > 0) {
        const digit = hits[0].object.userData.rackDigit;
        if (typeof digit === 'number') {
          onSelectRackDigit(digit);
        }
      }
    };
    renderer.domElement.addEventListener('click', handlePointerClick);

    const handleResize = () => {
      if (!mount) return;
      const nextW = mount.clientWidth || 1000;
      const nextH = mount.clientHeight || 620;
      camera.aspect = nextW / nextH;
      camera.updateProjectionMatrix();
      renderer.setSize(nextW, nextH);
      requestRender();
    };
    window.addEventListener('resize', handleResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    requestRender();

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('click', handlePointerClick);
      controls.dispose();
      envTex.dispose();
      bumpTex.dispose();
      contactTex.dispose();
      plateTextures.forEach((t) => t.dispose());
      renderer.dispose();
    };
  }, [onSelectRackDigit]);

  const handleSelectCameraPreset = (preset: CameraPresetKey) => {
    setCameraPreset(preset);
    sceneStateRef.current.cameraPreset = preset;
    sceneStateRef.current.cameraTransitionActive = true;
    triggerUpdateRef.current?.();
  };

  return (
    <section className="relative w-full h-[640px] rounded-2xl border border-zinc-200 bg-[#f3f1ec] overflow-hidden">
      {/* Dedicated isolated WebGL mount */}
      <div
        ref={canvasMountRef}
        data-testid="threejs-studio-canvas"
        className="w-full h-full"
        aria-label="3D Canlı Yayın Ürün ve 0-9 Raf Sahnesi"
      />

      {/* Minimal Top-Left Header Spec (Zero-occlusion) */}
      <div className="pointer-events-none absolute top-4 left-5 z-10">
        <div className="bg-white/95 border border-zinc-200 rounded-xl px-4 py-2.5 pointer-events-auto">
          <div className="text-xs font-mono text-emerald-800 font-semibold">
            {activeProduct.sku} · Raf Grubu {selectedRackDigit}
          </div>
          <div className="text-sm font-semibold text-zinc-900 mt-0.5">
            {activeProduct.name}
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">
            Sürükle: Döndür · Kaydır: Yakınlaş · Raf plakasını tıkla: 0–9 seç
          </div>
        </div>
      </div>

      {/* Collapsible Bottom Control Dock (Zero Viewport Occlusion) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(1060px,95%)] flex flex-col items-center pointer-events-none">
        <button
          type="button"
          onClick={() => setDockCollapsed((prev) => !prev)}
          className="pointer-events-auto mb-1.5 flex items-center gap-1.5 px-3 py-1 rounded-t-lg bg-white border border-zinc-200 text-xs font-medium text-zinc-700 hover:text-zinc-900 cursor-pointer"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              Kontrolleri Göster (H)
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              Kontrolleri Gizle (H)
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div className="pointer-events-auto w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 flex flex-wrap xl:flex-nowrap items-center justify-between gap-2.5">
            {/* Product Switcher */}
            <div className="flex items-center gap-2">
              <label htmlFor="studio-product-select" className="text-xs font-medium text-zinc-600 whitespace-nowrap">
                Ürün:
              </label>
              <select
                id="studio-product-select"
                value={activeProduct.id}
                onChange={(e) => onSelectProduct(Number(e.target.value))}
                className="text-xs font-medium bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-zinc-900"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Exploded View Slider */}
            <div className="flex items-center gap-2">
              <label htmlFor="exploded-slider" className="text-xs font-medium text-zinc-600 whitespace-nowrap">
                Katman Ayrımı:
              </label>
              <input
                id="exploded-slider"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={explodedAmount}
                onChange={(e) => setExplodedAmount(Number(e.target.value))}
                className="w-24 accent-[#0f5132] cursor-pointer"
              />
            </div>

            {/* Fabric Finish Switcher */}
            <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-lg">
              {(Object.keys(FABRIC_FINISHES) as FabricFinishKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFabricFinish(key)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                    fabricFinish === key
                      ? 'bg-white text-zinc-900 border border-zinc-200'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {FABRIC_FINISHES[key].label}
                </button>
              ))}
            </div>

            {/* Camera Presets */}
            <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-lg">
              {(Object.keys(CAMERA_PRESETS) as CameraPresetKey[]).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleSelectCameraPreset(preset)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                    cameraPreset === preset
                      ? 'bg-[#0f5132] text-white'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {CAMERA_PRESETS[preset].label}
                </button>
              ))}
              <button
                type="button"
                aria-label="Görünümü sıfırla"
                onClick={() => {
                  setExplodedAmount(0);
                  handleSelectCameraPreset('showcase');
                }}
                className="p-1.5 text-zinc-600 hover:text-zinc-900 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
