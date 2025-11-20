
import * as THREE from 'three';
import { BlockType, PALETTE, SimpleNoise, WORLD_SIZE, WATER_LEVEL } from '../utils/constants';

// --- SUB-CLASSES (Internal to World Manager for now to keep simplicity) ---

class SelectionBox {
    public mesh: THREE.LineSegments;
    constructor(scene: THREE.Scene) {
        const geometry = new THREE.BoxGeometry(1.005, 1.005, 1.005);
        const edges = new THREE.EdgesGeometry(geometry);
        this.mesh = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, opacity: 0.4, transparent: true }));
        this.mesh.visible = false;
        scene.add(this.mesh);
    }
    update(x: number, y: number, z: number, visible: boolean) {
        this.mesh.visible = visible;
        if (visible) this.mesh.position.set(x, y, z);
    }
}

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

    constructor(type: 'cow' | 'sheep', x: number, y: number, z: number) {
        this.type = type;
        this.position = new THREE.Vector3(x, y, z);
        this.mesh = new THREE.Group();
        
        const bodyColor = type === 'cow' ? 0x333333 : 0xFFFFFF;
        const headColor = type === 'cow' ? 0x666666 : 0xE0E0E0;
        
        this.body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 1.3), new THREE.MeshStandardMaterial({ color: bodyColor }));
        this.body.position.y = 0.9;
        this.mesh.add(this.body);
        
        this.head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: headColor }));
        this.head.position.set(0, 1.5, 0.8);
        this.mesh.add(this.head);
        
        const legGeo = new THREE.BoxGeometry(0.25, 0.6, 0.25);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
        
        this.leg1 = new THREE.Mesh(legGeo, legMat); this.leg1.position.set(-0.3, 0.3, 0.5);
        this.leg2 = new THREE.Mesh(legGeo, legMat); this.leg2.position.set(0.3, 0.3, 0.5);
        this.leg3 = new THREE.Mesh(legGeo, legMat); this.leg3.position.set(-0.3, 0.3, -0.5);
        this.leg4 = new THREE.Mesh(legGeo, legMat); this.leg4.position.set(0.3, 0.3, -0.5);
        
        this.mesh.add(this.leg1, this.leg2, this.leg3, this.leg4);
        
        this.mesh.traverse(o => { o.castShadow = true; o.receiveShadow = true; });
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
            
            const bx = Math.round(nextPos.x);
            const bz = Math.round(nextPos.z);
            const by = Math.round(nextPos.y);
            
            if (!world.isSolid(bx, by, bz) && !world.isSolid(bx, by + 1, bz)) {
                let groundY = by;
                while(!world.isSolid(bx, groundY - 1, bz) && groundY > -10) groundY--;
                
                if (Math.abs(groundY - by) <= 2) {
                    this.position.x = nextPos.x;
                    this.position.z = nextPos.z;
                    this.position.y = THREE.MathUtils.lerp(this.position.y, groundY, dt * 5);
                } else {
                    this.rotation += Math.PI;
                    this.moveDir.set(Math.sin(this.rotation), 0, Math.cos(this.rotation));
                }
            } else {
                 this.rotation += Math.PI;
                 this.moveDir.set(Math.sin(this.rotation), 0, Math.cos(this.rotation));
            }

            this.leg1.rotation.x = Math.sin(this.walkTime) * 0.5;
            this.leg2.rotation.x = Math.cos(this.walkTime) * 0.5;
            this.leg3.rotation.x = Math.cos(this.walkTime) * 0.5;
            this.leg4.rotation.x = Math.sin(this.walkTime) * 0.5;
        } else {
            this.leg1.rotation.x = 0; this.leg2.rotation.x = 0;
            this.leg3.rotation.x = 0; this.leg4.rotation.x = 0;
            
            if (Math.random() > 0.99) this.head.rotation.x = 0.5;
            else if (Math.random() > 0.95) this.head.rotation.x = 0;
        }

        this.mesh.position.copy(this.position);
        this.mesh.rotation.y = this.rotation;
    }
}

class PlayerActor {
    public mesh: THREE.Group;
    private head: THREE.Mesh;
    private body: THREE.Mesh;
    private armL: THREE.Mesh;
    private armR: THREE.Mesh;
    private legL: THREE.Mesh;
    private legR: THREE.Mesh;
    private walkTime = 0;
    private isMining = false;
    private mineAnimTime = 0;

    constructor() {
        this.mesh = new THREE.Group();
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0aa94 });
        const shirtMat = new THREE.MeshStandardMaterial({ color: 0x00AAAA });
        const pantsMat = new THREE.MeshStandardMaterial({ color: 0x3333AA });

        this.head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
        this.head.position.y = 1.65;
        this.mesh.add(this.head);

        this.body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.3), shirtMat);
        this.body.position.y = 1.05;
        this.mesh.add(this.body);

        const armGeo = new THREE.BoxGeometry(0.2, 0.7, 0.2);
        this.armL = new THREE.Mesh(armGeo, skinMat); this.armL.position.set(-0.4, 1.05, 0);
        this.armR = new THREE.Mesh(armGeo, skinMat); this.armR.position.set(0.4, 1.05, 0);
        this.armR.geometry.translate(0, -0.25, 0); // Shift pivot for better swing
        this.armR.position.y += 0.25;
        this.mesh.add(this.armL, this.armR);

        const legGeo = new THREE.BoxGeometry(0.25, 0.7, 0.25);
        this.legL = new THREE.Mesh(legGeo, pantsMat); this.legL.position.set(-0.15, 0.35, 0);
        this.legR = new THREE.Mesh(legGeo, pantsMat); this.legR.position.set(0.15, 0.35, 0);
        this.mesh.add(this.legL, this.legR);

        this.mesh.traverse(o => { o.castShadow = true; o.receiveShadow = true; });
    }

    setMining(mining: boolean) {
        this.isMining = mining;
    }

    update(dt: number, speed: number, isFlying: boolean) {
        // Walking Animation
        if (speed > 0.5 && !isFlying) {
            this.walkTime += dt * speed * 1.5;
            this.legL.rotation.x = Math.sin(this.walkTime) * 0.8;
            this.legR.rotation.x = Math.sin(this.walkTime + Math.PI) * 0.8;
            this.armL.rotation.x = Math.sin(this.walkTime + Math.PI) * 0.8;
        } else {
            const lerp = 10 * dt;
            this.legL.rotation.x = THREE.MathUtils.lerp(this.legL.rotation.x, 0, lerp);
            this.legR.rotation.x = THREE.MathUtils.lerp(this.legR.rotation.x, 0, lerp);
            this.armL.rotation.x = THREE.MathUtils.lerp(this.armL.rotation.x, 0, lerp);
        }

        // Mining / Idle Arm Animation
        if (this.isMining) {
            this.mineAnimTime += dt * 15;
            this.armR.rotation.x = -Math.abs(Math.sin(this.mineAnimTime)) * 2 + 0.5;
            this.armR.rotation.z = 0;
        } else {
            const lerp = 10 * dt;
             if (speed > 0.5 && !isFlying) {
                 this.armR.rotation.x = Math.sin(this.walkTime) * 0.8;
             } else {
                 this.armR.rotation.x = THREE.MathUtils.lerp(this.armR.rotation.x, 0, lerp);
             }
            this.armR.rotation.z = THREE.MathUtils.lerp(this.armR.rotation.z, 0, lerp);
            this.mineAnimTime = 0;
        }
    }
    
    setPosition(pos: THREE.Vector3) { this.mesh.position.copy(pos); }
    setRotation(yaw: number) { this.mesh.rotation.y = yaw; }
}

class ParticleSystem {
    private mesh: THREE.InstancedMesh;
    private count = 2000;
    private particles: { 
        position: THREE.Vector3, 
        velocity: THREE.Vector3, 
        rotVel: THREE.Vector3, 
        life: number, 
        active: boolean 
    }[] = [];
    private dummy = new THREE.Object3D();
    private activeIndex = 0;

    constructor(scene: THREE.Scene) {
        const geometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
        this.mesh = new THREE.InstancedMesh(geometry, material, this.count);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(this.mesh);
        
        const colors = new Float32Array(this.count * 3);
        this.mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);

        for (let i=0; i<this.count; i++) {
            this.particles.push({
                position: new THREE.Vector3(),
                velocity: new THREE.Vector3(),
                rotVel: new THREE.Vector3(),
                life: 0,
                active: false
            });
            this.dummy.position.set(0, -1000, 0);
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix);
        }
    }

    emit(pos: THREE.Vector3, colorHex: number, amount: number = 20) {
        const color = new THREE.Color(colorHex);
        for(let i=0; i<amount; i++) {
            this.activeIndex = (this.activeIndex + 1) % this.count;
            const p = this.particles[this.activeIndex];
            p.active = true; p.life = 0.8 + Math.random() * 0.4; 
            p.position.copy(pos);
            p.position.x += (Math.random() - 0.5) * 0.9;
            p.position.y += (Math.random() - 0.5) * 0.9;
            p.position.z += (Math.random() - 0.5) * 0.9;
            p.velocity.set((Math.random() - 0.5) * 6, (Math.random() * 4) + 2, (Math.random() - 0.5) * 6);
            p.rotVel.set((Math.random()-0.5)*10, (Math.random()-0.5)*10, (Math.random()-0.5)*10);
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
                p.velocity.y -= 20 * dt;
                p.position.addScaledVector(p.velocity, dt);

                if (p.life <= 0) {
                    p.active = false;
                    this.dummy.position.set(0, -1000, 0);
                } else {
                    this.dummy.position.copy(p.position);
                    this.dummy.rotation.x += p.rotVel.x * dt;
                    this.dummy.rotation.y += p.rotVel.y * dt;
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

export class WorldManager {
    public scene: THREE.Scene;
    public camera: THREE.PerspectiveCamera;
    public renderer: THREE.WebGLRenderer;
    
    public cameraYawGroup: THREE.Group;
    public cameraPitchGroup: THREE.Group;
    
    public blocks = new Map<string, { type: string, instanceId: number, mesh: THREE.InstancedMesh }>();
    public mobs: Mob[] = [];
    public playerActor: PlayerActor | null = null;
    public particles: ParticleSystem | null = null;
    public selectionBox: SelectionBox | null = null;
    
    public instancedMeshes: THREE.InstancedMesh[] = [];

    private cameraRaycaster = new THREE.Raycaster();

    constructor() {
        // Init base ThreeJS objects
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.Fog(0x87CEEB, 30, 180); // Increased fog distance for the giant screen

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 300); // Increased far plane
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Camera Rig
        // Yaw Group handles Horizontal Rotation and Physics Position
        this.cameraYawGroup = new THREE.Group();
        this.scene.add(this.cameraYawGroup);

        // Pitch Group handles Vertical Rotation and Pivot Point (Eyes)
        this.cameraPitchGroup = new THREE.Group();
        this.cameraPitchGroup.position.y = 1.6; // Eye Height
        this.cameraYawGroup.add(this.cameraPitchGroup);
        
        // Camera Object handles Distance (Zoom)
        this.cameraPitchGroup.add(this.camera);
        this.camera.position.set(1.2, 0, 4); // Initial Right Shoulder Offset

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(50, 150, 50);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.set(4096, 4096);
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 300;
        const sSize = 120; // Increased shadow map coverage
        dirLight.shadow.camera.left = -sSize; dirLight.shadow.camera.right = sSize;
        dirLight.shadow.camera.top = sSize; dirLight.shadow.camera.bottom = -sSize;
        dirLight.shadow.bias = -0.0004;
        this.scene.add(dirLight);
    }

    public init = (container: HTMLElement) => {
        container.appendChild(this.renderer.domElement);
        this.generateWorld();
        
        this.particles = new ParticleSystem(this.scene);
        this.playerActor = new PlayerActor();
        this.scene.add(this.playerActor.mesh);
        this.selectionBox = new SelectionBox(this.scene);

        window.addEventListener('resize', this.onResize);
    }

    public dispose = () => {
        window.removeEventListener('resize', this.onResize);
    }

    private onResize = () => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    public getBlock = (x: number, y: number, z: number) => {
        return this.blocks.get(`${Math.round(x)},${Math.round(y)},${Math.round(z)}`);
    }

    public isSolid = (x: number, y: number, z: number) => {
        const block = this.getBlock(x, y, z);
        if (!block) return false;
        const nonSolid = [BlockType.WATER, BlockType.CLOUD, BlockType.FLOWER_RED, BlockType.FLOWER_YELLOW, BlockType.TALL_GRASS];
        return !nonSolid.includes(block.type);
    }

    public removeBlock = (x: number, y: number, z: number) => {
        const key = `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
        const block = this.blocks.get(key);
        if (block) {
            const matrix = new THREE.Matrix4().makeScale(0,0,0);
            block.mesh.setMatrixAt(block.instanceId, matrix);
            block.mesh.instanceMatrix.needsUpdate = true;
            this.blocks.delete(key);
            return block.type;
        }
        return null;
    }

    public setSelection = (x: number, y: number, z: number, visible: boolean) => {
        this.selectionBox?.update(x, y, z, visible);
    }

    public setPlayerMining = (mining: boolean) => {
        this.playerActor?.setMining(mining);
    }

    private generateWorld = () => {
        const instances: Record<string, { matrix: number[], count: number }> = {};
        Object.values(BlockType).forEach(type => instances[type] = { matrix: [], count: 0 });
        const dummy = new THREE.Object3D();

        const addBlock = (type: string, x: number, y: number, z: number) => {
            if (!instances[type]) return;
            dummy.position.set(x, y, z);
            dummy.updateMatrix();
            instances[type].matrix.push(...dummy.matrix.elements);
            instances[type].count++;
            
            // Track blocks for interaction
            const interactables = [
                BlockType.GRASS, BlockType.DIRT, BlockType.STONE, BlockType.SAND, 
                BlockType.WOOD, BlockType.PLANKS, BlockType.OBSIDIAN, 
                BlockType.DARK_MATTER, BlockType.NEON_CYAN, BlockType.NEON_MAGENTA
            ];
            
            if (interactables.includes(type)) {
                this.blocks.set(`${Math.round(x)},${Math.round(y)},${Math.round(z)}`, { 
                    type, 
                    instanceId: instances[type].count - 1,
                    mesh: null as any
                });
            }
        };

        const noiseGen = new SimpleNoise();
        const offset = WORLD_SIZE / 2;
        const heightMap = new Map<string, number>();

        for (let x = -offset; x < offset; x++) {
            for (let z = -offset; z < offset; z++) {
                let y = noiseGen.noise(x * 0.02, 0, z * 0.02) * 18;
                y += noiseGen.noise(x * 0.1, 100, z * 0.1) * 4;
                const h = Math.round(y + 12);
                heightMap.set(`${x},${z}`, h);

                let surfaceType = BlockType.GRASS;
                if (h < WATER_LEVEL + 2) surfaceType = BlockType.SAND;
                if (h > 28) surfaceType = BlockType.STONE;
                if (h > 35) surfaceType = BlockType.SNOW;

                for (let dy = -4; dy <= h; dy++) {
                    let type = surfaceType;
                    if (dy < h) { type = BlockType.DIRT; if (h > 28) type = BlockType.STONE; }
                    if (dy < h - 3) type = BlockType.STONE;
                    if (dy > h && dy <= WATER_LEVEL) type = BlockType.WATER;
                    else if (dy > h) continue;
                    addBlock(type, x, dy, z);
                }
            }
        }

        // Decoration Pass
        for (let x = -offset + 2; x < offset - 2; x++) {
            for (let z = -offset + 2; z < offset - 2; z++) {
                const h = heightMap.get(`${x},${z}`)!;
                const surface = this.getBlock(x, h, z);
                
                if (surface && surface.type === BlockType.GRASS && h > WATER_LEVEL) {
                    const rand = Math.random();
                    if (rand < 0.015) { // Tree
                        const th = 4 + Math.floor(Math.random() * 2);
                        for(let i=1; i<=th; i++) addBlock(BlockType.WOOD, x, h+i, z);
                        for(let lx = -2; lx <= 2; lx++) {
                            for(let lz = -2; lz <= 2; lz++) {
                                for(let ly = th - 1; ly <= th + 1; ly++) {
                                    if (Math.abs(lx) + Math.abs(lz) + Math.abs(ly - th) < 4) {
                                        if(lx===0 && lz===0 && ly < th+1) continue;
                                        addBlock(BlockType.LEAVES, x+lx, h+ly, z+lz);
                                    }
                                }
                            }
                        }
                    } else if (rand < 0.08) { // Flower
                        addBlock(rand < 0.03 ? BlockType.FLOWER_RED : (rand < 0.05 ? BlockType.FLOWER_YELLOW : BlockType.TALL_GRASS), x, h+1, z);
                    } else if (rand > 0.995 && x%2===0 && z%2===0) { // House
                        let flat = true;
                        for(let hx=-2; hx<=2; hx++) for(let hz=-2; hz<=2; hz++) if (Math.abs(heightMap.get(`${x+hx},${z+hz}`)! - h) > 1) flat = false;
                        if (flat) {
                            for(let bx=-2; bx<=2; bx++) for(let bz=-2; bz<=2; bz++) for(let by=0; by<4; by++) {
                                if (bx===-2||bx===2||bz===-2||bz===2) {
                                    if (by===1 && bx!==0 && bz!==0) addBlock(BlockType.GLASS, x+bx, h+1+by, z+bz);
                                    else if (!(bx===0 && bz===2 && by < 2)) addBlock(BlockType.PLANKS, x+bx, h+1+by, z+bz);
                                } else if (by===0) addBlock(BlockType.PLANKS, x+bx, h+1, z+bz);
                                addBlock(BlockType.WOOD, x+bx, h+4, z+bz);
                            }
                        }
                    } else if (rand > 0.98) { // Mobs
                         this.mobs.push(new Mob(Math.random() > 0.5 ? 'cow' : 'sheep', x, h+1, z));
                         this.scene.add(this.mobs[this.mobs.length-1].mesh);
                    }
                }
            }
        }
        
        // Clouds
        for(let i=0; i<50; i++) {
           const cx = (Math.random()-0.5)*WORLD_SIZE*2, cz = (Math.random()-0.5)*WORLD_SIZE*2, cy = 55+Math.random()*10;
           for(let j=0; j<8+Math.random()*10; j++) addBlock(BlockType.CLOUD, cx+Math.random()*10, cy, cz+Math.random()*10);
        }

        // --- MASSIVE VOXEL WORLD BILLBOARD ---
        const billboardZ = -offset - 20; // Push it back further so it dominates the horizon
        const billboardY = 70; // Very high up
        const scale = 4; // 4x4 blocks per pixel! MASSIVE.

        const FONT_MAP: Record<string, number[]> = {
            'V': [17, 17, 17, 17, 10, 10, 4],
            'O': [14, 17, 17, 17, 17, 17, 14],
            'X': [17, 17, 10, 4, 10, 17, 17],
            'E': [31, 16, 16, 30, 16, 16, 31],
            'L': [16, 16, 16, 16, 16, 16, 31],
            'W': [17, 17, 17, 21, 21, 27, 17],
            'R': [30, 17, 17, 30, 20, 18, 17],
            'D': [30, 17, 17, 17, 17, 17, 30],
            ' ': [0, 0, 0, 0, 0, 0, 0]
        };

        const text = "VOXEL WORLD";
        const fontH = 7;
        const fontW = 5;
        const spacing = 1;
        
        // Calculate total dimensions in Blocks
        const totalCharWidth = text.length * (fontW * scale);
        const totalSpacingWidth = (text.length - 1) * (spacing * scale);
        const totalWidth = totalCharWidth + totalSpacingWidth;
        const totalHeight = fontH * scale;

        const startX = -Math.floor(totalWidth / 2);

        // Screen Background Padding
        const padX = 10;
        const padY = 10;
        const screenW = totalWidth + padX * 2;
        const screenH = totalHeight + padY * 2;

        // Draw Massive Screen Backing (Dark Matter + Neon Frame)
        const screenLeft = startX - padX;
        const screenBottom = billboardY - totalHeight - padY;
        
        for(let bx = 0; bx < screenW; bx++) {
            for(let by = 0; by < screenH; by++) {
                const posX = screenLeft + bx;
                const posY = screenBottom + by;
                
                // Border check
                if (bx === 0 || bx === screenW - 1 || by === 0 || by === screenH - 1) {
                    addBlock(BlockType.NEON_CYAN, posX, posY, billboardZ);
                } else {
                    addBlock(BlockType.DARK_MATTER, posX, posY, billboardZ);
                }
            }
        }

        // Draw Text
        let cursorX = startX;
        
        for(let i = 0; i < text.length; i++) {
            const char = text[i];
            const map = FONT_MAP[char];
            
            if (map) {
                for (let row = 0; row < 7; row++) {
                    const bits = map[row];
                    for (let col = 0; col < 5; col++) {
                        if ((bits >> (4 - col)) & 1) {
                            // Fill the scaled pixel (4x4 block chunk)
                            for(let sx = 0; sx < scale; sx++) {
                                for(let sy = 0; sy < scale; sy++) {
                                    const px = cursorX + (col * scale) + sx;
                                    const py = billboardY - (row * scale) - sy;
                                    
                                    // Gradient Logic: Left side Cyan, Right side Magenta
                                    const progress = (i / text.length) + (col/5) * (1/text.length);
                                    const type = progress > 0.5 ? BlockType.NEON_MAGENTA : BlockType.NEON_CYAN;
                                    
                                    addBlock(type, px, py, billboardZ + 1); // Pop out by 1
                                }
                            }
                        }
                    }
                }
            }
            cursorX += (fontW * scale) + (spacing * scale);
        }


        // Build Meshes
        const geo = new THREE.BoxGeometry(1,1,1);
        const smallGeo = new THREE.BoxGeometry(0.6,0.6,0.6);
        
        Object.keys(instances).forEach(key => {
            const data = instances[key];
            if (data.count === 0) return;
            const isFlora = [BlockType.FLOWER_RED, BlockType.FLOWER_YELLOW, BlockType.TALL_GRASS].includes(key);
            
            // Material Setup
            const mat = new THREE.MeshStandardMaterial({ color: PALETTE[key], roughness: 0.8 });
            
            if (key === BlockType.WATER) { 
                mat.transparent = true; mat.opacity = 0.6; mat.roughness = 0.1; 
            }
            if (key === BlockType.CLOUD || key === BlockType.GLASS) { 
                mat.transparent = true; mat.opacity = key===BlockType.CLOUD ? 0.8 : 0.4; 
            }
            if (key === BlockType.NEON_CYAN || key === BlockType.NEON_MAGENTA) {
                mat.emissive = new THREE.Color(PALETTE[key]);
                mat.emissiveIntensity = 0.8;
                mat.toneMapped = false; // Make it glow brighter
            }
            
            const mesh = new THREE.InstancedMesh(isFlora ? smallGeo : geo, mat, data.count);
            // Neon blocks don't cast shadows, they glow
            mesh.castShadow = !([BlockType.WATER, BlockType.CLOUD, BlockType.GLASS, BlockType.NEON_CYAN, BlockType.NEON_MAGENTA].includes(key));
            mesh.receiveShadow = true;
            
            const m4 = new THREE.Matrix4();
            for(let i=0; i<data.count; i++) {
                m4.fromArray(data.matrix, i*16);
                mesh.setMatrixAt(i, m4);
                // Optimized interaction check: Only register blocks we might reasonably touch near surface or in known structures
                // For the massive billboard, we skip registering individual blocks in the hashmap to save memory if they are too far,
                // but here we register everything for consistency.
                if(![BlockType.CLOUD, BlockType.WATER, BlockType.TALL_GRASS, BlockType.FLOWER_RED, BlockType.FLOWER_YELLOW].includes(key)){
                    const p = new THREE.Vector3().setFromMatrixPosition(m4);
                    // Only register blocks within a reasonable interact distance for mining logic to save map lookup time? 
                    // No, keep it simple for now.
                    const b = this.getBlock(p.x, p.y, p.z);
                    if(b) b.mesh = mesh;
                }
            }
            this.scene.add(mesh);
            this.instancedMeshes.push(mesh);
        });
    }

    public render = (dt: number, cameraYaw: number, cameraPitch: number, physPos: THREE.Vector3, physVel: THREE.Vector3, isFlying: boolean) => {
        // Lerp visual position (Physics Y is at feet)
        this.cameraYawGroup.position.x = physPos.x;
        this.cameraYawGroup.position.z = physPos.z;
        this.cameraYawGroup.position.y = THREE.MathUtils.lerp(this.cameraYawGroup.position.y, physPos.y, dt * 15);
        
        // Apply rotation to Groups
        this.cameraYawGroup.rotation.y = cameraYaw;
        this.cameraPitchGroup.rotation.x = cameraPitch;

        // --- SMART CAMERA COLLISION LOGIC ---
        
        // 1. Calculate the "Ideal" local position of the camera (Right Shoulder)
        // Ideally it's at (1.2, 0, 4) relative to the Head Pivot (PitchGroup)
        const idealLocal = new THREE.Vector3(1.2, 0.0, 4.0); 

        // 2. Calculate World Coordinates
        const pivotWorld = new THREE.Vector3(0,0,0).applyMatrix4(this.cameraPitchGroup.matrixWorld); // Head position
        const idealWorld = idealLocal.clone().applyMatrix4(this.cameraPitchGroup.matrixWorld); // Target Camera position

        // 3. Raycast from Pivot (Head) to Ideal Camera Pos
        const dir = new THREE.Vector3().subVectors(idealWorld, pivotWorld);
        const dist = dir.length();
        dir.normalize();

        this.cameraRaycaster.set(pivotWorld, dir);
        this.cameraRaycaster.far = dist;
        const intersects = this.cameraRaycaster.intersectObjects(this.instancedMeshes);

        // 4. Determine actual distance based on collision
        // If hit, move camera to hit point (minus buffer)
        const actualDist = (intersects.length > 0) ? Math.max(0.2, intersects[0].distance - 0.2) : dist;
        const ratio = actualDist / dist;

        // 5. Apply to Camera (Local position scales towards 0,0,0 based on collision ratio)
        this.camera.position.copy(idealLocal).multiplyScalar(ratio);


        // Update Player Mesh (Sync with Camera Rig)
        if (this.playerActor) {
            this.playerActor.setPosition(this.cameraYawGroup.position);
            this.playerActor.setRotation(cameraYaw);
            this.playerActor.update(dt, new THREE.Vector2(physVel.x, physVel.z).length(), isFlying);
        }

        // Update Mobs & Particles
        this.mobs.forEach(m => m.update(dt, this));
        if (this.particles) this.particles.update(dt);

        this.renderer.render(this.scene, this.camera);
    }
}
