import { createHash } from "crypto";
import { readPackage } from "../scripts/fw-bench";

// the package layout signpkg.py writes: legacy init 12 B, {type 2, len, sha256}, r, s
function dat(binary: Buffer): Buffer {
    const d = Buffer.alloc(116);
    d.writeUInt32LE(2, 12);
    d.writeUInt32LE(binary.length, 16);
    createHash("sha256").update(binary).digest().copy(d, 20);
    return d;
}

describe("fw-bench package checks", () => {
    const binary = Buffer.concat([Buffer.alloc(3000, 0x11), Buffer.from("BeePad 1.8.9+140\0", "latin1"), Buffer.alloc(500, 0x22)]);

    test("reads the version compiled into the image", () => {
        const p = readPackage(binary, dat(binary));
        expect(p.embedded).toEqual({ version: "1.8.9", build: 140 });
        expect(p.sha256).toBe(createHash("sha256").update(binary).digest("hex"));
    });

    test("rejects a package whose init packet does not match the image", () => {
        const other = Buffer.from(binary); other[10] ^= 1;
        expect(() => readPackage(other, dat(binary))).toThrow(/hash/);
        expect(() => readPackage(binary.subarray(1), dat(binary))).toThrow(/length/);
        expect(() => readPackage(binary, dat(binary).subarray(0, 100))).toThrow(/116/);
    });

    test("rejects an image larger than bank 1", () => {
        const big = Buffer.alloc(0x23001);
        expect(() => readPackage(big, dat(big))).toThrow(/bank 1/);
    });
});
