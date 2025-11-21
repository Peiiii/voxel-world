
export class InputManager {
  public keys = {
    f: false,
    b: false,
    l: false,
    r: false,
    jump: false,
    shift: false
  };

  // Virtual Joystick State (Analog)
  private virtualMove = { x: 0, y: 0 };

  public init = () => {
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
  }

  public dispose = () => {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
  }

  // API for Mobile Controls
  public setVirtualMove = (x: number, y: number) => {
      this.virtualMove.x = x;
      this.virtualMove.y = y;
  }

  public setButton = (btn: 'jump' | 'shift', pressed: boolean) => {
      this.keys[btn] = pressed;
  }

  // Combine Keyboard (Digital) and Joystick (Analog)
  public getMovementInput = () => {
      let x = 0;
      let z = 0;

      // Keyboard
      if (this.keys.l) x -= 1;
      if (this.keys.r) x += 1;
      if (this.keys.f) z -= 1;
      if (this.keys.b) z += 1;

      // Joystick overrides if active
      if (Math.abs(this.virtualMove.x) > 0.01 || Math.abs(this.virtualMove.y) > 0.01) {
          // If keyboard is also pressed, we could add them, but usually mobile users just use joystick.
          // We'll let joystick take precedence for smoothness if it's being used.
          x = this.virtualMove.x;
          z = this.virtualMove.y;
      }
      
      // Clamp magnitude to 1
      const len = Math.sqrt(x*x + z*z);
      if (len > 1) {
          x /= len;
          z /= len;
      }

      return {
          x,
          z,
          jump: this.keys.jump,
          shift: this.keys.shift
      };
  }

  private onKeyDown = (e: KeyboardEvent) => {
    switch(e.code) {
      case 'KeyW': this.keys.f = true; break;
      case 'KeyS': this.keys.b = true; break;
      case 'KeyA': this.keys.l = true; break;
      case 'KeyD': this.keys.r = true; break;
      case 'Space': this.keys.jump = true; break;
      case 'ShiftLeft': this.keys.shift = true; break;
    }
  }

  private onKeyUp = (e: KeyboardEvent) => {
    switch(e.code) {
      case 'KeyW': this.keys.f = false; break;
      case 'KeyS': this.keys.b = false; break;
      case 'KeyA': this.keys.l = false; break;
      case 'KeyD': this.keys.r = false; break;
      case 'Space': this.keys.jump = false; break;
      case 'ShiftLeft': this.keys.shift = false; break;
    }
  }
}
