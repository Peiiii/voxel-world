
import * as THREE from 'three';
import { BlockType, PALETTE, SimpleNoise, WORLD_SIZE, WATER_LEVEL, CHUNK_SIZE } from '../utils/constants';
import { SelectionBox } from '../world/SelectionBox';
import { Mob } from '../world/Mob';
import { PlayerActor } from '../world/PlayerActor';
import { ParticleSystem } from '../world/ParticleSystem';
import { CloudSystem } from '../world/CloudSystem';

// --- HELPER: Spatial Hashing for Performance ---
const getKey = (x: number, y: number, z: number) => {
    return ((x + 128) << 16) | ((z + 128) << 8) | (y + 64);
};

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
    private dirLight: THREE.DirectionalLight;

    constructor() {
        this.scene = new THREE.Scene();
        const skyColor = 0x87CEEB;
        this.scene.background = new THREE.Color(skyColor);
        this.scene.fog = new THREE.Fog(skyColor, 60, 180); 

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 300);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;

        this.cameraYawGroup = new THREE.Group();
        this.scene.add(this.cameraYawGroup);

        this.cameraPitchGroup = new THREE.Group();
        this.cameraPitchGroup.position.y = 1.6; 
        this.cameraYawGroup.add(this.cameraPitchGroup);
        
        this.cameraPitchGroup.add(this.camera);
        this.camera.position.set(1.2, 0, 4);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);
        
        this.dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
        this.dirLight.position.set(100, 150, 100);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.bias = -0.0004;
        this.scene.add(this.dirLight);

        const sunSize = 30;
        const sunGeo = new THREE.BoxGeometry(sunSize, sunSize, sunSize);
        const sunMat = new THREE.MeshBasicMaterial({ color: 0xffe34d, fog: false });
        const sunMesh = new THREE.Mesh(sunGeo, sunMat);
        sunMesh.position.set(100, 120, -150); 
        sunMesh.rotation.z = Math.PI / 4;
        sunMesh.rotation.y = Math.PI / 4;
        this.scene.add(sunMesh);
    }

    public init = (container: HTMLElement, isMobile: boolean) => {
        container.appendChild(this.renderer.domElement);
        
        if (isMobile) {
            this.renderer.setPixelRatio(1.0); 
            this.renderer.shadowMap.type = THREE.BasicShadowMap;
            this.dirLight.shadow.mapSize.set(1024, 1024);
            this.dirLight.shadow.camera.near = 0.5;
            this.dirLight.shadow.camera.far = 150;
            const sSize = 60;
            this.dirLight.shadow.camera.left = -sSize; this.dirLight.shadow.camera.right = sSize;
            this.dirLight.shadow.camera.top = sSize; this.dirLight.shadow.camera.bottom = -sSize;
            this.scene.fog = new THREE.Fog(0x87CEEB, 40, 120);
        } else {
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.dirLight.shadow.mapSize.set(2048, 2048);
            this.dirLight.shadow.camera.near = 0.5;
            this.dirLight.shadow.camera.far = 300;
            const sSize = 140;
            this.dirLight.shadow.camera.left = -sSize; this.dirLight.shadow.camera.right = sSize;
            this.dirLight.shadow.camera.top = sSize; this.dirLight.shadow.camera.bottom = -sSize;
        }
        
        this.generateWorld(isMobile);
        
        this.particles = new ParticleSystem(this.scene, isMobile);
        this.cloudSystem = new CloudSystem(this.scene, isMobile);
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
            BlockType.WHITE_TILE, BlockType.RED_WOOL, BlockType.WHEAT, BlockType.LAVA, BlockType.PATH
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

    private generateWorld = (isMobile: boolean) => {
        const worldData = new Map<number, string>();
        
        const storeBlock = (type: string | null, x: number, y: number, z: number) => {
            const key = getKey(x, y, z);
            if (type === null) {
                 if (worldData.has(key)) worldData.delete(key);
                 return;
            }
            worldData.set(key, type);
        };

        const heightNoise = new SimpleNoise(123);
        const detailNoise = new SimpleNoise(456);
        
        const offset = isMobile ? 85 : 120; 

        // --- TERRAIN GENERATION ---
        for (let x = -offset; x < offset; x++) {
            for (let z = -offset; z < offset; z++) {
                const distFromCenter = Math.sqrt(x*x + z*z);

                // 1. SAFE SPAWN PLATEAU
                // Force a flat solid area at (0,0) so player doesn't sink
                if (distFromCenter < 15) {
                    const spawnH = 18;
                    for (let y = spawnH; y > spawnH - 10; y--) {
                        let t = BlockType.DIRT;
                        if (y === spawnH) t = BlockType.GRASS;
                        else if (y < spawnH - 3) t = BlockType.STONE;
                        storeBlock(t, x, y, z);
                    }
                    // Set player spawn point just above
                    if (Math.abs(x) < 2 && Math.abs(z) < 2) {
                        this.spawnPoint.set(0, spawnH + 3, 0);
                    }
                    continue; 
                }

                // Normal Generation
                let h = 15; 
                let surface = BlockType.GRASS;
                let sub = BlockType.DIRT;
                
                const isMountain = (z < -45 && z > -85 && x > -40 && x < 40); 
                const isDesert = (z > 45 && z < 85 && x > -35 && x < 35); 
                const isOcean = distFromCenter > (isMobile ? 80 : 105);

                h += heightNoise.noise(x*0.05, 0, z*0.05) * 4;

                if (isOcean) {
                    h -= (distFromCenter - (isMobile ? 80 : 105)) * 5;
                    surface = BlockType.SAND;
                    sub = BlockType.SAND;
                } else if (isMountain) {
                    const dx = x - 0; const dz = z - (-65); 
                    const d = Math.sqrt(dx*dx + dz*dz);
                    if (d < 35) {
                        const factor = (35 - d) / 35; 
                        const mNoise = Math.abs(detailNoise.noise(x*0.1, 0, z*0.1));
                        h += factor * 85 * (0.6 + mNoise); 
                        surface = BlockType.STONE;
                        sub = BlockType.STONE;
                        if (h > 50) surface = BlockType.SNOW;
                    }
                } else if (isDesert) {
                    h += Math.sin(x*0.2) * Math.sin(z*0.2 + x*0.1) * 5;
                    surface = BlockType.SAND;
                    sub = BlockType.SANDSTONE;
                }

                h = Math.round(h);
                if (h < 5) h = 5; // Bedrock floor

                // 2. SOLID TERRAIN
                // Fill downwards 8 blocks to ensure mountains are not hollow shells
                // and you can't fall through easily.
                for (let y = h; y > h - 8; y--) {
                    let type = sub;
                    if (y === h) type = surface;
                    if (y < h - 4) type = BlockType.STONE; // Core is stone
                    storeBlock(type, x, y, z);
                }

                // Water Fill
                if (h < WATER_LEVEL) {
                    for (let y = h + 1; y <= WATER_LEVEL; y++) {
                        storeBlock(BlockType.WATER, x, y, z);
                    }
                }

                // Flora
                if (h > WATER_LEVEL && !isDesert && !isMountain && !isOcean && Math.random() > 0.98) {
                     storeBlock(BlockType.WOOD, x, h+1, z);
                     storeBlock(BlockType.WOOD, x, h+2, z);
                     storeBlock(BlockType.LEAVES, x, h+3, z);
                     storeBlock(BlockType.LEAVES, x+1, h+2, z);
                     storeBlock(BlockType.LEAVES, x-1, h+2, z);
                     storeBlock(BlockType.LEAVES, x, h+2, z+1);
                     storeBlock(BlockType.LEAVES, x, h+2, z-1);
                }
            }
        }

        // 3. MEGA SPIRE CATHEDRAL
        // A massive procedural tower at specific coords
        this.generateMegaSpire(worldData, -50, 50);

        // --- INSTANCING & MOBS ---
        const chunks = new Map<string, { count: number, matrices: THREE.Matrix4[] }>();
        
        worldData.forEach((type, key) => {
            if (!chunks.has(type)) chunks.set(type, { count: 0, matrices: [] });
            const entry = chunks.get(type)!;
            
            // Reverse key
            const y = key & 0xFF;
            const z = ((key >> 8) & 0xFF) - 128;
            const x = ((key >> 16) & 0xFF) - 128;
            
            const mat = new THREE.Matrix4().makeTranslation(x, y - 64, z); // Adjust y offset from key
            entry.matrices.push(mat);
            entry.count++;
        });

        chunks.forEach((data, type) => {
            const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial({ color: PALETTE[type] }), data.count);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            for (let i = 0; i < data.count; i++) {
                mesh.setMatrixAt(i, data.matrices[i]);
                const pos = new THREE.Vector3();
                pos.setFromMatrixPosition(data.matrices[i]);
                
                // Store for interactions
                const key = getKey(Math.round(pos.x), Math.round(pos.y), Math.round(pos.z));
                this.blocks.set(key, { type, instanceId: i, mesh });
            }
            this.scene.add(mesh);
            this.instancedMeshes.push(mesh);
        });

        // 4. MOBS: DINOSAURS & HUMANS
        // Spawn based on simplified biome logic
        for (let i = 0; i < (isMobile ? 10 : 20); i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 20 + Math.random() * 60;
            const mx = Math.round(Math.sin(angle) * dist);
            const mz = Math.round(Math.cos(angle) * dist);
            const my = this.getSurfaceHeight(mx, mz, worldData);

            if (my > WATER_LEVEL) {
                let mobType: 'human' | 'dino' | 'sheep' = 'sheep';
                
                // Humans near spawn/center
                if (dist < 40) {
                    mobType = 'human';
                } 
                // Dinosaurs further out, especially in mountains or plains
                else if (Math.random() > 0.5) {
                    mobType = 'dino';
                }

                const mob = new Mob(mobType, mx, my + 1, mz);
                this.scene.add(mob.mesh);
                this.mobs.push(mob);
            }
        }
    }

    private generateMegaSpire(worldData: Map<number, string>, cx: number, cz: number) {
        const height = 90;
        const baseRadius = 18;
        
        // Loop height
        for (let y = 0; y < height; y++) {
            // Tapering radius logic
            let currentRadius = baseRadius * (1 - (y / height) * 0.8);
            // Flaring at top for spire effect
            if (y > height - 15) currentRadius = 2; 
            if (y > height - 5) currentRadius = 1;

            for (let x = -Math.ceil(currentRadius); x <= Math.ceil(currentRadius); x++) {
                for (let z = -Math.ceil(currentRadius); z <= Math.ceil(currentRadius); z++) {
                    const d2 = x*x + z*z;
                    // Star shape buttresses
                    const angle = Math.atan2(z, x);
                    const spikes = Math.cos(angle * 4) * 3; // 4 buttresses
                    const rCheck = currentRadius + (y < 30 ? spikes : 0);

                    if (d2 < rCheck*rCheck) {
                        const py = 15 + y; // Start at ground level ~15
                        // Hollow inside check
                        if (d2 > (rCheck - 2)*(rCheck - 2) || y > height - 20) {
                            // Walls
                            let type = BlockType.STONE;
                            if (y % 10 === 0) type = BlockType.OBSIDIAN;
                            if (y > height - 10) type = BlockType.GOLD;
                            
                            this.storeBlockMap(worldData, type, cx + x, py, cz + z);
                        } else if (y === 0 || y === 30 || y === 60) {
                            // Floors
                            this.storeBlockMap(worldData, BlockType.PLANKS, cx + x, py, cz + z);
                        } else if (x === 0 && z === 0) {
                            // Central pillar/stairs
                            this.storeBlockMap(worldData, BlockType.LOG, cx + x, py, cz + z);
                        }
                    }
                }
            }
        }
    }

    private storeBlockMap(map: Map<number, string>, type: string, x: number, y: number, z: number) {
        const key = getKey(x, y, z);
        map.set(key, type);
    }

    private getSurfaceHeight(x: number, z: number, data: Map<number, string>): number {
        for (let y = 100; y > 0; y--) {
            if (data.has(getKey(x, y, z))) return y;
        }
        return 0;
    }

    public render = (dt: number, yaw: number, pitch: number, pPos: THREE.Vector3, pVel: THREE.Vector3, isFlying: boolean) => {
        this.cameraYawGroup.position.copy(pPos);
        this.cameraYawGroup.rotation.y = yaw;
        this.cameraPitchGroup.rotation.x = pitch;

        this.playerActor?.setPosition(pPos);
        this.playerActor?.setRotation(yaw);
        this.playerActor?.update(dt, new THREE.Vector2(pVel.x, pVel.z).length(), isFlying);

        this.mobs.forEach(m => m.update(dt, this));
        this.particles?.update(dt);
        this.cloudSystem?.update(dt);

        this.renderer.render(this.scene, this.camera);
    }
}
