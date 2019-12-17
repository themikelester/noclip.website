
import * as Viewer from '../../viewer';
import * as GX from '../../gx/gx_enum';
import * as GX_Material from '../../gx/gx_material';

import { mat4, vec3 } from "gl-matrix";
import { J3DModelInstanceSimple } from "../../Common/JSYSTEM/J3D/J3DGraphBase";
import { ANK1, TTK1, TRK1 } from "../../Common/JSYSTEM/J3D/J3DLoader";
import AnimationController from "../../AnimationController";
import { KyankoColors, ZWWExtraTextures } from "./zww_scenes";
import { ColorKind, PacketParams, MaterialParams, ub_MaterialParams, loadedDataCoalescerComboGfx } from "../../gx/gx_render";
import { GXShapeHelperGfx, GXMaterialHelperGfx } from '../../gx/gx_render';
import { AABB } from '../../Geometry';
import { ScreenSpaceProjection, computeScreenSpaceProjectionFromWorldSpaceAABB, computeViewMatrix } from '../../Camera';
import { GfxDevice } from '../../gfx/platform/GfxPlatform';
import ArrayBufferSlice from '../../ArrayBufferSlice';
import { assertExists } from '../../util';
import { DisplayListRegisters, displayListRegistersRun, parseMaterialEntry, displayListRegistersInitGX } from '../../rres/brres';
import { GX_Array, GX_VtxAttrFmt, GX_VtxDesc, compileVtxLoader, getAttributeByteSize } from '../../gx/gx_displaylist';
import { GfxBufferCoalescerCombo } from '../../gfx/helpers/BufferHelpers';
import { TextureMapping } from '../../TextureHolder';
import { colorFromRGBA, White, colorNewCopy, colorCopy } from '../../Color';
import { GfxRenderCache } from '../../gfx/render/GfxRenderCache';
import { GfxRenderInstManager } from '../../gfx/render/GfxRenderer';
import { BTIData, BTI_Texture } from '../../Common/JSYSTEM/JUTTexture';
import { Endianness } from '../../endian';

// Special-case actors

export const enum LightTevColorType {
    ACTOR = 0,
    BG0 = 1,
    BG1 = 2,
    BG2 = 3,
    BG3 = 4,
}

// dScnKy_env_light_c::settingTevStruct
export function settingTevStruct(actor: J3DModelInstanceSimple, type: LightTevColorType, colors: KyankoColors): void {
    if (type === LightTevColorType.ACTOR) {
        actor.setColorOverride(ColorKind.C0, colors.actorC0);
        actor.setColorOverride(ColorKind.K0, colors.actorK0);
    } else if (type === LightTevColorType.BG0) {
        actor.setColorOverride(ColorKind.C0, colors.bg0C0);
        actor.setColorOverride(ColorKind.K0, colors.bg0K0);
    } else if (type === LightTevColorType.BG1) {
        actor.setColorOverride(ColorKind.C0, colors.bg1C0);
        actor.setColorOverride(ColorKind.K0, colors.bg1K0);
    } else if (type === LightTevColorType.BG2) {
        actor.setColorOverride(ColorKind.C0, colors.bg2C0);
        actor.setColorOverride(ColorKind.K0, colors.bg2K0);
    } else if (type === LightTevColorType.BG3) {
        actor.setColorOverride(ColorKind.C0, colors.bg3C0);
        actor.setColorOverride(ColorKind.K0, colors.bg3K0);
    }
}

export interface ObjectRenderer {
    prepareToRender(device: GfxDevice, renderInstManager: GfxRenderInstManager, viewerInput: Viewer.ViewerRenderInput): void;
    destroy(device: GfxDevice): void;
    setKyankoColors(colors: KyankoColors): void;
    setExtraTextures(v: ZWWExtraTextures): void;
    setVertexColorsEnabled(v: boolean): void;
    setTexturesEnabled(v: boolean): void;
    visible: boolean;
    layer: number;
}

const bboxScratch = new AABB();
const screenProjection = new ScreenSpaceProjection();
export class BMDObjectRenderer implements ObjectRenderer {
    public visible = true;
    public modelMatrix: mat4 = mat4.create();
    public lightTevColorType = LightTevColorType.ACTOR;
    public layer: number;

    private childObjects: BMDObjectRenderer[] = [];
    private parentJointMatrix: mat4 | null = null;

    constructor(public modelInstance: J3DModelInstanceSimple) {
    }

    public bindANK1(ank1: ANK1, animationController?: AnimationController): void {
        this.modelInstance.bindANK1(ank1, animationController);
    }

    public bindTTK1(ttk1: TTK1, animationController?: AnimationController): void {
        this.modelInstance.bindTTK1(ttk1, animationController);
    }

    public bindTRK1(trk1: TRK1, animationController?: AnimationController): void {
        this.modelInstance.bindTRK1(trk1, animationController);
    }

    public setParentJoint(o: BMDObjectRenderer, jointName: string): void {
        this.parentJointMatrix = o.modelInstance.getJointToWorldMatrixReference(jointName);
        o.childObjects.push(this);
    }

    public setMaterialColorWriteEnabled(materialName: string, v: boolean): void {
        this.modelInstance.setMaterialColorWriteEnabled(materialName, v);
    }
    
    public setVertexColorsEnabled(v: boolean): void {
        this.modelInstance.setVertexColorsEnabled(v);
        this.childObjects.forEach((child)=> child.setVertexColorsEnabled(v));
    }

    public setTexturesEnabled(v: boolean): void {
        this.modelInstance.setTexturesEnabled(v);
        this.childObjects.forEach((child)=> child.setTexturesEnabled(v));
    }

    public setExtraTextures(extraTextures: ZWWExtraTextures): void {
        extraTextures.fillExtraTextures(this.modelInstance);

        for (let i = 0; i < this.childObjects.length; i++)
            this.childObjects[i].setExtraTextures(extraTextures);
    }

    public setKyankoColors(colors: KyankoColors): void {
        settingTevStruct(this.modelInstance, this.lightTevColorType, colors);

        for (let i = 0; i < this.childObjects.length; i++)
            this.childObjects[i].setKyankoColors(colors);
    }

    public prepareToRender(device: GfxDevice, renderInstManager: GfxRenderInstManager, viewerInput: Viewer.ViewerRenderInput): void {
        if (!this.visible)
            return;

        if (this.parentJointMatrix !== null) {
            mat4.mul(this.modelInstance.modelMatrix, this.parentJointMatrix, this.modelMatrix);
        } else {
            mat4.copy(this.modelInstance.modelMatrix, this.modelMatrix);

            // Don't compute screen area culling on child meshes (don't want heads to disappear before bodies.)
            bboxScratch.transform(this.modelInstance.modelData.bbox, this.modelInstance.modelMatrix);
            computeScreenSpaceProjectionFromWorldSpaceAABB(screenProjection, viewerInput.camera, bboxScratch);

            if (screenProjection.getScreenArea() <= 0.0002)
                return;
        }

        const light = this.modelInstance.getGXLightReference(0);
        GX_Material.lightSetWorldPosition(light, viewerInput.camera, 250, 250, 250);
        GX_Material.lightSetWorldDirection(light, viewerInput.camera, -250, -250, -250);
        // Toon lighting works by setting the color to red.
        colorFromRGBA(light.Color, 1, 0, 0, 0);
        vec3.set(light.CosAtten, 1.075, 0, 0);
        vec3.set(light.DistAtten, 1.075, 0, 0);

        this.modelInstance.prepareToRender(device, renderInstManager, viewerInput);
        for (let i = 0; i < this.childObjects.length; i++)
            this.childObjects[i].prepareToRender(device, renderInstManager, viewerInput);
    }

    public destroy(device: GfxDevice): void {
        this.modelInstance.destroy(device);
        for (let i = 0; i < this.childObjects.length; i++)
            this.childObjects[i].destroy(device);
    }
}

export type SymbolData = { Filename: string, SymbolName: string, Data: ArrayBufferSlice };
export type SymbolMap = { SymbolData: SymbolData[] };

function findSymbol(symbolMap: SymbolMap, filename: string, symbolName: string): ArrayBufferSlice {
    const entry = assertExists(symbolMap.SymbolData.find((e) => e.Filename === filename && e.SymbolName === symbolName));
    return entry.Data;
}

export class SmallTreeData {
    public textureMapping = new TextureMapping();
    public textureData: BTIData;
    public shapeHelperMain: GXShapeHelperGfx;
    public gxMaterial: GX_Material.GXMaterial;
    public bufferCoalescer: GfxBufferCoalescerCombo;

    constructor(device: GfxDevice, symbolMap: SymbolMap, cache: GfxRenderCache) {
        const l_matDL = findSymbol(symbolMap, `d_tree.o`, `l_matDL`);
        const l_pos = findSymbol(symbolMap, `d_tree.o`, `l_pos`);
        const l_color = findSymbol(symbolMap, `d_tree.o`, `l_color`);
        const l_texCoord = findSymbol(symbolMap, `d_tree.o`, `l_texCoord`);
        const l_vtxAttrFmtList = findSymbol(symbolMap, 'd_tree.o', 'l_vtxAttrFmtList$4670');
        const l_vtxDescList = findSymbol(symbolMap, 'd_tree.o', 'l_vtxDescList$4669');

        const l_Oba_swood_noneDL = findSymbol(symbolMap, 'd_tree.o', 'l_Oba_swood_noneDL');
        const l_Oba_swood_a_cuttDL = findSymbol(symbolMap, 'd_tree.o', 'l_Oba_swood_a_cuttDL');
        const l_Oba_swood_a_cutuDL = findSymbol(symbolMap, 'd_tree.o', 'l_Oba_swood_a_cutuDL');
        const l_Oba_swood_a_hapaDL = findSymbol(symbolMap, 'd_tree.o', 'l_Oba_swood_a_hapaDL');
        const l_Oba_swood_a_mikiDL = findSymbol(symbolMap, 'd_tree.o', 'l_Oba_swood_a_mikiDL');

        const l_Txa_kage_32TEX = findSymbol(symbolMap, 'd_tree.o', 'l_Txa_kage_32TEX');
        const l_Txa_swood_aTEX = findSymbol(symbolMap, 'd_tree.o', 'l_Txa_swood_aTEX');

        const matRegisters = new DisplayListRegisters();
        displayListRegistersInitGX(matRegisters);
        displayListRegistersRun(matRegisters, l_matDL);

        const genMode = matRegisters.bp[GX.BPRegister.GEN_MODE_ID];
        const numTexGens = (genMode >>> 0) & 0x0F;
        const numTevs = ((genMode >>> 10) & 0x0F) + 1;
        const numInds = ((genMode >>> 16) & 0x07);

        const hw2cm: GX.CullMode[] = [ GX.CullMode.NONE, GX.CullMode.BACK, GX.CullMode.FRONT, GX.CullMode.ALL ];
        const cullMode = hw2cm[((genMode >>> 14)) & 0x03];

        this.gxMaterial = parseMaterialEntry(matRegisters, 0, 'l_matDL', numTexGens, numTevs, numInds);
        this.gxMaterial.cullMode = cullMode;

        const image0 = matRegisters.bp[GX.BPRegister.TX_SETIMAGE0_I0_ID];
        const width  = ((image0 >>>  0) & 0x3FF) + 1;
        const height = ((image0 >>> 10) & 0x3FF) + 1;
        const format: GX.TexFormat = (image0 >>> 20) & 0x0F;
        const mode0 = matRegisters.bp[GX.BPRegister.TX_SETMODE0_I0_ID];
        const wrapS: GX.WrapMode = (mode0 >>> 0) & 0x03;
        const wrapT: GX.WrapMode = (mode0 >>> 2) & 0x03;

        const texture: BTI_Texture = {
            name: 'l_Txa_swood_aTEX',
            width, height, format,
            data: l_Txa_swood_aTEX,
            // TODO(jstpierre): do we have mips?
            mipCount: 1,
            paletteFormat: GX.TexPalette.RGB565,
            paletteData: null,
            wrapS, wrapT,
            minFilter: GX.TexFilter.LINEAR, magFilter: GX.TexFilter.LINEAR,
            minLOD: 1, maxLOD: 1, lodBias: 0,
        };
        this.textureData = new BTIData(device, cache, texture);
        this.textureData.fillTextureMapping(this.textureMapping);

        function parseGxVtxAttrFmtV(buffer: ArrayBufferSlice) {
            const attrFmts = buffer.createTypedArray(Uint32Array, 0, buffer.byteLength / 4, Endianness.BIG_ENDIAN);
            const result: GX_VtxAttrFmt[] = [];
            for (let i = 0; attrFmts[i + 0] !== 255; i += 2) {
                const attr = attrFmts[i + 0];
                const cnt  = attrFmts[i + 1];
                const type = attrFmts[i + 2];
                const frac = attrFmts[i + 3];
                result[attr] = { compCnt: cnt, compShift: frac, compType: type };
            }
            return result;
        }

        function parseGxVtxDescList(buffer: ArrayBufferSlice) {
            const attrTypePairs = buffer.createTypedArray(Uint32Array, 0, buffer.byteLength / 4, Endianness.BIG_ENDIAN);
            const vtxDesc: GX_VtxDesc[] = [];
            for (let i = 0; attrTypePairs[i + 0] !== 255; i += 2) {
                const attr = attrTypePairs[i + 0];
                const type = attrTypePairs[i + 1];
                vtxDesc[attr] = { type };
            }
            return vtxDesc;
        }

        const vatFormat = parseGxVtxAttrFmtV(l_vtxAttrFmtList);
        const vcd = parseGxVtxDescList(l_vtxDescList);
        const vtxLoader = compileVtxLoader(vatFormat, vcd);
        
        const vtxArrays: GX_Array[] = [];
        vtxArrays[GX.Attr.POS]  = { buffer: l_pos, offs: 0, stride: getAttributeByteSize(vatFormat, GX.Attr.POS) };
        vtxArrays[GX.Attr.CLR0] = { buffer: l_color, offs: 0, stride: getAttributeByteSize(vatFormat, GX.Attr.CLR0) };
        vtxArrays[GX.Attr.TEX0] = { buffer: l_texCoord, offs: 0, stride: getAttributeByteSize(vatFormat, GX.Attr.TEX0) };
        
        // // const vtx_l_Oba_swood_noneDL = vtxLoader.runVertices(vtxArrays, l_Oba_swood_noneDL);
        const vtx_l_Oba_swood_a_hapaDL = vtxLoader.runVertices(vtxArrays, l_Oba_swood_a_hapaDL);
        const vtx_l_Oba_swood_a_mikiDL = vtxLoader.runVertices(vtxArrays, l_Oba_swood_a_mikiDL);
        // // const vtx_l_Oba_swood_a_cuttDL = vtxLoader.runVertices(vtxArrays, l_Oba_swood_a_cuttDL);
        // // const vtx_l_Oba_swood_a_cutuDL = vtxLoader.runVertices(vtxArrays, l_Oba_swood_a_cutuDL);

        // TODO(mikelester): light channels
        this.gxMaterial.lightChannels.push({
            colorChannel: { lightingEnabled: false, matColorSource: GX.ColorSrc.VTX, ambColorSource: GX.ColorSrc.REG, litMask: 0, attenuationFunction: GX.AttenuationFunction.NONE, diffuseFunction: GX.DiffuseFunction.NONE },
            alphaChannel: { lightingEnabled: false, matColorSource: GX.ColorSrc.VTX, ambColorSource: GX.ColorSrc.REG, litMask: 0, attenuationFunction: GX.AttenuationFunction.NONE, diffuseFunction: GX.DiffuseFunction.NONE },
        });

        this.bufferCoalescer = loadedDataCoalescerComboGfx(device, [ vtx_l_Oba_swood_a_mikiDL ]);
        this.shapeHelperMain = new GXShapeHelperGfx(device, cache, this.bufferCoalescer.coalescedBuffers[0], vtxLoader.loadedVertexLayout, vtx_l_Oba_swood_a_mikiDL);
    }

    public destroy(device: GfxDevice): void {
        this.bufferCoalescer.destroy(device);
        this.shapeHelperMain.destroy(device);
        this.textureData.destroy(device);
    }
}

export interface FlowerData {
    textureMapping: TextureMapping;
    shapeHelperMain: GXShapeHelperGfx;
    gxMaterial: GX_Material.GXMaterial;
    bufferCoalescer: GfxBufferCoalescerCombo;
    destroy(device: GfxDevice): void;
}

export class WhiteFlowerData {
    public textureMapping = new TextureMapping();
    public textureData: BTIData;
    public shapeHelperMain: GXShapeHelperGfx;
    public gxMaterial: GX_Material.GXMaterial;
    public bufferCoalescer: GfxBufferCoalescerCombo;

    constructor(device: GfxDevice, symbolMap: SymbolMap, cache: GfxRenderCache) {
        const l_matDL = findSymbol(symbolMap, `d_flower.o`, `l_matDL`);
        const l_Txo_ob_flower_white_64x64TEX = findSymbol(symbolMap, `d_flower.o`, `l_Txo_ob_flower_white_64x64TEX`);
        const l_pos = findSymbol(symbolMap, `d_flower.o`, `l_pos`);
        const l_texCoord = findSymbol(symbolMap, `d_flower.o`, `l_texCoord`);
        const l_OhanaDL = findSymbol(symbolMap, `d_flower.o`, `l_OhanaDL`);
        const l_color2 = findSymbol(symbolMap, `d_flower.o`, `l_color2`);

        const matRegisters = new DisplayListRegisters();
        displayListRegistersInitGX(matRegisters);
        displayListRegistersRun(matRegisters, l_matDL);

        const genMode = matRegisters.bp[GX.BPRegister.GEN_MODE_ID];
        const numTexGens = (genMode >>> 0) & 0x0F;
        const numTevs = ((genMode >>> 10) & 0x0F) + 1;
        const numInds = ((genMode >>> 16) & 0x07);

        const hw2cm: GX.CullMode[] = [ GX.CullMode.NONE, GX.CullMode.BACK, GX.CullMode.FRONT, GX.CullMode.ALL ];
        const cullMode = hw2cm[((genMode >>> 14)) & 0x03];

        this.gxMaterial = parseMaterialEntry(matRegisters, 0, 'l_matDL', numTexGens, numTevs, numInds);
        this.gxMaterial.cullMode = cullMode;

        const image0 = matRegisters.bp[GX.BPRegister.TX_SETIMAGE0_I0_ID];
        const width  = ((image0 >>>  0) & 0x3FF) + 1;
        const height = ((image0 >>> 10) & 0x3FF) + 1;
        const format: GX.TexFormat = (image0 >>> 20) & 0x0F;
        const mode0 = matRegisters.bp[GX.BPRegister.TX_SETMODE0_I0_ID];
        const wrapS: GX.WrapMode = (mode0 >>> 0) & 0x03;
        const wrapT: GX.WrapMode = (mode0 >>> 2) & 0x03;

        const texture: BTI_Texture = {
            name: 'l_Txo_ob_flower_white_64x64TEX',
            width, height, format,
            data: l_Txo_ob_flower_white_64x64TEX,
            // TODO(jstpierre): do we have mips?
            mipCount: 1,
            paletteFormat: GX.TexPalette.RGB565,
            paletteData: null,
            wrapS, wrapT,
            minFilter: GX.TexFilter.LINEAR, magFilter: GX.TexFilter.LINEAR,
            minLOD: 1, maxLOD: 1, lodBias: 0,
        };
        this.textureData = new BTIData(device, cache, texture);
        this.textureData.fillTextureMapping(this.textureMapping);

        const vatFormat: GX_VtxAttrFmt[] = [];
        vatFormat[GX.Attr.POS] = { compCnt: GX.CompCnt.POS_XYZ, compShift: 0, compType: GX.CompType.F32 };
        vatFormat[GX.Attr.TEX0] = { compCnt: GX.CompCnt.TEX_ST, compShift: 0, compType: GX.CompType.F32 };
        vatFormat[GX.Attr.CLR0] = { compCnt: GX.CompCnt.CLR_RGBA, compShift: 0, compType: GX.CompType.RGBA8 };
        const vtxArrays: GX_Array[] = [];
        vtxArrays[GX.Attr.POS]  = { buffer: l_pos, offs: 0, stride: getAttributeByteSize(vatFormat, GX.Attr.POS) };
        vtxArrays[GX.Attr.CLR0] = { buffer: l_color2, offs: 0, stride: getAttributeByteSize(vatFormat, GX.Attr.CLR0) };
        vtxArrays[GX.Attr.TEX0] = { buffer: l_texCoord, offs: 0, stride: getAttributeByteSize(vatFormat, GX.Attr.TEX0) };
        const vcd: GX_VtxDesc[] = [];
        vcd[GX.Attr.POS] = { type: GX.AttrType.INDEX8 };
        vcd[GX.Attr.CLR0] = { type: GX.AttrType.INDEX8 };
        vcd[GX.Attr.TEX0] = { type: GX.AttrType.INDEX8 };
        const vtxLoader = compileVtxLoader(vatFormat, vcd);

        const vtx_l_OhanaDL = vtxLoader.runVertices(vtxArrays, l_OhanaDL);

        // TODO(jstpierre): light channels
        this.gxMaterial.lightChannels.push({
            colorChannel: { lightingEnabled: false, matColorSource: GX.ColorSrc.VTX, ambColorSource: GX.ColorSrc.REG, litMask: 0, attenuationFunction: GX.AttenuationFunction.NONE, diffuseFunction: GX.DiffuseFunction.NONE },
            alphaChannel: { lightingEnabled: false, matColorSource: GX.ColorSrc.VTX, ambColorSource: GX.ColorSrc.REG, litMask: 0, attenuationFunction: GX.AttenuationFunction.NONE, diffuseFunction: GX.DiffuseFunction.NONE },
        });

        this.bufferCoalescer = loadedDataCoalescerComboGfx(device, [ vtx_l_OhanaDL ]);
        this.shapeHelperMain = new GXShapeHelperGfx(device, cache, this.bufferCoalescer.coalescedBuffers[0], vtxLoader.loadedVertexLayout, vtx_l_OhanaDL);
    }

    public destroy(device: GfxDevice): void {
        this.bufferCoalescer.destroy(device);
        this.shapeHelperMain.destroy(device);
        this.textureData.destroy(device);
    }
}

export class PinkFlowerData {
    public textureMapping = new TextureMapping();
    public textureData: BTIData;
    public shapeHelperMain: GXShapeHelperGfx;
    public gxMaterial: GX_Material.GXMaterial;
    public bufferCoalescer: GfxBufferCoalescerCombo;

    constructor(device: GfxDevice, symbolMap: SymbolMap, cache: GfxRenderCache) {
        const l_matDL2 = findSymbol(symbolMap, `d_flower.o`, `l_matDL2`);
        const l_Txo_ob_flower_pink_64x64TEX = findSymbol(symbolMap, `d_flower.o`, `l_Txo_ob_flower_pink_64x64TEX`);
        const l_pos2 = findSymbol(symbolMap, `d_flower.o`, `l_pos2`);
        const l_texCoord2 = findSymbol(symbolMap, `d_flower.o`, `l_texCoord2`);
        const l_Ohana_highDL = findSymbol(symbolMap, `d_flower.o`, `l_Ohana_highDL`);
        const l_color2 = findSymbol(symbolMap, `d_flower.o`, `l_color2`);

        const matRegisters = new DisplayListRegisters();
        displayListRegistersInitGX(matRegisters);
        displayListRegistersRun(matRegisters, l_matDL2);

        const genMode = matRegisters.bp[GX.BPRegister.GEN_MODE_ID];
        const numTexGens = (genMode >>> 0) & 0x0F;
        const numTevs = ((genMode >>> 10) & 0x0F) + 1;
        const numInds = ((genMode >>> 16) & 0x07);

        const hw2cm: GX.CullMode[] = [ GX.CullMode.NONE, GX.CullMode.BACK, GX.CullMode.FRONT, GX.CullMode.ALL ];
        const cullMode = hw2cm[((genMode >>> 14)) & 0x03];

        this.gxMaterial = parseMaterialEntry(matRegisters, 0, 'l_matDL', numTexGens, numTevs, numInds);
        this.gxMaterial.cullMode = cullMode;

        const image0 = matRegisters.bp[GX.BPRegister.TX_SETIMAGE0_I0_ID];
        const width  = ((image0 >>>  0) & 0x3FF) + 1;
        const height = ((image0 >>> 10) & 0x3FF) + 1;
        const format: GX.TexFormat = (image0 >>> 20) & 0x0F;
        const mode0 = matRegisters.bp[GX.BPRegister.TX_SETMODE0_I0_ID];
        const wrapS: GX.WrapMode = (mode0 >>> 0) & 0x03;
        const wrapT: GX.WrapMode = (mode0 >>> 2) & 0x03;

        const texture: BTI_Texture = {
            name: 'l_Txo_ob_flower_pink_64x64TEX',
            width, height, format,
            data: l_Txo_ob_flower_pink_64x64TEX,
            // TODO(jstpierre): do we have mips?
            mipCount: 1,
            paletteFormat: GX.TexPalette.RGB565,
            paletteData: null,
            wrapS, wrapT,
            minFilter: GX.TexFilter.LINEAR, magFilter: GX.TexFilter.LINEAR,
            minLOD: 1, maxLOD: 1, lodBias: 0,
        };
        this.textureData = new BTIData(device, cache, texture);
        this.textureData.fillTextureMapping(this.textureMapping);

        const vatFormat: GX_VtxAttrFmt[] = [];
        vatFormat[GX.Attr.POS] = { compCnt: GX.CompCnt.POS_XYZ, compShift: 0, compType: GX.CompType.F32 };
        vatFormat[GX.Attr.TEX0] = { compCnt: GX.CompCnt.TEX_ST, compShift: 0, compType: GX.CompType.F32 };
        vatFormat[GX.Attr.CLR0] = { compCnt: GX.CompCnt.CLR_RGBA, compShift: 0, compType: GX.CompType.RGBA8 };
        const vtxArrays: GX_Array[] = [];
        vtxArrays[GX.Attr.POS]  = { buffer: l_pos2, offs: 0, stride: getAttributeByteSize(vatFormat, GX.Attr.POS) };
        vtxArrays[GX.Attr.CLR0] = { buffer: l_color2, offs: 0, stride: getAttributeByteSize(vatFormat, GX.Attr.CLR0) };
        vtxArrays[GX.Attr.TEX0] = { buffer: l_texCoord2, offs: 0, stride: getAttributeByteSize(vatFormat, GX.Attr.TEX0) };
        const vcd: GX_VtxDesc[] = [];
        vcd[GX.Attr.POS] = { type: GX.AttrType.INDEX8 };
        vcd[GX.Attr.CLR0] = { type: GX.AttrType.INDEX8 };
        vcd[GX.Attr.TEX0] = { type: GX.AttrType.INDEX8 };
        const vtxLoader = compileVtxLoader(vatFormat, vcd);

        const vtx_l_OhanaDL = vtxLoader.runVertices(vtxArrays, l_Ohana_highDL);

        // TODO(jstpierre): light channels
        this.gxMaterial.lightChannels.push({
            colorChannel: { lightingEnabled: false, matColorSource: GX.ColorSrc.VTX, ambColorSource: GX.ColorSrc.REG, litMask: 0, attenuationFunction: GX.AttenuationFunction.NONE, diffuseFunction: GX.DiffuseFunction.NONE },
            alphaChannel: { lightingEnabled: false, matColorSource: GX.ColorSrc.VTX, ambColorSource: GX.ColorSrc.REG, litMask: 0, attenuationFunction: GX.AttenuationFunction.NONE, diffuseFunction: GX.DiffuseFunction.NONE },
        });

        this.bufferCoalescer = loadedDataCoalescerComboGfx(device, [ vtx_l_OhanaDL ]);
        this.shapeHelperMain = new GXShapeHelperGfx(device, cache, this.bufferCoalescer.coalescedBuffers[0], vtxLoader.loadedVertexLayout, vtx_l_OhanaDL);
    }

    public destroy(device: GfxDevice): void {
        this.bufferCoalescer.destroy(device);
        this.shapeHelperMain.destroy(device);
        this.textureData.destroy(device);
    }
}

export class BessouFlowerData {
    public textureMapping = new TextureMapping();
    public textureData: BTIData;
    public shapeHelperMain: GXShapeHelperGfx;
    public gxMaterial: GX_Material.GXMaterial;
    public bufferCoalescer: GfxBufferCoalescerCombo;

    constructor(device: GfxDevice, symbolMap: SymbolMap, cache: GfxRenderCache) {
        const l_matDL3 = findSymbol(symbolMap, `d_flower.o`, `l_matDL3`);
        const l_Txq_bessou_hanaTEX = findSymbol(symbolMap, `d_flower.o`, `l_Txq_bessou_hanaTEX`);
        const l_pos3 = findSymbol(symbolMap, `d_flower.o`, `l_pos3`);
        const l_texCoord3 = findSymbol(symbolMap, `d_flower.o`, `l_texCoord3`);
        const l_QbsfwDL = findSymbol(symbolMap, `d_flower.o`, `l_QbsfwDL`);
        const l_color2 = findSymbol(symbolMap, `d_flower.o`, `l_color2`);

        const matRegisters = new DisplayListRegisters();
        displayListRegistersInitGX(matRegisters);
        displayListRegistersRun(matRegisters, l_matDL3);

        const genMode = matRegisters.bp[GX.BPRegister.GEN_MODE_ID];
        const numTexGens = (genMode >>> 0) & 0x0F;
        const numTevs = ((genMode >>> 10) & 0x0F) + 1;
        const numInds = ((genMode >>> 16) & 0x07);

        const hw2cm: GX.CullMode[] = [ GX.CullMode.NONE, GX.CullMode.BACK, GX.CullMode.FRONT, GX.CullMode.ALL ];
        const cullMode = hw2cm[((genMode >>> 14)) & 0x03];

        this.gxMaterial = parseMaterialEntry(matRegisters, 0, 'l_matDL', numTexGens, numTevs, numInds);
        this.gxMaterial.cullMode = cullMode;

        const image0 = matRegisters.bp[GX.BPRegister.TX_SETIMAGE0_I0_ID];
        const width  = ((image0 >>>  0) & 0x3FF) + 1;
        const height = ((image0 >>> 10) & 0x3FF) + 1;
        const format: GX.TexFormat = (image0 >>> 20) & 0x0F;
        const mode0 = matRegisters.bp[GX.BPRegister.TX_SETMODE0_I0_ID];
        const wrapS: GX.WrapMode = (mode0 >>> 0) & 0x03;
        const wrapT: GX.WrapMode = (mode0 >>> 2) & 0x03;

        const texture: BTI_Texture = {
            name: 'l_Txq_bessou_hanaTEX',
            width, height, format,
            data: l_Txq_bessou_hanaTEX,
            // TODO(jstpierre): do we have mips?
            mipCount: 1,
            paletteFormat: GX.TexPalette.RGB565,
            paletteData: null,
            wrapS, wrapT,
            minFilter: GX.TexFilter.LINEAR, magFilter: GX.TexFilter.LINEAR,
            minLOD: 1, maxLOD: 1, lodBias: 0,
        };
        this.textureData = new BTIData(device, cache, texture);
        this.textureData.fillTextureMapping(this.textureMapping);

        const vatFormat: GX_VtxAttrFmt[] = [];
        vatFormat[GX.Attr.POS] = { compCnt: GX.CompCnt.POS_XYZ, compShift: 0, compType: GX.CompType.F32 };
        vatFormat[GX.Attr.TEX0] = { compCnt: GX.CompCnt.TEX_ST, compShift: 0, compType: GX.CompType.F32 };
        vatFormat[GX.Attr.CLR0] = { compCnt: GX.CompCnt.CLR_RGBA, compShift: 0, compType: GX.CompType.RGBA8 };
        const vtxArrays: GX_Array[] = [];
        vtxArrays[GX.Attr.POS]  = { buffer: l_pos3, offs: 0, stride: getAttributeByteSize(vatFormat, GX.Attr.POS) };
        vtxArrays[GX.Attr.CLR0] = { buffer: l_color2, offs: 0, stride: getAttributeByteSize(vatFormat, GX.Attr.CLR0) };
        vtxArrays[GX.Attr.TEX0] = { buffer: l_texCoord3, offs: 0, stride: getAttributeByteSize(vatFormat, GX.Attr.TEX0) };
        const vcd: GX_VtxDesc[] = [];
        vcd[GX.Attr.POS] = { type: GX.AttrType.INDEX8 };
        vcd[GX.Attr.CLR0] = { type: GX.AttrType.INDEX8 };
        vcd[GX.Attr.TEX0] = { type: GX.AttrType.INDEX8 };
        const vtxLoader = compileVtxLoader(vatFormat, vcd);

        const vtx_l_OhanaDL = vtxLoader.runVertices(vtxArrays, l_QbsfwDL);

        // TODO(jstpierre): light channels
        this.gxMaterial.lightChannels.push({
            colorChannel: { lightingEnabled: false, matColorSource: GX.ColorSrc.VTX, ambColorSource: GX.ColorSrc.REG, litMask: 0, attenuationFunction: GX.AttenuationFunction.NONE, diffuseFunction: GX.DiffuseFunction.NONE },
            alphaChannel: { lightingEnabled: false, matColorSource: GX.ColorSrc.VTX, ambColorSource: GX.ColorSrc.REG, litMask: 0, attenuationFunction: GX.AttenuationFunction.NONE, diffuseFunction: GX.DiffuseFunction.NONE },
        });

        this.bufferCoalescer = loadedDataCoalescerComboGfx(device, [ vtx_l_OhanaDL ]);
        this.shapeHelperMain = new GXShapeHelperGfx(device, cache, this.bufferCoalescer.coalescedBuffers[0], vtxLoader.loadedVertexLayout, vtx_l_OhanaDL);
    }

    public destroy(device: GfxDevice): void {
        this.bufferCoalescer.destroy(device);
        this.shapeHelperMain.destroy(device);
        this.textureData.destroy(device);
    }
}

const packetParams = new PacketParams();
const materialParams = new MaterialParams();
const scratchVec3a = vec3.create();
const scratchVec3b = vec3.create();
export class FlowerObjectRenderer implements ObjectRenderer {
    public modelMatrix = mat4.create();
    public visible = true;
    public layer: number;

    private materialHelper: GXMaterialHelperGfx;
    private c0 = colorNewCopy(White);
    private k0 = colorNewCopy(White);

    constructor(private flowerData: FlowerData) {
        this.materialHelper = new GXMaterialHelperGfx(this.flowerData.gxMaterial);
    }

    public setVertexColorsEnabled(v: boolean): void {
    }

    public setTexturesEnabled(v: boolean): void {
    }

    public prepareToRender(device: GfxDevice, renderInstManager: GfxRenderInstManager, viewerInput: Viewer.ViewerRenderInput): void {
        if (!this.visible)
            return;

        // Do some basic distance culling.
        mat4.getTranslation(scratchVec3a, viewerInput.camera.worldMatrix);
        mat4.getTranslation(scratchVec3b, this.modelMatrix);

        // If we're too far, just kill us entirely.
        const distSq = vec3.squaredDistance(scratchVec3a, scratchVec3b);
        const maxDist = 5000;
        const maxDistSq = maxDist*maxDist;
        if (distSq >= maxDistSq)
            return;

        materialParams.m_TextureMapping[0].copy(this.flowerData.textureMapping);
        colorCopy(materialParams.u_Color[ColorKind.C0], this.c0);
        colorCopy(materialParams.u_Color[ColorKind.C1], this.k0);

        const renderInst = this.flowerData.shapeHelperMain.pushRenderInst(renderInstManager);

        const materialParamsOffs = renderInst.allocateUniformBuffer(ub_MaterialParams, this.materialHelper.materialParamsBufferSize);
        this.materialHelper.fillMaterialParamsDataOnInst(renderInst, materialParamsOffs, materialParams);
        this.materialHelper.setOnRenderInst(device, renderInstManager.gfxRenderCache, renderInst);
        renderInst.setSamplerBindingsFromTextureMappings(materialParams.m_TextureMapping);

        const m = packetParams.u_PosMtx[0];
        computeViewMatrix(m, viewerInput.camera);
        mat4.mul(m, m, this.modelMatrix);
        this.flowerData.shapeHelperMain.fillPacketParams(packetParams, renderInst);
    }

    public setKyankoColors(colors: KyankoColors): void {
        colorCopy(this.c0, colors.actorC0);
        colorCopy(this.k0, colors.actorK0);
    }

    public setExtraTextures(extraTextures: ZWWExtraTextures): void {
    }

    public destroy(device: GfxDevice): void {
    }
}

export class TreeObjectRenderer implements ObjectRenderer {
    public modelMatrix = mat4.create();
    public visible = true;
    public layer: number;

    private materialHelper: GXMaterialHelperGfx;
    private c0 = colorNewCopy(White);
    private k0 = colorNewCopy(White);

    constructor(private flowerData: FlowerData) {
        this.materialHelper = new GXMaterialHelperGfx(this.flowerData.gxMaterial);
    }

    public setVertexColorsEnabled(v: boolean): void {
    }

    public setTexturesEnabled(v: boolean): void {
    }

    public prepareToRender(device: GfxDevice, renderInstManager: GfxRenderInstManager, viewerInput: Viewer.ViewerRenderInput): void {
        if (!this.visible)
            return;

        // Do some basic distance culling.
        mat4.getTranslation(scratchVec3a, viewerInput.camera.worldMatrix);
        mat4.getTranslation(scratchVec3b, this.modelMatrix);

        // If we're too far, just kill us entirely.
        const distSq = vec3.squaredDistance(scratchVec3a, scratchVec3b);
        const maxDist = 5000;
        const maxDistSq = maxDist*maxDist;
        if (distSq >= maxDistSq)
            return;

        materialParams.m_TextureMapping[0].copy(this.flowerData.textureMapping);
        colorCopy(materialParams.u_Color[ColorKind.C0], this.c0);
        colorCopy(materialParams.u_Color[ColorKind.C1], this.k0);

        // Set the tree alpha. This fades after the tree is cut. This is multiplied with the texture alpha at the end of TEV stage 1.
        colorFromRGBA(materialParams.u_Color[ColorKind.C2], 0, 0, 0, 1);

        const renderInst = this.flowerData.shapeHelperMain.pushRenderInst(renderInstManager);

        const materialParamsOffs = renderInst.allocateUniformBuffer(ub_MaterialParams, this.materialHelper.materialParamsBufferSize);
        this.materialHelper.fillMaterialParamsDataOnInst(renderInst, materialParamsOffs, materialParams);
        this.materialHelper.setOnRenderInst(device, renderInstManager.gfxRenderCache, renderInst);
        renderInst.setSamplerBindingsFromTextureMappings(materialParams.m_TextureMapping);

        const m = packetParams.u_PosMtx[0];
        computeViewMatrix(m, viewerInput.camera);
        mat4.mul(m, m, this.modelMatrix);
        this.flowerData.shapeHelperMain.fillPacketParams(packetParams, renderInst);
    }

    public setKyankoColors(colors: KyankoColors): void {
        colorCopy(this.c0, colors.actorC0);
        colorCopy(this.k0, colors.actorK0);
    }

    public setExtraTextures(extraTextures: ZWWExtraTextures): void {
    }

    public destroy(device: GfxDevice): void {
    }
}
