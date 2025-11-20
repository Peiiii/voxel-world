
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

// --- CONSTANTS & PALETTE (Minecraft Style) ---
const WORLD_SIZE = 80; 
const WATER_LEVEL = 8;

const BlockType = {
  GRASS: 'grass',
  DIRT: 'dirt',
  STONE: 'stone',
  SAND: 'sand',
  WATER: 'water',
  SNOW: 'snow',
  WOOD: 'wood',
  LEAVES: 'leaves',
  CLOUD: 'cloud',
  PLANKS: 'planks',
  GLASS: 'glass',
  FLOWER_RED: 'flower_red',
  FLOWER_YELLOW: 'flower_yellow',
  TALL_GRASS: 'tall_grass'
};

// MC-inspired palette
const PALETTE = {
  [BlockType.GRASS]: 0x59982F,  // Vibrant green
  [BlockType.DIRT]: 0x856042,   // Rich brown
  [BlockType.STONE]: 0x919191,  // Classic grey
  [BlockType.SAND]: 0xDCCFA3,   // Pale sand
  [BlockType.WATER]: 0x3F76E4,  // Deep blue
  [BlockType.SNOW]: 0xFFFFFF,
  [BlockType.WOOD]: 0x5C4033,   // Oak wood
  [BlockType.LEAVES]: 0x4A8F28, // Oak leaves
  [BlockType.CLOUD]: 0xFFFFFF,
  [BlockType.PLANKS]: 0xA68064, // Wood planks
  [BlockType.GLASS]: 0xAED9E0,  // Light blueish
  [BlockType.FLOWER_RED]: 0xFF0000,
  [BlockType.FLOWER_YELLOW]: 0xFFFF00,
  [BlockType.TALL_GRASS]: 0x4A8F28
};

const HARDNESS = {
    [BlockType.GRASS]: 150, 
    [BlockType.DIRT]: 150,
    [BlockType.STONE]: 400,
    [BlockType.SAND]: 100,
    [BlockType.SNOW]: 100,
    [BlockType.WOOD]: 300,
    [BlockType.LEAVES]: 50,
    [BlockType.PLANKS]: 300,
    [BlockType.GLASS]: 50
}

// --- WORLD MANAGER ---
class WorldManager {
    public blocks = new Map<string, { type: string, instanceId: number, mesh: THREE.InstancedMesh }>();
    
    getBlock(x: number, y: number, z: number) {
        return this.blocks.get(`${Math.round(x)},${Math.round(y)},${Math.round(z)}`);
    }

    isSolid(x: number, y: number, z: number) {
        const block = this.getBlock(x, y, z);
        if (!block) return false;
        const nonSolid = [
            BlockType.WATER, 
            BlockType.CLOUD, 
            BlockType.FLOWER_RED, 
            BlockType.FLOWER_YELLOW, 
            BlockType.TALL_GRASS
        ];
        return !nonSolid.includes(block.type);
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

// --- ENTITIES (Mobs) ---
class Mob {
    public mesh: THREE.Group;
    private body: THREE.Mesh;
    private head: THREE.Mesh;
    private leg1: THREE.Mesh;
    private leg2: THREE.Mesh;
    private leg3: THREE.Mesh;
    private leg4: THREE.Mesh;
    
    public position: THREE.Vector3;
    public rotation: number = 0;
    private moveTimer: number = 0;
    private isMoving: boolean = false;
    private moveDir: THREE.Vector3 = new THREE.Vector3();
    private walkTime: number = 0;
    private type: 'cow' | 'sheep';

    constructor(scene: THREE.Scene, type: 'cow' | 'sheep', x: number, y: number, z: number) {
        this.type = type;
        this.position = new THREE.Vector3(x, y, z);
        this.mesh = new THREE.Group();
        
        const bodyColor = type === 'cow' ? 0x333333 : 0xFFFFFF; // Dark grey cow, White sheep
        const headColor = type === 'cow' ? 0x666666 : 0xE0E0E0;
        
        // Body
        this.body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 1.3), new THREE.MeshStandardMaterial({ color: bodyColor }));
        this.body.position.y = 0.9;
        this.mesh.add(this.body);
        
        // Head
        this.head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: headColor }));
        this.head.position.set(0, 1.5, 0.8);
        this.mesh.add(this.head);
        
        // Legs
        const legGeo = new THREE.BoxGeometry(0.25, 0.6, 0.25);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
        
        this.leg1 = new THREE.Mesh(legGeo, legMat); this.leg1.position.set(-0.3, 0.3, 0.5);
        this.leg2 = new THREE.Mesh(legGeo, legMat); this.leg2.position.set(0.3, 0.3, 0.5);
        this.leg3 = new THREE.Mesh(legGeo, legMat); this.leg3.position.set(-0.3, 0.3, -0.5);
        this.leg4 = new THREE.Mesh(legGeo, legMat); this.leg4.position.set(0.3, 0.3, -0.5);
        
        this.mesh.add(this.leg1, this.leg2, this.leg3, this.leg4);
        
        this.mesh.traverse(o => {
            o.castShadow = true;
            o.receiveShadow = true;
        });

        scene.add(this.mesh);
    }

    update(dt: number, world: WorldManager) {
        this.moveTimer -= dt;
        if (this.moveTimer <= 0) {
            this.isMoving = !this.isMoving && Math.random() > 0.3;
            this.moveTimer = Math.random() * 3 + 1;
            if (this.isMoving) {
                this.rotation = Math.random() * Math.PI * 2;
                this.moveDir.set(Math.sin(this.rotation), 0, Math.cos(this.rotation));
            }
        }

        if (this.isMoving) {
            this.walkTime += dt * 5;
            const nextPos = this.position.clone().addScaledVector(this.moveDir, dt * 1.5);
            
            // Basic collision/gravity
            const bx = Math.round(nextPos.x);
            const bz = Math.round(nextPos.z);
            const by = Math.round(nextPos.y);
            
            // Check wall
            if (!world.isSolid(bx, by, bz) && !world.isSolid(bx, by + 1, bz)) {
                // Check floor (gravity)
                let groundY = by;
                while(!world.isSolid(bx, groundY - 1, bz) && groundY > -10) {
                    groundY--;
                }
                
                // Only move if ground is close (max 2 block drop) and not climbing huge walls
                if (Math.abs(groundY - by) <= 2) {
                    this.position.x = nextPos.x;
                    this.position.z = nextPos.z;
                    this.position.y = THREE.MathUtils.lerp(this.position.y, groundY, dt * 5);
                } else {
                    // Turn around if cliff or wall
                    this.rotation += Math.PI;
                    this.moveDir.set(Math.sin(this.rotation), 0, Math.cos(this.rotation));
                }
            } else {
                 // Turn around
                 this.rotation += Math.PI;
                 this.moveDir.set(Math.sin(this.rotation), 0, Math.cos(this.rotation));
            }

            // Animate legs
            this.leg1.rotation.x = Math.sin(this.walkTime) * 0.5;
            this.leg2.rotation.x = Math.cos(this.walkTime) * 0.5;
            this.leg3.rotation.x = Math.cos(this.walkTime) * 0.5;
            this.leg4.rotation.x = Math.sin(this.walkTime) * 0.5;
        } else {
            // Idle animation
            this.leg1.rotation.x = 0;
            this.leg2.rotation.x = 0;
            this.leg3.rotation.x = 0;
            this.leg4.rotation.x = 0;
            
            // Grazing
            if (Math.random() > 0.99) {
                this.head.rotation.x = 0.5; // Eat grass
            } else if (Math.random() > 0.95) {
                this.head.rotation.x = 0;
            }
        }

        this.mesh.position.copy(this.position);
        this.mesh.rotation.y = this.rotation;
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
        const shirtMat = new THREE.MeshStandardMaterial({ color: 0x00AAAA }); // Steve cyan
        const pantsMat = new THREE.MeshStandardMaterial({ color: 0x3333AA }); // Dark blue

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
            this.legL.rotation.x = Math.sin(this.walkTime) * 0.8;
            this.legR.rotation.x = Math.sin(this.walkTime + Math.PI) * 0.8;
            this.armL.rotation.x = Math.sin(this.walkTime + Math.PI) * 0.8;
            this.armR.rotation.x = Math.sin(this.walkTime) * 0.8;
        } else {
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
    private particles: { position: THREE.Vector3, velocity: THREE.Vector3, life: number, active: boolean, color: number }[] = [];
    private dummy = new THREE.Object3D();
    private activeIndex = 0;

    constructor(scene: THREE.Scene) {
        const geometry = new THREE.BoxGeometry(0.15, 0.15, 0.15);
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
        this.mesh = new THREE.InstancedMesh(geometry, material, this.count);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(this.mesh);
        
        // Initialize colors buffer
        const colors = new Float32Array(this.count * 3);
        this.mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);

        for (let i=0; i<this.count; i++) {
            this.particles.push({
                position: new THREE.Vector3(),
                velocity: new THREE.Vector3(),
                life: 0,
                active: false,
                color: 0xffffff
            });
            this.dummy.position.set(0, -1000, 0);
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix);
        }
    }

    emit(pos: THREE.Vector3, colorHex: number, amount: number = 8) {
        const color = new THREE.Color(colorHex);
        for(let i=0; i<amount; i++) {
            this.activeIndex = (this.activeIndex + 1) % this.count;
            const p = this.particles[this.activeIndex];
            p.active = true;
            p.life = 1.0; 
            p.position.copy(pos);
            // Add randomness to spawn
            p.position.x += (Math.random() - 0.5) * 0.8;
            p.position.y += (Math.random() - 0.5) * 0.8;
            p.position.z += (Math.random() - 0.5) * 0.8;
            
            p.velocity.set(
                (Math.random() - 0.5) * 5,
                (Math.random() * 5) + 2, 
                (Math.random() - 0.5) * 5
            );
            
            // Update instance color
            this.mesh.setColorAt(this.activeIndex, color);
        }
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }

    update(dt: number) {
        let dirty = false;
        for(let i=0; i<this.count; i++) {
            const p = this.particles[i];
            if (p.active) {
                p.life -= dt;
                p.velocity.y -= 15 * dt; // Gravity
                p.position.addScaledVector(p.velocity, dt);

                if (p.life <= 0) {
                    p.active = false;
                    this.dummy.position.set(0, -1000, 0);
                } else {
                    this.dummy.position.copy(p.position);
                    this.dummy.rotation.x += p.velocity.z * dt;
                    this.dummy.rotation.y += p.velocity.x * dt;
                    const scale = p.life; 
                    this.dummy.scale.set(scale, scale, scale);
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
        inputVec.z = Number(input.b) - Number(input.f); 
        inputVec.x = Number(input.r) - Number(input.l);
        
        if (inputVec.lengthSq() > 0) inputVec.normalize();
        inputVec.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

        const speed = this.flying ? 25 : 6;
        const accel = this.flying ? 80 : 50;
        const friction = this.flying ? 0.9 : (this.onGround ? 0.8 : 0.95);

        this.velocity.x += inputVec.x * accel * dt;
        this.velocity.z += inputVec.z * accel * dt;

        const hVel = new THREE.Vector2(this.velocity.x, this.velocity.z);
        if (hVel.length() > speed) {
            hVel.normalize().multiplyScalar(speed);
            this.velocity.x = hVel.x;
            this.velocity.z = hVel.y;
        }
        this.velocity.x *= friction;
        this.velocity.z *= friction;

        if (this.flying) {
            this.velocity.y = 0;
            if (input.jump) this.velocity.y = 15;
            if (input.shift) this.velocity.y = -15;
        } else {
            this.velocity.y -= 32 * dt;
            if (this.onGround && input.jump) {
                this.velocity.y = 9;
                this.onGround = false;
            }
        }

        const steps = 4; 
        const subDt = dt / steps;

        for (let s = 0; s < steps; s++) {
            this.performSubStep(subDt);
        }

        if (this.position.y < -30) {
            this.position.set(0, 60, 0);
            this.velocity.set(0, 0, 0);
        }
    }

    private performSubStep(dt: number) {
        const pos = this.position.clone();
        
        // X Movement
        pos.x += this.velocity.x * dt;
        if (this.testCollision(pos)) {
            if (this.onGround && !this.flying) {
                const stepCandidate = pos.clone();
                stepCandidate.y += 1.1; 
                if (!this.testCollision(stepCandidate)) {
                    this.position.x = pos.x;
                    this.position.y = Math.floor(this.position.y) + 1 + 0.001;
                } else {
                     this.velocity.x = 0; 
                }
            } else {
                 this.velocity.x = 0;
            }
        } else {
            this.position.x = pos.x;
        }

        // Z Movement
        pos.copy(this.position);
        pos.z += this.velocity.z * dt;
        if (this.testCollision(pos)) {
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

        // Y Movement
        pos.copy(this.position);
        pos.y += this.velocity.y * dt;
        
        if (this.testCollision(pos)) {
             if (this.velocity.y < 0) {
                 this.onGround = true;
                 this.velocity.y = 0;
                 this.position.y = Math.round(pos.y - this.playerHeight/2) + 0.5 + 0.0001;
             } else if (this.velocity.y > 0) {
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
  const mobsRef = useRef<Mob[]>([]);
  
  // Visual smoothing
  const visualPosRef = useRef(new THREE.Vector3(0, 40, 0));
  
  const cameraYawRef = useRef(new THREE.Group());
  const cameraPitchRef = useRef(new THREE.Group());
  const cameraYaw = useRef(0);
  const cameraPitch = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;
    
    const world = worldRef.current;

    // --- SCENE & ATMOSPHERE ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Nice sky blue
    scene.fog = new THREE.Fog(0x87CEEB, 30, 120);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
    
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);

    // --- LIGHTING ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(50, 150, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 4096; // Higher res shadows
    dirLight.shadow.mapSize.height = 4096;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 300;
    dirLight.shadow.camera.left = -80;
    dirLight.shadow.camera.right = 80;
    dirLight.shadow.camera.top = 80;
    dirLight.shadow.camera.bottom = -80;
    dirLight.shadow.bias = -0.0004;
    scene.add(dirLight);

    // --- WORLD GENERATION HELPERS ---
    const instances: Record<string, { matrix: number[], count: number }> = {};
    Object.values(BlockType).forEach(type => instances[type] = { matrix: [], count: 0 });
    const dummy = new THREE.Object3D();

    const addBlock = (type: string, x: number, y: number, z: number) => {
        if (!instances[type]) return;
        dummy.position.set(x, y, z);
        dummy.updateMatrix();
        instances[type].matrix.push(...dummy.matrix.elements);
        instances[type].count++;
        
        const solidTypes = [BlockType.GRASS, BlockType.DIRT, BlockType.STONE, BlockType.SAND, BlockType.WOOD, BlockType.PLANKS];
        if (solidTypes.includes(type)) {
            world.blocks.set(`${Math.round(x)},${Math.round(y)},${Math.round(z)}`, { 
                type, 
                instanceId: instances[type].count - 1,
                mesh: null as any
            });
        }
    };

    const noiseGen = new SimpleNoise();
    const offset = WORLD_SIZE / 2;

    // 1. Base Terrain Pass
    const getNoiseHeight = (x: number, z: number) => {
      let y = noiseGen.noise(x * 0.02, 0, z * 0.02) * 18;
      y += noiseGen.noise(x * 0.1, 100, z * 0.1) * 4;
      return Math.round(y + 12);
    };

    // Track heightmap for decoration
    const heightMap = new Map<string, number>();

    for (let x = -offset; x < offset; x++) {
      for (let z = -offset; z < offset; z++) {
        const h = getNoiseHeight(x, z);
        heightMap.set(`${x},${z}`, h);

        let surfaceType = BlockType.GRASS;
        if (h < WATER_LEVEL + 2) surfaceType = BlockType.SAND;
        if (h > 28) surfaceType = BlockType.STONE;
        if (h > 35) surfaceType = BlockType.SNOW;

        for (let y = -4; y <= h; y++) {
          let type = surfaceType;
          if (y < h) {
             type = BlockType.DIRT;
             if (h > 28) type = BlockType.STONE; 
          }
          if (y < h - 3) type = BlockType.STONE;
          
          if (y > h && y <= WATER_LEVEL) type = BlockType.WATER;
          else if (y > h) continue;

          addBlock(type, x, y, z);
        }
      }
    }

    // 2. Decoration Pass (Trees, Grass, Structures)
    for (let x = -offset + 2; x < offset - 2; x++) {
        for (let z = -offset + 2; z < offset - 2; z++) {
            const h = heightMap.get(`${x},${z}`)!;
            const surface = world.getBlock(x, h, z);
            
            if (surface && surface.type === BlockType.GRASS && h > WATER_LEVEL) {
                const rand = Math.random();
                
                // Trees
                if (rand < 0.015) {
                    const treeHeight = 4 + Math.floor(Math.random() * 2);
                    // Trunk
                    for(let i=1; i<=treeHeight; i++) addBlock(BlockType.WOOD, x, h+i, z);
                    // Leaves
                    for(let lx = -2; lx <= 2; lx++) {
                        for(let lz = -2; lz <= 2; lz++) {
                            for(let ly = treeHeight - 1; ly <= treeHeight + 1; ly++) {
                                if (Math.abs(lx) + Math.abs(lz) + Math.abs(ly - treeHeight) < 4) {
                                    if(lx===0 && lz===0 && ly < treeHeight+1) continue; // skip trunk pos
                                    addBlock(BlockType.LEAVES, x+lx, h+ly, z+lz);
                                }
                            }
                        }
                    }
                } 
                // Flowers & Tall Grass
                else if (rand < 0.08) {
                    const floraType = rand < 0.03 ? BlockType.FLOWER_RED : (rand < 0.05 ? BlockType.FLOWER_YELLOW : BlockType.TALL_GRASS);
                    addBlock(floraType, x, h+1, z);
                }
                // House (Rare)
                else if (rand > 0.995 && x % 2 === 0 && z % 2 === 0) {
                    // Simple check if flat-ish
                    let flat = true;
                    for(let hx=-2; hx<=2; hx++) {
                        for(let hz=-2; hz<=2; hz++) {
                            if (Math.abs(heightMap.get(`${x+hx},${z+hz}`)! - h) > 1) flat = false;
                        }
                    }
                    
                    if (flat) {
                        // Build Hut
                        for(let bx=-2; bx<=2; bx++) {
                            for(let bz=-2; bz<=2; bz++) {
                                for(let by=0; by<4; by++) {
                                    if (bx===-2||bx===2||bz===-2||bz===2) {
                                         // Walls with glass
                                         if (by===1 && bx!==0 && bz!==0) addBlock(BlockType.GLASS, x+bx, h+1+by, z+bz);
                                         else if (!(bx===0 && bz===2 && by < 2)) addBlock(BlockType.PLANKS, x+bx, h+1+by, z+bz); // Door gap
                                    } else if (by===0) {
                                        addBlock(BlockType.PLANKS, x+bx, h+1, z+bz); // Floor
                                    }
                                }
                                addBlock(BlockType.WOOD, x+bx, h+4, z+bz); // Roof
                            }
                        }
                    }
                }
                // Spawn Mobs
                else if (rand > 0.98) {
                    const mobType = Math.random() > 0.5 ? 'cow' : 'sheep';
                    mobsRef.current.push(new Mob(scene, mobType, x, h + 1, z));
                }
            }
        }
    }

    // Clouds
    for(let i=0; i<50; i++) {
       const cx = (Math.random() - 0.5) * WORLD_SIZE * 2;
       const cz = (Math.random() - 0.5) * WORLD_SIZE * 2;
       const cy = 55 + Math.random() * 10;
       for(let j=0; j<8 + Math.random()*10; j++) {
          addBlock(BlockType.CLOUD, cx + Math.random()*10, cy, cz + Math.random()*10);
       }
    }

    // --- BUILD MESHES ---
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const smallGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6); // For flowers
    const instancedMeshes: THREE.InstancedMesh[] = [];

    Object.keys(instances).forEach(key => {
      const data = instances[key];
      if (data.count === 0) return;

      const isFlora = [BlockType.FLOWER_RED, BlockType.FLOWER_YELLOW, BlockType.TALL_GRASS].includes(key);
      const geo = isFlora ? smallGeo : geometry;

      const material = new THREE.MeshStandardMaterial({ 
        color: PALETTE[key],
        roughness: 0.8,
      });

      if (key === BlockType.WATER) {
        material.transparent = true;
        material.opacity = 0.6;
        material.roughness = 0.1;
      } else if (key === BlockType.CLOUD) {
        material.transparent = true;
        material.opacity = 0.8;
      } else if (key === BlockType.GLASS) {
        material.transparent = true;
        material.opacity = 0.4;
      }

      const mesh = new THREE.InstancedMesh(geo, material, data.count);
      mesh.castShadow = !([BlockType.WATER, BlockType.CLOUD, BlockType.GLASS].includes(key));
      mesh.receiveShadow = true;
      
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < data.count; i++) {
        matrix.fromArray(data.matrix, i * 16);
        mesh.setMatrixAt(i, matrix);
        
        // Link mesh to world for raycasting/removal
        if (![BlockType.CLOUD, BlockType.WATER, BlockType.TALL_GRASS, BlockType.FLOWER_RED, BlockType.FLOWER_YELLOW].includes(key)) {
            const pos = new THREE.Vector3();
            pos.setFromMatrixPosition(matrix);
            const blockData = world.getBlock(pos.x, pos.y, pos.z);
            if (blockData) blockData.mesh = mesh;
        }
      }
      scene.add(mesh);
      instancedMeshes.push(mesh);
    });

    // --- INIT SYSTEMS ---
    const particles = new ParticleSystem(scene);
    particlesRef.current = particles;

    const player = new PlayerActor(scene);
    playerRef.current = player;
    
    scene.add(cameraYawRef.current);
    cameraYawRef.current.add(cameraPitchRef.current);
    cameraPitchRef.current.add(camera);
    
    camera.position.set(0, 0.5, 4); 

    physicsRef.current = new PhysicsController(world);
    
    // Initialize position
    physicsRef.current.position.y = 40;
    visualPosRef.current.y = 40;

    // --- CONTROLS ---
    const startScreen = document.getElementById('start-screen');
    const startBtn = document.getElementById('start-btn');
    const miningRing = document.getElementById('mining-ring');
    let isLocked = false;

    const lockPointer = () => { document.body.requestPointerLock(); };
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

    document.addEventListener('mousemove', (e) => {
        if (!isLocked) return;
        const sensitivity = 0.002;
        cameraYaw.current -= e.movementX * sensitivity;
        cameraPitch.current -= e.movementY * sensitivity;
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
                         physicsRef.current.velocity.y = 2.0; 
                         physicsRef.current.onGround = false;
                    }
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

      // Update Mobs
      mobsRef.current.forEach(mob => mob.update(delta, world));

      if (isLocked && physicsRef.current && playerRef.current) {
        const phys = physicsRef.current;
        
        phys.step(delta, cameraYaw.current, inputs);
        
        // VISUAL SMOOTHING FOR AUTO-STEP
        // Instead of snapping directly to phys.position.y, we lerp towards it
        visualPosRef.current.x = phys.position.x;
        visualPosRef.current.z = phys.position.z;
        visualPosRef.current.y = THREE.MathUtils.lerp(visualPosRef.current.y, phys.position.y, delta * 15);

        // Apply smoothed position
        playerRef.current.setPosition(visualPosRef.current);
        playerRef.current.setRotation(cameraYaw.current); 
        playerRef.current.update(delta, new THREE.Vector2(phys.velocity.x, phys.velocity.z).length(), phys.flying);

        const lookTarget = visualPosRef.current.clone().add(new THREE.Vector3(0, 1.5, 0));
        cameraYawRef.current.position.copy(lookTarget);
        cameraYawRef.current.rotation.y = cameraYaw.current;
        cameraPitchRef.current.rotation.x = cameraPitch.current;
        
        raycaster.setFromCamera(center, camera);
        raycaster.far = 6; 
        
        const intersects = raycaster.intersectObjects(instancedMeshes);
        let foundBlock = false;
        
        if (intersects.length > 0) {
            const hit = intersects[0];
            if (hit.instanceId !== undefined) {
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
