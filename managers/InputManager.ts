
export class InputManager {
  public keys = {
    f: false,
    b: false,
    l: false,
    r: false,
    jump: false,
    shift: false
  };

  public init = () => {
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
  }

  public dispose = () => {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
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
