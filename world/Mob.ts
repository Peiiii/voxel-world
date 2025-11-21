
import * as THREE from 'three';

export interface IWorld {
    isSolid: (x: number, y: number, z: number) => boolean;
}

export class Mob {
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
