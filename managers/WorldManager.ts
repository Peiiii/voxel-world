
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
            // Villager is humanoid (standing)
            bodyColor = 0x604030; // Robe
            headColor = 0xD6B094; // Skin
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
            // Arms for villager
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
            
            if (this.type !== 'villager') {
                this.leg3.rotation.x = Math.cos(this.walkTime) * 0.5;
                this.leg4.rotation.x = Math.sin(this.walkTime) * 0.5;
            } else {
                // Villager arms opposite to legs
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
            // Swing DOWN/FORWARD (Negative X rotation)
            const swing = Math.abs(Math.sin(this.mineAnimTime)); 
            this.armR.rotation.x = - (swing * 1.5); 
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
        // Using a simple box geometry but instanced
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0xFFFFFF, 
            transparent: true, 
            opacity: 0.85 
        });
        
        // Allocate instances
        this.mesh = new THREE.InstancedMesh(geometry, material, 4000);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.castShadow = false;
        this.mesh.receiveShadow = false;
        scene.add(this.mesh);
        
        // Generate slightly wider than the world to allow seamless wrapping
        this.boundSize = WORLD_SIZE * 2.5; 
        this.generate();
    }

    generate() {
        const noise = new SimpleNoise(Math.random() * 1000);
        const noise2 = new SimpleNoise(Math.random() * 5000);
        
        const step = 4; // Clouds are larger blocks (4x4x4) for volumetric fluffiness and performance
        const start = -this.boundSize / 2;
        const end = this.boundSize / 2;
        let count = 0;

        for (let x = start; x < end; x += step) {
            for (let z = start; z < end; z += step) {
                // Low frequency noise for large cloud shapes
                const n1 = noise.noise(x * 0.006, 120, z * 0.006);
                // High frequency noise for detail edges
                const n2 = noise2.noise(x * 0.03, 0, z * 0.03) * 0.25;
                
                const val = n1 + n2;
                
                // High threshold creates distinct islands (patches) of clouds
                if (val > 0.35) {
                    // Base height
                    const h = 75 + (val - 0.35) * 15; 
                    
                    // Vertical thickness based on density
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
        this.offset += dt * 4; // Cloud drift speed
        const half = this.boundSize / 2;

        for(let i=0; i<this.clouds.length; i++) {
            const c = this.clouds[i];
            
            let px = c.x + this.offset;
            
            // Wrap around logic for infinite scrolling
            while(px > half) px -= this.boundSize;
            while(px < -half) px += this.boundSize;

            this.dummy.position.set(px, c.y, c.z);
            this.dummy.scale.set(4, 4, 4); // Scale matches the step size
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
    
    public blocks = new Map<string, { type: string, instanceId: number, mesh: THREE.InstancedMesh }>();
    public mobs: Mob[] = [];
    public playerActor: PlayerActor | null = null;
    public particles: ParticleSystem | null = null;
    public cloudSystem: CloudSystem | null = null;
    public selectionBox: SelectionBox | null = null;
    
    public instancedMeshes: THREE.InstancedMesh[] = [];
    public spawnPoint = new THREE.Vector3(0, 20, 0);

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
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
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
        return this.blocks.get(`${Math.round(x)},${Math.round(y)},${Math.round(z)}`);
    }

    public isSolid = (x: number, y: number, z: number) => {
        const block = this.getBlock(x, y, z);
        if (!block) return false;
        const nonSolid = [
            BlockType.WATER, BlockType.CLOUD, BlockType.FLOWER_RED, BlockType.FLOWER_YELLOW, 
            BlockType.TALL_GRASS, BlockType.DEAD_BUSH, BlockType.BAMBOO, 
            BlockType.WHITE_TILE, BlockType.RED_WOOL, BlockType.WHEAT
        ];
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
        
        const worldData = new Map<string, string>();
        const generatedCoords: {x: number, y: number, z: number, type: string}[] = [];

        const storeBlock = (type: string, x: number, y: number, z: number) => {
            const key = `${x},${y},${z}`;
            if (!worldData.has(key)) {
                worldData.set(key, type);
                generatedCoords.push({x, y, z, type});
            }
        };

        // --- ZONE CONFIG ---
        // Center (0,0) is Tao Hua Yuan (Flat Plain + Creek)
        // North (Negative Z) is Mountains
        // East (Positive X) is Lake
        // Edges (dist > 70) is Ocean

        const heightNoise = new SimpleNoise(123);
        const detailNoise = new SimpleNoise(456);
        
        const VILLAGE_LEVEL = 15; // Comfortable flat level
        const WATER_LEVEL = 7;
        const offset = 80; // WORLD_SIZE / 2

        // --- TERRAIN PASS ---
        for (let x = -offset; x < offset; x++) {
            for (let z = -offset; z < offset; z++) {
                const dist = Math.sqrt(x*x + z*z);
                
                // 1. Determine Zone Influence
                
                // Ocean Mask: 1 at center, 0 at edge (>70)
                let oceanMask = 1 - THREE.MathUtils.smoothstep(60, 78, dist);
                
                // Mountain Influence: Stronger at Z < -20
                let mountainMask = THREE.MathUtils.smoothstep(-10, -50, z) * 0.8; 
                // Add some noise to mountain distribution
                mountainMask *= (0.5 + 0.5 * detailNoise.noise(x*0.05, 0, z*0.05));

                // Lake Influence: Stronger at X > 30, Z between -20 and 20
                let lakeMask = 0;
                if (x > 20 && x < 60 && z > -30 && z < 30) {
                    // Elliptical lake shape
                    const dx = (x - 40) / 20;
                    const dz = z / 25;
                    if (dx*dx + dz*dz < 1) {
                        lakeMask = 1 - (dx*dx + dz*dz); // 1 at center of lake
                    }
                }

                // Village Plain: The area remaining in center
                const isVillage = dist < 50 && lakeMask < 0.1 && mountainMask < 0.1;

                // 2. Calculate Height
                
                let h = VILLAGE_LEVEL;

                if (oceanMask < 1) {
                    // Drop to ocean floor
                    h = THREE.MathUtils.lerp(2, h, oceanMask);
                }

                if (mountainMask > 0) {
                    // Add mountains
                    const mNoise = Math.abs(heightNoise.noise(x*0.03, 0, z*0.03));
                    const mHeight = 15 + mNoise * 40;
                    h += mountainMask * mHeight;
                }

                if (lakeMask > 0) {
                    // Dig out lake
                    // Smooth transition into water
                    h = THREE.MathUtils.lerp(h, WATER_LEVEL - 4, lakeMask);
                }

                // Creek in Village
                // Simple sine wave river winding through plains
                let isCreek = false;
                if (isVillage && oceanMask > 0.9) {
                    const creekPath = 10 * Math.sin(x * 0.1) + 5 * Math.cos(x * 0.05);
                    const distToCreek = Math.abs(z - creekPath);
                    if (distToCreek < 4) {
                        // Smooth bank
                        const t = distToCreek / 4;
                        h = THREE.MathUtils.lerp(WATER_LEVEL - 2, h, t);
                        isCreek = distToCreek < 3; // Water width
                    }
                }

                // Minor noise for texture on plains (but keep it walkable, no holes)
                if (h >= VILLAGE_LEVEL - 1 && oceanMask > 0.9) {
                    const smallDetail = detailNoise.noise(x*0.1, 0, z*0.1) * 0.5;
                    h += smallDetail;
                }

                h = Math.round(h);

                // 3. Block Type
                let surface = BlockType.GRASS;
                let sub = BlockType.DIRT;

                if (h <= WATER_LEVEL) {
                    surface = BlockType.SAND; // Underwater / Beach
                    if (lakeMask > 0) surface = BlockType.SAND; 
                }
                
                // Mountain tops
                if (h > 35) surface = BlockType.SNOW;
                else if (h > 25 && mountainMask > 0.2) surface = BlockType.STONE;

                // Fill Column
                for (let y = -5; y <= h; y++) {
                    let type = sub;
                    if (y === h) type = surface;
                    if (y < h - 3) type = BlockType.STONE;
                    
                    // Ensure water/creek bed is sand/dirt
                    if (h <= WATER_LEVEL && y === h) type = BlockType.SAND;

                    storeBlock(type, x, y, z);
                }

                // Water
                if (h < WATER_LEVEL) {
                    for (let w = h + 1; w <= WATER_LEVEL; w++) {
                        storeBlock(BlockType.WATER, x, w, z);
                    }
                }
            }
        }

        // --- DECORATION PASS ---
        // We do a second pass over coords to place trees/villages on top of the finalized height
        
        this.spawnPoint.set(0, VILLAGE_LEVEL + 2, 0); // Reset spawn to default safe, updated later

        // Structures
        // We manually place structures at safe coordinates we know are flat-ish
        this.buildVillage(storeBlock, VILLAGE_LEVEL);
        this.createBillboard(storeBlock);

        // Flora
        for (let x = -offset + 2; x < offset - 2; x++) {
            for (let z = -offset + 2; z < offset - 2; z++) {
                // Check height at this pos
                let groundY = -999;
                // Find top solid block
                for(let y = 50; y > 0; y--) {
                    const k = `${x},${y},${z}`;
                    if (worldData.has(k) && worldData.get(k) !== BlockType.WATER) {
                        groundY = y;
                        break;
                    }
                }
                if (groundY === -999) continue; // No ground (water only?)
                if (groundY < WATER_LEVEL) continue; // Underwater
                
                // Check if space above is clear
                if (worldData.has(`${x},${groundY+1},${z}`)) continue;

                const dist = Math.sqrt(x*x + z*z);
                const rand = Math.random();

                // BIOME CHECK based on location
                const isMountain = z < -20 && dist < 70;
                const isVillageArea = dist < 55 && !isMountain;
                const isLakeShore = x > 15 && x < 65 && z > -35 && z < 35 && groundY <= WATER_LEVEL + 2;

                if (isVillageArea) {
                    // Peach Trees & Bamboo
                    if (rand < 0.015) {
                        if (rand < 0.005) this.generateBamboo(x, groundY, z, storeBlock);
                        else this.generateLargePeachTree(x, groundY, z, storeBlock);
                    } else if (rand < 0.03) {
                        storeBlock(BlockType.FLOWER_RED, x, groundY+1, z);
                    } else if (rand < 0.005) {
                         // Mobs
                         const type = Math.random() > 0.5 ? 'villager' : (Math.random() > 0.5 ? 'cow' : 'pig');
                         this.mobs.push(new Mob(type, x, groundY+1, z));
                         this.scene.add(this.mobs[this.mobs.length-1].mesh);
                    }
                } else if (isMountain) {
                    if (groundY > 35) {
                        // Snow peak - maybe nothing
                    } else {
                        if (rand < 0.02) this.generateTree(x, groundY, z, storeBlock, 'OAK');
                    }
                } else if (isLakeShore) {
                    if (rand < 0.05) storeBlock(BlockType.TALL_GRASS, x, groundY+1, z);
                    if (rand < 0.01) this.generateTree(x, groundY, z, storeBlock, 'BIRCH');
                } else {
                    // Outer Plains / Forest
                    if (rand < 0.01) this.generateTree(x, groundY, z, storeBlock, 'OAK');
                    else if (rand < 0.05) storeBlock(BlockType.TALL_GRASS, x, groundY+1, z);
                }
            }
        }

        // Set Specific Safe Spawn on the path
        this.spawnPoint.set(0, VILLAGE_LEVEL + 2, 45);

        // --- CULLING & MESH BUILD ---
        const isOpaque = (t: string) => {
            const transparents = [
                BlockType.WATER, BlockType.GLASS, BlockType.LEAVES, BlockType.BIRCH_LEAVES, BlockType.PEACH_LEAVES,
                BlockType.FLOWER_RED, BlockType.FLOWER_YELLOW, BlockType.TALL_GRASS, BlockType.BAMBOO,
                BlockType.CACTUS, BlockType.DEAD_BUSH, BlockType.CLOUD, BlockType.NEON_CYAN, BlockType.NEON_MAGENTA,
                BlockType.SIGN_POST, BlockType.WHEAT
            ];
            return !transparents.includes(t);
        }

        for (const block of generatedCoords) {
            const {x, y, z, type} = block;
            if (type === BlockType.WATER) {
                let visible = false;
                const neighbors = [[x+1,y,z],[x-1,y,z],[x,y+1,z],[x,y-1,z],[x,y,z+1],[x,y,z-1]];
                for (const [nx, ny, nz] of neighbors) {
                    const nKey = `${nx},${ny},${nz}`;
                    const nType = worldData.get(nKey);
                    if (!nType || (nType !== BlockType.WATER && !isOpaque(nType))) {
                        visible = true; break;
                    }
                }
                if (visible) this.addInstance(instances, type, x, y, z);
                continue;
            }
            if (!isOpaque(type)) {
                this.addInstance(instances, type, x, y, z);
            } else {
                let visible = false;
                const neighbors = [[x+1,y,z],[x-1,y,z],[x,y+1,z],[x,y-1,z],[x,y,z+1],[x,y,z-1]];
                for (const [nx, ny, nz] of neighbors) {
                    const nKey = `${nx},${ny},${nz}`;
                    const nType = worldData.get(nKey);
                    if (!nType || !isOpaque(nType)) {
                        visible = true; break;
                    }
                }
                if (visible) this.addInstance(instances, type, x, y, z);
            }
        }

        this.buildMeshes(instances);
    }

    private buildVillage(storeBlock: Function, baseH: number) {
        // Placed explicitly on the flattened area
        const houseCenters = [
            {x: -25, z: -15, w: 7, d: 7}, 
            {x: -20, z: 15, w: 7, d: 6}, 
            {x: 25, z: -10, w: 6, d: 8},
            {x: 20, z: 20, w: 7, d: 7},
            {x: 0, z: -25, w: 8, d: 6} 
        ];

        for (const h of houseCenters) {
            // Ensure foundation goes down to ground
            this.buildLargeHouse(storeBlock, h.x, baseH, h.z, h.w, h.d);
        }

        this.buildMahjongTable(-5, baseH, -5, storeBlock);
        this.buildPaths(storeBlock, baseH);
        this.buildSignPost(storeBlock, 0, baseH, 40);
        this.buildFarm(storeBlock, baseH, 15, 15);
        this.buildFarm(storeBlock, baseH, -15, -20);
    }

    private buildLargeHouse(storeBlock: Function, cx: number, y: number, cz: number, width: number, depth: number) {
        const halfW = Math.floor(width / 2);
        const halfD = Math.floor(depth / 2);

        // Foundation & Walls
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
        // Floor
        for (let dx = -halfW; dx <= halfW; dx++) {
            for (let dz = -halfD; dz <= halfD; dz++) {
                storeBlock(BlockType.PLANKS, cx + dx, y, cz + dz);
            }
        }

        storeBlock(null, cx, y+1, cz+halfD);
        storeBlock(null, cx, y+2, cz+halfD);
        storeBlock(BlockType.GLASS, cx - halfW + 2, y+2, cz+halfD);
        storeBlock(BlockType.GLASS, cx + halfW - 2, y+2, cz+halfD);
        
        // Roof
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
        const ridgeLen = Math.abs(width - depth) / 2;
        if (width > depth) {
             for(let r = -ridgeLen; r <= ridgeLen; r++) storeBlock(BlockType.ROOF_TILE, cx + r, roofY-1, cz);
        } else {
             for(let r = -ridgeLen; r <= ridgeLen; r++) storeBlock(BlockType.ROOF_TILE, cx, roofY-1, cz + r);
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
        storeBlock(BlockType.SIGN_POST, x-1, y+3, z);
        storeBlock(BlockType.SIGN_POST, x+1, y+3, z);
    }

    private buildPaths(storeBlock: Function, y: number) {
        const drawPath = (x1: number, z1: number, x2: number, z2: number) => {
            let currX = x1; let currZ = z1;
            while (Math.abs(currX - x2) > 0 || Math.abs(currZ - z2) > 0) {
                storeBlock(BlockType.PATH, currX, y, currZ);
                if (Math.random() > 0.5 && currX !== x2) currX += Math.sign(x2 - currX);
                else if (currZ !== z2) currZ += Math.sign(z2 - currZ);
                else currX += Math.sign(x2 - currX);
            }
        };
        drawPath(0, 40, 0, 0); // Entrance
        drawPath(0, 0, -25, -15);
        drawPath(0, 0, 25, -10);
        drawPath(0, 0, 20, 20);
        drawPath(0, 0, -20, 15);
    }

    private buildFarm(storeBlock: Function, y: number, cx: number, cz: number) {
        for(let dx = -3; dx <= 3; dx++) {
            for(let dz = -3; dz <= 3; dz++) {
                if (dx === 0) storeBlock(BlockType.WATER, cx+dx, y, cz+dz);
                else {
                    storeBlock(BlockType.FARMLAND, cx+dx, y, cz+dz);
                    if (Math.random() > 0.2) storeBlock(BlockType.WHEAT, cx+dx, y+1, cz+dz);
                }
            }
        }
    }

    private addInstance(instances: Record<string, number[]>, type: string, x: number, y: number, z: number) {
        if (!instances[type]) return;
        const dummy = new THREE.Object3D();
        dummy.position.set(x, y, z);
        dummy.updateMatrix();
        instances[type].push(...dummy.matrix.elements);
        
        const nonInteractables = [BlockType.CLOUD];
        if (!nonInteractables.includes(type)) {
            const idx = (instances[type].length / 16) - 1;
            this.blocks.set(`${x},${y},${z}`, { 
                type, 
                instanceId: idx,
                mesh: null as any 
            });
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

    private generateLargePeachTree(x: number, y: number, z: number, addBlock: Function) {
        const h = 6 + Math.floor(Math.random() * 3);
        for(let i=1; i<=h; i++) {
            addBlock(BlockType.PEACH_WOOD, x, y+i, z);
            if(i < 3) { 
                addBlock(BlockType.PEACH_WOOD, x+1, y+i, z);
                addBlock(BlockType.PEACH_WOOD, x-1, y+i, z);
                addBlock(BlockType.PEACH_WOOD, x, y+i, z+1);
                addBlock(BlockType.PEACH_WOOD, x, y+i, z-1);
            }
        }
        const radius = 4;
        for(let lx = -radius; lx <= radius; lx++) {
            for(let lz = -radius; lz <= radius; lz++) {
                for(let ly = h - 2; ly <= h + 2; ly++) {
                    const dist = Math.sqrt(lx*lx + lz*lz + (ly-h)*(ly-h));
                    if (dist < radius + Math.random()) {
                        if (lx===0 && lz===0 && ly<h) continue;
                        addBlock(BlockType.PEACH_LEAVES, x+lx, y+ly, z+lz);
                    }
                }
            }
        }
    }

    private generateBamboo(x: number, y: number, z: number, addBlock: Function) {
        const h = 6 + Math.floor(Math.random() * 6);
        for(let i=1; i<=h; i++) addBlock(BlockType.BAMBOO, x, y+i, z);
        addBlock(BlockType.LEAVES, x, y+h+1, z);
        addBlock(BlockType.LEAVES, x+1, y+h, z);
        addBlock(BlockType.LEAVES, x-1, y+h, z);
    }

    private createBillboard(addBlock: Function) {
        const billboardZ = -80; 
        const billboardY = 60;
        const scale = 4;
        const FONT_MAP: Record<string, number[]> = {
            'T': [31, 4, 4, 4, 4, 4, 4],
            'A': [14, 17, 17, 31, 17, 17, 17],
            'O': [14, 17, 17, 17, 17, 17, 14],
            'H': [17, 17, 17, 31, 17, 17, 17],
            'U': [17, 17, 17, 17, 17, 17, 14],
            'Y': [17, 17, 17, 10, 4, 4, 4],
            'N': [17, 17, 25, 21, 19, 17, 17],
            ' ': [0, 0, 0, 0, 0, 0, 0]
        };
        const text = "TAO HUA YUAN";
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

    private buildMeshes(instances: Record<string, number[]>) {
        const geo = new THREE.BoxGeometry(1,1,1);
        const smallGeo = new THREE.BoxGeometry(0.6,0.6,0.6); 
        const poleGeo = new THREE.BoxGeometry(0.85, 1, 0.85); 
        const flatGeo = new THREE.BoxGeometry(0.8, 0.6, 0.8); 
        const thinGeo = new THREE.BoxGeometry(0.25, 1, 0.25); // Bamboo
        
        Object.keys(instances).forEach(key => {
            const matrixArray = instances[key];
            const count = matrixArray.length / 16;
            if (count === 0) return;
            
            let geometry = geo;
            const isFlora = [BlockType.FLOWER_RED, BlockType.FLOWER_YELLOW, BlockType.TALL_GRASS, BlockType.WHITE_TILE, BlockType.WHEAT].includes(key);
            if (isFlora) geometry = smallGeo;
            if (key === BlockType.CACTUS) geometry = poleGeo;
            if (key === BlockType.BAMBOO) geometry = thinGeo;
            if (key === BlockType.DEAD_BUSH) geometry = flatGeo;
            
            const mat = new THREE.MeshStandardMaterial({ color: PALETTE[key], roughness: 0.8 });
            
            if (key === BlockType.WATER) { 
                mat.transparent = true; 
                mat.opacity = 0.8; 
                mat.roughness = 0.1; 
                mat.metalness = 0.1;
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
            const noShadows = [BlockType.WATER, BlockType.CLOUD, BlockType.GLASS, BlockType.NEON_CYAN, BlockType.NEON_MAGENTA, BlockType.FLOWER_RED, BlockType.FLOWER_YELLOW, BlockType.TALL_GRASS];
            mesh.castShadow = !noShadows.includes(key);
            mesh.receiveShadow = true;
            
            const m4 = new THREE.Matrix4();
            for(let i=0; i<count; i++) {
                m4.fromArray(matrixArray, i*16);
                mesh.setMatrixAt(i, m4);
            }
            
            // Bind mesh for interactions
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
        if (this.cloudSystem) this.cloudSystem.update(dt);

        this.renderer.render(this.scene, this.camera);
    }
}
