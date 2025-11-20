
export const WORLD_SIZE = 160; 
export const WATER_LEVEL = 7;

export const BlockType = {
  GRASS: 'grass',
  DIRT: 'dirt',
  STONE: 'stone',
  SAND: 'sand',
  WATER: 'water',
  SNOW: 'snow',
  WOOD: 'wood',
  LEAVES: 'leaves',
  CLOUD: 'cloud',
  PLANKS: 'planks',
  GLASS: 'glass',
  FLOWER_RED: 'flower_red',
  FLOWER_YELLOW: 'flower_yellow',
  TALL_GRASS: 'tall_grass',
  OBSIDIAN: 'obsidian',
  DARK_MATTER: 'dark_matter',
  NEON_CYAN: 'neon_cyan',
  NEON_MAGENTA: 'neon_magenta',
  // New Types
  SANDSTONE: 'sandstone',
  CACTUS: 'cactus',
  BIRCH_WOOD: 'birch_wood',
  BIRCH_LEAVES: 'birch_leaves',
  DEAD_BUSH: 'dead_bush',
  // Tao Hua Yuan Types
  PEACH_WOOD: 'peach_wood',
  PEACH_LEAVES: 'peach_leaves',
  BAMBOO: 'bamboo',
  PATH: 'path',
  BRICK: 'brick',
  ROOF_TILE: 'roof_tile',
  WHITE_TILE: 'white_tile', // Mahjong
  RED_WOOL: 'red_wool',     // Table/Carpet
  SIGN_POST: 'sign_post',
  FARMLAND: 'farmland',
  WHEAT: 'wheat'
};

export const PALETTE = {
  [BlockType.GRASS]: 0x59982F,
  [BlockType.DIRT]: 0x856042,
  [BlockType.STONE]: 0x919191,
  [BlockType.SAND]: 0xDCCFA3,
  [BlockType.WATER]: 0x42A5F5, // Lighter, clearer blue
  [BlockType.SNOW]: 0xFFFFFF,
  [BlockType.WOOD]: 0x5C4033,
  [BlockType.LEAVES]: 0x4A8F28,
  [BlockType.CLOUD]: 0xFFFFFF,
  [BlockType.PLANKS]: 0xA68064,
  [BlockType.GLASS]: 0xAED9E0,
  [BlockType.FLOWER_RED]: 0xFF0000,
  [BlockType.FLOWER_YELLOW]: 0xFFFF00,
  [BlockType.TALL_GRASS]: 0x4A8F28,
  [BlockType.OBSIDIAN]: 0x1A1A1A,
  [BlockType.DARK_MATTER]: 0x050505,
  [BlockType.NEON_CYAN]: 0x00FFFF,
  [BlockType.NEON_MAGENTA]: 0xFF00CC,
  [BlockType.SANDSTONE]: 0xC6AE82,
  [BlockType.CACTUS]: 0x537C28,
  [BlockType.BIRCH_WOOD]: 0xE3D6C5,
  [BlockType.BIRCH_LEAVES]: 0x80A755,
  [BlockType.DEAD_BUSH]: 0x946838,
  // Village Colors
  [BlockType.PEACH_WOOD]: 0x5C3A21,
  [BlockType.PEACH_LEAVES]: 0xFFB7C5, // Pink
  [BlockType.BAMBOO]: 0x6FA830,
  [BlockType.PATH]: 0x917857,
  [BlockType.BRICK]: 0x8E5645,
  [BlockType.ROOF_TILE]: 0x333344, // Dark Slate/Blueish
  [BlockType.WHITE_TILE]: 0xF0F0F0,
  [BlockType.RED_WOOL]: 0xCC3333,
  [BlockType.SIGN_POST]: 0x725538,
  [BlockType.FARMLAND]: 0x4F3321,
  [BlockType.WHEAT]: 0xDCBB24
};

export const HARDNESS: Record<string, number> = {
    [BlockType.GRASS]: 600, 
    [BlockType.DIRT]: 600,
    [BlockType.STONE]: 2000,
    [BlockType.SAND]: 500,
    [BlockType.SNOW]: 400,
    [BlockType.WOOD]: 1500,
    [BlockType.LEAVES]: 250,
    [BlockType.PLANKS]: 1500,
    [BlockType.GLASS]: 250,
    [BlockType.WATER]: Infinity,
    [BlockType.CLOUD]: Infinity,
    [BlockType.OBSIDIAN]: Infinity,
    [BlockType.DARK_MATTER]: Infinity,
    [BlockType.NEON_CYAN]: 2000,
    [BlockType.NEON_MAGENTA]: 2000,
    [BlockType.SANDSTONE]: 1800,
    [BlockType.CACTUS]: 400,
    [BlockType.BIRCH_WOOD]: 1500,
    [BlockType.BIRCH_LEAVES]: 250,
    [BlockType.DEAD_BUSH]: 100,
    [BlockType.PEACH_WOOD]: 1500,
    [BlockType.PEACH_LEAVES]: 250,
    [BlockType.BAMBOO]: 300,
    [BlockType.PATH]: 600,
    [BlockType.BRICK]: 2000,
    [BlockType.ROOF_TILE]: 2000,
    [BlockType.WHITE_TILE]: 500,
    [BlockType.RED_WOOL]: 300,
    [BlockType.SIGN_POST]: 1000,
    [BlockType.FARMLAND]: 600,
    [BlockType.WHEAT]: 100
};

// --- PERLIN NOISE ---
export class SimpleNoise {
  private p: number[];
  constructor(seedOffset: number = 0) {
    this.p = new Array(512);
    const permutation = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
    // Simple seeding strategy: rotate the permutation array based on seedOffset
    for (let i=0; i < 256 ; i++) {
        const idx = (i + Math.floor(seedOffset)) % 256;
        this.p[256+i] = this.p[i] = permutation[idx];
    }
  }
  fade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10); }
  lerp(t: number, a: number, b: number) { return a + t * (b - a); }
  grad(hash: number, x: number, y: number, z: number) {
    const h = hash & 15;
    const u = h<8 ? x : y, v = h<4 ? y : h===12||h===14 ? x : z;
    return ((h&1) === 0 ? u : -u) + ((h&2) === 0 ? v : -v);
  }
  noise(x: number, y: number, z: number) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = this.fade(x), v = this.fade(y), w = this.fade(z);
    const A = this.p[X]+Y, AA = this.p[A]+Z, AB = this.p[A+1]+Z,
          B = this.p[X+1]+Y, BA = this.p[B]+Z, BB = this.p[B+1]+Z;
    return this.lerp(w, this.lerp(v, this.lerp(u, this.grad(this.p[AA], x, y, z),
                                     this.grad(this.p[BA], x-1, y, z)),
                             this.lerp(u, this.grad(this.p[AB], x, y-1, z),
                                     this.grad(this.p[BB], x-1, y-1, z))),
                     this.lerp(v, this.lerp(u, this.grad(this.p[AA+1], x, y, z-1),
                                     this.grad(this.p[BA+1], x-1, y, z-1)),
                             this.lerp(u, this.grad(this.p[AB+1], x, y-1, z-1),
                                     this.grad(this.p[BB+1], x-1, y-1, z-1))));
  }
}
