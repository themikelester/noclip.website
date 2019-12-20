import ArrayBufferSlice from '../../ArrayBufferSlice';
import { assertExists } from '../../util';
import { mat4, vec3 } from 'gl-matrix';
import * as GX from '../../gx/gx_enum';
import { GfxDevice } from '../../gfx/platform/GfxPlatform';
import { GfxRenderCache } from '../../gfx/render/GfxRenderCache';
import { SymbolMap } from './Actors';
import { Actor } from './Actors';
import { WwContext } from './zww_scenes';
import * as DZB from './DZB';

import { BTIData, BTI_Texture } from '../../Common/JSYSTEM/JUTTexture';
import { GX_Array, GX_VtxAttrFmt, GX_VtxDesc, compileVtxLoader, getAttributeByteSize } from '../../gx/gx_displaylist';
import { parseMaterial } from '../../gx/gx_material';
import { DisplayListRegisters, displayListRegistersRun, displayListRegistersInitGX } from '../../gx/gx_displaylist';
import { GfxBufferCoalescerCombo } from '../../gfx/helpers/BufferHelpers';
import { ColorKind, PacketParams, MaterialParams, ub_MaterialParams, loadedDataCoalescerComboGfx } from "../../gx/gx_render";
import { GXShapeHelperGfx, GXMaterialHelperGfx } from '../../gx/gx_render';
import { TextureMapping } from '../../TextureHolder';
import { GfxRenderInstManager } from '../../gfx/render/GfxRenderer';
import { ViewerRenderInput } from '../../viewer';
import { colorCopy, White } from '../../Color';

// @TODO: This belongs somewhere else
export type SymbolData = { Filename: string, SymbolName: string, Data: ArrayBufferSlice };
export type SymbolMap = { SymbolData: SymbolData[] };
function findSymbol(symbolMap: SymbolMap, filename: string, symbolName: string): ArrayBufferSlice {
    const entry = assertExists(symbolMap.SymbolData.find((e: SymbolData) => e.Filename === filename && e.SymbolName === symbolName));
    return entry.Data;
}

const scratchVec3a = vec3.create();
const scratchVec3b = vec3.create();
const scratchMat4a = mat4.create();
const packetParams = new PacketParams();
const materialParams = new MaterialParams();

// The game uses unsigned shorts to index into cos/sin tables.
// The max short value (2^16-1 = 65535) corresponds to 2PI
const kUshortTo2PI = Math.PI * 2.0 / 65535.0;
function uShortTo2PI(x: number) {
    return x * kUshortTo2PI;
}

// @NOTE: The game has separate checkGroundY functions for trees, grass, and flowers
function checkGroundY(context: WwContext, pos: vec3) {
    const dzb = context.roomRenderer.dzb;

    const down = vec3.set(scratchVec3b, 0, -1, 0);
    const hit = DZB.raycast(scratchVec3b, dzb, pos, down);
    return hit ? scratchVec3b[1] : pos[1];
}

// ---------------------------------------------
// Flower Packet
// ---------------------------------------------
enum FlowerType {
    WHITE,
    PINK,
    BESSOU,
};

enum FlowerFlags {
    isFrustumCulled = 1 << 0,
    needsGroundCheck = 2 << 0,
}

interface FlowerData {
    flags: number,
    type: FlowerType,
    animIdx: number,
    itemIdx: number,
    particleLifetime: number,
    pos: vec3,
    modelMatrix: mat4,
    nextData: FlowerData,
}

interface FlowerAnim {
    active: boolean,
    rotationX: number,
    rotationY: number,
    matrix: mat4,
}

const kMaxFlowerDatas = 200;
const kMaxGroundChecksPerFrame = 8;
const kDynamicAnimCount = 0; // The game uses 8 idle anims, and 64 dynamic anims for things like cutting

class FlowerModel {
    public pinkTextureMapping = new TextureMapping();
    public pinkTextureData: BTIData;
    public pinkMaterial: GXMaterialHelperGfx;
    public whiteTextureMapping = new TextureMapping();
    public whiteTextureData: BTIData;
    public whiteMaterial: GXMaterialHelperGfx;
    public bessouTextureMapping = new TextureMapping();
    public bessouTextureData: BTIData;
    public bessouMaterial: GXMaterialHelperGfx;

    public shapeWhiteUncut: GXShapeHelperGfx;
    public shapeWhiteCut: GXShapeHelperGfx;
    public shapePinkUncut: GXShapeHelperGfx;
    public shapePinkCut: GXShapeHelperGfx;
    public shapeBessouUncut: GXShapeHelperGfx;
    public shapeBessouCut: GXShapeHelperGfx;

    public bufferCoalescer: GfxBufferCoalescerCombo;

    constructor(device: GfxDevice, symbolMap: SymbolMap, cache: GfxRenderCache) {
        const l_matDL = findSymbol(symbolMap, `d_flower.o`, `l_matDL`);
        const l_matDL2 = findSymbol(symbolMap, `d_flower.o`, `l_matDL2`);
        const l_matDL3 = findSymbol(symbolMap, `d_flower.o`, `l_matDL3`);
        const l_Txo_ob_flower_pink_64x64TEX = findSymbol(symbolMap, `d_flower.o`, `l_Txo_ob_flower_pink_64x64TEX`);
        const l_Txo_ob_flower_white_64x64TEX = findSymbol(symbolMap, `d_flower.o`, `l_Txo_ob_flower_white_64x64TEX`);
        const l_Txq_bessou_hanaTEX = findSymbol(symbolMap, `d_flower.o`, `l_Txq_bessou_hanaTEX`);        

        const matRegisters = new DisplayListRegisters();

        const materialFromDL = (displayList: ArrayBufferSlice, name: string) => {
            displayListRegistersInitGX(matRegisters);
            displayListRegistersRun(matRegisters, displayList);
            const gxMaterial = parseMaterial(matRegisters, name);
            return gxMaterial;
        }

        const createTextureData = (data: ArrayBufferSlice, name: string) => {
            const minFilterTable = [
                GX.TexFilter.NEAR,
                GX.TexFilter.NEAR_MIP_NEAR,
                GX.TexFilter.NEAR_MIP_LIN,
                GX.TexFilter.NEAR,
                GX.TexFilter.LINEAR,
                GX.TexFilter.LIN_MIP_NEAR,
                GX.TexFilter.LIN_MIP_LIN,
            ];

            const image0 = matRegisters.bp[GX.BPRegister.TX_SETIMAGE0_I0_ID];
            const width  = ((image0 >>>  0) & 0x3FF) + 1;
            const height = ((image0 >>> 10) & 0x3FF) + 1;
            const format: GX.TexFormat = (image0 >>> 20) & 0x0F;
            const mode0 = matRegisters.bp[GX.BPRegister.TX_SETMODE0_I0_ID];
            const wrapS: GX.WrapMode = (mode0 >>> 0) & 0x03;
            const wrapT: GX.WrapMode = (mode0 >>> 2) & 0x03;
            const magFilter: GX.TexFilter = (mode0 >>> 4) & 0x01;
            const minFilter: GX.TexFilter = minFilterTable[(mode0 >>> 5) & 0x07];
            const lodBias = (mode0 >>> 9) & 0x05;
            const mode1 = matRegisters.bp[GX.BPRegister.TX_SETMODE1_I0_ID];
            const minLOD = (mode1 >>> 0) & 0xF;
            const maxLOD = (mode1 >>> 8) & 0xF;
            console.assert(minLOD === 0);
            console.assert(lodBias === 0, 'Non-zero LOD bias. This is untested');
    
            const texture: BTI_Texture = {
                name,
                width, height, format,
                data,
                mipCount: 1 + maxLOD - minLOD,
                paletteFormat: GX.TexPalette.RGB565,
                paletteData: null,
                wrapS, wrapT,
                minFilter, magFilter,
                minLOD, maxLOD, lodBias,
            };

            return new BTIData(device, cache, texture);
        }

        this.whiteMaterial = new GXMaterialHelperGfx(materialFromDL(l_matDL, 'l_matDL'));
        this.whiteTextureData = createTextureData(l_Txo_ob_flower_white_64x64TEX, 'l_Txo_ob_flower_white_64x64TEX');
        this.whiteTextureData.fillTextureMapping(this.whiteTextureMapping);

        this.pinkMaterial = new GXMaterialHelperGfx(materialFromDL(l_matDL2, 'l_matDL2'));
        this.pinkTextureData = createTextureData(l_Txo_ob_flower_pink_64x64TEX, 'l_Txo_ob_flower_pink_64x64TEX');
        this.pinkTextureData.fillTextureMapping(this.pinkTextureMapping);

        this.bessouMaterial = new GXMaterialHelperGfx(materialFromDL(l_matDL3, 'l_matDL3'));
        this.bessouTextureData = createTextureData(l_Txq_bessou_hanaTEX, 'l_Txq_bessou_hanaTEX');
        this.bessouTextureData.fillTextureMapping(this.bessouTextureMapping);

        // @TODO: These two symbols are being extracted as all 0. Need to investigate
        const l_colorData = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0xB2, 0xB2, 0xB2, 0xFF]);
        const l_color3Data = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0x80, 0x80, 0x80, 0xFF]);

        // White
        const l_pos = findSymbol(symbolMap, `d_flower.o`, `l_pos`);
        const l_color = new ArrayBufferSlice(l_colorData.buffer);
        const l_texCoord = findSymbol(symbolMap, `d_flower.o`, `l_texCoord`);

        // Pink
        const l_pos2 = findSymbol(symbolMap, `d_flower.o`, `l_pos2`);
        const l_color2 = findSymbol(symbolMap, `d_flower.o`, `l_color2`);
        const l_texCoord2 = findSymbol(symbolMap, `d_flower.o`, `l_texCoord2`);
        
        // Bessou
        const l_pos3 = findSymbol(symbolMap, `d_flower.o`, `l_pos3`);
        const l_color3 = new ArrayBufferSlice(l_color3Data.buffer);
        const l_texCoord3 = findSymbol(symbolMap, `d_flower.o`, `l_texCoord3`);

        const l_Ohana_highDL = findSymbol(symbolMap, `d_flower.o`, `l_Ohana_highDL`);
        const l_Ohana_high_gutDL = findSymbol(symbolMap, `d_flower.o`, `l_Ohana_high_gutDL`);
        const l_OhanaDL = findSymbol(symbolMap, `d_flower.o`, `l_OhanaDL`);
        const l_Ohana_gutDL = findSymbol(symbolMap, `d_flower.o`, `l_Ohana_gutDL`);
        const l_QbsafDL = findSymbol(symbolMap, `d_flower.o`, `l_QbsafDL`);
        const l_QbsfwDL = findSymbol(symbolMap, `d_flower.o`, `l_QbsfwDL`);

        // All flowers share the same vertex format
        const vatFormat: GX_VtxAttrFmt[] = [];
        vatFormat[GX.Attr.POS] = { compCnt: GX.CompCnt.POS_XYZ, compShift: 0, compType: GX.CompType.F32 };
        vatFormat[GX.Attr.TEX0] = { compCnt: GX.CompCnt.TEX_ST, compShift: 0, compType: GX.CompType.F32 };
        vatFormat[GX.Attr.CLR0] = { compCnt: GX.CompCnt.CLR_RGBA, compShift: 0, compType: GX.CompType.RGBA8 };
         const vcd: GX_VtxDesc[] = [];
        vcd[GX.Attr.POS] = { type: GX.AttrType.INDEX8 };
        vcd[GX.Attr.CLR0] = { type: GX.AttrType.INDEX8 };
        vcd[GX.Attr.TEX0] = { type: GX.AttrType.INDEX8 };
        const vtxLoader = compileVtxLoader(vatFormat, vcd);

        // Compute a CPU-side ArrayBuffers of indexes and interleaved vertices for each display list
        const vtxArrays: GX_Array[] = [];
        const loadFlowerVerts = (pos: ArrayBufferSlice, color: ArrayBufferSlice, texCoord: ArrayBufferSlice, displayList: ArrayBufferSlice) => {
            vtxArrays[GX.Attr.POS]  = { buffer: pos, offs: 0, stride: getAttributeByteSize(vatFormat, GX.Attr.POS) };
            vtxArrays[GX.Attr.CLR0] = { buffer: color, offs: 0, stride: getAttributeByteSize(vatFormat, GX.Attr.CLR0) };
            vtxArrays[GX.Attr.TEX0] = { buffer: texCoord, offs: 0, stride: getAttributeByteSize(vatFormat, GX.Attr.TEX0) };
            return vtxLoader.runVertices(vtxArrays, displayList);
        }

        // Each flower type has a unique set of attribute buffers, and a cut and uncut display list
        const lWhiteUncut = loadFlowerVerts(l_pos, l_color, l_texCoord, l_OhanaDL);
        const lWhiteCut = loadFlowerVerts(l_pos, l_color, l_texCoord, l_Ohana_gutDL);
        const lPinkUncut = loadFlowerVerts(l_pos2, l_color2, l_texCoord2, l_Ohana_highDL);
        const lPinkCut = loadFlowerVerts(l_pos2, l_color2, l_texCoord2, l_Ohana_high_gutDL);
        const lBessouUncut = loadFlowerVerts(l_pos3, l_color3, l_texCoord3, l_QbsafDL);
        const lBessouCut = loadFlowerVerts(l_pos3, l_color3, l_texCoord3, l_QbsfwDL);

        // Coalesce all VBs and IBs into single buffers and upload to the GPU
        this.bufferCoalescer = loadedDataCoalescerComboGfx(device, [ lWhiteUncut, lWhiteCut, lPinkUncut, lPinkCut ]);

        // Build an input layout and input state from the vertex layout and data
        this.shapeWhiteUncut = new GXShapeHelperGfx(device, cache, this.bufferCoalescer.coalescedBuffers[0], vtxLoader.loadedVertexLayout, lWhiteUncut);
        this.shapeWhiteCut = new GXShapeHelperGfx(device, cache, this.bufferCoalescer.coalescedBuffers[1], vtxLoader.loadedVertexLayout, lWhiteCut);
        this.shapePinkUncut = new GXShapeHelperGfx(device, cache, this.bufferCoalescer.coalescedBuffers[2], vtxLoader.loadedVertexLayout, lPinkUncut);
        this.shapePinkCut = new GXShapeHelperGfx(device, cache, this.bufferCoalescer.coalescedBuffers[3], vtxLoader.loadedVertexLayout, lPinkCut);
        this.shapeBessouUncut = new GXShapeHelperGfx(device, cache, this.bufferCoalescer.coalescedBuffers[2], vtxLoader.loadedVertexLayout, lBessouUncut);
        this.shapeBessouCut = new GXShapeHelperGfx(device, cache, this.bufferCoalescer.coalescedBuffers[3], vtxLoader.loadedVertexLayout, lBessouCut);
    }

    public destroy(device: GfxDevice): void {
        this.bufferCoalescer.destroy(device);
        this.shapeWhiteUncut.destroy(device);
        this.shapeWhiteCut.destroy(device);
        this.shapePinkUncut.destroy(device);
        this.shapePinkCut.destroy(device);

        this.whiteTextureData.destroy(device);
        this.pinkTextureData.destroy(device);
    }
}

export class FlowerPacket {
    datas: FlowerData[] = new Array(kMaxFlowerDatas);
    dataCount: number = 0;

    anims: FlowerAnim[] = new Array(8 + kDynamicAnimCount);
    
    private flowerModel: FlowerModel;

    constructor(private context: WwContext) {
        this.flowerModel = new FlowerModel(context.device, context.symbolMap, context.cache);

        // Random starting rotation for each idle anim
        const dy = 2.0 * Math.PI / 8.0;
        for (let i = 0; i < 8; i++) {
            this.anims[i] = {
                active: true,
                rotationX: 0,
                rotationY: i * dy,
                matrix: mat4.create(),
            }
        }
    }

    newData(pos: vec3, type: FlowerType, roomIdx: number, itemIdx: number): FlowerData {
        const dataIdx = this.datas.findIndex(d => d === undefined);
        if (dataIdx === -1) console.warn('Failed to allocate flower data');
        return this.setData(dataIdx, pos, type, roomIdx, itemIdx);
    }

    setData(index: number, pos: vec3, type: FlowerType, roomIdx: number, itemIdx: number): FlowerData {
        const animIdx = Math.floor(Math.random() * 8);
        
        // Island 0x21 uses the Bessou flower (the game does this check here as well)
        if (this.context.stage === 'sea' && roomIdx === 0x21) {
            type = FlowerType.BESSOU;
        }

        return this.datas[index] = {
            flags: FlowerFlags.needsGroundCheck,
            type,
            animIdx,
            itemIdx,
            particleLifetime: 0,
            pos: vec3.clone(pos),
            modelMatrix: mat4.create(),
            nextData: null!,
        }
    }

    calc() {        
        // Idle animation updates
        for (let i = 0; i < 8; i++) {
            const theta = Math.cos(uShortTo2PI(1000.0 * (this.context.frameCount + 0xfa * i)));
            this.anims[i].rotationX = uShortTo2PI(1000.0 + 1000.0 * theta);
        }

        // @TODO: Hit checks
    }

    update() {
        let groundChecksThisFrame = 0;

        // Update all animation matrices
        for (let i = 0; i < 8 + kDynamicAnimCount; i++) {
            mat4.fromYRotation(this.anims[i].matrix, this.anims[i].rotationY);
            mat4.rotateX(this.anims[i].matrix, this.anims[i].matrix, this.anims[i].rotationX);
            mat4.rotateY(this.anims[i].matrix, this.anims[i].matrix, -this.anims[i].rotationY);
        }

        for (let i = 0; i < kMaxFlowerDatas; i++) {
            const data = this.datas[i];
            if (!data) continue;

            // Perform ground checks for some limited number of flowers
            if (data.flags & FlowerFlags.needsGroundCheck && groundChecksThisFrame < kMaxGroundChecksPerFrame) {
                data.pos[1] = checkGroundY(this.context, data.pos);
                data.flags &= ~FlowerFlags.needsGroundCheck;
                ++groundChecksThisFrame;
            }

            // @TODO: Frustum culling

            if (!(data.flags & FlowerFlags.isFrustumCulled)) {
                // Update model matrix for all non-culled objects
                mat4.mul(data.modelMatrix, mat4.fromTranslation(scratchMat4a, data.pos), this.anims[data.animIdx].matrix);
            }
        }
    }

    draw(renderInstManager: GfxRenderInstManager, viewerInput: ViewerRenderInput, device: GfxDevice) {
        // @TODO: Set up the vertex pipeline and shared material 
        // @TODO: Render flowers in all rooms
        // @NOTE: It appears that flowers are drawn for all rooms all the time
        // @TODO: Set the kyanko colors for each room

        // @NOTE: Flowers leave C0 as unset, and assume it is black
        colorCopy(materialParams.u_Color[ColorKind.C1], White);

        // @TODO: This should probably be precomputed and stored in the context
        const roomToView = mat4.mul(scratchMat4a, viewerInput.camera.viewMatrix, this.context.roomMatrix);

        // Draw white flowers
        // @TODO: Only loop over flowers in this room (using the linked list)
        materialParams.m_TextureMapping[0].copy(this.flowerModel.whiteTextureMapping);
        for (let i = 0; i < kMaxFlowerDatas; i++) {
            const data = this.datas[i];
            if (!data) continue;
            if (data.flags & FlowerFlags.isFrustumCulled || data.type !== FlowerType.WHITE) continue;

            const renderInst = this.flowerModel.shapeWhiteUncut.pushRenderInst(renderInstManager);
            const materialParamsOffs = renderInst.allocateUniformBuffer(ub_MaterialParams, this.flowerModel.whiteMaterial.materialParamsBufferSize);
            this.flowerModel.whiteMaterial.fillMaterialParamsDataOnInst(renderInst, materialParamsOffs, materialParams);
            this.flowerModel.whiteMaterial.setOnRenderInst(device, renderInstManager.gfxRenderCache, renderInst);
            renderInst.setSamplerBindingsFromTextureMappings(materialParams.m_TextureMapping);

            mat4.mul(packetParams.u_PosMtx[0], roomToView, data.modelMatrix);
            this.flowerModel.shapeWhiteUncut.fillPacketParams(packetParams, renderInst);
        }

        // Draw pink flowers
        // @TODO: Only loop over flowers in this room (using the linked list)
        materialParams.m_TextureMapping[0].copy(this.flowerModel.pinkTextureMapping);
        for (let i = 0; i < kMaxFlowerDatas; i++) {
            const data = this.datas[i];
            if (!data) continue;
            if (data.flags & FlowerFlags.isFrustumCulled || data.type !== FlowerType.PINK) continue;

            const renderInst = this.flowerModel.shapePinkUncut.pushRenderInst(renderInstManager);
            const materialParamsOffs = renderInst.allocateUniformBuffer(ub_MaterialParams, this.flowerModel.pinkMaterial.materialParamsBufferSize);
            this.flowerModel.pinkMaterial.fillMaterialParamsDataOnInst(renderInst, materialParamsOffs, materialParams);
            this.flowerModel.pinkMaterial.setOnRenderInst(device, renderInstManager.gfxRenderCache, renderInst);
            renderInst.setSamplerBindingsFromTextureMappings(materialParams.m_TextureMapping);

            mat4.mul(packetParams.u_PosMtx[0], roomToView, data.modelMatrix);
            this.flowerModel.shapePinkUncut.fillPacketParams(packetParams, renderInst);
        }

        // Draw bessou flowers
        // @TODO: Only loop over flowers in this room (using the linked list)
        materialParams.m_TextureMapping[0].copy(this.flowerModel.pinkTextureMapping);
        for (let i = 0; i < kMaxFlowerDatas; i++) {
            const data = this.datas[i];
            if (!data) continue;
            if (data.flags & FlowerFlags.isFrustumCulled || data.type !== FlowerType.BESSOU) continue;

            const renderInst = this.flowerModel.shapeBessouUncut.pushRenderInst(renderInstManager);
            const materialParamsOffs = renderInst.allocateUniformBuffer(ub_MaterialParams, this.flowerModel.bessouMaterial.materialParamsBufferSize);
            this.flowerModel.bessouMaterial.fillMaterialParamsDataOnInst(renderInst, materialParamsOffs, materialParams);
            this.flowerModel.bessouMaterial.setOnRenderInst(device, renderInstManager.gfxRenderCache, renderInst);
            renderInst.setSamplerBindingsFromTextureMappings(materialParams.m_TextureMapping);

            mat4.mul(packetParams.u_PosMtx[0], roomToView, data.modelMatrix);
            this.flowerModel.shapeBessouUncut.fillPacketParams(packetParams, renderInst);
        }
    }
}

// ---------------------------------------------
// Grass Actor
// ---------------------------------------------
const kGrassSpawnPatterns = [
    { group: 0, count: 1},
    { group: 0, count: 7},
    { group: 1, count: 15},
    { group: 2, count: 3},
    { group: 3, count: 7},
    { group: 4, count: 11},
    { group: 5, count: 7},
    { group: 6, count: 5},
];

const kGrassSpawnOffsets = [
    [
        [0,0,0],
        [3,0,-0x32],
        [-2,0,0x32],
        [0x32,0,0x1b],
        [0x34,0,-0x19],
        [-0x32,0,0x16],
        [-0x32,0,-0x1d],
    ],
    [
        [-0x12,0,0x4c],
        [-0xf,0,0x1a],
        [0x85,0,0],
        [0x50,0,0x17],
        [0x56,0,-0x53],
        [0x21,0,-0x38],
        [0x53,0,-0x1b],
        [-0x78,0,-0x1a],
        [-0x12,0,-0x4a],
        [-0x14,0,-0x15],
        [-0x49,0,1],
        [-0x43,0,-0x66],    
        [-0x15,0,0x7e],
        [-0x78,0,-0x4e],
        [-0x46,0,-0x31],
        [0x20,0,0x67],
        [0x22,0,0x33],
        [-0x48,0,0x62],
        [-0x44,0,0x2f],
        [0x21,0,-5],
        [0x87,0,-0x35],
    ],
    [
        [-0x4b,0,-0x32],
        [0x4b,0,-0x19],
        [0xe,0,0x6a],
    ],
    [
        [-0x18,0,-0x1c],
        [0x1b,0,-0x1c],
        [-0x15,0,0x21],
        [-0x12,0,-0x22],
        [0x2c,0,-4],
        [0x29,0,10],
        [0x18,0,0x27],
    ],
    [
        [-0x37,0,-0x16],
        [-0x1c,0,-0x32],
        [-0x4d,0,0xb],
        [0x37,0,-0x2c],
        [0x53,0,-0x47],
        [0xb,0,-0x30],
        [0x61,0,-0x22],
        [-0x4a,0,-0x39],
        [0x1f,0,0x3a],
        [0x3b,0,0x1e],
        [0xd,0,0x17],
        [-0xc,0,0x36],
        [0x37,0,0x61],
        [10,0,0x5c],
        [0x21,0,-10],
        [-99,0,-0x1b],
        [0x28,0,-0x57],
    ],
    [
        [0,0,3],
        [-0x1a,0,-0x1d],
        [7,0,-0x19],
        [0x1f,0,-5],
        [-7,0,0x28],
        [-0x23,0,0xf],
        [0x17,0,0x20],
    ],
    [
        [-0x28,0,0],
        [0,0,0],
        [0x50,0,0],
        [-0x50,0,0],
        [0x28,0,0],
    ]
];

export class AGrass {
    static create(context: WwContext, actor: Actor) {
        enum FoliageType {
            Grass,
            Tree,
            WhiteFlower,
            PinkFlower
        };

        const spawnPatternId = (actor.parameters & 0x00F) >> 0;
        const type: FoliageType = (actor.parameters & 0x030) >> 4;

        const pattern = kGrassSpawnPatterns[spawnPatternId];
        const offsets = kGrassSpawnOffsets[pattern.group];
        const count = pattern.count;

        switch (type) {
            case FoliageType.Grass:

            break;

            case FoliageType.Tree:
                // for (let j = 0; j < count; j++) {
                //     const objectRenderer = buildSmallTreeModel(symbolMap);

                //     const x = offsets[j][0];
                //     const y = offsets[j][1];
                //     const z = offsets[j][2];
                //     const offset = vec3.set(scratchVec3a, x, y, z);

                //     setModelMatrix(objectRenderer.modelMatrix);
                //     mat4.translate(objectRenderer.modelMatrix, objectRenderer.modelMatrix, offset);
                //     setToNearestFloor(objectRenderer.modelMatrix, objectRenderer.modelMatrix);
                //     roomRenderer.objectRenderers.push(objectRenderer);
                //     objectRenderer.layer = layer;
                // }
            break;

            case FoliageType.WhiteFlower:
            case FoliageType.PinkFlower:
                if (!context.flowerPacket) context.flowerPacket = new FlowerPacket(context);

                const itemIdx = (actor.parameters >> 6) & 0x3f; // Determines which item spawns when this is cut down

                for (let j = 0; j < count; j++) {
                    const flowerType = (type == FoliageType.WhiteFlower) ? FlowerType.WHITE : FlowerType.PINK; 

                    // @NOTE: Flowers do not observe actor rotation or scale
                    const offset = vec3.set(scratchVec3a, offsets[j][0], offsets[j][1], offsets[j][2]);
                    const pos = vec3.add(scratchVec3a, offset, actor.pos); 

                    const data = context.flowerPacket.newData(pos, flowerType, actor.roomIndex, itemIdx);
                }
            break;
        }
        return;
    }
}