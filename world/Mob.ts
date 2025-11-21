
import * as THREE from 'three';

export interface IWorld {
    isSolid: (x: number, y: number, z: number) => boolean;
}

export class Mob {
    public mesh: THREE.Group;
    private body: THREE.Mesh;
    private head: THREE.Mesh;
    // Generic Limbs
    private leg1: THREE.Mesh;
    private leg2: THREE.Mesh;
    private leg3: THREE.Mesh;
    private leg4: THREE.Mesh;
    
    // Dino specific parts
    private tail: THREE.Mesh | null = null;
    private armL: THREE.Mesh | null = null;
    private armR: THREE.Mesh | null = null;

    public position: THREE.Vector3;
    public rotation: number = 0;
    private moveTimer: number = 0;
    private isMoving: boolean = false;
    private moveDir: THREE.Vector3 = new THREE.Vector3();
    private walkTime: number = 0;
    private type: 'cow' | 'sheep' | 'pig' | 'villager' | 'human' | 'dino';

    constructor(type: 'cow' | 'sheep' | 'pig' | 'villager' | 'human' | 'dino', x: number, y: number, z: number) {
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
        } else if (type === 'villager' || type === 'human') {
            bodyColor = type === 'villager' ? 0x604030 : 0x2A4B7C; // Brown or Blue shirt for Human
            headColor = 0xD6B094;
            bodyGeo = new THREE.BoxGeometry(0.6, 0.8, 0.4);
            headGeo = new THREE.BoxGeometry(0.5, 0.6, 0.5);
        } else if (type === 'dino') {
            bodyColor = 0x3A5D23; // Dark Green T-Rex
            headColor = 0x4A6D23;
            // T-Rex body is large and horizontal
            bodyGeo = new THREE.BoxGeometry(1.4, 1.6, 3.0); 
            headGeo = new THREE.BoxGeometry(1.0, 1.0, 1.6);
        }
        
        this.body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: bodyColor }));
        this.head = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: headColor }));

        if (type === 'villager' || type === 'human') {
            this.body.position.y = 1.0;
            this.head.position.set(0, 1.7, 0);
        } else if (type === 'dino') {
            this.body.position.y = 3.0;
            // Head sticking out forward and up
            this.head.position.set(0, 4.2, 2.2);
        } else {
            this.body.position.y = 0.9;
            this.head.position.set(0, 1.5, 0.8);
        }

        this.mesh.add(this.body);
        this.mesh.add(this.head);
        
        const legGeo = new THREE.BoxGeometry(0.25, 0.6, 0.25);
        const legMat = new THREE.MeshStandardMaterial({ color: (type === 'villager' || type === 'human') ? 0x403020 : 0x222222 });
        
        this.leg1 = new THREE.Mesh(legGeo, legMat); 
        this.leg2 = new THREE.Mesh(legGeo, legMat); 
        this.leg3 = new THREE.Mesh(legGeo, legMat); 
        this.leg4 = new THREE.Mesh(legGeo, legMat); 

        if (type === 'villager' || type === 'human') {
            // Legs
            this.leg1.position.set(-0.15, 0.3, 0);
            this.leg2.position.set(0.15, 0.3, 0);
            this.mesh.add(this.leg1, this.leg2);
            
            // Arms
            const armGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
            const armMat = new THREE.MeshStandardMaterial({ color: bodyColor });
            this.leg3 = new THREE.Mesh(armGeo, armMat); this.leg3.position.set(-0.45, 1.1, 0);
            this.leg4 = new THREE.Mesh(armGeo, armMat); this.leg4.position.set(0.45, 1.1, 0);
            this.mesh.add(this.leg3, this.leg4);
        } else if (type === 'dino') {
            // Big Legs
            const dinoLegGeo = new THREE.BoxGeometry(0.6, 2.2, 0.8);
            const dinoLegMat = new THREE.MeshStandardMaterial({ color: 0x2A4D13 });
            this.leg1 = new THREE.Mesh(dinoLegGeo, dinoLegMat);
            this.leg2 = new THREE.Mesh(dinoLegGeo, dinoLegMat);
            this.leg1.position.set(-0.7, 1.1, 0.5);
            this.leg2.position.set(0.7, 1.1, 0.5);
            this.mesh.add(this.leg1, this.leg2);

            // Tail
            const tailGeo = new THREE.BoxGeometry(0.8, 0.8, 3.0);
            this.tail = new THREE.Mesh(tailGeo, dinoLegMat);
            this.tail.position.set(0, 3.2, -2.5);
            this.tail.rotation.x = -0.2;
            this.mesh.add(this.tail);

            // Tiny Arms
            const tinyArmGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
            this.armL = new THREE.Mesh(tinyArmGeo, dinoLegMat);
            this.armR = new THREE.Mesh(tinyArmGeo, dinoLegMat);
            this.armL.position.set(-0.8, 3.2, 1.8);
            this.armR.position.set(0.8, 3.2, 1.8);
            this.armL.rotation.x = -0.5;
            this.armR.rotation.x = -0.5;
            this.mesh.add(this.armL, this.armR);
            
            // Ignore unused standard legs by hiding or not adding
            this.leg3.visible = false; 
            this.leg4.visible = false;
        } else {
            // Quadruped
            this.leg1.position.set(-0.3, 0.3, 0.5);
            this.leg2.position.set(0.3, 0.3, 0.5);
            this.leg3.position.set(-0.3, 0.3, -0.5);
            this.leg4.position.set(0.3, 0.3, -0.5);
            this.mesh.add(this.leg1, this.leg2, this.leg3, this.leg4);
        }
        
        this.mesh.traverse(o => { o.castShadow = true; o.receiveShadow = true; });
    }

    update(dt: number, world: IWorld) {
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
            const speed = (this.type === 'dino') ? 3.5 : 1.8;
            this.walkTime += dt * speed * 3;
            const nextPos = this.position.clone().addScaledVector(this.moveDir, dt * speed);
            
            const bx = Math.round(nextPos.x);
            const bz = Math.round(nextPos.z);
            const by = Math.round(nextPos.y);
            
            // Collision / Height check
            const heightCheck = (this.type === 'dino') ? 3 : 1;
            
            if (!world.isSolid(bx, by, bz) && !world.isSolid(bx, by + heightCheck, bz)) {
                let groundY = by;
                let foundGround = false;
                // Look down for ground
                for(let i=0; i<4; i++) {
                    if(world.isSolid(bx, groundY - 1, bz)) {
                        foundGround = true;
                        break;
                    }
                    groundY--;
                }
                // Look up for step
                if (!foundGround) {
                     if (world.isSolid(bx, by, bz)) { 
                         if (!world.isSolid(bx, by+heightCheck, bz)) {
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

            // Animation
            if (this.type === 'dino') {
                this.leg1.rotation.x = Math.sin(this.walkTime) * 0.6;
                this.leg2.rotation.x = Math.cos(this.walkTime) * 0.6;
                if (this.tail) this.tail.rotation.y = Math.sin(this.walkTime * 0.5) * 0.3;
                this.head.rotation.z = Math.sin(this.walkTime * 0.5) * 0.1;
                this.body.rotation.z = Math.sin(this.walkTime) * 0.05; // Stomping roll
            } else {
                this.leg1.rotation.x = Math.sin(this.walkTime) * 0.5;
                this.leg2.rotation.x = Math.cos(this.walkTime) * 0.5;
                
                if (this.type === 'villager' || this.type === 'human') {
                    this.leg3.rotation.x = Math.cos(this.walkTime) * 0.5;
                    this.leg4.rotation.x = Math.sin(this.walkTime) * 0.5;
                } else {
                    this.leg3.rotation.x = Math.cos(this.walkTime) * 0.5;
                    this.leg4.rotation.x = Math.sin(this.walkTime) * 0.5;
                }
            }
        } else {
            // Idle
            this.leg1.rotation.x = 0; this.leg2.rotation.x = 0;
            if (this.leg3) this.leg3.rotation.x = 0; 
            if (this.leg4) this.leg4.rotation.x = 0;
            
            if (this.type === 'dino') {
                 if (Math.random() > 0.98) this.head.rotation.y = (Math.random()-0.5) * 0.8;
                 if (Math.random() > 0.95) this.tail!.rotation.y = (Math.random()-0.5) * 0.3;
            } else {
                 if (Math.random() > 0.99) this.head.rotation.x = 0.2;
                 else if (Math.random() > 0.95) this.head.rotation.x = 0;
            }
        }

        this.mesh.position.copy(this.position);
        this.mesh.rotation.y = this.rotation;
    }
}
