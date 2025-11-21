
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

        const { setMiningProgress, setIsFlying } = useGameStore.getState();

        if (this.physics.flying !== useGameStore.getState().isFlying) {
           setIsFlying(this.physics.flying);
        }

        // PASS input manager directly for analog support
        this.physics.step(dt, this.cameraYaw, this.input);

        if (useGameStore.getState().isLocked) {
            // Update Raycaster
            this.raycaster.setFromCamera(new THREE.Vector2(0,0), this.world.camera);
            this.raycaster.far = 8; 
            const intersects = this.raycaster.intersectObjects(this.world.instancedMeshes);
            
            let found = false;
            if (intersects.length > 0) {
                const hit = intersects[0];
                if (hit.face) {
                    const p = hit.point.clone().addScaledVector(hit.face.normal, -0.5);
                    const block = this.world.getBlock(p.x, p.y, p.z);
                    if (block) {
                        found = true;
                        const bx = Math.round(p.x);
                        const by = Math.round(p.y);
                        const bz = Math.round(p.z);
                        
                        this.world.setSelection(bx, by, bz, true);

                        if (!this.targetBlock || this.targetBlock.x !== bx || this.targetBlock.y !== by || this.targetBlock.z !== bz) {
                            this.targetBlock = { x: bx, y: by, z: bz, type: block.type };
                            this.mineStartTime = time;
                            setMiningProgress(0);
                        }
                        
                        if (this.isMining) {
                            const hardness = HARDNESS[block.type] || 1000;
                            const progress = Math.min((time - this.mineStartTime) / hardness, 1);
                            setMiningProgress(progress);
                            
                            if (progress >= 1) {
                                const removed = this.world.removeBlock(this.targetBlock.x, this.targetBlock.y, this.targetBlock.z);
                                if (removed && this.world.particles) {
                                    this.world.particles.emit(new THREE.Vector3(this.targetBlock.x, this.targetBlock.y, this.targetBlock.z), PALETTE[removed], 25);
                                }
                                this.isMining = false;
                                setMiningProgress(0);
                            }
                        } else {
                            setMiningProgress(0);
                            this.mineStartTime = time; // Reset start time if not mining but looking
                        }
                    }
                }
            }
            if (!found) {
                this.targetBlock = null;
                setMiningProgress(0);
                this.world.setSelection(0, 0, 0, false);
            }
            
            this.world.setPlayerMining(this.isMining);
        }

        this.world.render(dt, this.cameraYaw, this.cameraPitch, this.physics.position, this.physics.velocity, this.physics.flying);
    }

    public toggleFly = () => {
        this.physics.flying = !this.physics.flying;
        if (this.physics.flying) {
            this.physics.velocity.y = 2.0;
            this.physics.onGround = false;
        }
        useGameStore.getState().setIsFlying(this.physics.flying);
    }
}
