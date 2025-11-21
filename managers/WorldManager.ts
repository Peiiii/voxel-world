
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

const getChunkKey = (cx: number, cz: number) => `${cx},${cz}`;

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
        this.scene.fog = new THREE.Fog(skyColor, 60, 180); 

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
        const sSize = 140;
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

    private generateWorld = () => {
        // Data structure for CHUNKED rendering
        const chunkInstances = new Map<string, Record<string, number[]>>();
        const chunkBlockCoords = new Map<string, Record<string, {x:number, y:number, z:number}[]>>();
        const worldData = new Map<number, string>();
        
        const storeBlock = (type: string | null, x: number, y: number, z: number) => {
            const key = getKey(x, y, z);
            
            // If type is null, we are explicitly removing a block (hollowing out)
            if (type === null) {
                 if (worldData.has(key)) {
                     worldData.delete(key);
                     // Note: This logic is only perfect if we haven't generated meshes yet.
                     // Since we run this during generation phase, we can just manipulate worldData.
                     // For chunks, we check worldData in the mesh build pass, but we also push to instances.
                     // To support hollow structures, we should verify existence before pushing.
                     // HOWEVER, since we push to arrays immediately below, removing from worldData isn't enough
                     // to prevent the mesh from being built if it was already added.
                     // A simple fix for generation-time hollowing is to just NOT call storeBlock for those spots,
                     // but if we are carving out existing terrain, we need a way to track "removed".
                     // For this implementation, structures will be built AFTER terrain, overwriting the data.
                     // The mesh generator iterates over worldData. No, it iterates over arrays. 
                     // Actually, the correct way for this simple engine:
                     // 1. Generate Terrain map. 2. Carve holes. 3. Add structures. 4. Build Meshes from final map.
                     // But currently storeBlock pushes to instances immediately. 
                     // Let's change storeBlock to ONLY update map, then build instances later?
                     // Too big refactor.
                     // Alternative: 'storeBlock' pushes to a specific map, and we convert map to instances at the end.
                 }
                 return;
            }

            if (!worldData.has(key)) {
                worldData.set(key, type);
            } else {
                // Overwriting existing block (e.g. road over grass)
                worldData.set(key, type);
            }
        };

        const heightNoise = new SimpleNoise(123);
        const detailNoise = new SimpleNoise(456);
        const forestNoise = new SimpleNoise(789);
        const offset = 120; // Expanded world size (approx WORLD_SIZE / 2)

        // --- TERRAIN PASS ---
        for (let x = -offset; x < offset; x++) {
            for (let z = -offset; z < offset; z++) {
                const distFromCenter = Math.sqrt(x*x + z*z);
                
                const isOcean = distFromCenter > 105; // Pushed out ocean
                const isAbyss = (x < -55 && x > -95 && z > -20 && z < 20);
                const isVolcano = (x > 65 && x < 105 && z > -20 && z < 20);
                const isDesert = (z > 65 && z < 105 && x > -35 && x < 35);
                const isMountain = (z < -65 && z > -105 && x > -40 && x < 40);

                let h = 15; 
                let surface = BlockType.GRASS;
                let sub = BlockType.DIRT;
                let biome = 'plains';

                h += heightNoise.noise(x*0.05, 0, z*0.05) * 4;

                if (isOcean) {
                    biome = 'ocean';
                    h -= (distFromCenter - 105) * 5;
                    surface = BlockType.SAND;
                } else if (isAbyss) {
                    biome = 'abyss';
                    const dx = x - (-75);
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
                    const dx = x - 85; const dz = z - 0;
                    const d = Math.sqrt(dx*dx + dz*dz);
                    h += 55 * Math.exp(-d * 0.13);
                    surface = BlockType.BASALT;
                    sub = BlockType.STONE;
                    if (d < 6) {
                        h = 45 - (6-d)*3;
                        surface = BlockType.OBSIDIAN;
                    }
                } else if (isMountain) {
                    biome = 'mountain';
                    const dx = x - 0; const dz = z - (-85);
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
                    // Plains
                    if (heightNoise.noise(x*0.03 + 100, 0, z*0.03) > 0.65) {
                         h = 10; 
                    }
                }

                h = Math.round(h);

                // Optimization: Don't store every stone block deep underground, only near surface/caves
                // For this demo, we fill down to -5
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
                    const dx = x - 85; const dz = z;
                    const d = Math.sqrt(dx*dx + dz*dz);
                    if (d < 5.5 && 40 > h) { 
                        for(let l = h+1; l <= 40; l++) storeBlock(BlockType.LAVA, x, l, z);
                    }
                }
            }
        }

        // Structures
        this.buildTown(storeBlock, 15); 
        this.buildCathedral(storeBlock, 0, 15, 60); // Large Cathedral at the end of the town
        this.createBillboard(storeBlock);

        // --- DECORATION PASS & MESH GENERATION CONVERSION ---
        // Note: We traverse worldData to add decoration, then we build instances.
        
        for (let x = -offset + 2; x < offset - 2; x++) {
            for (let z = -offset + 2; z < offset - 2; z++) {
                let groundY = -999;
                // Find surface
                for(let y = 100; y > -10; y--) {
                     if (worldData.has(getKey(x, y, z))) {
                         const t = worldData.get(getKey(x, y, z));
                         if (t !== BlockType.WATER && t !== BlockType.CLOUD && t !== BlockType.LAVA) {
                             groundY = y;
                             break;
                         }
                     }
                }
                
                if (groundY === -999) continue;
                if (worldData.has(getKey(x, groundY+1, z))) continue; // Already occupied (e.g. by house or road)
                
                const surfaceBlock = worldData.get(getKey(x, groundY, z));
                if (!surfaceBlock) continue;

                // Don't decorate on paths/floors
                if (surfaceBlock === BlockType.PATH || surfaceBlock === BlockType.PLANKS || surfaceBlock === BlockType.BRICK || surfaceBlock === BlockType.STONE || surfaceBlock === BlockType.RED_WOOL) continue;

                const rand = Math.random();
                const fVal = forestNoise.noise(x*0.06, 0, z*0.06); 
                const isForest = fVal > 0.15;

                if (surfaceBlock === BlockType.GRASS) {
                    if (isForest) {
                        if (rand < 0.06) { 
                            if (rand < 0.01) this.generateTree(x, groundY, z, storeBlock, 'BIRCH');
                            else this.generateTree(x, groundY, z, storeBlock, 'OAK');
                        } else if (rand < 0.15) {
                            storeBlock(BlockType.TALL_GRASS, x, groundY+1, z);
                        }
                    } else {
                        if (rand < 0.002) { 
                             this.generateTree(x, groundY, z, storeBlock, 'OAK');
                        } else if (rand < 0.05) {
                             if (rand < 0.025) storeBlock(BlockType.FLOWER_RED, x, groundY+1, z);
                             else storeBlock(BlockType.FLOWER_YELLOW, x, groundY+1, z);
                        } else if (rand < 0.1) {
                             storeBlock(BlockType.TALL_GRASS, x, groundY+1, z);
                        }
                    }
                } else if (surfaceBlock === BlockType.SAND) {
                     if (z > 60 && rand < 0.005) {
                          storeBlock(BlockType.CACTUS, x, groundY+1, z);
                          if (Math.random() > 0.5) storeBlock(BlockType.CACTUS, x, groundY+2, z);
                     } else if (groundY <= WATER_LEVEL + 2 && rand < 0.02) {
                          storeBlock(BlockType.DEAD_BUSH, x, groundY+1, z);
                     }
                } 

                // Mobs
                if (rand < 0.005) {
                    let type: any = null;
                    if (surfaceBlock === BlockType.GRASS) type = Math.random() > 0.5 ? 'cow' : 'pig';
                    if (surfaceBlock === BlockType.SAND && z <= 30) type = 'villager'; 
                    if (surfaceBlock === BlockType.SNOW) type = 'sheep';
                    
                    if (type && !worldData.has(getKey(x, groundY+2, z))) {
                        this.mobs.push(new Mob(type, x, groundY+1, z));
                        this.scene.add(this.mobs[this.mobs.length-1].mesh);
                    }
                }
            }
        }

        // Finally, convert the Map to the Chunk Arrays
        worldData.forEach((type, key) => {
            if (type === null) return;
            // Extract coords from key
            let k = key;
            const y = (k & 0xFF) - 64;
            k = k >> 8;
            const z = (k & 0xFF) - 128;
            k = k >> 8;
            const x = (k & 0xFF) - 128;

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
            
            if (ci[type]) {
                ci[type].push(...dummy.matrix.elements);
                cc[type].push({x, y, z});
            }
        });

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
            BlockType.RED_WOOL, BlockType.WHEAT, BlockType.STONE, BlockType.GOLD
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
                const rawMatrices = instances[type];
                const rawCoords = coords[type];
                
                if (rawMatrices.length === 0) return;

                const finalMatrices: number[] = [];
                const finalCoords: {x:number, y:number, z:number}[] = [];

                for (let i = 0; i < rawCoords.length; i++) {
                    const {x, y, z} = rawCoords[i];
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
                if (type === BlockType.GOLD) { mat.metalness = 0.8; mat.roughness = 0.2; }

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
            this.scene.add(chunkGroup);
        });
    }

    private buildTown(storeBlock: Function, baseH: number) {
        // Roads
        for (let z = -50; z <= 30; z++) {
            storeBlock(BlockType.PATH, 0, baseH, z);
            storeBlock(BlockType.PATH, 1, baseH, z);
        }
        for (let x = -40; x <= 40; x++) {
            storeBlock(BlockType.PATH, x, baseH, -10);
            storeBlock(BlockType.PATH, x, baseH, -9);
        }

        // Houses
        const houseLocations = [
            {x: -15, z: -25, w: 7, d: 7}, 
            {x: -25, z: -25, w: 6, d: 6},
            {x: -15, z: 5, w: 6, d: 8}, 
            {x: -28, z: 5, w: 8, d: 8},
            {x: 15, z: -25, w: 7, d: 7}, 
            {x: 25, z: -25, w: 6, d: 6},
            {x: 15, z: 5, w: 6, d: 8},
            {x: 28, z: 5, w: 8, d: 8}
        ];

        houseLocations.forEach(h => {
             this.buildLargeHouse(storeBlock, h.x, baseH, h.z, h.w, h.d);
        });

        this.buildMahjongTable(-5, baseH, -5, storeBlock);
        this.buildSignPost(storeBlock, 3, baseH, 3); 
        this.buildFarm(storeBlock, baseH, -10, 20);
        this.buildFarm(storeBlock, baseH, 10, 20);
    }

    private buildCathedral(storeBlock: Function, cx: number, cy: number, cz: number) {
        const width = 22;
        const length = 44;
        const height = 22;
        const towerH = 34;

        // Clear area
        for(let x = cx - width/2 - 2; x <= cx + width/2 + 2; x++) {
            for(let z = cz - 2; z <= cz + length + 2; z++) {
                for(let y = cy; y < cy + towerH; y++) {
                    storeBlock(null, x, y, z); // Remove nature
                }
            }
        }

        // Floor & Carpet
        for(let x = -width/2; x <= width/2; x++) {
            for(let z = 0; z < length; z++) {
                if (Math.abs(x) < 3) storeBlock(BlockType.RED_WOOL, cx + x, cy, cz + z);
                else storeBlock(BlockType.STONE, cx + x, cy, cz + z);
            }
        }

        // Walls
        for(let y = 0; y < height; y++) {
            for(let z = 0; z < length; z++) {
                // Side Walls
                storeBlock(BlockType.STONE, cx - width/2, cy + y, cz + z);
                storeBlock(BlockType.STONE, cx + width/2, cy + y, cz + z);

                // Stained Glass Windows
                if (y > 4 && y < height - 4 && z % 6 > 2) {
                    const color = (z % 12 > 6) ? BlockType.NEON_CYAN : BlockType.NEON_MAGENTA;
                    storeBlock(BlockType.GLASS, cx - width/2, cy + y, cz + z);
                    storeBlock(color, cx - width/2, cy + y + 1, cz + z); // Detail
                    storeBlock(BlockType.GLASS, cx + width/2, cy + y, cz + z);
                }
            }
            // Back Wall
            for(let x = -width/2; x <= width/2; x++) {
                storeBlock(BlockType.STONE, cx + x, cy + y, cz + length);
            }
        }

        // Towers (Front)
        const tSize = 5;
        for(let tx of [-width/2 + tSize/2, width/2 - tSize/2]) {
            for(let y = 0; y < towerH; y++) {
                for(let dx = -tSize/2; dx <= tSize/2; dx++) {
                    for(let dz = -tSize/2; dz <= tSize/2; dz++) {
                         storeBlock(BlockType.STONE, cx + tx + dx, cy + y, cz + dz);
                         if (y > towerH - 5 && (Math.abs(dx) < 2 && Math.abs(dz) < 2)) storeBlock(BlockType.GOLD, cx + tx + dx, cy + y, cz + dz);
                    }
                }
            }
        }

        // Roof
        let rx = width/2;
        let ry = cy + height;
        while(rx >= 0) {
            for(let z = 0; z <= length; z++) {
                storeBlock(BlockType.ROOF_TILE, cx + rx, ry, cz + z);
                storeBlock(BlockType.ROOF_TILE, cx - rx, ry, cz + z);
            }
            rx--;
            ry++;
        }

        // Interior: Altar
        for(let x = -2; x <= 2; x++) {
            storeBlock(BlockType.GOLD, cx+x, cy+1, cz + length - 4);
            storeBlock(BlockType.GOLD, cx+x, cy+2, cz + length - 4);
        }
        storeBlock(BlockType.NEON_CYAN, cx, cy+3, cz + length - 4);
    }

    private buildLargeHouse(storeBlock: Function, cx: number, y: number, cz: number, width: number, depth: number) {
        const halfW = Math.floor(width / 2);
        const halfD = Math.floor(depth / 2);
        const wallHeight = 4;
        
        // Clear space (optional but good for dense forests)
        for(let dx = -halfW; dx <= halfW; dx++) {
             for(let dz = -halfD; dz <= halfD; dz++) {
                 for(let dy = 0; dy < 6; dy++) storeBlock(null, cx+dx, y+dy, cz+dz);
             }
        }

        for (let dy = 0; dy <= wallHeight; dy++) {
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
                if (Math.abs(dx) < halfW && Math.abs(dz) < halfD) {
                    // Hollow inside
                } else {
                    // Already built walls
                }
                // Floor
                storeBlock(BlockType.PLANKS, cx + dx, y, cz + dz);
            }
        }
        // Door
        storeBlock(null, cx, y+1, cz+halfD);
        storeBlock(null, cx, y+2, cz+halfD);
        // Windows
        storeBlock(BlockType.GLASS, cx - halfW + 2, y+2, cz+halfD);
        storeBlock(BlockType.GLASS, cx + halfW - 2, y+2, cz+halfD);
        
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
        // Cyberpunk/Sci-Fi Screen logic - South Side
        const centerZ = 110; 
        const centerY = 65;  
        const width = 90;
        const height = 36;
        const halfW = width / 2;
        const halfH = height / 2;
        
        // Frame & Background
        for (let x = -halfW; x <= halfW; x++) {
            for (let y = -halfH; y <= halfH; y++) {
                const wx = x;
                const wy = centerY + y;
                const wz = centerZ;

                // Cyberpunk Frame pattern
                const isEdge = x === -halfW || x === halfW || y === -halfH || y === halfH;
                const isInnerEdge = (Math.abs(x) === halfW-2 && Math.abs(y) < halfH-2) || (Math.abs(y) === halfH-2 && Math.abs(x) < halfW-2);
                
                if (isEdge) {
                     addBlock(BlockType.OBSIDIAN, wx, wy, wz);
                } else if (isInnerEdge) {
                     addBlock(BlockType.NEON_MAGENTA, wx, wy, wz);
                } else {
                     addBlock(BlockType.DARK_MATTER, wx, wy, wz);
                }
                
                if (Math.random() < 0.05) {
                     addBlock(BlockType.OBSIDIAN, wx, wy, wz + 1);
                }
            }
        }

        // Text Drawing
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
        const charWidth = 5;
        const spacing = 2; 
        
        const totalWidth = (text.length * charWidth) + ((text.length - 1) * spacing);
        // FIX: Text direction. Start from Left (negative X) and move Right (positive X)
        let cursorX = -Math.floor(totalWidth / 2);
        const textY = centerY + 3;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const map = FONT_MAP[char];
            if (map) {
                for (let row = 0; row < 7; row++) {
                    const bits = map[row];
                    for (let col = 0; col < 5; col++) {
                         // Iterate bits from left to right
                         if ((bits >> (4 - col)) & 1) {
                            // Draw at cursor + col
                            addBlock(BlockType.NEON_CYAN, cursorX + col, textY - row, centerZ - 1);
                         }
                    }
                }
            }
            cursorX += (charWidth + spacing);
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