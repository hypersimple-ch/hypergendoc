/*
 * Minimal QR Code encoder for HyperGenDoc `qr` template nodes.
 *
 * Hand-implemented against ISO/IEC 18004: byte mode with UTF-8 data,
 * versions 1-40, all four error-correction levels (L/M/Q/H), and full
 * mask evaluation using the spec's four penalty rules. No dependencies.
 * The algorithm structure follows the reference design popularized by
 * Project Nayuki's QR Code generator library (MIT License,
 * https://www.nayuki.io/page/qr-code-generator-library); this file was
 * written for this repository rather than copied verbatim.
 */

/** Error-correction levels from low to high robustness. */
export type QrEccLevel = "low" | "medium" | "quartile" | "high";

const ECC_LEVELS: readonly QrEccLevel[] = ["low", "medium", "quartile", "high"];

/** Format-information bits per EC level (ISO/IEC 18004 section 8.9). */
const FORMAT_BITS: readonly number[] = [1, 0, 3, 2]; // low, medium, quartile, high

/** ECC codewords per block, indexed by [eccLevel][version]. */
const ECC_CODEWORDS_PER_BLOCK: readonly (readonly number[])[] = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // Low
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], // Medium
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // Quartile
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // High
];

/** Number of error-correction blocks, indexed by [eccLevel][version]. */
const NUM_ERROR_CORRECTION_BLOCKS: readonly (readonly number[])[] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25], // Low
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49], // Medium
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68], // Quartile
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81], // High
];

const getNumRawDataModules = (version: number): number => {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
};

const getNumDataCodewords = (version: number, eccIndex: number): number =>
  Math.floor(getNumRawDataModules(version) / 8) -
  ECC_CODEWORDS_PER_BLOCK[eccIndex]![version]! *
    NUM_ERROR_CORRECTION_BLOCKS[eccIndex]![version]!;

const alignmentPatternPositions = (version: number): number[] => {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const step =
    version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = version * 4 + 10; result.length < numAlign; pos -= step)
    result.splice(1, 0, pos);
  return result;
};

// ---- Reed-Solomon arithmetic over GF(2^8), modulus 0x11D -------------------

const gfMultiply = (x: number, y: number): number => {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = ((z << 1) ^ ((z >>> 7) * 0x11d)) & 0xff;
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
};

/** Exponential table for the field generator alpha = 2. */
const GF_EXP: readonly number[] = (() => {
  const table = [1];
  for (let i = 1; i < 512; i++)
    table.push((table[i - 1]! << 1) ^ (table[i - 1]! >= 0x80 ? 0x11d : 0));
  return table;
})();

/**
 * Generator polynomial of the requested degree, stored with the leading 1
 * omitted: coefficients[i] multiplies x^(degree-1-i).
 */
const divisorCache = new Map<number, readonly number[]>();
const rsDivisor = (degree: number): readonly number[] => {
  const cached = divisorCache.get(degree);
  if (cached) return cached;
  let full: number[] = [1]; // full[0] is the coefficient of the highest power
  for (let i = 0; i < degree; i++) {
    const root = GF_EXP[i]!;
    const next: number[] = new Array<number>(full.length + 1).fill(0);
    for (let j = 0; j < full.length; j++) {
      const coefficient = full[j] as number;
      next[j] = (next[j] as number) ^ coefficient; // times x
      next[j + 1] =
        (next[j + 1] as number) ^ gfMultiply(coefficient, root); // (x + alpha^i)
    }
    full = next;
  }
  const divisor = full.slice(1);
  divisorCache.set(degree, divisor);
  return divisor;
};

/** Returns the Reed-Solomon ECC remainder of the given codewords. */
const rsRemainder = (
  data: readonly number[],
  eccLength: number,
): number[] => {
  const coefficients = rsDivisor(eccLength);
  const result = new Array<number>(coefficients.length).fill(0);
  for (const b of data) {
    const factor = b ^ result[0]!;
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < coefficients.length; i++)
      result[i] =
        (result[i] as number) ^ gfMultiply(coefficients[i] as number, factor);
  }
  return result;
};

// ---- Encoding pipeline -----------------------------------------------------

type Grid = boolean[][];

const smallestVersionFor = (text: string, eccIndex: number): number => {
  const byteLength = new TextEncoder().encode(text).length;
  for (let version = 1; version <= 40; version++) {
    const countBits = version < 10 ? 8 : 16;
    if (byteLength >= 1 << countBits) continue;
    const capacityBits =
      getNumDataCodewords(version, eccIndex) * 8 - 4 - countBits;
    if (byteLength * 8 <= capacityBits) return version;
  }
  throw new RangeError("Data too long to encode as a QR Code");
};

/** Builds data+ECC codewords interleaved per ISO/IEC 18004 section 8.6. */
const makeCodewords = (
  text: string,
  version: number,
  eccIndex: number,
): number[] => {
  const bytes = new TextEncoder().encode(text);
  const bits: number[] = [];
  const append = (value: number, length: number): void => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  append(0x4, 4); // Byte mode indicator
  append(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) append(b, 8);

  const dataCapacityBits = getNumDataCodewords(version, eccIndex) * 8;
  append(0, Math.min(4, dataCapacityBits - bits.length)); // Terminator
  append(0, (8 - (bits.length % 8)) % 8); // Byte alignment
  for (
    let padByte = 0xec;
    bits.length < dataCapacityBits;
    padByte ^= 0xec ^ 0x11
  )
    append(padByte, 8);

  const dataCodewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j]!;
    dataCodewords.push(byte);
  }

  // Split into blocks, append per-block ECC, then interleave.
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[eccIndex]![version]!;
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[eccIndex]![version]!;
  const rawCodewords = Math.floor(getNumRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const data = dataCodewords.slice(
      k,
      k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1),
    );
    k += data.length;
    const ecc = rsRemainder(data, blockEccLen);
    if (i < numShortBlocks) data.push(0); // Placeholder keeps lengths equal
    blocks.push([...data, ...ecc]);
  }

  const result: number[] = [];
  for (let i = 0; i < blocks[0]!.length; i++)
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks)
        result.push(block[i]!);
    });
  return result;
};

// ---- Module drawing --------------------------------------------------------

const makeGrid = (size: number): Grid =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => false));

const drawFinderPattern = (grid: Grid, cx: number, cy: number): void => {
  const size = grid.length;
  for (let dy = -4; dy <= 4; dy++)
    for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || x >= size || y < 0 || y >= size) continue;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      grid[y]![x] = dist !== 2 && dist !== 4;
    }
};

const drawAlignmentPattern = (grid: Grid, cx: number, cy: number): void => {
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++)
      grid[cy + dy]![cx + dx] =
        Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
};

const formatBits = (eccIndex: number, mask: number): number => {
  const data = (FORMAT_BITS[eccIndex]! << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
};

const drawFormatBits = (
  grid: Grid,
  eccIndex: number,
  mask: number,
): void => {
  const size = grid.length;
  const bits = formatBits(eccIndex, mask);
  // First copy around the top-left finder pattern
  for (let i = 0; i <= 5; i++) grid[i]![8] = ((bits >>> i) & 1) !== 0;
  grid[7]![8] = ((bits >>> 6) & 1) !== 0;
  grid[8]![8] = ((bits >>> 7) & 1) !== 0;
  grid[8]![7] = ((bits >>> 8) & 1) !== 0;
  for (let i = 9; i < 15; i++) grid[8]![14 - i] = ((bits >>> i) & 1) !== 0;
  // Second copy beside the top-right and bottom-left finders
  for (let i = 0; i < 8; i++)
    grid[8]![size - 1 - i] = ((bits >>> i) & 1) !== 0;
  for (let i = 8; i < 15; i++)
    grid[size - 15 + i]![8] = ((bits >>> i) & 1) !== 0;
  grid[size - 8]![8] = true; // Dark module
};

const drawVersionInfo = (grid: Grid, version: number): void => {
  if (version < 7) return;
  const size = grid.length;
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const bit = ((bits >>> i) & 1) !== 0;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    grid[b]![a] = bit;
    grid[a]![b] = bit;
  }
};

const drawFunctionPatterns = (grid: Grid, version: number): void => {
  const size = grid.length;
  for (let i = 0; i < size; i++) {
    grid[6]![i] = i % 2 === 0; // Horizontal timing pattern
    grid[i]![6] = i % 2 === 0; // Vertical timing pattern
  }
  drawFinderPattern(grid, 3, 3);
  drawFinderPattern(grid, size - 4, 3);
  drawFinderPattern(grid, 3, size - 4);
  const align = alignmentPatternPositions(version);
  for (let i = 0; i < align.length; i++)
    for (let j = 0; j < align.length; j++)
      if (
        !(
          (i === 0 && j === 0) ||
          (i === 0 && j === align.length - 1) ||
          (i === align.length - 1 && j === 0)
        )
      )
        drawAlignmentPattern(grid, align[j]!, align[i]!, );
  drawFormatBits(grid, 0 /* placeholder */, 0);
  drawVersionInfo(grid, version);
};

/** Marks every coordinate reserved for function patterns. */
const makeFunctionMap = (size: number, version: number): boolean[][] => {
  const reserved = makeGrid(size);
  const stampArea = (cx: number, cy: number, radius: number): void => {
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) reserved[y]![x] = true;
      }
  };
  for (let i = 0; i < size; i++) {
    reserved[6]![i] = true;
    reserved[i]![6] = true;
  }
  stampArea(3, 3, 4);
  stampArea(size - 4, 3, 4);
  stampArea(3, size - 4, 4);
  const align = alignmentPatternPositions(version);
  for (let i = 0; i < align.length; i++)
    for (let j = 0; j < align.length; j++)
      if (
        !(
          (i === 0 && j === 0) ||
          (i === 0 && j === align.length - 1) ||
          (i === align.length - 1 && j === 0)
        )
      )
        stampArea(align[j]!, align[i]!, 2);
  // Format information areas (both copies plus the dark module)
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) reserved[8]![i] = true;
    if (i !== 6) reserved[i]![8] = true;
  }
  for (let i = size - 8; i < size; i++) {
    reserved[8]![i] = true;
    reserved[i]![8] = true;
  }
  // Version information areas
  if (version >= 7)
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      reserved[b]![a] = true;
      reserved[a]![b] = true;
    }
  return reserved;
};

const placeData = (
  grid: Grid,
  reserved: boolean[][],
  codewords: readonly number[],
): void => {
  const size = grid.length;
  const totalBits = codewords.length * 8;
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!reserved[y]![x] && bitIndex < totalBits) {
          grid[y]![x] = ((codewords[bitIndex >>> 3]! >>> (7 - (bitIndex & 7))) & 1) !== 0;
          bitIndex++;
        }
      }
  }
};

const maskFormula = (mask: number, x: number, y: number): boolean => {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x * y) % 3) + ((x + y) % 2)) % 2 === 0;
  }
};

const applyMaskToGrid = (
  grid: Grid,
  reserved: boolean[][],
  mask: number,
): void => {
  const size = grid.length;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (!reserved[y]![x] && maskFormula(mask, x, y))
        grid[y]![x] = !grid[y]![x];
};

// ---- Mask penalty evaluation (ISO/IEC 18004 section 8.8.2) -----------------

const finderPenaltyAddHistory = (
  runLength: number,
  runHistory: number[],
): void => {
  let current = runLength;
  if (runHistory[0] === 0) current += gridPenaltySize; // Light border
  runHistory.pop();
  runHistory.unshift(current);
};

const finderPenaltyCountPatterns = (runHistory: readonly number[]): number => {
  const n = runHistory[1]!;
  const core =
    n > 0 &&
    runHistory[2] === n &&
    runHistory[3] === n * 3 &&
    runHistory[4] === n &&
    runHistory[5] === n;
  if (!core) return 0;
  return (
    (runHistory[0]! >= n * 4 && runHistory[6]! >= n ? 1 : 0) +
    (runHistory[6]! >= n * 4 && runHistory[0]! >= n ? 1 : 0)
  );
};

// Module count backing the light-border heuristic below; set per encode call.
let gridPenaltySize = 0;

const penaltyScore = (grid: Grid): number => {
  const size = grid.length;
  let result = 0;

  // Rules 1 and 3, evaluated together per row and column.
  for (let y = 0; y < size; y++) {
    let runColor = false;
    let runLength = 0;
    const runHistory = [0, 0, 0, 0, 0, 0, 0];
    for (let x = 0; x < size; x++) {
      if (grid[y]![x] === runColor) {
        runLength += 1;
        if (runLength === 5) result += 3;
        else if (runLength > 5) result += 1;
      } else {
        finderPenaltyAddHistory(runLength, runHistory);
        if (!runColor)
          result += finderPenaltyCountPatterns(runHistory) * 40;
        runColor = grid[y]![x]!;
        runLength = 1;
      }
    }
    if (runColor) {
      finderPenaltyAddHistory(runLength, runHistory);
      runLength = 0;
    }
    runLength += size; // Trailing light border
    finderPenaltyAddHistory(runLength, runHistory);
    result += finderPenaltyCountPatterns(runHistory) * 40;
  }
  for (let x = 0; x < size; x++) {
    let runColor = false;
    let runLength = 0;
    const runHistory = [0, 0, 0, 0, 0, 0, 0];
    for (let y = 0; y < size; y++) {
      if (grid[y]![x] === runColor) {
        runLength += 1;
        if (runLength === 5) result += 3;
        else if (runLength > 5) result += 1;
      } else {
        finderPenaltyAddHistory(runLength, runHistory);
        if (!runColor)
          result += finderPenaltyCountPatterns(runHistory) * 40;
        runColor = grid[y]![x]!;
        runLength = 1;
      }
    }
    if (runColor) {
      finderPenaltyAddHistory(runLength, runHistory);
      runLength = 0;
    }
    runLength += size;
    finderPenaltyAddHistory(runLength, runHistory);
    result += finderPenaltyCountPatterns(runHistory) * 40;
  }

  // Rule 2: 2x2 blocks of the same color
  for (let y = 0; y < size - 1; y++)
    for (let x = 0; x < size - 1; x++) {
      const color = grid[y]![x]!;
      if (
        color === grid[y]![x + 1] &&
        color === grid[y + 1]![x] &&
        color === grid[y + 1]![x + 1]
      )
        result += 3;
    }

  // Rule 4: deviation from an even dark/light balance
  let dark = 0;
  for (const row of grid) for (const cell of row) if (cell) dark += 1;
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += Math.max(k, 0) * 10;
  return result;
};

export type EncodedQrCode = {
  /** QR version (1-40); the symbol is `17 + 4 * version` modules wide. */
  readonly version: number;
  /** Modules per side including function patterns. */
  readonly size: number;
  /** Whether the module at column `x`, row `y` is dark. */
  readonly getModule: (x: number, y: number) => boolean;
};

/**
 * Encodes UTF-8 text into a QR Code symbol using byte mode, choosing the
 * smallest fitting version and the lowest-penalty mask deterministically.
 */
export const encodeQr = (text: string, eccLevel: QrEccLevel): EncodedQrCode => {
  const eccIndex = ECC_LEVELS.indexOf(eccLevel);
  if (eccIndex < 0) throw new RangeError(`Unknown EC level: ${eccLevel}`);
  const version = smallestVersionFor(text, eccIndex);
  const size = version * 4 + 17;
  gridPenaltySize = size;

  const codewords = makeCodewords(text, version, eccIndex);
  const reserved = makeFunctionMap(size, version);
  const baseGrid = makeGrid(size);
  drawFunctionPatterns(baseGrid, version);
  drawFormatBits(baseGrid, eccIndex, 0);

  let bestGrid: Grid | undefined;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const grid = baseGrid.map((row) => row.slice());
    drawFormatBits(grid, eccIndex, mask);
    placeData(grid, reserved, codewords);
    applyMaskToGrid(grid, reserved, mask);
    const penalty = penaltyScore(grid);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestGrid = grid;
    }
  }

  const finalGrid = bestGrid!;
  return {
    version,
    size,
    getModule: (x: number, y: number): boolean => {
      if (!Number.isInteger(x) || !Number.isInteger(y))
        throw new RangeError("Module coordinates must be integers");
      if (x < 0 || x >= size || y < 0 || y >= size)
        throw new RangeError("Module coordinates out of bounds");
      return finalGrid[y]![x]!;
    },
  };
};
