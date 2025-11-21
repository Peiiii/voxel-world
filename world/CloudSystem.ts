
import * as THREE from 'three';
import { SimpleNoise, WORLD_SIZE } from '../utils/constants';

export class CloudSystem {
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
