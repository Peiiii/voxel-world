
import * as THREE from 'three';
import { BlockType, PALETTE, SimpleNoise, WORLD_SIZE, WATER_LEVEL } from '../utils/constants';

// --- SUB-CLASSES ---

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
        const skyColor = 0x87CEEB;
        this.scene.background = new THREE.Color(skyColor);
        
        // Adjusted Fog for 160 world size
        this.scene.fog = new THREE.Fog(skyColor, 60, 150); 

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 300);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Camera Rig
        this.cameraYawGroup = new THREE.Group();
        this.scene.add(this.cameraYawGroup);

        this.cameraPitchGroup = new THREE.Group();
        this.cameraPitchGroup.position.y = 1.6; 
        this.cameraYawGroup.add(this.cameraPitchGroup);
        
        this.cameraPitchGroup.add(this.camera);
        this.camera.position.set(1.2, 0, 4);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(100, 150, 100);
        dirLight.castShadow = true;
        // Optimized Shadow Map
        dirLight.shadow.mapSize.set(2048, 2048);
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 300;
        const sSize = 120;
        dirLight.shadow.camera.left = -sSize; dirLight.shadow.camera.right = sSize;
        dirLight.shadow.camera.top = sSize; dirLight.shadow.camera.bottom = -sSize;
        dirLight.shadow.bias = -0.0004;
        this.scene.add(dirLight);

        // Sun
        const sunSize = 30;
        const sunGeo = new THREE.BoxGeometry(sunSize, sunSize, sunSize);
        const sunMat = new THREE.MeshBasicMaterial({ color: 0xffe34d, fog: false });
        const sunMesh = new THREE.Mesh(sunGeo, sunMat);
        sunMesh.position.set(100, 120, -150); 
        sunMesh.rotation.z = Math.PI / 4;
        sunMesh.rotation.y = Math.PI / 4;
        this.scene.add(sunMesh);
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
        const nonSolid = [BlockType.WATER, BlockType.CLOUD, BlockType.FLOWER_RED, BlockType.FLOWER_YELLOW, BlockType.TALL_GRASS, BlockType.DEAD_BUSH];
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
        const instances: Record<string, number[]> = {};
        Object.values(BlockType).forEach(type => instances[type] = []);
        
        const dummy = new THREE.Object3D();
        const offset = WORLD_SIZE / 2;

        // --- 1. DATA GENERATION PASS ---
        // Key: "x,y,z", Value: BlockType
        // We store all generated block data first to allow for culling logic
        const worldData = new Map<string, string>();
        const generatedCoords: {x: number, y: number, z: number, type: string}[] = [];

        const storeBlock = (type: string, x: number, y: number, z: number) => {
            const key = `${x},${y},${z}`;
            // Avoid duplicates
            if (!worldData.has(key)) {
                worldData.set(key, type);
                generatedCoords.push({x, y, z, type});
            }
        };

        const heightNoise = new SimpleNoise(0);
        const moistureNoise = new SimpleNoise(100); 
        const riverNoise = new SimpleNoise(500);

        const heightMap = new Map<string, { h: number, biome: string, isRiver: boolean }>();

        // Terrain Generation
        for (let x = -offset; x < offset; x++) {
            for (let z = -offset; z < offset; z++) {
                // 1. Biome
                const mVal = moistureNoise.noise(x * 0.015, 0, z * 0.015);
                let biome = 'PLAINS';
                if (mVal > 0.4) biome = 'FOREST';
                if (mVal < -0.4) biome = 'DESERT';
                
                // 2. River
                const rVal = Math.abs(riverNoise.noise(x * 0.012, 0, z * 0.012));
                const isRiver = rVal < 0.035;

                // 3. Height
                let h = 0;
                if (biome === 'DESERT') {
                    h = 10 + heightNoise.noise(x * 0.03, 0, z * 0.03) * 6;
                } else if (biome === 'PLAINS') {
                    h = 12 + heightNoise.noise(x * 0.02, 0, z * 0.02) * 8;
                } else if (biome === 'FOREST') {
                    h = 14 + heightNoise.noise(x * 0.04, 0, z * 0.04) * 12;
                } else {
                    h = 12 + heightNoise.noise(x * 0.03, 0, z * 0.03) * 10;
                }

                const peakNoise = heightNoise.noise(x * 0.05 + 100, 100, z * 0.05 + 100);
                if (peakNoise > 0.6 && biome !== 'DESERT') {
                    biome = 'MOUNTAIN';
                    h += (peakNoise - 0.6) * 40;
                }

                if (isRiver) {
                    h = Math.min(h, WATER_LEVEL - 1);
                }

                h = Math.round(h);
                heightMap.set(`${x},${z}`, { h, biome, isRiver });

                // 4. Blocks
                let surfaceType = BlockType.GRASS;
                let subSurfaceType = BlockType.DIRT;

                if (biome === 'DESERT') {
                    surfaceType = BlockType.SAND;
                    subSurfaceType = BlockType.SANDSTONE;
                } else if (biome === 'MOUNTAIN') {
                    if (h > 35) surfaceType = BlockType.SNOW;
                    else surfaceType = BlockType.STONE;
                    subSurfaceType = BlockType.STONE;
                }

                if (isRiver || h <= WATER_LEVEL) {
                   surfaceType = (biome === 'DESERT') ? BlockType.SAND : BlockType.DIRT;
                   if (h <= WATER_LEVEL - 3) surfaceType = BlockType.STONE;
                }

                // Only generate blocks down to h - 5 to save memory/processing
                // No one sees the deep underground anyway in this demo
                const bottomLimit = h - 5;
                
                for (let dy = bottomLimit; dy <= h; dy++) {
                    let type = subSurfaceType;
                    if (dy === h) type = surfaceType;
                    if (dy < h - 3) type = BlockType.STONE;
                    storeBlock(type, x, dy, z);
                }
                
                if (isRiver || h < WATER_LEVEL) {
                    for (let w = h + 1; w <= WATER_LEVEL; w++) {
                        storeBlock(BlockType.WATER, x, w, z);
                    }
                }
            }
        }

        // Flora & Structures
        for (let x = -offset + 2; x < offset - 2; x++) {
            for (let z = -offset + 2; z < offset - 2; z++) {
                const data = heightMap.get(`${x},${z}`);
                if (!data) continue;
                const { h, biome, isRiver } = data;

                if (h <= WATER_LEVEL) continue;

                const rand = Math.random();

                if (biome === 'DESERT') {
                    if (rand < 0.015) {
                        const ch = 2 + Math.floor(Math.random() * 3);
                        for(let i=1; i<=ch; i++) storeBlock(BlockType.CACTUS, x, h+i, z);
                    } else if (rand < 0.05) storeBlock(BlockType.DEAD_BUSH, x, h+1, z);
                } else if (biome === 'PLAINS') {
                    if (rand < 0.005) this.generateTree(x, h, z, storeBlock, 'OAK');
                    else if (rand < 0.1) {
                        const f = rand < 0.05 ? BlockType.FLOWER_RED : BlockType.FLOWER_YELLOW;
                        storeBlock(rand < 0.02 ? BlockType.TALL_GRASS : f, x, h+1, z);
                    }
                } else if (biome === 'FOREST') {
                     if (rand < 0.035) this.generateTree(x, h, z, storeBlock, rand > 0.5 ? 'BIRCH' : 'OAK');
                     else if (rand < 0.15) storeBlock(BlockType.TALL_GRASS, x, h+1, z);
                }

                if (rand > 0.99 && !isRiver) {
                    this.mobs.push(new Mob(Math.random() > 0.5 ? 'cow' : 'sheep', x, h+1, z));
                    this.scene.add(this.mobs[this.mobs.length-1].mesh);
                }
            }
        }

        // Volumetric Clouds - Restricted to offset
        const cloudNoise = new SimpleNoise(999);
        const cloudHeight = 65; 
        // Only generate clouds over the world area
        for (let x = -offset; x < offset; x+=2) { // Step 2 for fluffier/less dense clouds
            for (let z = -offset; z < offset; z+=2) {
                const n = cloudNoise.noise(x * 0.015, 50, z * 0.015);
                const d = cloudNoise.noise(x * 0.05, 0, z * 0.05) * 0.15;
                const val = n + d;

                if (val > 0.35) {
                    storeBlock(BlockType.CLOUD, x, cloudHeight, z);
                    if (val > 0.5) storeBlock(BlockType.CLOUD, x, cloudHeight + 1, z);
                    if (val > 0.6) storeBlock(BlockType.CLOUD, x, cloudHeight + 2, z);
                }
            }
        }

        this.createBillboard(storeBlock);

        // --- 2. CULLING PASS ---
        // Filter out blocks that are completely hidden
        const isOpaque = (t: string) => {
            // Treat these as transparent for culling purposes (i.e. if a neighbor is one of these, we must render)
            const transparents = [
                BlockType.WATER, BlockType.GLASS, BlockType.LEAVES, BlockType.BIRCH_LEAVES, 
                BlockType.FLOWER_RED, BlockType.FLOWER_YELLOW, BlockType.TALL_GRASS, 
                BlockType.CACTUS, BlockType.DEAD_BUSH, BlockType.CLOUD, BlockType.NEON_CYAN, BlockType.NEON_MAGENTA
            ];
            return !transparents.includes(t);
        }

        for (const block of generatedCoords) {
            const {x, y, z, type} = block;

            // Always render non-opaque blocks (Water, Glass, Flora, etc)
            // This simplifies transparency handling
            if (!isOpaque(type)) {
                this.addInstance(instances, type, x, y, z);
                continue;
            }

            // For opaque blocks, check neighbors.
            // If a neighbor is missing OR is not opaque, we are visible.
            // We need to check 6 faces.
            let visible = false;
            const neighbors = [
                [x+1, y, z], [x-1, y, z],
                [x, y+1, z], [x, y-1, z],
                [x, y, z+1], [x, y, z-1]
            ];

            for (const [nx, ny, nz] of neighbors) {
                const nKey = `${nx},${ny},${nz}`;
                const nType = worldData.get(nKey);
                
                // If neighbor is void (undefined) or transparent, face is visible -> block is visible
                if (!nType || !isOpaque(nType)) {
                    visible = true;
                    break;
                }
            }

            if (visible) {
                this.addInstance(instances, type, x, y, z);
            }
        }

        this.buildMeshes(instances);
    }

    private addInstance(instances: Record<string, number[]>, type: string, x: number, y: number, z: number) {
        if (!instances[type]) return;
        const dummy = new THREE.Object3D();
        dummy.position.set(x, y, z);
        dummy.updateMatrix();
        instances[type].push(...dummy.matrix.elements);
        
        // Register interactable blocks
        const nonInteractables = [BlockType.CLOUD, BlockType.WATER];
        if (!nonInteractables.includes(type)) {
            // Calculate index based on current length. 
            // 16 elements per matrix.
            const idx = (instances[type].length / 16) - 1;
            this.blocks.set(`${x},${y},${z}`, { 
                type, 
                instanceId: idx,
                mesh: null as any // Will be assigned in buildMeshes
            });
        }
    }

    private generateTree(x: number, y: number, z: number, addBlock: Function, type: 'OAK' | 'BIRCH') {
        const woodType = type === 'OAK' ? BlockType.WOOD : BlockType.BIRCH_WOOD;
        const leafType = type === 'OAK' ? BlockType.LEAVES : BlockType.BIRCH_LEAVES;
        
        const h = 4 + Math.floor(Math.random() * 3); 

        for(let i=1; i<=h; i++) addBlock(woodType, x, y+i, z);
        
        for(let lx = -2; lx <= 2; lx++) {
            for(let lz = -2; lz <= 2; lz++) {
                for(let ly = h - 1; ly <= h + 1; ly++) {
                    if (Math.abs(lx) + Math.abs(lz) + Math.abs(ly - h) < 4) {
                        if(lx===0 && lz===0 && ly < h+1) continue;
                        addBlock(leafType, x+lx, y+ly, z+lz);
                    }
                }
            }
        }
    }

    private createBillboard(addBlock: Function) {
        const billboardZ = -80; // Moved closer for 160 world size
        const billboardY = 60;
        const scale = 4;

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
        const fontW = 5;
        const spacing = 1;
        
        const totalCharWidth = text.length * (fontW * scale);
        const totalSpacingWidth = (text.length - 1) * (spacing * scale);
        const totalWidth = totalCharWidth + totalSpacingWidth;
        
        const startX = -Math.floor(totalWidth / 2);

        const padX = 6;
        const padY = 6;
        const screenW = totalWidth + padX * 2;
        const screenH = (7 * scale) + padY * 2;

        const screenLeft = startX - padX;
        const screenBottom = billboardY - (7*scale) - padY;
        
        for(let bx = 0; bx < screenW; bx++) {
            for(let by = 0; by < screenH; by++) {
                const posX = screenLeft + bx;
                const posY = screenBottom + by;
                
                if (bx === 0 || bx === screenW - 1 || by === 0 || by === screenH - 1) {
                    addBlock(BlockType.NEON_CYAN, posX, posY, billboardZ);
                } else {
                    addBlock(BlockType.DARK_MATTER, posX, posY, billboardZ);
                }
            }
        }

        let cursorX = startX;
        for(let i = 0; i < text.length; i++) {
            const char = text[i];
            const map = FONT_MAP[char];
            if (map) {
                for (let row = 0; row < 7; row++) {
                    const bits = map[row];
                    for (let col = 0; col < 5; col++) {
                        if ((bits >> (4 - col)) & 1) {
                            for(let sx = 0; sx < scale; sx++) {
                                for(let sy = 0; sy < scale; sy++) {
                                    const px = cursorX + (col * scale) + sx;
                                    const py = billboardY - (row * scale) - sy;
                                    const progress = (i / text.length) + (col/5) * (1/text.length);
                                    const type = progress > 0.5 ? BlockType.NEON_MAGENTA : BlockType.NEON_CYAN;
                                    addBlock(type, px, py, billboardZ + 1);
                                }
                            }
                        }
                    }
                }
            }
            cursorX += (fontW * scale) + (spacing * scale);
        }
    }

    private buildMeshes(instances: Record<string, number[]>) {
        const geo = new THREE.BoxGeometry(1,1,1);
        const smallGeo = new THREE.BoxGeometry(0.6,0.6,0.6); 
        const poleGeo = new THREE.BoxGeometry(0.85, 1, 0.85); 
        const flatGeo = new THREE.BoxGeometry(0.8, 0.6, 0.8); 
        
        Object.keys(instances).forEach(key => {
            const matrixArray = instances[key];
            const count = matrixArray.length / 16;
            if (count === 0) return;
            
            let geometry = geo;
            const isFlora = [BlockType.FLOWER_RED, BlockType.FLOWER_YELLOW, BlockType.TALL_GRASS].includes(key);
            if (isFlora) geometry = smallGeo;
            if (key === BlockType.CACTUS) geometry = poleGeo;
            if (key === BlockType.DEAD_BUSH) geometry = flatGeo;
            
            const mat = new THREE.MeshStandardMaterial({ color: PALETTE[key], roughness: 0.8 });
            
            if (key === BlockType.WATER) { 
                mat.transparent = true; mat.opacity = 0.6; mat.roughness = 0.1; 
            }
            if (key === BlockType.CLOUD) { 
                mat.transparent = false; mat.opacity = 1.0; mat.roughness = 1.0;
            }
            if (key === BlockType.GLASS) {
                mat.transparent = true; mat.opacity = 0.4;
            }
            if (key === BlockType.NEON_CYAN || key === BlockType.NEON_MAGENTA) {
                mat.emissive = new THREE.Color(PALETTE[key]);
                mat.emissiveIntensity = 0.8;
                mat.toneMapped = false;
            }
            
            const mesh = new THREE.InstancedMesh(geometry, mat, count);
            mesh.castShadow = !([BlockType.WATER, BlockType.CLOUD, BlockType.GLASS, BlockType.NEON_CYAN, BlockType.NEON_MAGENTA].includes(key));
            mesh.receiveShadow = true;
            
            const m4 = new THREE.Matrix4();
            for(let i=0; i<count; i++) {
                m4.fromArray(matrixArray, i*16);
                mesh.setMatrixAt(i, m4);
                
                // Note: InstancedMesh creation is now decoupled from initial block registration.
                // We must retroactively update the block map references if we want to mine them.
                // However, checking the map by position is expensive here.
                // Instead, we did it during AddInstance.
            }
            
            // Re-bind meshes to blocks for mining interaction
            // Since we culled, 'this.blocks' only contains interactables that are visible.
            // But 'this.blocks' entries have instanceId relative to the full list? 
            // No, addInstance calculates ID based on the filtered list.
            // But we need to link the MESH to the block data.
            for (const [posKey, block] of this.blocks) {
                if (block.type === key) {
                    block.mesh = mesh;
                }
            }

            this.scene.add(mesh);
            this.instancedMeshes.push(mesh);
        });
    }

    public render = (dt: number, cameraYaw: number, cameraPitch: number, physPos: THREE.Vector3, physVel: THREE.Vector3, isFlying: boolean) => {
        this.cameraYawGroup.position.x = physPos.x;
        this.cameraYawGroup.position.z = physPos.z;
        this.cameraYawGroup.position.y = THREE.MathUtils.lerp(this.cameraYawGroup.position.y, physPos.y, dt * 15);
        
        this.cameraYawGroup.rotation.y = cameraYaw;
        this.cameraPitchGroup.rotation.x = cameraPitch;

        const idealLocal = new THREE.Vector3(1.2, 0.0, 4.0); 
        const pivotWorld = new THREE.Vector3(0,0,0).applyMatrix4(this.cameraPitchGroup.matrixWorld);
        const idealWorld = idealLocal.clone().applyMatrix4(this.cameraPitchGroup.matrixWorld);

        const dir = new THREE.Vector3().subVectors(idealWorld, pivotWorld);
        const dist = dir.length();
        dir.normalize();

        this.cameraRaycaster.set(pivotWorld, dir);
        this.cameraRaycaster.far = dist;
        const intersects = this.cameraRaycaster.intersectObjects(this.instancedMeshes);

        const actualDist = (intersects.length > 0) ? Math.max(0.2, intersects[0].distance - 0.2) : dist;
        const ratio = actualDist / dist;

        this.camera.position.copy(idealLocal).multiplyScalar(ratio);

        if (this.playerActor) {
            this.playerActor.setPosition(this.cameraYawGroup.position);
            this.playerActor.setRotation(cameraYaw);
            this.playerActor.update(dt, new THREE.Vector2(physVel.x, physVel.z).length(), isFlying);
        }

        this.mobs.forEach(m => m.update(dt, this));
        if (this.particles) this.particles.update(dt);

        this.renderer.render(this.scene, this.camera);
    }
}
