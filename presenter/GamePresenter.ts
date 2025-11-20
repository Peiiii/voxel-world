
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
    
    // Touch handling
    private lastTouchX = 0;
    private lastTouchY = 0;
    public isMobile = false;

    public init = (container: HTMLElement) => {
        this.isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        
        this.setupControls();
        this.input.init();

        setTimeout(() => {
            try {
                this.world.init(container);
                this.physics.setWorld(this.world);
                const loadingEl = document.getElementById('loading');
                if (loadingEl) loadingEl.style.display = 'none';
            } catch (e) {
                console.error("Failed to initialize world:", e);
            }
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
        document.removeEventListener('touchmove', this.onTouchMove);
        document.removeEventListener('touchstart', this.onTouchStart);
    }

    private setupControls = () => {
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mousedown', this.onMouseDown);
        document.addEventListener('mouseup', this.onMouseUp);
        document.addEventListener('pointerlockchange', this.onPointerLockChange);
        document.addEventListener('pointerlockerror', (e) => console.error("Pointer Lock Error", e));
        
        // Touch controls for camera look
        document.addEventListener('touchmove', this.onTouchMove, { passive: false });
        document.addEventListener('touchstart', this.onTouchStart, { passive: false });
    }

    private onPointerLockChange = () => {
        const isLocked = !!document.pointerLockElement;
        useGameStore.getState().setLocked(isLocked);
    }

    public requestPointerLock = () => {
        if (this.isMobile) {
            // Mobile: Bypass pointer lock API and just start the game
            useGameStore.getState().setLocked(true);
        } else {
            // Desktop: Request actual lock
            document.body.requestPointerLock();
        }
    }

    private onTouchStart = (e: TouchEvent) => {
        // Only track the first touch that isn't on a control interface
        // Simple heuristic: if it's on the right side of the screen and not a button
        for (let i = 0; i < e.touches.length; i++) {
            const t = e.touches[i];
            // If touch is on the right 2/3rds of screen, treat as camera look (simplification)
            // The UI layer handles the buttons, preventing default if touched there
            if (t.clientX > window.innerWidth * 0.3) {
                this.lastTouchX = t.clientX;
                this.lastTouchY = t.clientY;
            }
        }
    }

    private onTouchMove = (e: TouchEvent) => {
        if (!useGameStore.getState().isLocked) return;
        
        // Prevent scrolling
        if(e.cancelable) e.preventDefault();

        for (let i = 0; i < e.touches.length; i++) {
            const t = e.touches[i];
            // Simple logic: If touch started on right side (camera zone)
            if (t.clientX > window.innerWidth * 0.3) {
                const dx = t.clientX - this.lastTouchX;
                const dy = t.clientY - this.lastTouchY;
                
                const sensitivity = 0.005;
                this.cameraYaw -= dx * sensitivity;
                this.cameraPitch -= dy * sensitivity;
                this.cameraPitch = Math.max(-Math.PI/2+0.1, Math.min(Math.PI/2-0.1, this.cameraPitch));

                this.lastTouchX = t.clientX;
                this.lastTouchY = t.clientY;
            }
        }
    }

    private onMouseMove = (e: MouseEvent) => {
        if (!useGameStore.getState().isLocked) return;
        const sensitivity = 0.002;
        this.cameraYaw -= e.movementX * sensitivity;
        this.cameraPitch -= e.movementY * sensitivity;
        this.cameraPitch = Math.max(-Math.PI/2+0.1, Math.min(Math.PI/2-0.1, this.cameraPitch));
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

        this.physics.step(dt, this.cameraYaw, this.input.keys);

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
