
import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';

// --- PERLIN NOISE IMPLEMENTATION ---
class SimpleNoise {
  private p: number[];
  constructor() {
    this.p = new Array(512);
    const permutation = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
    for (let i=0; i < 256 ; i++) this.p[256+i] = this.p[i] = permutation[i];
  }
  fade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10); }
  lerp(t: number, a: number, b: number) { return a + t * (b - a); }
  grad(hash: number, x: number, y: number, z: number) {
    const h = hash & 15;
    const u = h<8 ? x : y, v = h<4 ? y : h===12||h===14 ? x : z;
    return ((h&1) === 0 ? u : -u) + ((h&2) === 0 ? v : -v);
  }
  noise(x: number, y: number, z: number) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = this.fade(x), v = this.fade(y), w = this.fade(z);
    const A = this.p[X]+Y, AA = this.p[A]+Z, AB = this.p[A+1]+Z,
          B = this.p[X+1]+Y, BA = this.p[B]+Z, BB = this.p[B+1]+Z;
    return this.lerp(w, this.lerp(v, this.lerp(u, this.grad(this.p[AA], x, y, z),
                                     this.grad(this.p[BA], x-1, y, z)),
                             this.lerp(u, this.grad(this.p[AB], x, y-1, z),
                                     this.grad(this.p[BB], x-1, y-1, z))),
                     this.lerp(v, this.lerp(u, this.grad(this.p[AA+1], x, y, z-1),
                                     this.grad(this.p[BA+1], x-1, y, z-1)),
                             this.lerp(u, this.grad(this.p[AB+1], x, y-1, z-1),
                                     this.grad(this.p[BB+1], x-1, y-1, z-1))));
  }
}

// --- CONSTANTS ---
const WORLD_SIZE = 80; 
const WATER_LEVEL = 8;

// --- COLORS & TYPES ---
const BlockType = {
  GRASS: 'grass',
  DIRT: 'dirt',
  STONE: 'stone',
  SAND: 'sand',
  WATER: 'water',
  SNOW: 'snow',
  WOOD: 'wood',
  LEAVES: 'leaves',
  CLOUD: 'cloud'
};

const PALETTE = {
  [BlockType.GRASS]: 0x567d46,
  [BlockType.DIRT]: 0x3b2921,
  [BlockType.STONE]: 0x757575,
  [BlockType.SAND]: 0xe6db74,
  [BlockType.WATER]: 0x29b6f6,
  [BlockType.SNOW]: 0xffffff,
  [BlockType.WOOD]: 0x4e342e,
  [BlockType.LEAVES]: 0x388e3c,
  [BlockType.CLOUD]: 0xffffff
};

const HARDNESS = {
    [BlockType.GRASS]: 150, 
    [BlockType.DIRT]: 150,
    [BlockType.STONE]: 400,
    [BlockType.SAND]: 100,
    [BlockType.SNOW]: 100,
    [BlockType.WOOD]: 300,
    [BlockType.LEAVES]: 50
}

// --- WORLD MANAGER (Spatial Hash) ---
class WorldManager {
    public blocks = new Map<string, { type: string, instanceId: number, mesh: THREE.InstancedMesh }>();
    
    // Blocks are centered at integers. range [x-0.5, x+0.5]
    // So point 0.6 is in block 1. point 0.4 is in block 0.
    // Math.round gives the correct index.
    getBlock(x: number, y: number, z: number) {
        return this.blocks.get(`${Math.round(x)},${Math.round(y)},${Math.round(z)}`);
    }

    isSolid(x: number, y: number, z: number) {
        const block = this.getBlock(x, y, z);
        return block && block.type !== BlockType.WATER && block.type !== BlockType.CLOUD;
    }

    removeBlock(x: number, y: number, z: number) {
        const key = `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
        const block = this.blocks.get(key);
        if (block) {
            const matrix = new THREE.Matrix4();
            matrix.makeScale(0, 0, 0); 
            block.mesh.setMatrixAt(block.instanceId, matrix);
            block.mesh.instanceMatrix.needsUpdate = true;
            this.blocks.delete(key);
            return block.type;
        }
        return null;
    }
}

// --- PLAYER MESH ---
class PlayerActor {
    public mesh: THREE.Group;
    private head: THREE.Mesh;
    private body: THREE.Mesh;
    private armL: THREE.Mesh;
    private armR: THREE.Mesh;
    private legL: THREE.Mesh;
    private legR: THREE.Mesh;
    private walkTime = 0;

    constructor(scene: THREE.Scene) {
        this.mesh = new THREE.Group();
        
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0aa94 });
        const shirtMat = new THREE.MeshStandardMaterial({ color: 0x3366cc });
        const pantsMat = new THREE.MeshStandardMaterial({ color: 0x333399 });

        // Head
        this.head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
        this.head.position.y = 1.65;
        this.mesh.add(this.head);

        // Body
        this.body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.3), shirtMat);
        this.body.position.y = 1.05;
        this.mesh.add(this.body);

        // Arms
        const armGeo = new THREE.BoxGeometry(0.2, 0.7, 0.2);
        this.armL = new THREE.Mesh(armGeo, skinMat);
        this.armL.position.set(-0.4, 1.05, 0);
        this.mesh.add(this.armL);

        this.armR = new THREE.Mesh(armGeo, skinMat);
        this.armR.position.set(0.4, 1.05, 0);
        this.mesh.add(this.armR);

        // Legs
        const legGeo = new THREE.BoxGeometry(0.25, 0.7, 0.25);
        this.legL = new THREE.Mesh(legGeo, pantsMat);
        this.legL.position.set(-0.15, 0.35, 0);
        this.mesh.add(this.legL);

        this.legR = new THREE.Mesh(legGeo, pantsMat);
        this.legR.position.set(0.15, 0.35, 0);
        this.mesh.add(this.legR);

        // Shadow
        this.mesh.traverse(o => {
            o.castShadow = true;
            o.receiveShadow = true;
        });

        scene.add(this.mesh);
    }

    update(dt: number, speed: number, isFlying: boolean) {
        if (speed > 0.5 && !isFlying) {
            this.walkTime += dt * speed * 1.5;
            
            // Walk cycle
            this.legL.rotation.x = Math.sin(this.walkTime) * 0.8;
            this.legR.rotation.x = Math.sin(this.walkTime + Math.PI) * 0.8;
            
            this.armL.rotation.x = Math.sin(this.walkTime + Math.PI) * 0.8;
            this.armR.rotation.x = Math.sin(this.walkTime) * 0.8;
        } else {
            // Reset limbs
            const lerp = 10 * dt;
            this.legL.rotation.x = THREE.MathUtils.lerp(this.legL.rotation.x, 0, lerp);
            this.legR.rotation.x = THREE.MathUtils.lerp(this.legR.rotation.x, 0, lerp);
            this.armL.rotation.x = THREE.MathUtils.lerp(this.armL.rotation.x, 0, lerp);
            this.armR.rotation.x = THREE.MathUtils.lerp(this.armR.rotation.x, 0, lerp);
        }
    }

    setPosition(pos: THREE.Vector3) {
        this.mesh.position.copy(pos);
    }
    
    setRotation(yaw: number) {
        this.mesh.rotation.y = yaw;
    }
}

// --- PARTICLE SYSTEM ---
class ParticleSystem {
    private mesh: THREE.InstancedMesh;
    private count = 1000;
    private particles: { position: THREE.Vector3, velocity: THREE.Vector3, life: number, active: boolean }[] = [];
    private dummy = new THREE.Object3D();
    private activeIndex = 0;

    constructor(scene: THREE.Scene) {
        const geometry = new THREE.BoxGeometry(0.15, 0.15, 0.15);
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.mesh = new THREE.InstancedMesh(geometry, material, this.count);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(this.mesh);

        for (let i=0; i<this.count; i++) {
            this.particles.push({
                position: new THREE.Vector3(),
                velocity: new THREE.Vector3(),
                life: 0,
                active: false
            });
            this.dummy.position.set(0, -1000, 0);
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix);
        }
    }

    emit(pos: THREE.Vector3, color: number, amount: number = 8) {
        this.mesh.material.color.setHex(color);
        for(let i=0; i<amount; i++) {
            this.activeIndex = (this.activeIndex + 1) % this.count;
            const p = this.particles[this.activeIndex];
            p.active = true;
            p.life = 1.0; 
            p.position.copy(pos);
            p.position.x += (Math.random() - 0.5) * 0.8;
            p.position.y += (Math.random() - 0.5) * 0.8;
            p.position.z += (Math.random() - 0.5) * 0.8;
            
            p.velocity.set(
                (Math.random() - 0.5) * 5,
                (Math.random() * 5) + 2, 
                (Math.random() - 0.5) * 5
            );
        }
    }

    update(dt: number) {
        let dirty = false;
        for(let i=0; i<this.count; i++) {
            const p = this.particles[i];
            if (p.active) {
                p.life -= dt;
                p.velocity.y -= 15 * dt;
                p.position.addScaledVector(p.velocity, dt);

                if (p.life <= 0) {
                    p.active = false;
                    this.dummy.position.set(0, -1000, 0);
                } else {
                    this.dummy.position.copy(p.position);
                    this.dummy.rotation.x += p.velocity.z * dt;
                    this.dummy.rotation.y += p.velocity.x * dt;
                }
                this.dummy.updateMatrix();
                this.mesh.setMatrixAt(i, this.dummy.matrix);
                dirty = true;
            }
        }
        if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
    }
}

// --- PHYSICS CONTROLLER ---
class PhysicsController {
    public position = new THREE.Vector3(0, 40, 0);
    public velocity = new THREE.Vector3();
    public flying = false;
    public onGround = false;
    
    private world: WorldManager;
    private playerHeight = 1.8;
    private playerWidth = 0.6;
    private boxMin = new THREE.Vector3();
    private boxMax = new THREE.Vector3();

    constructor(world: WorldManager) {
        this.world = world;
    }

    private getCollidingBlocks(min: THREE.Vector3, max: THREE.Vector3) {
        const blocks = [];
        const startX = Math.round(min.x);
        const endX = Math.round(max.x);
        const startY = Math.round(min.y);
        const endY = Math.round(max.y);
        const startZ = Math.round(min.z);
        const endZ = Math.round(max.z);

        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                for (let z = startZ; z <= endZ; z++) {
                    if (this.world.isSolid(x, y, z)) {
                        blocks.push({ x, y, z, 
                            min: new THREE.Vector3(x - 0.5, y - 0.5, z - 0.5),
                            max: new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5)
                        });
                    }
                }
            }
        }
        return blocks;
    }

    private testCollision(pos: THREE.Vector3): boolean {
        const hw = this.playerWidth / 2;
        this.boxMin.set(pos.x - hw, pos.y, pos.z - hw);
        this.boxMax.set(pos.x + hw, pos.y + this.playerHeight, pos.z + hw);

        const blocks = this.getCollidingBlocks(this.boxMin, this.boxMax);
        
        for (const b of blocks) {
            // AABB Overlap Test
            if (this.boxMin.x < b.max.x && this.boxMax.x > b.min.x &&
                this.boxMin.y < b.max.y && this.boxMax.y > b.min.y &&
                this.boxMin.z < b.max.z && this.boxMax.z > b.min.z) {
                return true;
            }
        }
        return false;
    }

    step(dt: number, yaw: number, input: { f: boolean, b: boolean, l: boolean, r: boolean, jump: boolean, shift: boolean }) {
        const inputVec = new THREE.Vector3();
        // Fixed Controls:
        // W (input.f) should move Forward (-Z direction relative to camera)
        // S (input.b) should move Backward (+Z direction relative to camera)
        inputVec.z = Number(input.b) - Number(input.f); 
        // A (input.l) should move Left (-X direction relative to camera)
        // D (input.r) should move Right (+X direction relative to camera)
        inputVec.x = Number(input.r) - Number(input.l);
        
        // Normalize input
        if (inputVec.lengthSq() > 0) inputVec.normalize();

        // Apply Rotation
        inputVec.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

        const speed = this.flying ? 25 : 6;
        const accel = this.flying ? 80 : 50;
        const friction = this.flying ? 0.9 : (this.onGround ? 0.8 : 0.95);

        // Apply Horizontal Velocity
        this.velocity.x += inputVec.x * accel * dt;
        this.velocity.z += inputVec.z * accel * dt;

        // Clamp Speed
        const hVel = new THREE.Vector2(this.velocity.x, this.velocity.z);
        if (hVel.length() > speed) {
            hVel.normalize().multiplyScalar(speed);
            this.velocity.x = hVel.x;
            this.velocity.z = hVel.y;
        }
        this.velocity.x *= friction;
        this.velocity.z *= friction;

        // Vertical Velocity
        if (this.flying) {
            // Direct velocity control for flight responsiveness
            this.velocity.y = 0;
            if (input.jump) this.velocity.y = 15;
            if (input.shift) this.velocity.y = -15;
        } else {
            this.velocity.y -= 32 * dt; // Gravity
            if (this.onGround && input.jump) {
                this.velocity.y = 9;
                this.onGround = false;
            }
        }

        // --- RESOLVE COLLISIONS ---
        const steps = 4; // Sub-steps for smoother collision
        const subDt = dt / steps;

        for (let s = 0; s < steps; s++) {
            this.performSubStep(subDt);
        }

        // World Bounds Reset
        if (this.position.y < -30) {
            this.position.set(0, 60, 0);
            this.velocity.set(0, 0, 0);
        }
    }

    private performSubStep(dt: number) {
        const pos = this.position.clone();
        
        // 1. Try moving X
        pos.x += this.velocity.x * dt;
        if (this.testCollision(pos)) {
            // Check Auto-step
            if (this.onGround && !this.flying) {
                const stepCandidate = pos.clone();
                stepCandidate.y += 1.1; 
                if (!this.testCollision(stepCandidate)) {
                    this.position.x = pos.x;
                    this.position.y = Math.floor(this.position.y) + 1 + 0.001;
                } else {
                     this.velocity.x = 0; // Wall hit
                }
            } else {
                 this.velocity.x = 0;
            }
        } else {
            this.position.x = pos.x;
        }

        // 2. Try moving Z
        pos.copy(this.position);
        pos.z += this.velocity.z * dt;
        if (this.testCollision(pos)) {
            // Check Auto-step
             if (this.onGround && !this.flying) {
                const stepCandidate = pos.clone();
                stepCandidate.y += 1.1; 
                if (!this.testCollision(stepCandidate)) {
                    this.position.z = pos.z;
                    this.position.y = Math.floor(this.position.y) + 1 + 0.001;
                } else {
                     this.velocity.z = 0;
                }
            } else {
                 this.velocity.z = 0;
            }
        } else {
            this.position.z = pos.z;
        }

        // 3. Try moving Y
        pos.copy(this.position);
        pos.y += this.velocity.y * dt;
        
        if (this.testCollision(pos)) {
             if (this.velocity.y < 0) {
                 // Hit ground
                 this.onGround = true;
                 this.velocity.y = 0;
                 // Snap to grid top
                 this.position.y = Math.round(pos.y - this.playerHeight/2) + 0.5 + 0.0001;
             } else if (this.velocity.y > 0) {
                 // Hit head
                 this.velocity.y = 0;
                 this.position.y = Math.round(pos.y + this.playerHeight) - 0.5 - this.playerHeight - 0.01;
             }
        } else {
            this.position.y = pos.y;
            this.onGround = false;
        }
    }
}

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef(new WorldManager());
  const physicsRef = useRef<PhysicsController | null>(null);
  const particlesRef = useRef<ParticleSystem | null>(null);
  const playerRef = useRef<PlayerActor | null>(null);
  
  // Camera Rig Refs
  const cameraPivotRef = useRef(new THREE.Object3D());
  const cameraYaw = useRef(0);
  const cameraPitch = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;
    
    const world = worldRef.current;

    // --- SCENE ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 20, 90);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 150);
    
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);

    // --- LIGHTING ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 200;
    dirLight.shadow.camera.left = -60;
    dirLight.shadow.camera.right = 60;
    dirLight.shadow.camera.top = 60;
    dirLight.shadow.camera.bottom = -60;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    // --- WORLD GEN ---
    const noiseGen = new SimpleNoise();
    const instances: Record<string, { matrix: number[], count: number }> = {};
    Object.values(BlockType).forEach(type => instances[type] = { matrix: [], count: 0 });
    
    const dummy = new THREE.Object3D();
    const offset = WORLD_SIZE / 2;

    const getNoiseHeight = (x: number, z: number) => {
      let y = noiseGen.noise(x * 0.03, 0, z * 0.03) * 15;
      y += noiseGen.noise(x * 0.1, 100, z * 0.1) * 5;
      return Math.round(y + 10);
    };

    for (let x = -offset; x < offset; x++) {
      for (let z = -offset; z < offset; z++) {
        const h = getNoiseHeight(x, z);
        let surfaceType = BlockType.GRASS;
        if (h < WATER_LEVEL + 2) surfaceType = BlockType.SAND;
        if (h > 22) surfaceType = BlockType.STONE;
        if (h > 28) surfaceType = BlockType.SNOW;

        for (let y = -4; y <= h; y++) {
          let type = surfaceType;
          if (y < h) {
             type = BlockType.DIRT;
             if (h > 22) type = BlockType.STONE; 
          }
          if (y < h - 3) type = BlockType.STONE;
          
          if (y > h && y <= WATER_LEVEL) type = BlockType.WATER;
          else if (y > h) continue;

          dummy.position.set(x, y, z);
          dummy.updateMatrix();
          instances[type].matrix.push(...dummy.matrix.elements);
          instances[type].count++;
          
          if (type !== BlockType.CLOUD) {
              world.blocks.set(`${Math.round(x)},${Math.round(y)},${Math.round(z)}`, { 
                  type, 
                  instanceId: instances[type].count - 1,
                  mesh: null as any
              });
          }
        }
      }
    }

    // Clouds
    for(let i=0; i<100; i++) {
       const cx = (Math.random() - 0.5) * WORLD_SIZE * 1.5;
       const cz = (Math.random() - 0.5) * WORLD_SIZE * 1.5;
       const cy = 40 + Math.random() * 10;
       for(let j=0; j<5 + Math.random()*8; j++) {
          dummy.position.set(cx + Math.random()*6, cy, cz + Math.random()*6);
          dummy.updateMatrix();
          instances[BlockType.CLOUD].matrix.push(...dummy.matrix.elements);
          instances[BlockType.CLOUD].count++;
       }
    }

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const instancedMeshes: THREE.InstancedMesh[] = [];

    Object.keys(instances).forEach(key => {
      const data = instances[key];
      if (data.count === 0) return;

      const material = new THREE.MeshStandardMaterial({ 
        color: PALETTE[key],
        roughness: 0.9,
      });

      if (key === BlockType.WATER) {
        material.transparent = true;
        material.opacity = 0.6;
        material.roughness = 0.1;
      } else if (key === BlockType.CLOUD) {
        material.transparent = true;
        material.opacity = 0.8;
      }

      const mesh = new THREE.InstancedMesh(geometry, material, data.count);
      mesh.castShadow = (key !== BlockType.WATER && key !== BlockType.CLOUD);
      mesh.receiveShadow = true;
      
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < data.count; i++) {
        matrix.fromArray(data.matrix, i * 16);
        mesh.setMatrixAt(i, matrix);
        if (key !== BlockType.CLOUD && key !== BlockType.WATER) {
            const pos = new THREE.Vector3();
            pos.setFromMatrixPosition(matrix);
            const blockData = world.getBlock(pos.x, pos.y, pos.z);
            if (blockData) blockData.mesh = mesh;
        }
      }
      scene.add(mesh);
      instancedMeshes.push(mesh);
    });

    // --- ENTITIES ---
    const particles = new ParticleSystem(scene);
    particlesRef.current = particles;

    const player = new PlayerActor(scene);
    playerRef.current = player;
    
    scene.add(cameraPivotRef.current); 
    cameraPivotRef.current.add(camera);
    camera.position.set(0, 1.5, 4); 

    physicsRef.current = new PhysicsController(world);

    // --- CONTROLS ---
    const startScreen = document.getElementById('start-screen');
    const startBtn = document.getElementById('start-btn');
    const miningRing = document.getElementById('mining-ring');
    let isLocked = false;

    const lockPointer = () => {
        document.body.requestPointerLock();
    };

    if(startBtn) startBtn.addEventListener('click', lockPointer);

    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === document.body) {
            isLocked = true;
            if(startScreen) startScreen.style.display = 'none';
            document.getElementById('info-panel')!.style.opacity = '0.3';
        } else {
            isLocked = false;
            if(startScreen) startScreen.style.display = 'flex';
            document.getElementById('info-panel')!.style.opacity = '1';
        }
    });

    // Camera Rotation
    document.addEventListener('mousemove', (e) => {
        if (!isLocked) return;
        const sensitivity = 0.002;
        cameraYaw.current -= e.movementX * sensitivity;
        cameraPitch.current -= e.movementY * sensitivity;
        
        // Clamp Pitch
        cameraPitch.current = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, cameraPitch.current));
    });

    const inputs = { f: false, b: false, l: false, r: false, jump: false, shift: false };
    const onKeyDown = (e: KeyboardEvent) => {
        switch(e.code) {
            case 'KeyW': inputs.f = true; break;
            case 'KeyS': inputs.b = true; break;
            case 'KeyA': inputs.l = true; break;
            case 'KeyD': inputs.r = true; break;
            case 'Space': inputs.jump = true; break;
            case 'ShiftLeft': inputs.shift = true; break;
            case 'KeyF': 
                if(physicsRef.current) {
                    physicsRef.current.flying = !physicsRef.current.flying; 
                    if(physicsRef.current.flying) {
                         physicsRef.current.velocity.y = 2.0; // Little jump to detach from ground
                         physicsRef.current.onGround = false;
                    }
                    console.log("Flying Mode:", physicsRef.current.flying);
                }
                break;
        }
    };
    const onKeyUp = (e: KeyboardEvent) => {
        switch(e.code) {
            case 'KeyW': inputs.f = false; break;
            case 'KeyS': inputs.b = false; break;
            case 'KeyA': inputs.l = false; break;
            case 'KeyD': inputs.r = false; break;
            case 'Space': inputs.jump = false; break;
            case 'ShiftLeft': inputs.shift = false; break;
        }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Mining
    const raycaster = new THREE.Raycaster();
    const center = new THREE.Vector2(0, 0);
    let isMining = false;
    let mineStartTime = 0;
    let targetBlock: { x: number, y: number, z: number, type: string } | null = null;

    const onMouseDown = () => { if(isLocked) { isMining = true; mineStartTime = performance.now(); } };
    const onMouseUp = () => { isMining = false; if(miningRing) miningRing.style.transform = 'scale(0)'; };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);

    let prevTime = performance.now();
    
    const animate = () => {
      requestAnimationFrame(animate);
      const time = performance.now();
      const delta = Math.min((time - prevTime) / 1000, 0.1);
      prevTime = time;

      if (isLocked && physicsRef.current && playerRef.current) {
        const phys = physicsRef.current;
        
        // Physics Step
        phys.step(delta, cameraYaw.current, inputs);
        
        // Update Player Mesh
        playerRef.current.setPosition(phys.position);
        playerRef.current.setRotation(cameraYaw.current); 
        playerRef.current.update(delta, new THREE.Vector2(phys.velocity.x, phys.velocity.z).length(), phys.flying);

        // Update Camera Rig
        const lookTarget = phys.position.clone().add(new THREE.Vector3(0, 1.5, 0));
        cameraPivotRef.current.position.copy(lookTarget);
        cameraPivotRef.current.rotation.y = cameraYaw.current;
        cameraPivotRef.current.rotation.x = cameraPitch.current;
        
        // Mining Raycast (From camera center, ignoring player mesh)
        raycaster.setFromCamera(center, camera);
        raycaster.far = 6; 
        
        // Raycast against world
        const intersects = raycaster.intersectObjects(instancedMeshes);
        let foundBlock = false;
        
        if (intersects.length > 0) {
            const hit = intersects[0];
            if (hit.instanceId !== undefined) {
                // Calculate block position from normal
                const p = hit.point.clone().addScaledVector(hit.face!.normal!, -0.5);
                const bx = Math.round(p.x);
                const by = Math.round(p.y);
                const bz = Math.round(p.z);

                const block = world.getBlock(bx, by, bz);
                if (block) {
                    foundBlock = true;
                    if (!targetBlock || targetBlock.x !== bx || targetBlock.y !== by || targetBlock.z !== bz) {
                        targetBlock = { x: bx, y: by, z: bz, type: block.type };
                        mineStartTime = time;
                    }
                    if (isMining) {
                        const hardness = HARDNESS[block.type] || 200;
                        const elapsed = time - mineStartTime;
                        const progress = Math.min(elapsed / hardness, 1);
                        
                        if (miningRing) {
                            miningRing.style.transform = `scale(${progress})`;
                            miningRing.style.borderColor = progress > 0.8 ? '#ff4444' : 'rgba(255, 255, 255, 0.8)';
                        }
                        if (progress >= 1) {
                            const removedType = world.removeBlock(bx, by, bz);
                            if (removedType && particlesRef.current) {
                                particlesRef.current.emit(
                                    new THREE.Vector3(bx, by, bz), 
                                    PALETTE[removedType],
                                    12
                                );
                            }
                            isMining = false;
                            if (miningRing) miningRing.style.transform = 'scale(0)';
                        }
                    } else {
                        if (miningRing) miningRing.style.transform = 'scale(0)';
                    }
                }
            }
        }
        if (!foundBlock) {
            targetBlock = null;
            if (miningRing) miningRing.style.transform = 'scale(0)';
        }
      }

      if (particlesRef.current) particlesRef.current.update(delta);
      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      if(containerRef.current) containerRef.current.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={containerRef} />;
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
