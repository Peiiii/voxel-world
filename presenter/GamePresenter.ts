
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

    public init = (container: HTMLElement) => {
        // 1. Setup Controls FIRST so events are caught immediately
        this.setupControls();
        this.input.init();

        // 2. Initialize World (Heavy Operation)
        // We use a timeout to allow the browser to render the 'Loading' state if needed before freezing for generation
        setTimeout(() => {
            try {
                this.world.init(container);
                this.physics.setWorld(this.world);
                
                // Hide loading screen
                const loadingEl = document.getElementById('loading');
                if (loadingEl) loadingEl.style.display = 'none';

            } catch (e) {
                console.error("Failed to initialize world:", e);
            }
            
            // 3. Start Loop
            this.startLoop();
        }, 10);
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
        document.addEventListener('pointerlockerror', (e) => console.error("Pointer Lock Error", e));
    }

    private onPointerLockChange = () => {
        // Check if ANY element is locked, not just body. 
        // This fixes issues where browsers might report the specific element instead of body.
        const isLocked = !!document.pointerLockElement;
        useGameStore.getState().setLocked(isLocked);
    }

    public requestPointerLock = () => {
        // Request lock on body to cover full screen
        const element = document.body;
        element.requestPointerLock();
    }

    private onMouseMove = (e: MouseEvent) => {
        if (!useGameStore.getState().isLocked) return;
        const sensitivity = 0.002;
        this.cameraYaw -= e.movementX * sensitivity;
        this.cameraPitch -= e.movementY * sensitivity;
        this.cameraPitch = Math.max(-Math.PI/2+0.1, Math.min(Math.PI/2-0.1, this.cameraPitch));
    }

    private onMouseDown = () => {
        if (useGameStore.getState().isLocked) {
            this.isMining = true;
            this.mineStartTime = performance.now();
        }
    }

    private onMouseUp = () => {
        this.isMining = false;
        useGameStore.getState().setMiningProgress(0);
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

        // Sync Flight state
        if (this.physics.flying !== useGameStore.getState().isFlying) {
           setIsFlying(this.physics.flying);
        }

        this.physics.step(dt, this.cameraYaw, this.input.keys);

        // Mining Logic
        if (useGameStore.getState().isLocked) {
            this.raycaster.setFromCamera(new THREE.Vector2(0,0), this.world.camera);
            this.raycaster.far = 6;
            const intersects = this.raycaster.intersectObjects(this.world.instancedMeshes);
            
            let found = false;
            if (intersects.length > 0) {
                const hit = intersects[0];
                const p = hit.point.clone().addScaledVector(hit.face!.normal!, -0.5);
                const block = this.world.getBlock(p.x, p.y, p.z);
                if (block) {
                    found = true;
                    if (!this.targetBlock || this.targetBlock.x !== Math.round(p.x) || this.targetBlock.y !== Math.round(p.y) || this.targetBlock.z !== Math.round(p.z)) {
                        this.targetBlock = { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z), type: block.type };
                        this.mineStartTime = time;
                    }
                    if (this.isMining) {
                        const hardness = HARDNESS[block.type] || 200;
                        const progress = Math.min((time - this.mineStartTime) / hardness, 1);
                        setMiningProgress(progress);
                        
                        if (progress >= 1) {
                            const removed = this.world.removeBlock(this.targetBlock.x, this.targetBlock.y, this.targetBlock.z);
                            if (removed && this.world.particles) {
                                this.world.particles.emit(new THREE.Vector3(this.targetBlock.x, this.targetBlock.y, this.targetBlock.z), PALETTE[removed], 12);
                            }
                            this.isMining = false;
                            setMiningProgress(0);
                        }
                    } else {
                        setMiningProgress(0);
                    }
                }
            }
            if (!found) {
                this.targetBlock = null;
                setMiningProgress(0);
            }
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
