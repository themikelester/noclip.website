
import { fopAc_ac_c, cPhs__Status, fGlobals, fpcPf__Register, fpc__ProcessName, fpc_bs__Constructor } from "./framework";
import { dGlobals } from "./zww_scenes";
import { vec3, mat4, quat } from "gl-matrix";
import { dComIfG_resLoad, ResType } from "./d_resorce";
import { J3DModelInstance, J3DModelData, buildEnvMtx } from "../Common/JSYSTEM/J3D/J3DGraphBase";
import { GfxRenderInstManager } from "../gfx/render/GfxRenderer";
import { ViewerRenderInput } from "../viewer";
import { settingTevStruct, LightType, setLightTevColorType, LIGHT_INFLUENCE, dKy_plight_set, dKy_plight_cut, dKy_tevstr_c, dKy_tevstr_init, dKy_checkEventNightStop, dKy_change_colpat, dKy_setLight__OnModelInstance, WAVE_INFLUENCE, dKy__waveinfl_cut, dKy__waveinfl_set } from "./d_kankyo";
import { mDoExt_modelUpdateDL, mDoExt_btkAnm, mDoExt_brkAnm, mDoExt_bckAnm } from "./m_do_ext";
import { JPABaseEmitter } from "../Common/JSYSTEM/JPA";
import { cLib_addCalc2, cLib_addCalc, cLib_addCalcAngleRad2, cM_rndFX } from "./SComponent";
import { dStage_Multi_c } from "./d_stage";
import { nArray, assertExists } from "../util";
import { TTK1, LoopMode, TRK1, TexMtx } from "../Common/JSYSTEM/J3D/J3DLoader";
import { colorCopy, colorNewCopy, TransparentBlack } from "../Color";
import { dKyw_rain_set, ThunderMode, dKyw_get_wind_vec, dKyw_get_wind_pow, dKyr_get_vectle_calc } from "./d_kankyo_wether";
import { ColorKind } from "../gx/gx_render";
import { d_a_sea } from "./d_a_sea";
import { saturate, Vec3UnitY, Vec3Zero, computeModelMatrixS, computeMatrixWithoutTranslation } from "../MathHelpers";
import { dBgW, cBgW_Flags } from "./d_bg";

// Framework'd actors

const kUshortTo2PI = Math.PI / 0x7FFF;

export function mDoMtx_XrotM(dst: mat4, n: number): void {
    mat4.rotateX(dst, dst, n * kUshortTo2PI);
}

export function mDoMtx_YrotS(dst: mat4, n: number): void {
    mat4.identity(dst);
    mat4.rotateY(dst, dst, n * kUshortTo2PI);
}

export function mDoMtx_YrotM(dst: mat4, n: number): void {
    mat4.rotateY(dst, dst, n * kUshortTo2PI);
}

export function mDoMtx_ZrotM(dst: mat4, n: number): void {
    mat4.rotateZ(dst, dst, n * kUshortTo2PI);
}

export function mDoMtx_ZYXrotM(dst: mat4, v: vec3): void {
    mat4.rotateZ(dst, dst, v[2] * kUshortTo2PI);
    mat4.rotateY(dst, dst, v[1] * kUshortTo2PI);
    mat4.rotateZ(dst, dst, v[0] * kUshortTo2PI);
}

export const calc_mtx = mat4.create();

export function MtxTrans(pos: vec3, concat: boolean, m: mat4 = calc_mtx): void {
    if (concat) {
        mat4.translate(m, m, pos);
    } else {
        mat4.fromTranslation(m, pos);
    }
}

export function MtxPosition(dst: vec3, src: vec3 = dst, m: mat4 = calc_mtx): void {
    vec3.transformMat4(dst, src, m);
}

export function quatM(q: quat, dst = calc_mtx, scratch = scratchMat4a): void {
    mat4.fromQuat(scratch, q);
    mat4.mul(dst, dst, scratch);
}

const scratchMat4a = mat4.create();
const scratchVec3a = vec3.create();
const scratchVec3b = vec3.create();

class d_a_grass extends fopAc_ac_c {
    public static PROCESS_NAME = fpc__ProcessName.d_a_grass;

    static kSpawnPatterns = [
        { group: 0, count: 1 },
        { group: 0, count: 7 },
        { group: 1, count: 15 },
        { group: 2, count: 3 },
        { group: 3, count: 7 },
        { group: 4, count: 11 },
        { group: 5, count: 7 },
        { group: 6, count: 5 },
    ];
    
    static kSpawnOffsets = [
        [
            [0, 0, 0],
            [3, 0, -50],
            [-2, 0, 50],
            [50, 0, 27],
            [52, 0, -25],
            [-50, 0, 22],
            [-50, 0, -29],
        ],
        [
            [-18, 0, 76],
            [-15, 0, 26],
            [133, 0, 0],
            [80, 0, 23],
            [86, 0, -83],
            [33, 0, -56],
            [83, 0, -27],
            [-120, 0, -26],
            [-18, 0, -65],
            [-20, 0, -21],
            [-73, 0, 1],
            [-67, 0, -102],
            [-21, 0, 126],
            [-120, 0, -78],
            [-70, 0, -49],
            [32, 0, 103],
            [34, 0, 51],
            [-72, 0, 98],
            [-68, 0, 47],
            [33, 0, -5],
            [135, 0, -53],
        ],
        [
            [-75, 0, -50],
            [75, 0, -25],
            [14, 0, 106],
        ],
        [
            [-24, 0, -28],
            [27, 0, -28],
            [-21, 0, 33],
            [-18, 0, -34],
            [44, 0, -4],
            [41, 0, 10],
            [24, 0, 39],
        ],
        [
            [-55, 0, -22],
            [-28, 0, -50],
            [-77, 0, 11],
            [55, 0, -44],
            [83, 0, -71],
            [11, 0, -48],
            [97, 0, -34],
            [-74, 0, -57],
            [31, 0, 58],
            [59, 0, 30],
            [13, 0, 23],
            [-12, 0, 54],
            [55, 0, 97],
            [10, 0, 92],
            [33, 0, -10],
            [-99, 0, -27],
            [40, 0, -87],
        ],
        [
            [0, 0, 3],
            [-26, 0, -29],
            [7, 0, -25],
            [31, 0, -5],
            [-7, 0, 40],
            [-35, 0, 15],
            [23, 0, 32],
        ],
        [
            [-40, 0, 0],
            [0, 0, 0],
            [80, 0, 0],
            [-80, 0, 0],
            [40, 0, 0],
        ]
    ];

    public subload(globals: dGlobals): cPhs__Status {
        const enum FoliageType {
            Grass,
            Tree,
            WhiteFlower,
            PinkFlower
        };

        const spawnPatternId = (this.parameters & 0x00F) >> 0;
        const type: FoliageType = (this.parameters & 0x030) >> 4;
        const itemIdx = (this.parameters >> 6) & 0x3f; // Determines which item spawns when this is cut down

        const pattern = d_a_grass.kSpawnPatterns[spawnPatternId];
        const offsets = d_a_grass.kSpawnOffsets[pattern.group];
        const count = pattern.count;

        switch (type) {
            case FoliageType.Grass:
                for (let j = 0; j < count; j++) {
                    // @NOTE: Grass does not observe actor rotation or scale
                    const offset = vec3.set(scratchVec3a, offsets[j][0], offsets[j][1], offsets[j][2]);
                    const pos = vec3.add(scratchVec3a, offset, this.pos);
                    globals.scnPlay.grassPacket.newData(pos, this.roomNo, itemIdx);
                }
            break;

            case FoliageType.Tree:
                const rotation = mat4.fromYRotation(scratchMat4a, this.rot[1] / 0x7FFF * Math.PI);

                for (let j = 0; j < count; j++) {
                    const offset = vec3.transformMat4(scratchVec3a, offsets[j], rotation);
                    const pos = vec3.add(scratchVec3b, offset, this.pos);
                    globals.scnPlay.treePacket.newData(pos, 0, this.roomNo);
                }
            break;

            case FoliageType.WhiteFlower:
            case FoliageType.PinkFlower:
                for (let j = 0; j < count; j++) {
                    const isPink = (type === FoliageType.PinkFlower);

                    // @NOTE: Flowers do not observe actor rotation or scale
                    const offset = vec3.set(scratchVec3a, offsets[j][0], offsets[j][1], offsets[j][2]);
                    const pos = vec3.add(scratchVec3a, offset, this.pos);
                    globals.scnPlay.flowerPacket.newData(globals, pos, isPink, this.roomNo, itemIdx);
                }
            break;
            default:
                console.warn('Unknown grass actor type');
        }

        return cPhs__Status.Next;
    }
}

// -------------------------------------------------------
// Bushes
// -------------------------------------------------------
class d_a_obj_wood extends fopAc_ac_c {
    public static PROCESS_NAME = fpc__ProcessName.d_a_obj_wood;

    public subload(globals: dGlobals): cPhs__Status {

        globals.scnPlay.bushPacket.newData(this.pos, this.roomNo);

        return cPhs__Status.Next;
    }
}

// TODO(jstpierre): Bad hack
export function createEmitter(globals: dGlobals, resourceId: number): JPABaseEmitter {
    const renderer = globals.renderer;
    const emitter = renderer.effectSystem!.createBaseEmitter(renderer.device, renderer.renderCache, resourceId);
    return emitter;
}

// -------------------------------------------------------
// Generic Torch
// -------------------------------------------------------
class d_a_ep extends fopAc_ac_c {
    public static PROCESS_NAME = fpc__ProcessName.d_a_ep;

    private type: number;
    private hasGa: boolean;
    private hasObm: boolean;
    private model: J3DModelInstance;
    private posTop = vec3.create();
    private light = new LIGHT_INFLUENCE();
    private state: number = 0;
    private lightPower: number = 0.0;
    private lightPowerTarget: number = 0.0;

    public subload(globals: dGlobals): cPhs__Status {
        const status = dComIfG_resLoad(globals, `Ep`);
        if (status !== cPhs__Status.Complete)
            return status;

        this.hasGa = !!((this.parameters >>> 6) & 0x01);
        this.hasObm = !!((this.parameters >>> 7) & 0x01);
        this.type = (this.parameters & 0x3F);
        if (this.type === 0x3F)
            this.type = 0;

        if (this.type === 0 || this.type === 3) {
            this.model = new J3DModelInstance(globals.resCtrl.getObjectRes(ResType.Model, `Ep`, this.hasObm ? 0x04 : 0x05));
        }

        this.CreateInit();

        dKy_plight_set(globals.g_env_light, this.light);

        // Create particle systems.

        // TODO(jstpierre): Implement the real thing.
        const pa = createEmitter(globals, 0x0001);
        vec3.copy(pa.globalTranslation, this.posTop);
        pa.globalTranslation[1] += -240 + 235 + 15;
        if (this.type !== 2) {
            const pb = createEmitter(globals, 0x4004);
            vec3.copy(pb.globalTranslation, pa.globalTranslation);
            pb.globalTranslation[1] += 20;
        }
        const pc = createEmitter(globals, 0x01EA);
        vec3.copy(pc.globalTranslation, this.posTop);
        pc.globalTranslation[1] += -240 + 235 + 8;
        // TODO(jstpierre): ga

        return cPhs__Status.Next;
    }

    public draw(globals: dGlobals, renderInstManager: GfxRenderInstManager, viewerInput: ViewerRenderInput): void {
        if (this.type === 0 || this.type === 3) {
            settingTevStruct(globals, LightType.BG0, this.pos, this.tevStr);
            setLightTevColorType(globals, this.model, this.tevStr, viewerInput.camera);
            mDoExt_modelUpdateDL(globals, this.model, renderInstManager, viewerInput);
        }
    }

    public execute(globals: dGlobals): void {
        if (this.type === 0 || this.type === 3) {
            if (this.hasGa)
                this.ga_move();
        }

        this.ep_move();
    }

    public delete(globals: dGlobals): void {
        dKy_plight_cut(globals.g_env_light, this.light);
    }

    private CreateInit(): void {
        this.daEp_set_mtx();
    }

    private daEp_set_mtx(): void {
        if (this.type === 0 || this.type === 3) {
            MtxTrans(this.pos, false);
            mDoMtx_YrotM(calc_mtx, this.rot[1]);
            mDoMtx_XrotM(calc_mtx, this.rot[0]);
            mDoMtx_ZrotM(calc_mtx, this.rot[2]);
            mat4.copy(this.model.modelMatrix, calc_mtx);
            vec3.set(this.posTop, 0, 140, 0);
            MtxPosition(this.posTop);
        } else {
            vec3.copy(this.posTop, this.pos);
        }
    }

    private ga_move(): void {
        // TODO(jstpierre): ga
    }

    private ep_move(): void {
        // tons of fun timers and such
        if (this.state === 0) {
            // check switches
            this.state = 3;
            this.lightPowerTarget = this.scale[0];
        } else if (this.state === 3 || this.state === 4) {
            this.lightPower = cLib_addCalc2(this.lightPower, this.lightPowerTarget, 0.5, 0.2);
            if (this.type !== 2) {
                // check a bunch of stuff, collision, etc.
                // setSimple 0x4004
            }
        }

        vec3.copy(this.light.pos, this.posTop);
        this.light.color.r = 600 / 0xFF;
        this.light.color.g = 400 / 0xFF;
        this.light.color.b = 120 / 0xFF;
        this.light.power = this.lightPower * 150.0;
        this.light.fluctuation = 250.0;

        // other emitter stuff
    }
}

export function dComIfGp_getMapTrans(globals: dGlobals, roomNo: number): dStage_Multi_c | null {
    for (let i = 0; i < globals.dStage_dt.mult.length; i++)
        if (globals.dStage_dt.mult[i].roomNo === roomNo)
            return globals.dStage_dt.mult[i];
    return null;
}

class daBg_btkAnm_c {
    public anm = new mDoExt_btkAnm();
    private isSC_01: boolean = false;

    constructor(modelData: J3DModelData, anmData: TTK1) {
        this.anm.init(modelData, anmData, true, LoopMode.REPEAT);
    }

    public entry(modelInstance: J3DModelInstance): void {
        this.anm.entry(modelInstance);
        // this.isSC_01 = modelData.bmd.mat3.materialEntries[0].name.startsWith('SC_01');
    }

    public play(deltaTimeFrames: number): void {
        if (this.isSC_01) {
            // Sync to SE timer.
            this.anm.play(deltaTimeFrames);
        } else {
            this.anm.play(deltaTimeFrames);
        }
    }
}

class daBg_brkAnm_c {
    public anm = new mDoExt_brkAnm();

    constructor(modelData: J3DModelData, anmData: TRK1) {
        this.anm.init(modelData, anmData, true, LoopMode.REPEAT);
    }

    public entry(modelInstance: J3DModelInstance): void {
        this.anm.entry(modelInstance);
    }

    public play(deltaTimeFrames: number): void {
        this.anm.play(deltaTimeFrames);
    }
}

class d_a_bg extends fopAc_ac_c {
    public static PROCESS_NAME = fpc__ProcessName.d_a_bg;

    private numBg = 4;
    private bgModel: (J3DModelInstance | null)[] = nArray(this.numBg, () => null);
    private bgBtkAnm: (daBg_btkAnm_c | null)[] = nArray(this.numBg, () => null);
    private bgBrkAnm: (daBg_brkAnm_c | null)[] = nArray(this.numBg, () => null);
    private bgTevStr: (dKy_tevstr_c | null)[] = nArray(this.numBg, () => null);
    private bgW = new dBgW();

    public subload(globals: dGlobals): cPhs__Status {
        const resCtrl = globals.resCtrl;

        const roomNo = this.parameters;
        const arcName = `Room` + roomNo;

        const modelName  = ['model.bmd', 'model1.bmd', 'model2.bmd', 'model3.bmd'];
        const modelName2 = ['model.bdl', 'model1.bdl', 'model2.bdl', 'model3.bdl'];
        const btkName    = ['model.btk', 'model1.btk', 'model2.btk', 'model3.btk'];
        const brkName    = ['model.brk', 'model1.brk', 'model2.brk', 'model3.brk'];

        // createHeap
        for (let i = 0; i < this.numBg; i++) {
            let modelData = resCtrl.getStageResByName(ResType.Model, arcName, modelName[i]);
            if (modelData === null)
                modelData = resCtrl.getStageResByName(ResType.Model, arcName, modelName2[i]);
            if (modelData === null)
                continue;
            this.bgModel[i] = new J3DModelInstance(modelData);

            const btk = globals.resCtrl.getStageResByName(ResType.Btk, arcName, btkName[i]);
            if (btk !== null)
                this.bgBtkAnm[i] = new daBg_btkAnm_c(modelData, btk);

            const brk = globals.resCtrl.getStageResByName(ResType.Brk, arcName, brkName[i]);
            if (brk !== null)
                this.bgBrkAnm[i] = new daBg_brkAnm_c(modelData, brk);

            const tevStr = new dKy_tevstr_c();
            this.bgTevStr[i] = tevStr;
            dKy_tevstr_init(tevStr, roomNo, -1);
        }

        const bgDt = assertExists(resCtrl.getStageResByName(ResType.Dzb, arcName, 'room.dzb'));

        this.bgW.Set(bgDt, cBgW_Flags.Global, null);
        globals.scnPlay.bgS.Regist(this.bgW, this);

        // create
        for (let i = 0; i < this.numBg; i++) {
            if (this.bgBtkAnm[i] !== null)
                this.bgBtkAnm[i]!.entry(this.bgModel[i]!);
            if (this.bgBrkAnm[i] !== null)
                this.bgBrkAnm[i]!.entry(this.bgModel[i]!);
        }

        const mult = dComIfGp_getMapTrans(globals, roomNo);
        if (mult !== null) {
            MtxTrans(vec3.set(scratchVec3a, mult.transX, 0, mult.transZ), false);
            mDoMtx_YrotM(calc_mtx, mult.rotY);
            for (let i = 0; i < this.numBg; i++)
                if (this.bgModel[i] !== null)
                    mat4.copy(this.bgModel[i]!.modelMatrix, calc_mtx);
        }

        dKy_tevstr_init(globals.roomStatus[roomNo].tevStr, roomNo, -1);

        return cPhs__Status.Next;
    }

    public execute(globals: dGlobals, deltaTimeInFrames: number): void {
        for (let i = 0; i < this.numBg; i++) {
            if (this.bgBtkAnm[i] !== null)
                this.bgBtkAnm[i]!.play(deltaTimeInFrames);
            if (this.bgBrkAnm[i] !== null)
                this.bgBrkAnm[i]!.play(deltaTimeInFrames);
        }
    }

    public draw(globals: dGlobals, renderInstManager: GfxRenderInstManager, viewerInput: ViewerRenderInput): void {
        // force far plane to 100000.0 ?

        for (let i = 0; i < this.numBg; i++) {
            if (this.bgModel[i] === null)
                continue;

            settingTevStruct(globals, LightType.BG0 + i, null, this.bgTevStr[i]!);
            setLightTevColorType(globals, this.bgModel[i]!, this.bgTevStr[i]!, viewerInput.camera);
            // this is actually mDoExt_modelEntryDL
            mDoExt_modelUpdateDL(globals, this.bgModel[i]!, renderInstManager, viewerInput);
        }

        const roomNo = this.parameters;
        settingTevStruct(globals, LightType.BG0, null, globals.roomStatus[roomNo].tevStr);
    }

    public delete(globals: dGlobals): void {
        globals.scnPlay.bgS.Release(this.bgW);
    }
}

class d_a_vrbox extends fopAc_ac_c {
    public static PROCESS_NAME = fpc__ProcessName.d_a_vrbox;
    private model: J3DModelInstance;

    public subload(globals: dGlobals): cPhs__Status {
        const envLight = globals.g_env_light;

        const res = assertExists(globals.resCtrl.getStageResByName(ResType.Model, `Stage`, `vr_sky.bdl`));
        this.model = new J3DModelInstance(res);

        // vrboxFlags?
        globals.scnPlay.vrboxLoaded = true;
        envLight.vrboxInvisible = false;

        return cPhs__Status.Next;
    }

    private dungeon_rain_proc(globals: dGlobals): void {
        const envLight = globals.g_env_light;

        if (dKy_checkEventNightStop(globals)) {
            const stage = globals.stageName;

            let rainMode: number = -1;
            const roomNo = globals.mStayNo;
            if (stage === 'M_NewD2' && roomNo === 3)
                rainMode = 1;
            else if (stage === 'M_Dra09')
                rainMode = 1;
            else if (stage === 'kinMB')
                rainMode = 1;
            else if (stage === 'kindan') {
                if (roomNo === 2 || roomNo === 13)
                    rainMode = 1;
                else if (roomNo === 4)
                    rainMode = 2;
                else
                    rainMode = 0;
            }

            if (rainMode === 0) {
                if (envLight.thunderMode !== ThunderMode.Off) {
                    dKyw_rain_set(envLight, 0);
                    envLight.thunderMode = ThunderMode.Off;
                }
            } else if (rainMode === 1) {
                if (envLight.rainCountOrig !== 250) {
                    dKy_change_colpat(envLight, 1);
                    dKyw_rain_set(envLight, 250);
                    envLight.thunderMode = ThunderMode.On;
                }
            } else if (rainMode === 2) {
                if (envLight.thunderMode === ThunderMode.Off) {
                    dKy_change_colpat(envLight, 1);
                    envLight.thunderMode = ThunderMode.FarOnly;
                }
            }
        }
    }

    public execute(globals: dGlobals, deltaTimeInFrames: number): void {
        this.dungeon_rain_proc(globals);
    }

    private daVrbox_color_set(globals: dGlobals): void {
        const envLight = globals.g_env_light;

        let sum = 0;
        sum += envLight.vrKasumiMaeCol.r + envLight.vrKasumiMaeCol.g + envLight.vrKasumiMaeCol.b;
        sum += envLight.vrSkyCol.r + envLight.vrSkyCol.g + envLight.vrSkyCol.b;
        sum += envLight.vrKumoCol.r + envLight.vrKumoCol.g + envLight.vrKumoCol.b;
        if (sum === 0) {
            envLight.vrboxInvisible = true;
        } else {
            envLight.vrboxInvisible = false;

            // Can't use overrides because it's per-material.
            const m0 = this.model.modelMaterialData.materialData![0].material;
            colorCopy(m0.colorConstants[0], envLight.vrKasumiMaeCol);
            const m1 = this.model.modelMaterialData.materialData![1].material;
            colorCopy(m1.colorConstants[0], envLight.vrSkyCol);
        }
    }

    public draw(globals: dGlobals, renderInstManager: GfxRenderInstManager, viewerInput: ViewerRenderInput): void {
        const envLight = globals.g_env_light;

        this.daVrbox_color_set(globals);

        if (envLight.vrboxInvisible)
            return;

        let skyboxOffsY = 0;
        const fili = globals.roomStatus[globals.mStayNo].fili;
        if (fili !== null)
            skyboxOffsY = fili.skyboxY;

        MtxTrans(globals.cameraPosition, false);
        calc_mtx[13] -= 0.09 * (globals.cameraPosition[1] - skyboxOffsY);
        mat4.copy(this.model.modelMatrix, calc_mtx);

        dKy_setLight__OnModelInstance(envLight, this.model, viewerInput.camera);
        mDoExt_modelUpdateDL(globals, this.model, renderInstManager, viewerInput, globals.dlst.sky);
    }
}

class d_a_vrbox2 extends fopAc_ac_c {
    public static PROCESS_NAME = fpc__ProcessName.d_a_vrbox2;
    private backCloud: J3DModelInstance;
    private kasumiMae: J3DModelInstance | null = null;
    private kasumiMaeC0 = colorNewCopy(TransparentBlack);
    private kasumiMaeK0 = colorNewCopy(TransparentBlack);
    private usoUmi: J3DModelInstance | null = null;

    public subload(globals: dGlobals): cPhs__Status {
        const backCloudRes = assertExists(globals.resCtrl.getStageResByName(ResType.Model, `Stage`, `vr_back_cloud.bdl`));
        this.backCloud = new J3DModelInstance(backCloudRes);

        const kasumiMaeRes = globals.resCtrl.getStageResByName(ResType.Model, `Stage`, `vr_kasumi_mae.bdl`);
        if (kasumiMaeRes !== null)
            this.kasumiMae = new J3DModelInstance(kasumiMaeRes);

        const usoUmiRes = globals.resCtrl.getStageResByName(ResType.Model, `Stage`, `vr_uso_umi.bdl`);
        if (usoUmiRes !== null)
            this.usoUmi = new J3DModelInstance(usoUmiRes);

        return cPhs__Status.Next;
    }

    private daVrbox2_color_set(globals: dGlobals, deltaTimeInFrames: number): void {
        const envLight = globals.g_env_light;

        let sum = 0;
        sum += envLight.vrKasumiMaeCol.r + envLight.vrKasumiMaeCol.g + envLight.vrKasumiMaeCol.b;
        sum += envLight.vrSkyCol.r + envLight.vrSkyCol.g + envLight.vrSkyCol.b;
        sum += envLight.vrKumoCol.r + envLight.vrKumoCol.g + envLight.vrKumoCol.b;
        if (sum === 0)
            return;

        const windVec = dKyw_get_wind_vec(envLight);
        const windPower = dKyw_get_wind_pow(envLight);

        let windX = windVec[0];
        let windZ = windVec[2];

        const roomType = (globals.dStage_dt.stag.roomTypeAndSchBit >>> 16) & 0x07;
        if (roomType === 2) {
            // TODO(jstpierre): #TACT_WIND. Overwrite with tact wind. LinkRM / Orichh / Ojhous2 / Omasao / Onobuta
        }

        // Camera forward in XZ plane
        vec3.copy(scratchVec3a, globals.cameraFwd);
        scratchVec3a[1] = 0;
        vec3.normalize(scratchVec3a, scratchVec3a);

        const scrollSpeed0 = deltaTimeInFrames * windPower * 0.0005 * ((-windX * scratchVec3a[2]) - (-windZ * scratchVec3a[0]));

        let mtx: mat4;
        const backMat0 = this.backCloud.materialInstances[0].materialData.material;
        mtx = backMat0.texMatrices[0]!.matrix;
        mtx[12] = (mtx[12] + scrollSpeed0) % 1.0;

        mtx = backMat0.texMatrices[1]!.matrix;
        mtx[12] = (mtx[12] + scrollSpeed0) % 1.0;

        const scrollSpeed1 = scrollSpeed0 * 0.8;

        const backMat1 = this.backCloud.materialInstances[1].materialData.material;
        mtx = backMat1.texMatrices[0]!.matrix;
        mtx[12] = (mtx[12] + scrollSpeed1) % 1.0;

        mtx = backMat1.texMatrices[1]!.matrix;
        mtx[12] = (mtx[12] + scrollSpeed1) % 1.0;

        const scrollSpeed2 = scrollSpeed0 * 0.6;

        const backMat2 = this.backCloud.materialInstances[2].materialData.material;
        mtx = backMat2.texMatrices[0]!.matrix;
        mtx[12] = (mtx[12] + scrollSpeed2) % 1.0;

        mtx = backMat2.texMatrices[1]!.matrix;
        mtx[12] = (mtx[12] + scrollSpeed0 + scrollSpeed2) % 1.0;

        // Overwrite colors.
        this.backCloud.setColorOverride(ColorKind.K0, envLight.vrKumoCol);

        if (this.kasumiMae !== null) {
            colorCopy(this.kasumiMaeC0, envLight.vrKasumiMaeCol, 0.0);
            this.kasumiMaeK0.r = envLight.vrKumoCol.a;
            this.kasumiMae.setColorOverride(ColorKind.C0, this.kasumiMaeC0);
            this.kasumiMae.setColorOverride(ColorKind.K0, this.kasumiMaeK0);
        }

        if (this.usoUmi !== null)
            this.usoUmi.setColorOverride(ColorKind.K0, envLight.vrUsoUmiCol);
    }

    public execute(globals: dGlobals, deltaTimeInFrames: number): void {
        this.daVrbox2_color_set(globals, deltaTimeInFrames);
    }

    public draw(globals: dGlobals, renderInstManager: GfxRenderInstManager, viewerInput: ViewerRenderInput): void {
        const envLight = globals.g_env_light;

        let sum = 0;
        sum += envLight.vrKasumiMaeCol.r + envLight.vrKasumiMaeCol.g + envLight.vrKasumiMaeCol.b;
        sum += envLight.vrSkyCol.r + envLight.vrSkyCol.g + envLight.vrSkyCol.b;
        sum += envLight.vrKumoCol.r + envLight.vrKumoCol.g + envLight.vrKumoCol.b;
        if (sum === 0)
            return;

        let skyboxOffsY = 0;
        const fili = globals.roomStatus[globals.mStayNo].fili;
        if (fili !== null)
            skyboxOffsY = 0.09 * (globals.cameraPosition[1] - fili.skyboxY);

        MtxTrans(globals.cameraPosition, false);
        calc_mtx[13] -= skyboxOffsY;

        if (this.usoUmi !== null) {
            mat4.copy(this.usoUmi.modelMatrix, calc_mtx);
            dKy_setLight__OnModelInstance(envLight, this.usoUmi, viewerInput.camera);
            mDoExt_modelUpdateDL(globals, this.usoUmi, renderInstManager, viewerInput, globals.dlst.sky);
        }

        if (this.kasumiMae !== null) {
            mat4.copy(this.kasumiMae.modelMatrix, calc_mtx);
            dKy_setLight__OnModelInstance(envLight, this.kasumiMae, viewerInput.camera);
            mDoExt_modelUpdateDL(globals, this.kasumiMae, renderInstManager, viewerInput, globals.dlst.sky);
        }

        mat4.copy(this.backCloud.modelMatrix, calc_mtx);
        dKy_setLight__OnModelInstance(envLight, this.backCloud, viewerInput.camera);
        mDoExt_modelUpdateDL(globals, this.backCloud, renderInstManager, viewerInput, globals.dlst.sky);
    }
}

class d_a_kytag00 extends fopAc_ac_c {
    public static PROCESS_NAME = fpc__ProcessName.d_a_kytag00;

    private pselIdx = 0;
    private effectMode = 0;
    private invert = false;
    private alwaysCheckPlayerPos = false;
    private target = 0.0;
    private effectSet = false;
    private pselSet = false;

    // Cylinder
    private innerFadeY = 0.0;
    private innerRadius = 0.0;
    private outerRadius = 0.0;

    public subload(globals: dGlobals): cPhs__Status {
        this.pselIdx = this.parameters & 0xFF;
        this.effectMode = (this.parameters >>> 8) & 0xFF;
        this.invert = !!((this.rot[0] >>> 8) & 0xFF);
        this.alwaysCheckPlayerPos = !!(this.rot[2] & 0xFF);

        if (this.invert) {
            this.target = 1.0;
        } else {
            this.target = 0.0;
        }

        this.innerFadeY = ((this.parameters >> 24) & 0xFF) * 100.0;

        const paramRadius = (this.parameters >>> 16) & 0xFF;
        if (this.alwaysCheckPlayerPos) {
            this.innerRadius = this.scale[0] * 500.0;
            this.outerRadius = this.innerRadius + paramRadius * 10.0;
        } else {
            this.innerRadius = this.scale[0] * 5000.0;
            this.outerRadius = this.innerRadius + paramRadius * 100.0;
        }

        this.wether_tag_efect_move(globals);

        return cPhs__Status.Next;
    }

    private get_check_pos(globals: dGlobals): vec3 {
        // Return the closer of the two.
        if (this.alwaysCheckPlayerPos || vec3.distance(this.pos, globals.playerPosition) < vec3.distance(this.pos, globals.cameraPosition))
            return globals.playerPosition;
        else
            return globals.cameraPosition;
    }

    private wether_tag_efect_move(globals: dGlobals): void {
        // Moved inside wether_tag_move.
    }

    public execute(globals: dGlobals, deltaTimeInFrames: number): void {
        if (this.invert) {
            this.target = cLib_addCalc(this.target, 0.0, 0.1, 0.01, 0.0001);
        } else {
            this.target = cLib_addCalc(this.target, 1.0, 0.1, 0.01, 0.0001);
        }

        this.wether_tag_move(globals);
    }

    private raincnt_set(globals: dGlobals, target: number): void {
        const envLight = globals.g_env_light;

        let newRainCount = (saturate(target * target * target) * 250.0) | 0;

        if (dKy_checkEventNightStop(globals)) {
            if (newRainCount < envLight.rainCount)
                newRainCount = envLight.rainCount;
        }

        if (newRainCount > envLight.rainCountOrig)
            envLight.rainCount = newRainCount;
    }

    private raincnt_cut(globals: dGlobals): void {
        const envLight = globals.g_env_light;

        if (!dKy_checkEventNightStop(globals))
            envLight.rainCount = envLight.rainCountOrig;
    }

    private wether_tag_move(globals: dGlobals): void {
        const envLight = globals.g_env_light;

        const checkPos = this.get_check_pos(globals);

        const distXZ = Math.hypot(checkPos[0] - this.pos[0], checkPos[2] - this.pos[2]);

        const innerBottomY = this.pos[1], outerBottomY = innerBottomY - this.innerFadeY;
        const innerTopY = this.pos[1] + (this.scale[1] * 5000.0), outerTopY = innerTopY + this.innerFadeY;

        if (distXZ < this.outerRadius && checkPos[1] > outerBottomY && checkPos[1] <= outerTopY) {
            const fadeRadius = this.outerRadius - this.innerRadius;
            const blendXZ = Math.min((this.outerRadius - distXZ) / fadeRadius, 1.0);

            let blendY = 1.0;
            if (this.innerFadeY !== 0) {
                if (checkPos[1] > innerBottomY)
                    blendY = 1.0 - saturate((checkPos[1] - outerTopY) / this.innerFadeY);
                else
                    blendY = 1.0 - saturate((innerBottomY - checkPos[1]) / this.innerFadeY);
            }

            const target = this.target * blendXZ * blendY;

            if (envLight.envrIdxPrev === envLight.envrIdxCurr && this.pselIdx < 4) {
                this.pselSet = true;

                if (target > 0.5) {
                    envLight.blendPselGather = target;
                    envLight.pselIdxPrevGather = envLight.weatherPselIdx;
                    envLight.pselIdxCurrGather = this.pselIdx;
                    envLight.colSetModeGather = 1;
                } else {
                    envLight.blendPselGather = 1.0 - target;
                    envLight.pselIdxPrevGather = this.pselIdx;
                    envLight.pselIdxCurrGather = envLight.weatherPselIdx;
                    envLight.colSetModeGather = 1;
                }
            }

            // wether_tag_efect_move
            this.effectSet = true;

            if (this.effectMode === 1) {
                this.raincnt_set(globals, target);
            } else if (this.effectMode === 7) {
                if (envLight.thunderMode === 0)
                    envLight.thunderMode = 2;
            } else if (this.effectMode === 8) {
                if (envLight.thunderMode === 0)
                    envLight.thunderMode = 2;
                this.raincnt_set(globals, target);
            } else if (this.effectMode === 9) {
                // TODO(jstpierre): moya
                if (envLight.thunderMode === 0)
                    envLight.thunderMode = 2;
                this.raincnt_set(globals, target);
            } else {
                // TODO(jstpierre): The rest of the modes.
            }
        } else {
            if (this.pselSet) {
                this.pselSet = false;
                envLight.pselIdxPrevGather = envLight.weatherPselIdx;
                envLight.pselIdxCurrGather = envLight.weatherPselIdx;
                envLight.blendPselGather = 0.0;
                envLight.colSetModeGather = 1;
            }

            if (this.effectSet) {
                this.effectSet = false;

                if (this.effectMode === 1) {
                    this.raincnt_cut(globals);
                } else if (this.effectMode === 7) {
                    if (envLight.thunderMode === 2)
                        envLight.thunderMode = 0;
                } else if (this.effectMode === 8) {
                    if (envLight.thunderMode === 2)
                        envLight.thunderMode = 0;
                    this.raincnt_cut(globals);
                } else if (this.effectMode === 9) {
                    // TODO(jstpierre): moya
                    if (envLight.thunderMode === 2)
                        envLight.thunderMode = 0;
                    this.raincnt_cut(globals);
                }
            }
        }
    }
}

class d_a_kytag01 extends fopAc_ac_c {
    public static PROCESS_NAME = fpc__ProcessName.d_a_kytag01;

    private influence = new WAVE_INFLUENCE();

    public subload(globals: dGlobals): cPhs__Status {
        vec3.copy(this.influence.pos, this.pos);

        this.influence.innerRadius = this.scale[0] * 5000.0;
        this.influence.outerRadius = Math.max(this.scale[2] * 5000.0, this.influence.innerRadius + 500.0);
        dKy__waveinfl_set(globals.g_env_light, this.influence);

        // TODO(jstpierre): Need a Create/Destroy hook that happens on room load / unload.
        // this.wave_make(globals);

        return cPhs__Status.Next;
    }

    public delete(globals: dGlobals): void {
        dKy__waveinfl_cut(globals.g_env_light, this.influence);
    }
}

class d_a_obj_Ygush00 extends fopAc_ac_c {
    public static PROCESS_NAME = fpc__ProcessName.d_a_obj_Ygush00;

    private type: number;
    private model: J3DModelInstance;
    private btkAnm = new mDoExt_btkAnm();
    private bckAnm = new mDoExt_bckAnm();

    public subload(globals: dGlobals): cPhs__Status {
        const status = dComIfG_resLoad(globals, `Ygush00`);
        if (status !== cPhs__Status.Complete)
            return status;

        this.type = this.parameters & 0x03;
        const mdl_table = [0x0A, 0x09, 0x09, 0x09];
        const btk_table = [0x0E, 0x0D, 0x0D, 0x0D];
        const bck_table = [0x06, 0x05, 0x05, 0x05];

        const resCtrl = globals.resCtrl;
        this.model = new J3DModelInstance(resCtrl.getObjectRes(ResType.Model, `Ygush00`, mdl_table[this.type]));
        this.btkAnm.init(this.model.modelData, resCtrl.getObjectRes(ResType.Btk, `Ygush00`, btk_table[this.type]), true, LoopMode.REPEAT);
        this.bckAnm.init(this.model.modelData, resCtrl.getObjectRes(ResType.Bck, `Ygush00`, bck_table[this.type]), true, LoopMode.REPEAT);

        vec3.copy(this.model.baseScale, this.scale);
        mat4.translate(this.model.modelMatrix, this.model.modelMatrix, this.pos);

        return cPhs__Status.Next;
    }

    public execute(globals: dGlobals, deltaTimeInFrames: number): void {
        if (this.type !== 3) {
            this.btkAnm.play(deltaTimeInFrames);
            this.bckAnm.play(deltaTimeInFrames);
        }

        if (this.type === 1) {
            // Judge for Gryw00 nearby
        }
    }

    public draw(globals: dGlobals, renderInstManager: GfxRenderInstManager, viewerInput: ViewerRenderInput): void {
        settingTevStruct(globals, LightType.BG1, this.pos, this.tevStr);
        setLightTevColorType(globals, this.model, this.tevStr, viewerInput.camera);

        this.btkAnm.entry(this.model);
        this.bckAnm.entry(this.model);
        mDoExt_modelUpdateDL(globals, this.model, renderInstManager, viewerInput);
    }
}

class d_a_obj_lpalm extends fopAc_ac_c {
    public static PROCESS_NAME = fpc__ProcessName.d_a_obj_lpalm;

    private model: J3DModelInstance;

    private baseQuat = quat.create();
    private baseQuatTarget = quat.create();
    private animDir = nArray(2, () => 0);
    private animWave = nArray(2, () => 0);
    private animMtxQuat = nArray(2, () => quat.create());

    public subload(globals: dGlobals): cPhs__Status {
        const status = dComIfG_resLoad(globals, `Oyashi`);
        if (status !== cPhs__Status.Complete)
            return status;

        const resCtrl = globals.resCtrl;
        this.model = new J3DModelInstance(resCtrl.getObjectRes(ResType.Model, `Oyashi`, 0x04));
        this.model.jointMatrixCalcCallback = this.nodeCallBack;

        mat4.translate(this.model.modelMatrix, this.model.modelMatrix, this.pos);
        mDoMtx_ZYXrotM(this.model.modelMatrix, this.rot);

        return cPhs__Status.Next;
    }

    private nodeCallBack = (dst: mat4, i: number): void => {
        if (i === 2 || i === 3) {
            mDoMtx_ZrotM(dst, -0x4000);
            quatM(this.baseQuat, dst);
            if (i === 2)
                quatM(this.animMtxQuat[0], dst);
            else
                quatM(this.animMtxQuat[1], dst);
            mDoMtx_ZrotM(dst, 0x4000);
        }
    };

    public execute(globals: dGlobals, deltaTimeInFrames: number): void {
        const envLight = globals.g_env_light;

        const windVec = dKyw_get_wind_vec(envLight);
        const windPow = dKyw_get_wind_pow(envLight);

        mDoMtx_YrotS(calc_mtx, -this.rot[1]);
        MtxPosition(scratchVec3a, windVec);

        vec3.set(scratchVec3b, 0, 1, 0);
        vec3.cross(scratchVec3b, scratchVec3b, scratchVec3a);

        if (vec3.length(scratchVec3b) >= 0.00000001) {
            vec3.normalize(scratchVec3b, scratchVec3b);
            quat.setAxisAngle(this.baseQuatTarget, scratchVec3b, windPow * (0x600 * kUshortTo2PI));
        } else {
            quat.identity(this.baseQuatTarget);
        }

        quat.slerp(this.baseQuat, this.baseQuat, this.baseQuatTarget, 0.25);

        for (let i = 0; i < 2; i++) {
            const animDirTarget = Math.min(windPow * 0x180, 0x100);
            this.animDir[i] = cLib_addCalcAngleRad2(this.animDir[i], animDirTarget * kUshortTo2PI, 0x04 * kUshortTo2PI, 0x20 * kUshortTo2PI);

            // Rock back and forth.
            this.animWave[i] += ((windPow * 0x800) + cM_rndFX(0x80)) * kUshortTo2PI * deltaTimeInFrames;
            const wave = Math.sin(this.animWave[i]);

            vec3.set(scratchVec3a, wave, 0, wave);
            quat.setAxisAngle(this.animMtxQuat[i], scratchVec3a, this.animDir[i]);
        }
    }

    public draw(globals: dGlobals, renderInstManager: GfxRenderInstManager, viewerInput: ViewerRenderInput): void {
        settingTevStruct(globals, LightType.BG0, this.pos, this.tevStr);
        setLightTevColorType(globals, this.model, this.tevStr, viewerInput.camera);
        mDoExt_modelUpdateDL(globals, this.model, renderInstManager, viewerInput);
    }
}

function vecHalfAngle(dst: vec3, a: vec3, b: vec3): void {
    vec3.negate(a, a);
    vec3.negate(b, b);
    vec3.normalize(a, a);
    vec3.normalize(b, b);
    vec3.add(dst, a, b);
    if (vec3.dot(dst, dst) > 0.0)
        vec3.normalize(dst, dst);
    else
        vec3.set(dst, 0, 0, 0);
}

class d_a_obj_zouK1 extends fopAc_ac_c {
    public static PROCESS_NAME = fpc__ProcessName.d_a_obj_zouK1;

    private model: J3DModelInstance;
    private bckAnm = new mDoExt_bckAnm();
    private effectMtx = mat4.create();

    public subload(globals: dGlobals): cPhs__Status {
        const status = dComIfG_resLoad(globals, `VzouK`);
        if (status !== cPhs__Status.Complete)
            return status;

        const resCtrl = globals.resCtrl;
        this.model = new J3DModelInstance(resCtrl.getObjectRes(ResType.Model, `VzouK`, 0x08));

        const anm = resCtrl.getObjectRes(ResType.Bck, `VzouK`, 0x05);
        this.bckAnm.init(this.model.modelData, anm, true, LoopMode.ONCE, 0.0, anm.duration);
        this.bckAnm.play(0.0);

        for (let i = 0; i < this.model.materialInstances.length; i++)
            this.model.materialInstances[i].effectMtxCallback = this.effectMtxCallback;

        return cPhs__Status.Next;
    }

    private effectMtxCallback = (dst: mat4, texMtx: TexMtx): void => {
        mat4.copy(dst, this.effectMtx);
    }

    private set_mtx(): void {
        vec3.copy(this.model.baseScale, this.scale);
        MtxTrans(this.pos, false, this.model.modelMatrix);
        mDoMtx_ZYXrotM(this.model.modelMatrix, this.rot);
    }

    public execute(globals: dGlobals, deltaTimeInFrames: number): void {
        this.set_mtx();
    }

    private setEffectMtx(globals: dGlobals, pos: vec3, refl: number): void {
        const scale = 1.0 / refl;
        computeModelMatrixS(this.effectMtx, scale, scale, 1.0);

        // Remap.
        buildEnvMtx(scratchMat4a, 1.0);
        mat4.mul(this.effectMtx, this.effectMtx, scratchMat4a);

        // Half-vector lookAt transform.
        vec3.sub(scratchVec3a, pos, globals.cameraPosition);
        dKyr_get_vectle_calc(this.tevStr.lightObj.Position, pos, scratchVec3b);
        vecHalfAngle(scratchVec3a, scratchVec3a, scratchVec3b);
        mat4.lookAt(scratchMat4a, Vec3Zero, scratchVec3a, Vec3UnitY);
        mat4.mul(this.effectMtx, this.effectMtx, scratchMat4a);

        computeMatrixWithoutTranslation(this.effectMtx, this.effectMtx);
    }

    public draw(globals: dGlobals, renderInstManager: GfxRenderInstManager, viewerInput: ViewerRenderInput): void {
        settingTevStruct(globals, LightType.Actor, this.pos, this.tevStr);
        setLightTevColorType(globals, this.model, this.tevStr, viewerInput.camera);
        this.setEffectMtx(globals, this.pos, 0.5);
        this.bckAnm.entry(this.model);
        mDoExt_modelUpdateDL(globals, this.model, renderInstManager, viewerInput);
    }
}

interface constructor extends fpc_bs__Constructor {
    PROCESS_NAME: fpc__ProcessName;
}

export function d_a__RegisterConstructors(globals: fGlobals): void {
    function R(constructor: constructor): void {
        fpcPf__Register(globals, constructor.PROCESS_NAME, constructor);
    }

    R(d_a_grass);
    R(d_a_obj_wood);
    R(d_a_ep);
    R(d_a_bg);
    R(d_a_vrbox);
    R(d_a_vrbox2);
    R(d_a_sea);
    R(d_a_kytag00);
    R(d_a_kytag01);
    R(d_a_obj_Ygush00);
    R(d_a_obj_lpalm);
    R(d_a_obj_zouK1);
}
