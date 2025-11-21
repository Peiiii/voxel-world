
import * as THREE from 'three';
import { InputManager } from '../managers/InputManager';
import { PhysicsManager } from '../managers/PhysicsManager';
import { WorldManager } from '../managers/WorldManager';
import { useGameStore } from '../stores/gameStore';
import { HARDNESS, PALETTE } from '../utils/constants';

export class GamePresenter {
    public world = new WorldManager();
    public physics = new PhysicsManager();
    public input = new InputManager();

    private cameraYaw = 0;
    private cameraPitch = 0;
    private prevTime = 0;
    private isMining = false;
    private mineStartTime = 0;
    private targetBlock: any = null;
    private raycaster = new THREE.Raycaster();
    private loopId: number = 0;
    
    // Smoothing
    private cameraYOffset = 0; // For visual smoothing when stepping up
    
    public isMobile = false;

    public init = (container: HTMLElement) => {
        this.isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        
        this.setupControls();
        this.input.init();

        // Slight delay to allow UI to mount before heavy world generation
        setTimeout(() => {
            try {
                this.world.init(container, this.isMobile);
                this.physics.setWorld(this.world);
                
                // Ensure we spawn high enough
                const spawnY = Math.max(this.world.spawnPoint.y, 15);
                this.physics.position.set(this.world.spawnPoint.x, spawnY, this.world.spawnPoint.z);
                this.physics.velocity.set(0, 0, 0);
            } catch (e) {
                console.error("Failed to initialize world:", e);
            }
            this.startLoop();
        }, 50);
    }

    public dispose = () => {
        cancelAnimationFrame(this.loopId);
        this.input.dispose();
        this.world.dispose();
        
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mousedown', this.onMouseDown);
        document.removeEventListener('mouseup', this.onMouseUp);
        document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    }

    private setupControls = () => {
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mousedown', this.onMouseDown);
        document.addEventListener('mouseup', this.onMouseUp);
        document.addEventListener('pointerlockchange', this.onPointerLockChange);
        document.addEventListener('pointerlockerror', (e) => console.warn("Pointer Lock Error (handled)", e));
    }

    private onPointerLockChange = () => {
        const isLocked = !!document.pointerLockElement;
        useGameStore.getState().setLocked(isLocked);
    }

    public requestPointerLock = () => {
        if (this.isMobile) {
            useGameStore.getState().setLocked(true);
        } else {
            if (document.pointerLockElement === document.body) return;
            
            try {
                const promise = document.body.requestPointerLock();
                // @ts-ignore 
                if (promise && typeof promise.catch === 'function') {
                    // @ts-ignore
                    promise.catch(e => { /* Ignore user cancellation/fast exit */ });
                }
            } catch (e) {
                console.warn("Pointer lock failed:", e);
            }
        }
    }

    public toggleFly = () => {
        this.physics.flying = !this.physics.flying;
    }

    // Public API for UI-driven Camera Control (Mobile)
    public rotateCamera = (dx: number, dy: number) => {
        const sensitivity = 0.005;
        this.cameraYaw -= dx * sensitivity;
        this.cameraPitch -= dy * sensitivity;
        this.cameraPitch = Math.max(-Math.PI/2+0.1, Math.min(Math.PI/2-0.1, this.cameraPitch));
    }

    private onMouseMove = (e: MouseEvent) => {
        if (!useGameStore.getState().isLocked) return;
        // Use public method for consistency
        this.rotateCamera(e.movementX, e.movementY * 0.4); // Mouse movement needs slightly different scaling or not
        // Actually standard mouse movement is usually 1:1 pixel delta, so let's adjust sensitivity inside
    }

    private onMouseDown = () => {
        // On desktop, click to mine. On mobile, we use a button.
        if (!this.isMobile && useGameStore.getState().isLocked) {
            this.startMining();
        }
    }

    public startMining = () => {
        this.isMining = true;
        this.mineStartTime = performance.now();
    }

    public stopMining = () => {
        this.isMining = false;
        useGameStore.getState().setMiningProgress(0);
    }

    private onMouseUp = () => {
        if (!this.isMobile) this.stopMining();
    }

    private startLoop = () => {
        this.prevTime = performance.now();
        this.loop();
    }

    private loop = () => {
        this.loopId = requestAnimationFrame(this.loop);
        const time = performance.now();
        const dt = Math.min((time - this.prevTime) / 1000, 0.1);
        this.prevTime = time;

        const { setMiningProgress, setIsFlying, timeOfDay } = useGameStore.getState();

        if (this.physics.flying !== useGameStore.getState().isFlying) {
           setIsFlying(this.physics.flying);
        }

        // Update Time
        this.world.updateTimeOfDay(timeOfDay);

        // PASS input manager directly for analog support
        this.physics.step(dt, this.cameraYaw, this.input);

        // --- SILKY SMOOTH STEPPING LOGIC ---
        // If physics snapped up (stepped), we negate that snap in the camera logic
        // and smoothly interpolate it back to 0 over time.
        if (this.physics.lastStepDelta > 0) {
            // If physics jumped up +1.05, set camera offset to -1.05 so visual position remains identical for this frame
            this.cameraYOffset -= this.physics.lastStepDelta;
        }
        
        // Decay offset to 0 (Rise visual). Lower speed = silkier feel.
        this.cameraYOffset = THREE.MathUtils.lerp(this.cameraYOffset, 0, dt * 8); 

        // Apply to World Camera Group
        const smoothPos = this.physics.position.clone();
        smoothPos.y += this.cameraYOffset;
        
        this.world.cameraYawGroup.position.copy(smoothPos);
        
        // ------------------------------------

        if (useGameStore.getState().isLocked) {
            // Update Raycaster
            this.raycaster.setFromCamera(new THREE.Vector2(0,0), this.world.camera);
            this.raycaster.far = 6;
            
            const intersects = this.raycaster.intersectObjects(this.world.instancedMeshes, false);
            if (intersects.length > 0) {
                // Instance intersection returns instanceId
                const hit = intersects[0];
                const mesh = hit.object as THREE.InstancedMesh;
                const instanceId = hit.instanceId;
                
                if (instanceId !== undefined) {
                     // We need to find the exact block key. 
                     // We can reverse lookup via matrix position?
                     const mat = new THREE.Matrix4();
                     mesh.getMatrixAt(instanceId, mat);
                     const pos = new THREE.Vector3().setFromMatrixPosition(mat);
                     
                     // Snap to grid
                     const x = Math.round(pos.x);
                     const y = Math.round(pos.y);
                     const z = Math.round(pos.z);
                     
                     this.world.setSelection(x, y, z, true);
                     this.targetBlock = { x, y, z };

                     if (this.isMining) {
                         const block = this.world.getBlock(x, y, z);
                         if (block) {
                             const hardness = HARDNESS[block.type] || 500;
                             const elapsed = performance.now() - this.mineStartTime;
                             const progress = Math.min(elapsed / hardness, 1);
                             setMiningProgress(progress);
                             
                             this.world.setPlayerMining(true);

                             if (progress >= 1) {
                                 this.world.removeBlock(x, y, z);
                                 
                                 // Particles
                                 const color = PALETTE[block.type] || 0xffffff;
                                 this.world.particles?.emit(new THREE.Vector3(x, y, z), color);

                                 this.mineStartTime = performance.now();
                                 setMiningProgress(0);
                             }
                         }
                     } else {
                         setMiningProgress(0);
                         this.world.setPlayerMining(false);
                     }
                }
            } else {
                this.world.setSelection(0, 0, 0, false);
                this.targetBlock = null;
                setMiningProgress(0);
                this.world.setPlayerMining(false);
            }
        } else {
            this.world.setPlayerMining(false);
        }

        this.world.render(dt, this.cameraYaw, this.cameraPitch, this.physics.position, this.physics.velocity, this.physics.flying);
    }
}
