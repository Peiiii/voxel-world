
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

    private dirLight: THREE.DirectionalLight;
    private ambientLight: THREE.AmbientLight;
    private sunMesh: THREE.Mesh;
    private skyColor = new THREE.Color(0x87CEEB);

    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = this.skyColor;
        this.scene.fog = new THREE.Fog(this.skyColor, 60, 180); 

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

        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(this.ambientLight);
        
        this.dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
        this.dirLight.position.set(100, 150, 100);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.bias = -0.0004;
        this.scene.add(this.dirLight);

        const sunSize = 30;
        const sunGeo = new THREE.BoxGeometry(sunSize, sunSize, sunSize);
        const sunMat = new THREE.MeshBasicMaterial({ color: 0xffe34d, fog: false });
        this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
        this.sunMesh.position.set(100, 120, -150); 
        this.scene.add(this.sunMesh);
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
            this.scene.fog = new THREE.Fog(this.skyColor, 40, 120);
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
                if (distFromCenter < 15) {
                    const spawnH = 18;
                    for (let y = spawnH; y > spawnH - 10; y--) {
                        let t = BlockType.DIRT;
                        if (y === spawnH) t = BlockType.GRASS;
                        else if (y < spawnH - 3) t = BlockType.STONE;
                        storeBlock(t, x, y, z);
                    }
                    if (Math.abs(x) < 2 && Math.abs(z) < 2) {
                        this.spawnPoint.set(0, spawnH + 3, 0);
                    }
                    continue; 
                }

                // Normal Generation
                let h = 15; 
                let surface = BlockType.GRASS;
                let sub = BlockType.DIRT;
                
                // Mountain: North (-Z)
                const isMountain = (z < -45 && z > -95 && x > -50 && x < 50); 
                
                // Ladder Zone: South (+Z). Aggressively lower terrain here.
                const isLadderZone = (z > 40 && Math.abs(x) < 40);
                
                const isOcean = distFromCenter > (isMobile ? 80 : 105);

                h += heightNoise.noise(x*0.05, 0, z*0.05) * 4;

                if (isOcean) {
                    h -= (distFromCenter - (isMobile ? 80 : 105)) * 5;
                    surface = BlockType.SAND;
                    sub = BlockType.SAND;
                } else if (isMountain) {
                    const dx = x - 0; const dz = z - (-70); 
                    const d = Math.sqrt(dx*dx + dz*dz);
                    if (d < 40) {
                        const factor = (40 - d) / 40; 
                        const mNoise = Math.abs(detailNoise.noise(x*0.1, 0, z*0.1));
                        h += factor * 95 * (0.6 + mNoise); 
                        surface = BlockType.STONE;
                        sub = BlockType.STONE;
                        if (h > 55) surface = BlockType.SNOW;
                    }
                } else if (isLadderZone) {
                    // Force flat, low terrain to keep ladder entrance clear
                    h = 10; 
                    surface = BlockType.GRASS;
                }

                h = Math.round(h);
                if (h < 5) h = 5; 

                // 2. SOLID TERRAIN
                for (let y = h; y > h - 8; y--) {
                    let type = sub;
                    if (y === h) type = surface;
                    if (y < h - 4) type = BlockType.STONE;
                    storeBlock(type, x, y, z);
                }

                // Water Fill
                if (h < WATER_LEVEL) {
                    for (let y = h + 1; y <= WATER_LEVEL; y++) {
                        storeBlock(BlockType.WATER, x, y, z);
                    }
                }

                // Flora
                if (h > WATER_LEVEL && !isMountain && !isOcean && !isLadderZone && Math.random() > 0.98) {
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

        // 3. MEGA SPIRE (West, -X)
        this.generateMegaSpire(worldData, -80, 0);

        // 4. SKY LADDER (South, +Z)
        this.generateSkyLadder(worldData, 0, 60); 

        // 5. VOXEL WORLD TITLE (East, +X)
        this.generateVoxelTitle(worldData, 120, 0); 

        // --- INSTANCING & MOBS ---
        const chunks = new Map<string, { count: number, matrices: THREE.Matrix4[] }>();
        
        worldData.forEach((type, key) => {
            if (!chunks.has(type)) chunks.set(type, { count: 0, matrices: [] });
            const entry = chunks.get(type)!;
            
            const y = key & 0xFF;
            const z = ((key >> 8) & 0xFF) - 128;
            const x = ((key >> 16) & 0xFF) - 128;
            
            const mat = new THREE.Matrix4().makeTranslation(x, y - 64, z);
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
                const key = getKey(Math.round(pos.x), Math.round(pos.y), Math.round(pos.z));
                this.blocks.set(key, { type, instanceId: i, mesh });
            }
            this.scene.add(mesh);
            this.instancedMeshes.push(mesh);
        });

        // 5. MOBS
        for (let i = 0; i < (isMobile ? 10 : 20); i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 20 + Math.random() * 60;
            const mx = Math.round(Math.sin(angle) * dist);
            const mz = Math.round(Math.cos(angle) * dist);
            const my = this.getSurfaceHeight(mx, mz, worldData);

            if (my > WATER_LEVEL) {
                let mobType: 'human' | 'dino' | 'sheep' = 'sheep';
                if (dist < 40) mobType = 'human';
                else if (Math.random() > 0.5) mobType = 'dino';
                const mob = new Mob(mobType, mx, my + 1, mz);
                this.scene.add(mob.mesh);
                this.mobs.push(mob);
            }
        }
    }

    private generateSkyLadder(worldData: Map<number, string>, cx: number, cz: number) {
        // Straight, wide, infinite ladder going South (+Z)
        const maxY = 4000; 
        const startY = 12; // Start near ground
        
        // Width of the stairs
        const width = 3; 
        const totalClearWidth = width + 3;

        for (let i = 0; i < (maxY - startY); i++) {
            const y = startY + i;
            const z = cz + i; // 1:1 slope forward
            
            // CLEAR AREA: Aggressively remove blocks above and around the step
            // This creates a clean tunnel through any mountains or clouds
            for (let airY = 0; airY < 10; airY++) { // 10 blocks high clearance
                for (let w = -totalClearWidth; w <= totalClearWidth; w++) {
                    // Do not remove the block we are about to place (airY=0, within width)
                    if (airY === 0 && Math.abs(w) <= width) continue;
                    
                    const key = getKey(cx + w, y + airY, z);
                    if (worldData.has(key)) worldData.delete(key);
                }
            }

            // Build Step
            for (let w = -width; w <= width; w++) {
                const x = cx + w;
                let type = BlockType.SNOW;
                // Gold trim on the sides and every 50th step
                if (Math.abs(w) === width || i % 50 === 0) {
                    type = BlockType.GOLD; 
                }
                this.storeBlockMap(worldData, type, x, y, z);
                
                // Fill underneath slightly to look solid
                this.storeBlockMap(worldData, BlockType.SNOW, x, y - 1, z);
                this.storeBlockMap(worldData, BlockType.SNOW, x, y - 2, z);
            }
        }
    }

    private generateVoxelTitle(worldData: Map<number, string>, cx: number, cz: number) {
        const letters: {[key: string]: string[]} = {
            V: ["10001", "10001", "10001", "01010", "00100"],
            O: ["01110", "10001", "10001", "10001", "01110"],
            X: ["10001", "01010", "00100", "01010", "10001"],
            E: ["11111", "10000", "11110", "10000", "11111"],
            L: ["10000", "10000", "10000", "10000", "11111"],
            W: ["10001", "10001", "10101", "11011", "10001"],
            R: ["11110", "10001", "11110", "10100", "10011"],
            D: ["11110", "10001", "10001", "10001", "11110"],
            SPC: ["00000", "00000", "00000", "00000", "00000"]
        };
        
        const text = "VOXEL WORLD";
        const scale = 3; // Larger
        const startY = 80; // High up
        
        // Calculate total width to center it along Z
        const totalWidth = text.length * 6 * scale;
        let currentZ = cz - totalWidth / 2; 

        for (let char of text) {
            const pattern = char === ' ' ? letters['SPC'] : letters[char];
            if (pattern) {
                for (let row = 0; row < 5; row++) {
                    for (let col = 0; col < 5; col++) {
                        if (pattern[row][col] === '1') {
                            const pixelY = (4 - row);
                            for(let sy=0; sy<scale; sy++) {
                                for(let sz=0; sz<scale; sz++) {
                                    const bx = cx; // Flat on X plane
                                    const by = Math.floor(startY + (pixelY * scale) + sy);
                                    const bz = Math.floor(currentZ + (col * scale) + sz);
                                    for(let d=0; d<2; d++) {
                                        this.storeBlockMap(worldData, BlockType.NEON_CYAN, bx + d, by, bz);
                                    }
                                }
                            }
                        }
                    }
                }
                currentZ += 6 * scale; 
            }
        }
    }

    private generateMegaSpire(worldData: Map<number, string>, cx: number, cz: number) {
        const height = 90;
        const baseRadius = 18;
        for (let y = 0; y < height; y++) {
            let currentRadius = baseRadius * (1 - (y / height) * 0.8);
            if (y > height - 15) currentRadius = 2; 
            if (y > height - 5) currentRadius = 1;
            for (let x = -Math.ceil(currentRadius); x <= Math.ceil(currentRadius); x++) {
                for (let z = -Math.ceil(currentRadius); z <= Math.ceil(currentRadius); z++) {
                    const d2 = x*x + z*z;
                    const angle = Math.atan2(z, x);
                    const spikes = Math.cos(angle * 4) * 3; 
                    const rCheck = currentRadius + (y < 30 ? spikes : 0);
                    if (d2 < rCheck*rCheck) {
                        const py = 15 + y; 
                        if (d2 > (rCheck - 2)*(rCheck - 2) || y > height - 20) {
                            let type = BlockType.STONE;
                            if (y % 10 === 0) type = BlockType.OBSIDIAN;
                            if (y > height - 10) type = BlockType.GOLD;
                            this.storeBlockMap(worldData, type, cx + x, py, cz + z);
                        } else if (y === 0 || y === 30 || y === 60) {
                            this.storeBlockMap(worldData, BlockType.PLANKS, cx + x, py, cz + z);
                        } else if (x === 0 && z === 0) {
                            this.storeBlockMap(worldData, BlockType.WOOD, cx + x, py, cz + z);
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

    public updateTimeOfDay(time: number) {
        // time: 0..1. 0.5 = Noon, 0/1 = Midnight.
        
        // Sun Rotation
        const angle = time * Math.PI * 2 - Math.PI / 2;
        const radius = 200;
        const sx = Math.cos(angle) * radius;
        const sy = Math.sin(angle) * radius;
        
        this.dirLight.position.set(sx, sy, 50);
        this.sunMesh.position.set(sx, sy, -150);
        
        // Colors
        // Noon
        const dayColor = new THREE.Color(0x87CEEB);
        const sunsetColor = new THREE.Color(0xFD5E53);
        const nightColor = new THREE.Color(0x050510);

        let currentColor = dayColor.clone();
        let intensity = 1.1;
        let ambient = 0.7;

        if (time < 0.2 || time > 0.8) {
            // Night
            currentColor.copy(nightColor);
            intensity = 0.0;
            ambient = 0.2;
        } else if (time < 0.3) {
            // Sunrise (0.2 - 0.3)
            const t = (time - 0.2) * 10;
            currentColor.lerpColors(nightColor, sunsetColor, t);
            intensity = t * 0.5;
            ambient = 0.2 + t * 0.3;
        } else if (time < 0.4) {
             // Morning (0.3 - 0.4)
             const t = (time - 0.3) * 10;
             currentColor.lerpColors(sunsetColor, dayColor, t);
             intensity = 0.5 + t * 0.6;
             ambient = 0.5 + t * 0.2;
        } else if (time > 0.7) {
            // Sunset (0.7 - 0.8)
            const t = (time - 0.7) * 10;
            currentColor.lerpColors(dayColor, sunsetColor, t);
            intensity = 1.1 - t * 0.6;
            ambient = 0.7 - t * 0.4;
        } else {
            // Day (0.4 - 0.7)
            currentColor.copy(dayColor);
        }
        
        // Fade sunset to night
        if (time > 0.75) {
             const t = (time - 0.75) * 20; 
             if (t <= 1) currentColor.lerpColors(sunsetColor, nightColor, t);
             else currentColor.copy(nightColor);
        }

        this.scene.background = currentColor;
        if (this.scene.fog) this.scene.fog.color = currentColor;
        
        this.dirLight.intensity = intensity;
        this.ambientLight.intensity = ambient;
    }

    public render = (dt: number, yaw: number, pitch: number, pPos: THREE.Vector3, pVel: THREE.Vector3, isFlying: boolean) => {
        // Camera Group now handles orientation. 
        // pPos is the PHYSICS body position. 
        // We will manipulate the group's position before rendering to add smoothing.
        
        this.cameraYawGroup.rotation.y = yaw;
        this.cameraPitchGroup.rotation.x = pitch;
        
        // Important: The position is set by GamePresenter now to include smoothing logic.
        // But we still need to update the player actor visualization
        this.playerActor?.setPosition(pPos);
        this.playerActor?.setRotation(yaw);
        this.playerActor?.update(dt, new THREE.Vector2(pVel.x, pVel.z).length(), isFlying);

        this.mobs.forEach(m => m.update(dt, this));
        this.particles?.update(dt);
        this.cloudSystem?.update(dt);

        this.renderer.render(this.scene, this.camera);
    }
}
