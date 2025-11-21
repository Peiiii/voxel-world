
import * as THREE from 'three';
import { WorldManager } from './WorldManager';

export class PhysicsManager {
  public position = new THREE.Vector3(0, 40, 0);
  public velocity = new THREE.Vector3();
  public flying = false;
  public onGround = false;
  
  private world: WorldManager | null = null;
  private playerHeight = 1.8;
  private playerWidth = 0.6;
  private boxMin = new THREE.Vector3();
  private boxMax = new THREE.Vector3();
  private coyoteTime = 0; // Time allowed to jump after leaving ground

  public setWorld = (world: WorldManager) => {
    this.world = world;
  }

  private getCollidingBlocks = (min: THREE.Vector3, max: THREE.Vector3) => {
    if (!this.world) return [];
    const blocks = [];
    const startX = Math.round(min.x);
    const endX = Math.round(max.x);
    const startY = Math.round(min.y);
    const endY = Math.round(max.y);
    const startZ = Math.round(min.z);
    const endZ = Math.round(max.z);

    for (let x = startX; x <= endX; x++) {
        for (let y = startY; y <= endY; y++) {
            for (let z = startZ; z <= endZ; z++) {
                if (this.world.isSolid(x, y, z)) {
                    blocks.push({ x, y, z, 
                        min: new THREE.Vector3(x - 0.5, y - 0.5, z - 0.5),
                        max: new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5)
                    });
                }
            }
        }
    }
    return blocks;
  }

  private testCollision = (pos: THREE.Vector3): boolean => {
    const hw = this.playerWidth / 2;
    this.boxMin.set(pos.x - hw, pos.y, pos.z - hw);
    this.boxMax.set(pos.x + hw, pos.y + this.playerHeight, pos.z + hw);

    const blocks = this.getCollidingBlocks(this.boxMin, this.boxMax);
    
    for (const b of blocks) {
        if (this.boxMin.x < b.max.x && this.boxMax.x > b.min.x &&
            this.boxMin.y < b.max.y && this.boxMax.y > b.min.y &&
            this.boxMin.z < b.max.z && this.boxMax.z > b.min.z) {
            return true;
        }
    }
    return false;
  }

  public step = (dt: number, yaw: number, input: { f: boolean, b: boolean, l: boolean, r: boolean, jump: boolean, shift: boolean }) => {
    const inputVec = new THREE.Vector3();
    inputVec.z = Number(input.b) - Number(input.f); 
    inputVec.x = Number(input.r) - Number(input.l);
    
    if (inputVec.lengthSq() > 0) inputVec.normalize();
    inputVec.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

    const speed = this.flying ? 25 : 6;
    const accel = this.flying ? 80 : 50;
    const friction = this.flying ? 0.9 : (this.onGround ? 0.8 : 0.95);

    this.velocity.x += inputVec.x * accel * dt;
    this.velocity.z += inputVec.z * accel * dt;

    const hVel = new THREE.Vector2(this.velocity.x, this.velocity.z);
    if (hVel.length() > speed) {
        hVel.normalize().multiplyScalar(speed);
        this.velocity.x = hVel.x;
        this.velocity.z = hVel.y;
    }
    this.velocity.x *= friction;
    this.velocity.z *= friction;

    // Gravity & Jumping
    // Reset onGround for this frame, but keep a copy to check if we CAN jump (coyote time)
    const wasOnGround = this.onGround;
    this.onGround = false; // Assume air until collision proves otherwise

    if (wasOnGround) {
        this.coyoteTime = 0.15; // 150ms grace period
    } else {
        this.coyoteTime -= dt;
    }

    if (this.flying) {
        this.velocity.y = 0;
        if (input.jump) this.velocity.y = 15;
        if (input.shift) this.velocity.y = -15;
    } else {
        this.velocity.y -= 32 * dt;
        
        // Jump Logic
        if ((wasOnGround || this.coyoteTime > 0) && input.jump) {
            this.velocity.y = 12; // Reliable jump height
            this.onGround = false;
            this.coyoteTime = 0;
            this.position.y += 0.2; // Boost slightly to clear ground immediately
        }
    }

    const steps = 6; 
    const subDt = dt / steps;

    for (let s = 0; s < steps; s++) {
        this.performSubStep(subDt);
    }

    if (this.position.y < -30) {
        // Respawn if fallen
        this.position.set(0, 30, 60);
        this.velocity.set(0, 0, 0);
    }
  }

  private performSubStep = (dt: number) => {
    const pos = this.position.clone();
    
    // X Movement
    pos.x += this.velocity.x * dt;
    if (this.testCollision(pos)) {
        if (this.onGround && !this.flying) {
            // Auto-step up
            const stepCandidate = pos.clone();
            stepCandidate.y += 1.1; 
            if (!this.testCollision(stepCandidate)) {
                this.position.x = pos.x;
                this.position.y = Math.floor(this.position.y) + 1 + 0.001;
            } else {
                 this.velocity.x = 0; 
            }
        } else {
             this.velocity.x = 0;
        }
    } else {
        this.position.x = pos.x;
    }

    // Z Movement
    pos.copy(this.position);
    pos.z += this.velocity.z * dt;
    if (this.testCollision(pos)) {
         if (this.onGround && !this.flying) {
            const stepCandidate = pos.clone();
            stepCandidate.y += 1.1; 
            if (!this.testCollision(stepCandidate)) {
                this.position.z = pos.z;
                this.position.y = Math.floor(this.position.y) + 1 + 0.001;
            } else {
                 this.velocity.z = 0;
            }
        } else {
             this.velocity.z = 0;
        }
    } else {
        this.position.z = pos.z;
    }

    // Y Movement
    pos.copy(this.position);
    pos.y += this.velocity.y * dt;
    
    if (this.testCollision(pos)) {
         if (this.velocity.y < 0) {
             this.onGround = true;
             this.velocity.y = 0;
             this.position.y = Math.round(pos.y - this.playerHeight/2) + 0.5 + 0.0001;
         } else if (this.velocity.y > 0) {
             this.velocity.y = 0;
             this.position.y = Math.round(pos.y + this.playerHeight) - 0.5 - this.playerHeight - 0.01;
         }
    } else {
        this.position.y = pos.y;
        // Do NOT set onGround = false here, as it might have been set to true in a previous substep
    }
  }
}
