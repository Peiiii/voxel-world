
import * as THREE from 'three';
import { BlockType, PALETTE, SimpleNoise, WORLD_SIZE, WATER_LEVEL, CHUNK_SIZE } from '../utils/constants';

// --- HELPER: Spatial Hashing for Performance ---
const getKey = (x: number, y: number, z: number) => {
    return ((x + 128) << 16) | ((z + 128) << 8) | (y + 64);
};

const getChunkKey = (cx: number, cz: number) => `${cx},${cz}`;

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
    private type: 'cow' | 'sheep' | 'pig' | 'villager';

    constructor(type: 'cow' | 'sheep' | 'pig' | 'villager', x: number, y: number, z: number) {
        this.type = type;
        this.position = new THREE.Vector3(x, y, z);
        this.mesh = new THREE.Group();
        
        let bodyColor = 0x333333;
        let headColor = 0x666666;
        let bodyGeo = new THREE.BoxGeometry(0.9, 0.6, 1.3);
        let headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);

        if (type === 'cow') {
            bodyColor = 0x333333; headColor = 0x666666;
        } else if (type === 'sheep') {
            bodyColor = 0xFFFFFF; headColor = 0xE0E0E0;
        } else if (type === 'pig') {
            bodyColor = 0xF0B0B0; headColor = 0xF0B0B0;
            bodyGeo = new THREE.BoxGeometry(0.9, 0.6, 0.9);
        } else if (type === 'villager') {
            bodyColor = 0x604030; 
            headColor = 0xD6B094;
            bodyGeo = new THREE.BoxGeometry(0.6, 0.8, 0.4);
            headGeo = new THREE.BoxGeometry(0.5, 0.6, 0.5);
        }
        
        this.body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: bodyColor }));
        
        if (type === 'villager') {
            this.body.position.y = 1.0;
            this.head = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: headColor }));
            this.head.position.set(0, 1.7, 0);
        } else {
            this.body.position.y = 0.9;
            this.head = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: headColor }));
            this.head.position.set(0, 1.5, 0.8);
        }

        this.mesh.add(this.body);
        this.mesh.add(this.head);
        
        const legGeo = new THREE.BoxGeometry(0.25, 0.6, 0.25);
        const legMat = new THREE.MeshStandardMaterial({ color: type === 'villager' ? 0x403020 : 0x222222 });
        
        this.leg1 = new THREE.Mesh(legGeo, legMat); 
        this.leg2 = new THREE.Mesh(legGeo, legMat); 
        
        if (type === 'villager') {
            this.leg1.position.set(-0.15, 0.3, 0);
            this.leg2.position.set(0.15, 0.3, 0);
            this.mesh.add(this.leg1, this.leg2);
            const armGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
            const armMat = new THREE.MeshStandardMaterial({ color: 0x604030 });
            this.leg3 = new THREE.Mesh(armGeo, armMat); this.leg3.position.set(-0.45, 1.1, 0);
            this.leg4 = new THREE.Mesh(armGeo, armMat); this.leg4.position.set(0.45, 1.1, 0);
            this.mesh.add(this.leg3, this.leg4);
        } else {
            this.leg3 = new THREE.Mesh(legGeo, legMat); 
            this.leg4 = new THREE.Mesh(legGeo, legMat); 
            this.leg1.position.set(-0.3, 0.3, 0.5);
            this.leg2.position.set(0.3, 0.3, 0.5);
            this.leg3.position.set(-0.3, 0.3, -0.5);
            this.leg4.position.set(0.3, 0.3, -0.5);
            this.mesh.add(this.leg1, this.leg2, this.leg3, this.leg4);
        }
        
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
                let foundGround = false;
                for(let i=0; i<3; i++) {
                    if(world.isSolid(bx, groundY - 1, bz)) {
                        foundGround = true;
                        break;
                    }
                    groundY--;
                }
                if (!foundGround) {
                     if (world.isSolid(bx, by, bz)) { 
                         if (!world.isSolid(bx, by+1, bz) && !world.isSolid(bx, by+2, bz)) {
                             groundY = by + 1;
                             foundGround = true;
                         }
                     }
                }
                if (foundGround && Math.abs(groundY - this.position.y) <= 1.5) {
                    this.position.x = nextPos.x;
                    this.position.z = nextPos.z;
                    this.position.y = THREE.MathUtils.lerp(this.position.y, groundY, dt * 10);
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
            
            if (this.type !== 'villager') {
                this.leg3.rotation.x = Math.cos(this.walkTime) * 0.5;
                this.leg4.rotation.x = Math.sin(this.walkTime) * 0.5;
            } else {
                this.leg3.rotation.x = Math.cos(this.walkTime) * 0.5;
                this.leg4.rotation.x = Math.sin(this.walkTime) * 0.5;
            }
        } else {
            this.leg1.rotation.x = 0; this.leg2.rotation.x = 0;
            this.leg3.rotation.x = 0; this.leg4.rotation.x = 0;
            if (Math.random() > 0.99) this.head.rotation.x = 0.2;
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
        this.armR.geometry.translate(0, -0.25, 0); 
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

        if (this.isMining) {
            this.mineAnimTime += dt * 15;
            const swing = Math.abs(Math.sin(this.mineAnimTime)); 
            this.armR.rotation.x = (swing * 1.5); 
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

class CloudSystem {
    private mesh: THREE.InstancedMesh;
    private clouds: { x: number, y: number, z: number }[] = [];
    private offset: number = 0;
    private dummy = new THREE.Object3D();
    private boundSize: number;

    constructor(scene: THREE.Scene) {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0xFFFFFF, 
            transparent: true, 
            opacity: 0.85 
        });
        
        this.mesh = new THREE.InstancedMesh(geometry, material, 1500);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.castShadow = false;
        this.mesh.receiveShadow = false;
        scene.add(this.mesh);
        
        this.boundSize = WORLD_SIZE * 2.5; 
        this.generate();
    }

    generate() {
        const noise = new SimpleNoise(Math.random() * 1000);
        const noise2 = new SimpleNoise(Math.random() * 5000);
        
        const step = 6; 
        const start = -this.boundSize / 2;
        const end = this.boundSize / 2;
        let count = 0;

        for (let x = start; x < end; x += step) {
            for (let z = start; z < end; z += step) {
                const n1 = noise.noise(x * 0.006, 120, z * 0.006);
                const n2 = noise2.noise(x * 0.03, 0, z * 0.03) * 0.25;
                const val = n1 + n2;
                if (val > 0.4) {
                    const h = 75 + (val - 0.35) * 15; 
                    const thickness = 1 + Math.floor((val - 0.35) * 5);
                    for(let t=0; t<thickness; t++) {
                        if (count < this.mesh.count) {
                            this.clouds.push({ x, y: h + t * step, z });
                            count++;
                        }
                    }
                }
            }
        }
        this.mesh.count = count;
        this.update(0);
    }

    update(dt: number) {
        this.offset += dt * 4;
        const half = this.boundSize / 2;

        for(let i=0; i<this.clouds.length; i++) {
            const c = this.clouds[i];
            let px = c.x + this.offset;
            while(px > half) px -= this.boundSize;
            while(px < -half) px += this.boundSize;
            this.dummy.position.set(px, c.y, c.z);
            this.dummy.scale.set(6, 4, 6); 
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
    }
}

export class WorldManager {
    public scene: THREE.Scene;
    public camera: THREE.PerspectiveCamera;
    public renderer: THREE.WebGLRenderer;
    
    public cameraYawGroup: THREE.Group;
    public cameraPitchGroup: THREE.Group;
    
    public blocks = new Map<number, { type: string, instanceId: number, mesh: THREE.InstancedMesh }>();
    public mobs: Mob[] = [];
    public playerActor: PlayerActor | null = null;
    public particles: ParticleSystem | null = null;
    public cloudSystem: CloudSystem | null = null;
    public selectionBox: SelectionBox | null = null;
    
    public instancedMeshes: THREE.InstancedMesh[] = [];
    public spawnPoint = new THREE.Vector3(0, 100, 0); 

    private cameraRaycaster = new THREE.Raycaster();

    constructor() {
        this.scene = new THREE.Scene();
        const skyColor = 0x87CEEB;
        this.scene.background = new THREE.Color(skyColor);
        this.scene.fog = new THREE.Fog(skyColor, 60, 150); 

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 300);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.cameraYawGroup = new THREE.Group();
        this.scene.add(this.cameraYawGroup);

        this.cameraPitchGroup = new THREE.Group();
        this.cameraPitchGroup.position.y = 1.6; 
        this.cameraYawGroup.add(this.cameraPitchGroup);
        
        this.cameraPitchGroup.add(this.camera);
        this.camera.position.set(1.2, 0, 4);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
        dirLight.position.set(100, 150, 100);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.set(2048, 2048);
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 300;
        const sSize = 120;
        dirLight.shadow.camera.left = -sSize; dirLight.shadow.camera.right = sSize;
        dirLight.shadow.camera.top = sSize; dirLight.shadow.camera.bottom = -sSize;
        dirLight.shadow.bias = -0.0004;
        this.scene.add(dirLight);

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
        this.cloudSystem = new CloudSystem(this.scene);
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
        return this.blocks.get(getKey(Math.round(x), Math.round(y), Math.round(z)));
    }

    public isSolid = (x: number, y: number, z: number) => {
        const block = this.getBlock(x, y, z);
        if (!block) return false;
        const nonSolid = [
            BlockType.WATER, BlockType.CLOUD, BlockType.FLOWER_RED, BlockType.FLOWER_YELLOW, 
            BlockType.TALL_GRASS, BlockType.DEAD_BUSH, BlockType.BAMBOO, 
            BlockType.WHITE_TILE, BlockType.RED_WOOL, BlockType.WHEAT, BlockType.LAVA
        ];
        return !nonSolid.includes(block.type);
    }

    public removeBlock = (x: number, y: number, z: number) => {
        const key = getKey(Math.round(x), Math.round(y), Math.round(z));
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
        // Data structure for CHUNKED rendering
        // Map<chunkKey, Record<BlockType, matrixData[]>>
        const chunkInstances = new Map<string, Record<string, number[]>>();
        // Map<chunkKey, Record<BlockType, {x,y,z}[]>> for linking back to blocks map
        const chunkBlockCoords = new Map<string, Record<string, {x:number, y:number, z:number}[]>>();

        const worldData = new Map<number, string>();
        
        const storeBlock = (type: string, x: number, y: number, z: number) => {
            const key = getKey(x, y, z);
            if (!worldData.has(key)) {
                worldData.set(key, type);

                // Determine Chunk
                const cx = Math.floor(x / CHUNK_SIZE);
                const cz = Math.floor(z / CHUNK_SIZE);
                const chunkKey = getChunkKey(cx, cz);

                if (!chunkInstances.has(chunkKey)) {
                    const emptyRec: Record<string, number[]> = {};
                    const emptyCoord: Record<string, {x:number,y:number,z:number}[]> = {};
                    Object.values(BlockType).forEach(t => {
                        emptyRec[t] = [];
                        emptyCoord[t] = [];
                    });
                    chunkInstances.set(chunkKey, emptyRec);
                    chunkBlockCoords.set(chunkKey, emptyCoord);
                }

                const dummy = new THREE.Object3D();
                dummy.position.set(x, y, z);
                dummy.updateMatrix();
                
                const ci = chunkInstances.get(chunkKey)!;
                const cc = chunkBlockCoords.get(chunkKey)!;
                
                ci[type].push(...dummy.matrix.elements);
                cc[type].push({x, y, z});
            }
        };

        const heightNoise = new SimpleNoise(123);
        const detailNoise = new SimpleNoise(456);
        const offset = 80;

        // --- TERRAIN PASS ---
        for (let x = -offset; x < offset; x++) {
            for (let z = -offset; z < offset; z++) {
                const distFromCenter = Math.sqrt(x*x + z*z);
                
                const isOcean = distFromCenter > 74;
                const isAbyss = (x < -35 && x > -75 && z > -20 && z < 20);
                const isVolcano = (x > 35 && x < 75 && z > -20 && z < 20);
                const isDesert = (z > 35 && z < 75 && x > -25 && x < 25);
                const isMountain = (z < -35 && z > -75 && x > -30 && x < 30);

                let h = 15; 
                let surface = BlockType.GRASS;
                let sub = BlockType.DIRT;
                let biome = 'plains';

                h += heightNoise.noise(x*0.05, 0, z*0.05) * 4;

                if (isOcean) {
                    biome = 'ocean';
                    h -= (distFromCenter - 74) * 5;
                    surface = BlockType.SAND;
                } else if (isAbyss) {
                    biome = 'abyss';
                    const dx = x - (-55);
                    const dz = z - 0;
                    const d = Math.sqrt(dx*dx + dz*dz);
                    if (d < 22) {
                        h = -50 + d * 3.5; 
                        if (h > 15) h = 15;
                        surface = BlockType.OBSIDIAN;
                        sub = BlockType.DARK_MATTER;
                    }
                } else if (isVolcano) {
                    biome = 'volcano';
                    const dx = x - 55; const dz = z - 0;
                    const d = Math.sqrt(dx*dx + dz*dz);
                    h += 55 * Math.exp(-d * 0.13);
                    surface = BlockType.BASALT;
                    sub = BlockType.STONE;
                    if (d < 5) {
                        h = 45 - (5-d)*3;
                        surface = BlockType.OBSIDIAN;
                    }
                } else if (isMountain) {
                    biome = 'mountain';
                    const dx = x - 0; const dz = z - (-55);
                    const d = Math.sqrt(dx*dx + dz*dz);
                    if (d < 35) {
                        const factor = (35 - d) / 35; 
                        const mNoise = Math.abs(detailNoise.noise(x*0.1, 0, z*0.1));
                        h += factor * 85 * (0.6 + mNoise); 
                        surface = BlockType.STONE;
                        if (h > 50) surface = BlockType.SNOW;
                    }
                } else if (isDesert) {
                    biome = 'desert';
                    h += Math.sin(x*0.2) * Math.sin(z*0.2 + x*0.1) * 5;
                    surface = BlockType.SAND;
                    sub = BlockType.SANDSTONE;
                } else {
                    if (heightNoise.noise(x*0.03 + 100, 0, z*0.03) > 0.65) {
                         h = 10; 
                    }
                }

                h = Math.round(h);

                for (let y = -5; y <= h; y++) {
                    let type = sub;
                    if (y === h) type = surface;
                    if (y < h - 4) type = BlockType.STONE;
                    if (biome === 'volcano' && y < h - 2) type = BlockType.BASALT;
                    if (h <= WATER_LEVEL + 1 && biome === 'plains' && y===h) type = BlockType.SAND;

                    storeBlock(type, x, y, z);
                }

                if (h < WATER_LEVEL && biome !== 'volcano' && biome !== 'abyss') {
                     for (let w = h + 1; w <= WATER_LEVEL; w++) {
                        storeBlock(BlockType.WATER, x, w, z);
                    }
                    if (biome === 'mountain' && h < WATER_LEVEL) {
                         storeBlock(BlockType.ICE, x, WATER_LEVEL, z);
                    }
                }
                
                if (biome === 'volcano') {
                    const dx = x - 55; const dz = z;
                    const d = Math.sqrt(dx*dx + dz*dz);
                    if (d < 4.5 && 40 > h) { 
                        for(let l = h+1; l <= 40; l++) storeBlock(BlockType.LAVA, x, l, z);
                    }
                }
            }
        }

        // Structures
        this.buildVillage(storeBlock, 15); 
        this.createBillboard(storeBlock);

        // --- DECORATION PASS ---
        for (let x = -offset + 2; x < offset - 2; x++) {
            for (let z = -offset + 2; z < offset - 2; z++) {
                let groundY = -999;
                for(let y = 80; y > -50; y--) {
                    if (worldData.has(getKey(x,y,z))) {
                        const b = worldData.get(getKey(x,y,z));
                         if (b !== BlockType.WATER && b !== BlockType.CLOUD && b !== BlockType.LAVA) {
                            groundY = y;
                            break;
                        }
                    }
                }
                
                if (groundY === -999) continue;
                if (worldData.has(getKey(x, groundY+1, z))) continue;
                
                const surfaceBlock = worldData.get(getKey(x, groundY, z));
                const rand = Math.random();

                if (surfaceBlock === BlockType.GRASS) {
                    if (rand < 0.05) {
                         if (rand < 0.01) this.generateTree(x, groundY, z, storeBlock, 'OAK');
                         else if (rand < 0.02) this.generateTree(x, groundY, z, storeBlock, 'BIRCH');
                         else if (rand < 0.03) storeBlock(BlockType.FLOWER_RED, x, groundY+1, z);
                         else storeBlock(BlockType.TALL_GRASS, x, groundY+1, z);
                    }
                } else if (surfaceBlock === BlockType.SAND) {
                     if (z > 30 && rand < 0.02) {
                          storeBlock(BlockType.CACTUS, x, groundY+1, z);
                          if (Math.random() > 0.5) storeBlock(BlockType.CACTUS, x, groundY+2, z);
                          if (Math.random() > 0.8) storeBlock(BlockType.CACTUS, x, groundY+3, z);
                     } else if (groundY <= WATER_LEVEL + 2 && rand < 0.05) {
                          storeBlock(BlockType.DEAD_BUSH, x, groundY+1, z);
                     }
                } else if (surfaceBlock === BlockType.SNOW && rand < 0.01) {
                    this.generateTree(x, groundY, z, storeBlock, 'OAK');
                }

                if (rand < 0.01) {
                    let type: any = 'sheep';
                    if (surfaceBlock === BlockType.GRASS) type = Math.random() > 0.5 ? 'cow' : 'pig';
                    if (surfaceBlock === BlockType.SAND && z > 30) type = null; 
                    if (surfaceBlock === BlockType.SAND && z <= 30) type = 'villager'; 
                    if (surfaceBlock === BlockType.STONE || surfaceBlock === BlockType.SNOW) type = 'sheep';
                    
                    if (type) {
                        if (!worldData.has(getKey(x, groundY+2, z))) {
                            this.mobs.push(new Mob(type, x, groundY+1, z));
                            this.scene.add(this.mobs[this.mobs.length-1].mesh);
                        }
                    }
                }
            }
        }

        // --- MESH BUILD (CHUNKED) ---
        this.buildChunkMeshes(chunkInstances, chunkBlockCoords, worldData);
    }

    private buildChunkMeshes(
        chunkInstances: Map<string, Record<string, number[]>>, 
        chunkBlockCoords: Map<string, Record<string, {x:number, y:number, z:number}[]>>,
        worldData: Map<number, string>
    ) {
        const geo = new THREE.BoxGeometry(1,1,1);
        const smallGeo = new THREE.BoxGeometry(0.6,0.6,0.6); 
        const poleGeo = new THREE.BoxGeometry(0.85, 1, 0.85); 
        const flatGeo = new THREE.BoxGeometry(0.8, 0.6, 0.8); 
        const thinGeo = new THREE.BoxGeometry(0.25, 1, 0.25); 

        const shadowCastingBlocks = [
            BlockType.WOOD, BlockType.LEAVES, BlockType.BIRCH_WOOD, BlockType.BIRCH_LEAVES,
            BlockType.PEACH_WOOD, BlockType.PEACH_LEAVES, BlockType.CACTUS, 
            BlockType.PLANKS, BlockType.BRICK, BlockType.ROOF_TILE, BlockType.SIGN_POST,
            BlockType.RED_WOOL, BlockType.WHEAT
        ];
        
        const isOpaque = (t: string) => {
            const transparents = [
                BlockType.WATER, BlockType.GLASS, BlockType.LEAVES, BlockType.BIRCH_LEAVES, BlockType.PEACH_LEAVES,
                BlockType.FLOWER_RED, BlockType.FLOWER_YELLOW, BlockType.TALL_GRASS, BlockType.BAMBOO,
                BlockType.CACTUS, BlockType.DEAD_BUSH, BlockType.CLOUD, BlockType.NEON_CYAN, BlockType.NEON_MAGENTA,
                BlockType.SIGN_POST, BlockType.WHEAT, BlockType.LAVA, BlockType.ICE
            ];
            return !transparents.includes(t);
        }

        const neighbors = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

        chunkInstances.forEach((instances, chunkKey) => {
            const coords = chunkBlockCoords.get(chunkKey)!;
            const chunkGroup = new THREE.Group();
            
            Object.keys(instances).forEach(type => {
                // CULLING within the chunk data before creating mesh
                // Note: We must keep sync between instances array and coords array
                const rawMatrices = instances[type];
                const rawCoords = coords[type];
                
                if (rawMatrices.length === 0) return;

                const finalMatrices: number[] = [];
                const finalCoords: {x:number, y:number, z:number}[] = [];

                // Perform Face Culling Check
                for (let i = 0; i < rawCoords.length; i++) {
                    const {x, y, z} = rawCoords[i];
                    
                    // Optimization: Don't render if completely surrounded
                    let visible = true;
                    if (isOpaque(type)) {
                        visible = false;
                        for (const offset of neighbors) {
                            const nKey = getKey(x + offset[0], y + offset[1], z + offset[2]);
                            const nType = worldData.get(nKey);
                            if (!nType || !isOpaque(nType)) {
                                visible = true; break;
                            }
                        }
                    }
                    
                    if (visible) {
                        finalMatrices.push(...rawMatrices.slice(i*16, (i+1)*16));
                        finalCoords.push({x, y, z});
                    }
                }

                const count = finalMatrices.length / 16;
                if (count === 0) return;

                let geometry = geo;
                const isFlora = [BlockType.FLOWER_RED, BlockType.FLOWER_YELLOW, BlockType.TALL_GRASS, BlockType.WHITE_TILE, BlockType.WHEAT].includes(type);
                if (isFlora) geometry = smallGeo;
                if (type === BlockType.CACTUS) geometry = poleGeo;
                if (type === BlockType.BAMBOO) geometry = thinGeo;
                if (type === BlockType.DEAD_BUSH) geometry = flatGeo;
                
                const mat = new THREE.MeshStandardMaterial({ color: PALETTE[type], roughness: 0.8 });
                
                if (type === BlockType.WATER) { mat.transparent = true; mat.opacity = 0.7; mat.roughness = 0.4; mat.metalness = 0.1;}
                if (type === BlockType.ICE) { mat.transparent = true; mat.opacity = 0.9; mat.roughness = 0.1; mat.metalness = 0.1;}
                if (type === BlockType.CLOUD) { mat.transparent = false; mat.opacity = 1.0; mat.roughness = 1.0;}
                if (type === BlockType.GLASS) { mat.transparent = true; mat.opacity = 0.4;}
                if (type === BlockType.LAVA) { mat.emissive = new THREE.Color(0xCF1020); mat.emissiveIntensity = 1.0; mat.color = new THREE.Color(0xCF1020);}
                if (type === BlockType.NEON_CYAN || type === BlockType.NEON_MAGENTA) { mat.emissive = new THREE.Color(PALETTE[type]); mat.emissiveIntensity = 0.8; mat.toneMapped = false;}
                
                const mesh = new THREE.InstancedMesh(geometry, mat, count);
                mesh.castShadow = shadowCastingBlocks.includes(type);
                mesh.receiveShadow = true;
                if (type === BlockType.WATER || type === BlockType.LAVA || type === BlockType.NEON_CYAN) {
                    mesh.receiveShadow = false;
                }

                const m4 = new THREE.Matrix4();
                for(let i=0; i<count; i++) {
                    m4.fromArray(finalMatrices, i*16);
                    mesh.setMatrixAt(i, m4);
                    
                    // Update global block map with mesh reference
                    const c = finalCoords[i];
                    this.blocks.set(getKey(c.x, c.y, c.z), {
                        type: type,
                        instanceId: i,
                        mesh: mesh
                    });
                }

                chunkGroup.add(mesh);
                this.instancedMeshes.push(mesh);
            });
            
            // By adding to scene as small groups or individual meshes, 
            // Three.js Frustum culling works on each mesh's bounding sphere.
            // Since chunks are spatially separated, this provides free "chunk culling".
            this.scene.add(chunkGroup);
        });
    }

    private buildVillage(storeBlock: Function, baseH: number) {
        const houseCenters = [
            {x: -15, z: -15, w: 6, d: 6}, 
            {x: -12, z: 15, w: 5, d: 5}, 
            {x: 15, z: -10, w: 6, d: 7},
            {x: 10, z: 12, w: 5, d: 5}
        ];
        for (const h of houseCenters) {
            this.buildLargeHouse(storeBlock, h.x, baseH, h.z, h.w, h.d);
        }
        this.buildMahjongTable(-5, baseH, -5, storeBlock);
        this.buildSignPost(storeBlock, 0, baseH, 5); 
        this.buildFarm(storeBlock, baseH, 8, 8);
    }

    private buildLargeHouse(storeBlock: Function, cx: number, y: number, cz: number, width: number, depth: number) {
        const halfW = Math.floor(width / 2);
        const halfD = Math.floor(depth / 2);
        const wallHeight = 4;
        for (let dy = 1; dy <= wallHeight; dy++) {
            for (let dx = -halfW; dx <= halfW; dx++) {
                storeBlock(BlockType.BRICK, cx + dx, y + dy, cz - halfD);
                storeBlock(BlockType.BRICK, cx + dx, y + dy, cz + halfD);
            }
            for (let dz = -halfD; dz <= halfD; dz++) {
                storeBlock(BlockType.BRICK, cx - halfW, y + dy, cz + dz);
                storeBlock(BlockType.BRICK, cx + halfW, y + dy, cz + dz);
            }
        }
        for (let dx = -halfW; dx <= halfW; dx++) {
            for (let dz = -halfD; dz <= halfD; dz++) {
                storeBlock(BlockType.PLANKS, cx + dx, y, cz + dz);
            }
        }
        storeBlock(null, cx, y+1, cz+halfD);
        storeBlock(null, cx, y+2, cz+halfD);
        storeBlock(BlockType.GLASS, cx - halfW + 2, y+2, cz+halfD);
        let roofY = y + wallHeight + 1;
        for (let i = 0; i <= Math.max(halfW, halfD); i++) {
            const w = halfW + 1 - i;
            const d = halfD + 1 - i;
            if (w < 0 || d < 0) break;
            for (let dx = -w; dx <= w; dx++) {
                storeBlock(BlockType.ROOF_TILE, cx + dx, roofY, cz - d);
                storeBlock(BlockType.ROOF_TILE, cx + dx, roofY, cz + d);
            }
            for (let dz = -d; dz <= d; dz++) {
                storeBlock(BlockType.ROOF_TILE, cx - w, roofY, cz + dz);
                storeBlock(BlockType.ROOF_TILE, cx + w, roofY, cz + dz);
            }
            roofY++;
        }
    }

    private buildMahjongTable(x: number, y: number, z: number, storeBlock: Function) {
        storeBlock(BlockType.RED_WOOL, x, y+1, z);
        storeBlock(BlockType.BIRCH_WOOD, x+1, y+1, z);
        storeBlock(BlockType.BIRCH_WOOD, x-1, y+1, z);
        storeBlock(BlockType.BIRCH_WOOD, x, y+1, z+1);
        storeBlock(BlockType.BIRCH_WOOD, x, y+1, z-1);
        storeBlock(BlockType.WHITE_TILE, x, y+2, z); 
    }

    private buildSignPost(storeBlock: Function, x: number, y: number, z: number) {
        storeBlock(BlockType.WOOD, x, y+1, z);
        storeBlock(BlockType.WOOD, x, y+2, z);
        storeBlock(BlockType.SIGN_POST, x, y+3, z);
    }

    private buildFarm(storeBlock: Function, y: number, cx: number, cz: number) {
        for(let dx = -2; dx <= 2; dx++) {
            for(let dz = -2; dz <= 2; dz++) {
                if (dx === 0) storeBlock(BlockType.WATER, cx+dx, y, cz+dz);
                else {
                    storeBlock(BlockType.FARMLAND, cx+dx, y, cz+dz);
                    if (Math.random() > 0.2) storeBlock(BlockType.WHEAT, cx+dx, y+1, cz+dz);
                }
            }
        }
    }

    private generateTree(x: number, y: number, z: number, addBlock: Function, type: 'OAK' | 'BIRCH') {
        let woodType = BlockType.WOOD;
        let leafType = BlockType.LEAVES;
        if (type === 'BIRCH') { woodType = BlockType.BIRCH_WOOD; leafType = BlockType.BIRCH_LEAVES; }
        
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
        const billboardZ = -80; 
        const billboardY = 60;
        const scale = 4;
        const FONT_MAP: Record<string, number[]> = {
            'V': [17, 17, 17, 17, 17, 10, 4],
            'O': [14, 17, 17, 17, 17, 17, 14],
            'X': [17, 17, 10, 4, 10, 17, 17],
            'E': [31, 1, 1, 31, 1, 1, 31],
            'L': [1, 1, 1, 1, 1, 1, 31],
            'W': [17, 17, 17, 21, 21, 21, 10],
            'R': [30, 17, 17, 30, 20, 18, 17],
            'D': [30, 17, 17, 17, 17, 17, 30],
            ' ': [0, 0, 0, 0, 0, 0, 0]
        };
        const text = "VOXEL WORLD";
        const fontW = 5;
        const spacing = 1;
        let cursorX = -Math.floor(((text.length * (fontW * scale) + (text.length - 1) * (spacing * scale))) / 2);
        
        const padX = 6, padY = 6;
        const screenW = (text.length * (fontW * scale)) + padX*2;
        const screenH = (7 * scale) + padY * 2;
        const screenLeft = cursorX - padX;
        const screenBottom = billboardY - (7*scale) - padY;
        
        for(let bx = 0; bx < screenW; bx++) {
            for(let by = 0; by < screenH; by++) {
                const posX = screenLeft + bx;
                const posY = screenBottom + by;
                const isBorder = bx === 0 || bx === screenW - 1 || by === 0 || by === screenH - 1;
                addBlock(isBorder ? BlockType.NEON_CYAN : BlockType.DARK_MATTER, posX, posY, billboardZ);
            }
        }

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
                                    addBlock(BlockType.NEON_MAGENTA, cursorX + (col * scale) + sx, billboardY - (row * scale) - sy, billboardZ + 1);
                                }
                            }
                        }
                    }
                }
            }
            cursorX += (fontW * scale) + (spacing * scale);
        }
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
        // Since meshes are now chunked, this array contains all chunks. 
        // Three.js Raycaster automatically checks bounding spheres first, so it's still reasonably fast.
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
        if (this.cloudSystem) this.cloudSystem.update(dt);

        this.renderer.render(this.scene, this.camera);
    }
}