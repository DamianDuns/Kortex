// ==========================================
// ARCHIVO: src/utils/zipBuilder.js
// Empaquetador .ZIP en memoria RAM, conversor de mallas .mesh de Roblox a Wavefront .OBJ y resolutor CDN
// ==========================================

/**
 * Resuelve un hash de rbxcdn usando la función oficial de enrutamiento de CDN de Roblox:
 * let i = 31; for (let c of hash) i ^= c.charCodeAt(0); return https://t${i % 8}.rbxcdn.com/${hash}
 */
function resolveRbxCdnUrl(hash) {
    if (!hash) return null;
    const clean = String(hash).trim();
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
        return clean;
    }
    let i = 31;
    for (const c of clean) {
        i ^= c.charCodeAt(0);
    }
    return `https://t${Math.abs(i) % 8}.rbxcdn.com/${clean}`;
}

/**
 * Convierte un archivo binario o de texto .mesh de Roblox (version 1.00, 1.01, 2.00, 3.00, 4.00)
 * a formato estándar Wavefront .OBJ listo para Blender, Blockbench o Cinema4D.
 */
function convertRobloxMeshToObj(meshBuffer, objectName = 'RobloxAsset', mtlName = 'Material_Roblox') {
    if (!meshBuffer || meshBuffer.length < 16) return null;

    const headerLine = meshBuffer.subarray(0, 12).toString('ascii');
    const objLines = [
        `# Kortex 3D Mesh Converter — ${objectName}`,
        `# Formato original detectado: ${headerLine.trim()}`,
        `mtllib model.mtl`,
        `o ${String(objectName).replace(/[^\w\-]/g, '_')}`,
        `usemtl ${mtlName}`
    ];

    try {
        // 1. Formato ASCII clásico: version 1.00 / version 1.01
        if (headerLine.startsWith('version 1.')) {
            const text = meshBuffer.toString('utf8');
            const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            if (lines.length < 3) return null;

            const numFaces = parseInt(lines[1], 10) || 0;
            const dataStr = lines.slice(2).join('');
            const vecRegex = /\[([-\d.eE+]+),([-\d.eE+]+),([-\d.eE+]+)\]/g;
            const vectors = [];
            let match;
            while ((match = vecRegex.exec(dataStr)) !== null) {
                vectors.push([
                    parseFloat(match[1]) || 0,
                    parseFloat(match[2]) || 0,
                    parseFloat(match[3]) || 0
                ]);
            }

            // Cada vértice tiene 3 tripletas: Posición [x,y,z], Normal [nx,ny,nz], UV [u,v,0]
            const totalVerts = Math.min(numFaces * 3, Math.floor(vectors.length / 3));
            if (totalVerts < 3) return null;

            for (let i = 0; i < totalVerts; i++) {
                const pos = vectors[i * 3];
                const norm = vectors[i * 3 + 1];
                const uv = vectors[i * 3 + 2];
                objLines.push(`v ${(pos[0] * 0.5).toFixed(5)} ${(pos[1] * 0.5).toFixed(5)} ${(pos[2] * 0.5).toFixed(5)}`);
                objLines.push(`vn ${norm[0].toFixed(5)} ${norm[1].toFixed(5)} ${norm[2].toFixed(5)}`);
                objLines.push(`vt ${uv[0].toFixed(5)} ${(1.0 - uv[1]).toFixed(5)}`);
            }

            const faceCount = Math.floor(totalVerts / 3);
            for (let f = 0; f < faceCount; f++) {
                const i1 = f * 3 + 1;
                const i2 = f * 3 + 2;
                const i3 = f * 3 + 3;
                objLines.push(`f ${i1}/${i1}/${i1} ${i2}/${i2}/${i2} ${i3}/${i3}/${i3}`);
            }

            return {
                objText: objLines.join('\n') + '\n',
                vertexCount: totalVerts,
                faceCount,
                version: headerLine.trim()
            };
        }

        // 2. Formato Binario: version 2.00, 3.00, 3.01, 4.00, 4.01
        if (headerLine.startsWith('version 2.') || headerLine.startsWith('version 3.') || headerLine.startsWith('version 4.')) {
            const newlineIdx = meshBuffer.indexOf(0x0A); // '\n'
            if (newlineIdx === -1) return null;
            const binStart = newlineIdx + 1;

            const sizeofMeshHeader = meshBuffer.readUInt16LE(binStart);
            let sizeofVertex = 36;
            let sizeofFace = 12;
            let numVerts = 0;
            let numFaces = 0;
            let vertOffset = binStart + sizeofMeshHeader;
            let faceOffset = 0;

            if (headerLine.startsWith('version 2.') || headerLine.startsWith('version 3.')) {
                sizeofVertex = meshBuffer.readUInt8(binStart + 2);
                sizeofFace = meshBuffer.readUInt8(binStart + 3);
                const isV3 = headerLine.startsWith('version 3.');
                const numLodsOffset = isV3 ? binStart + 6 : null;
                const numLods = isV3 ? meshBuffer.readUInt16LE(numLodsOffset) : 0;
                numVerts = meshBuffer.readUInt32LE(binStart + (isV3 ? 8 : 4));
                numFaces = meshBuffer.readUInt32LE(binStart + (isV3 ? 12 : 8));
                vertOffset = binStart + sizeofMeshHeader + (isV3 ? numLods * 4 : 0);
                faceOffset = vertOffset + numVerts * sizeofVertex;
            } else if (headerLine.startsWith('version 4.')) {
                numVerts = meshBuffer.readUInt32LE(binStart + 4);
                numFaces = meshBuffer.readUInt32LE(binStart + 8);
                const numLods = meshBuffer.readUInt16LE(binStart + 12);
                const numBones = meshBuffer.readUInt16LE(binStart + 14);
                sizeofVertex = 40;
                sizeofFace = 12;
                vertOffset = binStart + sizeofMeshHeader;
                const skinDataBytes = numBones > 0 ? numVerts * 8 : 0;
                faceOffset = vertOffset + (numVerts * sizeofVertex) + skinDataBytes + (numLods * 4);
            }

            if (numVerts <= 0 || numVerts > 150000 || vertOffset + numVerts * sizeofVertex > meshBuffer.length) {
                return null;
            }

            for (let v = 0; v < numVerts; v++) {
                const vo = vertOffset + v * sizeofVertex;
                const px = meshBuffer.readFloatLE(vo);
                const py = meshBuffer.readFloatLE(vo + 4);
                const pz = meshBuffer.readFloatLE(vo + 8);
                const nx = meshBuffer.readFloatLE(vo + 12);
                const ny = meshBuffer.readFloatLE(vo + 16);
                const nz = meshBuffer.readFloatLE(vo + 20);
                const tu = meshBuffer.readFloatLE(vo + 24);
                const tv = meshBuffer.readFloatLE(vo + 28);

                objLines.push(`v ${px.toFixed(5)} ${py.toFixed(5)} ${pz.toFixed(5)}`);
                objLines.push(`vn ${nx.toFixed(5)} ${ny.toFixed(5)} ${nz.toFixed(5)}`);
                objLines.push(`vt ${tu.toFixed(5)} ${(1.0 - tv).toFixed(5)}`);
            }

            let validFaces = 0;
            const maxFaces = Math.min(numFaces, Math.floor((meshBuffer.length - faceOffset) / sizeofFace));
            for (let f = 0; f < maxFaces; f++) {
                const fo = faceOffset + f * sizeofFace;
                const a = meshBuffer.readUInt32LE(fo) + 1;
                const b = meshBuffer.readUInt32LE(fo + 4) + 1;
                const c = meshBuffer.readUInt32LE(fo + 8) + 1;
                if (a <= numVerts && b <= numVerts && c <= numVerts) {
                    objLines.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
                    validFaces++;
                }
            }

            if (validFaces === 0) return null;

            return {
                objText: objLines.join('\n') + '\n',
                vertexCount: numVerts,
                faceCount: validFaces,
                version: headerLine.trim()
            };
        }
    } catch {
        return null;
    }

    return null;
}

// Tabla precalculada para CRC32 estándar (IEEE 802.3)
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Construye un archivo .ZIP válido directamente en un Buffer en memoria RAM (sin tocar disco).
 * @param {Array<{ name: string, data: Buffer|string }>} files Lista de archivos a incluir
 * @returns {Buffer} Buffer del archivo .zip listo para AttachmentBuilder y FileBuilder
 */
function createZipBuffer(files) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    const now = new Date();
    const dosTime = ((now.getHours() & 0x1F) << 11) | ((now.getMinutes() & 0x3F) << 5) | ((now.getSeconds() >> 1) & 0x1F);
    const dosDate = (((now.getFullYear() - 1980) & 0x7F) << 9) | (((now.getMonth() + 1) & 0x0F) << 5) | (now.getDate() & 0x1F);

    for (const file of files) {
        const nameBuf = Buffer.from(String(file.name), 'utf8');
        const dataBuf = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data || ''), 'utf8');
        const crc = crc32(dataBuf);
        const size = dataBuf.length;

        // Local File Header (30 bytes + filename)
        const localHeader = Buffer.alloc(30 + nameBuf.length);
        localHeader.writeUInt32LE(0x04034b50, 0); // Signature
        localHeader.writeUInt16LE(20, 4);         // Version needed (2.0)
        localHeader.writeUInt16LE(0x0800, 6);     // UTF-8 flag
        localHeader.writeUInt16LE(0, 8);          // Compression method: 0 (STORE - sin pérdida y ultrarrápido en RAM)
        localHeader.writeUInt16LE(dosTime, 10);
        localHeader.writeUInt16LE(dosDate, 12);
        localHeader.writeUInt32LE(crc, 14);
        localHeader.writeUInt32LE(size, 18);      // Compressed size
        localHeader.writeUInt32LE(size, 22);      // Uncompressed size
        localHeader.writeUInt16LE(nameBuf.length, 26);
        localHeader.writeUInt16LE(0, 28);         // Extra field length
        nameBuf.copy(localHeader, 30);

        localParts.push(localHeader, dataBuf);

        // Central Directory File Header (46 bytes + filename)
        const centralHeader = Buffer.alloc(46 + nameBuf.length);
        centralHeader.writeUInt32LE(0x02014b50, 0); // Signature
        centralHeader.writeUInt16LE(20, 4);         // Version made by
        centralHeader.writeUInt16LE(20, 6);         // Version needed
        centralHeader.writeUInt16LE(0x0800, 8);     // UTF-8 flag
        centralHeader.writeUInt16LE(0, 10);         // Compression method: STORE
        centralHeader.writeUInt16LE(dosTime, 12);
        centralHeader.writeUInt16LE(dosDate, 14);
        centralHeader.writeUInt32LE(crc, 16);
        centralHeader.writeUInt32LE(size, 20);
        centralHeader.writeUInt32LE(size, 24);
        centralHeader.writeUInt16LE(nameBuf.length, 28);
        centralHeader.writeUInt16LE(0, 30);         // Extra field len
        centralHeader.writeUInt16LE(0, 32);         // Comment len
        centralHeader.writeUInt16LE(0, 34);         // Disk number
        centralHeader.writeUInt16LE(0, 36);         // Internal attrs
        centralHeader.writeUInt32LE(0, 38);         // External attrs
        centralHeader.writeUInt32LE(offset, 42);    // Relative offset of local header
        nameBuf.copy(centralHeader, 46);

        centralParts.push(centralHeader);
        offset += localHeader.length + size;
    }

    const centralDirSize = centralParts.reduce((acc, b) => acc + b.length, 0);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);              // End of central dir signature
    eocd.writeUInt16LE(0, 4);                       // Number of this disk
    eocd.writeUInt16LE(0, 6);                       // Disk where central dir starts
    eocd.writeUInt16LE(files.length, 8);            // Total entries on disk
    eocd.writeUInt16LE(files.length, 10);           // Total entries
    eocd.writeUInt32LE(centralDirSize, 12);         // Size of central directory
    eocd.writeUInt32LE(offset, 16);                 // Offset of start of central directory
    eocd.writeUInt16LE(0, 20);                      // Comment length

    return Buffer.concat([...localParts, ...centralParts, eocd]);
}

module.exports = {
    resolveRbxCdnUrl,
    convertRobloxMeshToObj,
    createZipBuffer
};
