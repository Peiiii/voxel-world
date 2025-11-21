
import * as THREE from 'three';
import { WorldManager } from './WorldManager';
import { InputManager } from './InputManager';

export class PhysicsManager {
  public position = new THREE.Vector3(0, 100, 0); 
  public velocity = new THREE.Vector3();
  public flying = false;
  public onGround = false;
  public lastStepDelta = 0; // Tracks sudden Y changes for visual smoothing
  
  private world: WorldManager | null = null;
  private playerHeight = 1.7; 
  private playerWidth = 0.5;  
  private boxMin = new THREE.Vector3();
  private boxMax = new THREE.Vector3();
  private coyoteTime = 0; 

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

  public step = (dt: number, yaw: number, inputMgr: InputManager) => {
    this.lastStepDelta = 0; // Reset step tracker at the beginning of the frame
    const input = inputMgr.getMovementInput();
    
    // Input vector (Analog x, z)
    const inputVec = new THREE.Vector3(input.x, 0, input.z);
    inputVec.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

    const moveSpeed = this.flying ? 25 : 6;
    
    if (this.flying) {
        const lerpFactor = dt * 10;
        this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, inputVec.x * moveSpeed, lerpFactor);
        this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, inputVec.z * moveSpeed, lerpFactor);
        
        this.velocity.y = 0;
        if (input.jump) this.velocity.y = 15;
        if (input.shift) this.velocity.y = -15;
    } else {
        if (this.onGround) {
            if (inputVec.lengthSq() > 0.01) {
                this.velocity.x = inputVec.x * moveSpeed;
                this.velocity.z = inputVec.z * moveSpeed;
            } else {
                // Ground Friction
                const damping = Math.pow(0.0001, dt); 
                this.velocity.x *= damping;
                this.velocity.z *= damping;
                if (Math.abs(this.velocity.x) < 0.1) this.velocity.x = 0;
                if (Math.abs(this.velocity.z) < 0.1) this.velocity.z = 0;
            }
        } else {
            const airAccel = 30;
            this.velocity.x += inputVec.x * airAccel * dt;
            this.velocity.z += inputVec.z * airAccel * dt;
            
            // Air Drag
            const airDrag = Math.pow(0.9, dt * 60); 
            this.velocity.x *= airDrag;
            this.velocity.z *= airDrag;
        }

        // Gravity
        this.velocity.y -= 32 * dt;

        const wasOnGround = this.onGround;
        this.onGround = false; 

        if (wasOnGround) {
            this.coyoteTime = 0.15; 
        } else {
            this.coyoteTime -= dt;
        }

        if ((wasOnGround || this.coyoteTime > 0) && input.jump) {
            this.velocity.y = 9; 
            this.onGround = false;
            this.coyoteTime = 0;
            this.position.y += 0.2; 
        }
    }

    // Physics Sub-stepping
    const steps = 5; 
    const subDt = dt / steps;

    for (let s = 0; s < steps; s++) {
        this.performSubStep(subDt);
    }

    if (this.position.y < -100) {
        this.position.set(0, 100, 0);
        this.velocity.set(0, 0, 0);
    }
  }

  private performSubStep = (dt: number) => {
    const pos = this.position.clone();
    
    // X Movement
    pos.x += this.velocity.x * dt;
    if (this.testCollision(pos)) {
        let stepped = false;
        if (this.onGround && !this.flying) {
            const stepCheck = pos.clone();
            // Check 1.1m up (slightly more than 1 block) to see if we can step up
            stepCheck.y += 1.1; 
            if (!this.testCollision(stepCheck)) {
                // Successful Step Up
                const riseAmount = 1.05; // Just enough to clear the 1.0 block
                this.position.y += riseAmount; 
                this.lastStepDelta += riseAmount; // Record this for visual smoothing
                
                // Important: Maintain Ground State
                this.onGround = true; 
                this.velocity.y = 0; 
                this.position.x = pos.x;
                stepped = true;
            }
        }
        if (!stepped) {
             this.position.x = pos.x - this.velocity.x * dt; 
             this.velocity.x = 0;
        }
    } else {
        this.position.x = pos.x;
    }

    // Z Movement
    pos.copy(this.position);
    pos.z += this.velocity.z * dt;
    if (this.testCollision(pos)) {
         let stepped = false;
         if (this.onGround && !this.flying) {
            const stepCheck = pos.clone();
            stepCheck.y += 1.1; 
            if (!this.testCollision(stepCheck)) {
                const riseAmount = 1.05;
                this.position.y += riseAmount;
                this.lastStepDelta += riseAmount;

                this.onGround = true;
                this.velocity.y = 0;
                this.position.z = pos.z;
                stepped = true;
            }
        }
        if (!stepped) {
            this.position.z = pos.z - this.velocity.z * dt;
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
             // Snap nicely to integer grid + epsilon if landing on top
             this.position.y = Math.round(pos.y - this.playerHeight/2) + 0.5 + 0.0001;
         } else if (this.velocity.y > 0) {
             this.velocity.y = 0;
             this.position.y = Math.round(pos.y + this.playerHeight) - 0.5 - this.playerHeight - 0.01;
         }
    } else {
        this.position.y = pos.y;
    }
  }
}
