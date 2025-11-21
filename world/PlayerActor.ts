
import * as THREE from 'three';

export class PlayerActor {
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
