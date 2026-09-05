/**
 * 拼豆图纸核心算法模块
 * -------------------------------------------------
 * 从 PindouDesigner.vue 中抽取并规范化的共享工具，供以下场景复用：
 *   1. 图纸转换页（PindouDesigner.vue）—— 本地图片转拼豆图纸
 *   2. 拼小豆 AI 聊天（PineXiaoDouView.vue）—— AI 生成图 / 用户上传图一键转图纸
 *
 * 算法说明：
 *   - 颜色匹配：默认 CIE Lab ΔE 感知距离最近邻（MATCH_USE_LAB=true，观感更接近原图）；
 *     置为 false 则使用 RGB 欧氏距离最近邻。
 *   - 量化：按“使用频次”保留前 N 色（UI 默认不限色 = MARD 全色）
 *   - 抖动：Floyd–Steinberg 误差扩散（引擎保留，UI 默认关闭）
 *   - 预处理：3x3 高斯降噪、Laplacian 边缘增强（引擎保留，UI 默认关闭）
 *   - 相似度：基于 CIE Lab ΔE 的平均相似度（仅作展示指标）
 *
 * 纯浏览器实现（依赖 Canvas API），与后端 jimp 版算法保持一致。
 */

// ==================== 拼豆颜色库（Perler 标准色） ====================
export const PINDOU_COLORS = [
  { name: 'A1', code: '#FAF4C8', rgb: [250, 244, 200] },
  { name: 'A2', code: '#FFFFD5', rgb: [255, 255, 213] },
  { name: 'A3', code: '#FEFF8B', rgb: [254, 255, 139] },
  { name: 'A4', code: '#FBED56', rgb: [251, 237, 86] },
  { name: 'A5', code: '#F4D738', rgb: [244, 215, 56] },
  { name: 'A6', code: '#FEAC4C', rgb: [254, 172, 76] },
  { name: 'A7', code: '#FE8B4C', rgb: [254, 139, 76] },
  { name: 'A8', code: '#FFDA45', rgb: [255, 218, 69] },
  { name: 'A9', code: '#FF995B', rgb: [255, 153, 91] },
  { name: 'A10', code: '#F77C31', rgb: [247, 124, 49] },
  { name: 'A11', code: '#FFDD99', rgb: [255, 221, 153] },
  { name: 'A12', code: '#FE9F72', rgb: [254, 159, 114] },
  { name: 'A13', code: '#FFC365', rgb: [255, 195, 101] },
  { name: 'A14', code: '#FD543D', rgb: [253, 84, 61] },
  { name: 'A15', code: '#FFF365', rgb: [255, 243, 101] },
  { name: 'A16', code: '#FFFF9F', rgb: [255, 255, 159] },
  { name: 'A17', code: '#FFE36E', rgb: [255, 227, 110] },
  { name: 'A18', code: '#FEBE7D', rgb: [254, 190, 125] },
  { name: 'A19', code: '#FD7C72', rgb: [253, 124, 114] },
  { name: 'A20', code: '#FFD568', rgb: [255, 213, 104] },
  { name: 'A21', code: '#FFE395', rgb: [255, 227, 149] },
  { name: 'A22', code: '#F4F57D', rgb: [244, 245, 125] },
  { name: 'A23', code: '#E6C9B7', rgb: [230, 201, 183] },
  { name: 'A24', code: '#F7F8A2', rgb: [247, 248, 162] },
  { name: 'A25', code: '#FFD67D', rgb: [255, 214, 125] },
  { name: 'A26', code: '#FFC830', rgb: [255, 200, 48] },
  { name: 'B1', code: '#E6EE31', rgb: [230, 238, 49] },
  { name: 'B2', code: '#63F347', rgb: [99, 243, 71] },
  { name: 'B3', code: '#9EF780', rgb: [158, 247, 128] },
  { name: 'B4', code: '#5DE035', rgb: [93, 224, 53] },
  { name: 'B5', code: '#35E352', rgb: [53, 227, 82] },
  { name: 'B6', code: '#65E2A6', rgb: [101, 226, 166] },
  { name: 'B7', code: '#3DAF80', rgb: [61, 175, 128] },
  { name: 'B8', code: '#1C9C4F', rgb: [28, 156, 79] },
  { name: 'B9', code: '#27523A', rgb: [39, 82, 58] },
  { name: 'B10', code: '#95D3C2', rgb: [149, 211, 194] },
  { name: 'B11', code: '#5D722A', rgb: [93, 114, 42] },
  { name: 'B12', code: '#166F41', rgb: [22, 111, 65] },
  { name: 'B13', code: '#CAEB7B', rgb: [202, 235, 123] },
  { name: 'B14', code: '#ADE946', rgb: [173, 233, 70] },
  { name: 'B15', code: '#2E5132', rgb: [46, 81, 50] },
  { name: 'B16', code: '#C5ED9C', rgb: [197, 237, 156] },
  { name: 'B17', code: '#9BB13A', rgb: [155, 177, 58] },
  { name: 'B18', code: '#E6EE49', rgb: [230, 238, 73] },
  { name: 'B19', code: '#24B88C', rgb: [36, 184, 140] },
  { name: 'B20', code: '#C2F0CC', rgb: [194, 240, 204] },
  { name: 'B21', code: '#156A6B', rgb: [21, 106, 107] },
  { name: 'B22', code: '#0B3C43', rgb: [11, 60, 67] },
  { name: 'B23', code: '#303A21', rgb: [48, 58, 33] },
  { name: 'B24', code: '#EEFCA5', rgb: [238, 252, 165] },
  { name: 'B25', code: '#4E846D', rgb: [78, 132, 109] },
  { name: 'B26', code: '#8D7A35', rgb: [141, 122, 53] },
  { name: 'B27', code: '#CCE1AF', rgb: [204, 225, 175] },
  { name: 'B28', code: '#9EE5B9', rgb: [158, 229, 185] },
  { name: 'B29', code: '#C5E254', rgb: [197, 226, 84] },
  { name: 'B30', code: '#E2FCB1', rgb: [226, 252, 177] },
  { name: 'B31', code: '#B0E792', rgb: [176, 231, 146] },
  { name: 'B32', code: '#9CAB5A', rgb: [156, 171, 90] },
  { name: 'C1', code: '#E8FFE7', rgb: [232, 255, 231] },
  { name: 'C2', code: '#A9F9FC', rgb: [169, 249, 252] },
  { name: 'C3', code: '#A0E2FB', rgb: [160, 226, 251] },
  { name: 'C4', code: '#41CCFF', rgb: [65, 204, 255] },
  { name: 'C5', code: '#01ACEB', rgb: [1, 172, 235] },
  { name: 'C6', code: '#50AAF0', rgb: [80, 170, 240] },
  { name: 'C7', code: '#3677D2', rgb: [54, 119, 210] },
  { name: 'C8', code: '#0F54C0', rgb: [15, 84, 192] },
  { name: 'C9', code: '#324BCA', rgb: [50, 75, 202] },
  { name: 'C10', code: '#3EBCE2', rgb: [62, 188, 226] },
  { name: 'C11', code: '#28DDDD', rgb: [40, 221, 221] },
  { name: 'C12', code: '#1C334D', rgb: [28, 51, 77] },
  { name: 'C13', code: '#CDE8FF', rgb: [205, 232, 255] },
  { name: 'C14', code: '#D5FDFF', rgb: [213, 253, 255] },
  { name: 'C15', code: '#22C4C6', rgb: [34, 196, 198] },
  { name: 'C16', code: '#1557A8', rgb: [21, 87, 168] },
  { name: 'C17', code: '#04D1F6', rgb: [4, 209, 246] },
  { name: 'C18', code: '#1D3344', rgb: [29, 51, 68] },
  { name: 'C19', code: '#1887A2', rgb: [24, 135, 162] },
  { name: 'C20', code: '#176DAF', rgb: [23, 109, 175] },
  { name: 'C21', code: '#BEDCFF', rgb: [190, 221, 255] },
  { name: 'C22', code: '#67B4BE', rgb: [103, 180, 190] },
  { name: 'C23', code: '#C8E2FF', rgb: [200, 226, 255] },
  { name: 'C24', code: '#7CC4FF', rgb: [124, 196, 255] },
  { name: 'C25', code: '#A9E5E5', rgb: [169, 229, 229] },
  { name: 'C26', code: '#3CAED8', rgb: [60, 174, 216] },
  { name: 'C27', code: '#D3DFFA', rgb: [211, 223, 250] },
  { name: 'C28', code: '#BBCFED', rgb: [187, 207, 237] },
  { name: 'C29', code: '#34488E', rgb: [52, 72, 142] },
  { name: 'D1', code: '#AEB4F2', rgb: [174, 180, 242] },
  { name: 'D2', code: '#858EDD', rgb: [133, 142, 221] },
  { name: 'D3', code: '#2F54AF', rgb: [47, 84, 175] },
  { name: 'D4', code: '#182A84', rgb: [24, 42, 132] },
  { name: 'D5', code: '#B843C5', rgb: [184, 67, 197] },
  { name: 'D6', code: '#AC7BDE', rgb: [172, 123, 222] },
  { name: 'D7', code: '#8854B3', rgb: [136, 84, 179] },
  { name: 'D8', code: '#E2D3FF', rgb: [226, 211, 255] },
  { name: 'D9', code: '#D5B9F8', rgb: [213, 185, 248] },
  { name: 'D10', code: '#361851', rgb: [54, 24, 81] },
  { name: 'D11', code: '#B9BAE1', rgb: [185, 186, 225] },
  { name: 'D12', code: '#DE9AD4', rgb: [222, 154, 212] },
  { name: 'D13', code: '#B90095', rgb: [185, 0, 149] },
  { name: 'D14', code: '#8B279B', rgb: [139, 39, 155] },
  { name: 'D15', code: '#2F1F90', rgb: [47, 31, 144] },
  { name: 'D16', code: '#E3E1EE', rgb: [227, 225, 238] },
  { name: 'D17', code: '#C4D4F6', rgb: [196, 212, 246] },
  { name: 'D18', code: '#A45EC7', rgb: [164, 94, 199] },
  { name: 'D19', code: '#D8C3D7', rgb: [216, 195, 215] },
  { name: 'D20', code: '#9C32B2', rgb: [156, 50, 178] },
  { name: 'D21', code: '#9A009B', rgb: [154, 0, 155] },
  { name: 'D22', code: '#333A95', rgb: [51, 58, 149] },
  { name: 'D23', code: '#EBDAFC', rgb: [235, 218, 252] },
  { name: 'D24', code: '#7786E5', rgb: [119, 134, 229] },
  { name: 'D25', code: '#494FC7', rgb: [73, 79, 199] },
  { name: 'D26', code: '#DFC2F8', rgb: [223, 194, 248] },
  { name: 'E1', code: '#E8D3CC', rgb: [232, 211, 204] },
  { name: 'E2', code: '#FEC0DF', rgb: [254, 192, 223] },
  { name: 'E3', code: '#FFB7E7', rgb: [255, 183, 231] },
  { name: 'E4', code: '#E8649E', rgb: [232, 100, 158] },
  { name: 'E5', code: '#F551A2', rgb: [245, 81, 162] },
  { name: 'E6', code: '#F13D74', rgb: [241, 61, 116] },
  { name: 'E7', code: '#C63478', rgb: [198, 52, 120] },
  { name: 'E8', code: '#FFD3E9', rgb: [255, 219, 233] },
  { name: 'E9', code: '#E970CC', rgb: [233, 112, 204] },
  { name: 'E10', code: '#D33793', rgb: [211, 55, 147] },
  { name: 'E11', code: '#FCDDD2', rgb: [252, 221, 210] },
  { name: 'E12', code: '#F78FC3', rgb: [247, 143, 195] },
  { name: 'E13', code: '#B5006D', rgb: [181, 0, 109] },
  { name: 'E14', code: '#FFD1BA', rgb: [255, 209, 186] },
  { name: 'E15', code: '#F8C7C9', rgb: [248, 199, 201] },
  { name: 'E16', code: '#FFF3EB', rgb: [255, 243, 235] },
  { name: 'E17', code: '#FFE2EA', rgb: [255, 226, 234] },
  { name: 'E18', code: '#FFC7DB', rgb: [255, 199, 219] },
  { name: 'E19', code: '#FEBAD5', rgb: [254, 186, 213] },
  { name: 'E20', code: '#D8C7D1', rgb: [216, 199, 209] },
  { name: 'E21', code: '#BD9DA1', rgb: [189, 157, 161] },
  { name: 'E22', code: '#B785A1', rgb: [183, 133, 161] },
  { name: 'E23', code: '#937A8D', rgb: [147, 122, 141] },
  { name: 'E24', code: '#E1BCE8', rgb: [225, 188, 232] },
  { name: 'F1', code: '#FD957B', rgb: [253, 149, 123] },
  { name: 'F2', code: '#FC3D46', rgb: [252, 61, 70] },
  { name: 'F3', code: '#F74941', rgb: [247, 73, 65] },
  { name: 'F4', code: '#FE283C', rgb: [252, 40, 60] },
  { name: 'F5', code: '#E7002F', rgb: [231, 0, 47] },
  { name: 'F6', code: '#943630', rgb: [148, 54, 48] },
  { name: 'F7', code: '#971937', rgb: [151, 25, 55] },
  { name: 'F8', code: '#BC0028', rgb: [188, 0, 40] },
  { name: 'F9', code: '#E2677A', rgb: [226, 103, 122] },
  { name: 'F10', code: '#8A4526', rgb: [138, 69, 38] },
  { name: 'F11', code: '#5A2121', rgb: [90, 33, 33] },
  { name: 'F12', code: '#FD4E6A', rgb: [253, 78, 106] },
  { name: 'F13', code: '#F35744', rgb: [243, 87, 68] },
  { name: 'F14', code: '#FFA9AD', rgb: [255, 169, 173] },
  { name: 'F15', code: '#D30022', rgb: [211, 0, 34] },
  { name: 'F16', code: '#FEC2A6', rgb: [254, 194, 166] },
  { name: 'F17', code: '#E69C79', rgb: [230, 156, 121] },
  { name: 'F18', code: '#D37C46', rgb: [211, 124, 70] },
  { name: 'F19', code: '#C1444A', rgb: [193, 68, 74] },
  { name: 'F20', code: '#CD9391', rgb: [205, 147, 145] },
  { name: 'F21', code: '#F7B4C6', rgb: [247, 180, 198] },
  { name: 'F22', code: '#FDC0D0', rgb: [253, 192, 208] },
  { name: 'F23', code: '#F67E66', rgb: [246, 126, 102] },
  { name: 'F24', code: '#E698AA', rgb: [230, 152, 170] },
  { name: 'F25', code: '#E54B4F', rgb: [229, 75, 79] },
  { name: 'G1', code: '#FFE2CE', rgb: [255, 226, 206] },
  { name: 'G2', code: '#FFC4AA', rgb: [255, 196, 170] },
  { name: 'G3', code: '#F4C3A5', rgb: [244, 195, 165] },
  { name: 'G4', code: '#E1B383', rgb: [225, 179, 131] },
  { name: 'G5', code: '#EDB045', rgb: [237, 176, 69] },
  { name: 'G6', code: '#E99C17', rgb: [233, 156, 23] },
  { name: 'G7', code: '#9D5B3E', rgb: [157, 91, 62] },
  { name: 'G8', code: '#753832', rgb: [117, 56, 50] },
  { name: 'G9', code: '#E6B483', rgb: [230, 180, 131] },
  { name: 'G10', code: '#D98C39', rgb: [217, 140, 57] },
  { name: 'G11', code: '#E0C593', rgb: [224, 197, 147] },
  { name: 'G12', code: '#FFC890', rgb: [255, 200, 144] },
  { name: 'G13', code: '#B7714A', rgb: [183, 113, 74] },
  { name: 'G14', code: '#8D614C', rgb: [141, 97, 76] },
  { name: 'G15', code: '#FCF9E0', rgb: [252, 249, 224] },
  { name: 'G16', code: '#F2D9BA', rgb: [242, 217, 186] },
  { name: 'G17', code: '#78524B', rgb: [120, 82, 75] },
  { name: 'G18', code: '#FFE4CC', rgb: [255, 228, 204] },
  { name: 'G19', code: '#E07935', rgb: [224, 121, 53] },
  { name: 'G20', code: '#A94023', rgb: [169, 64, 35] },
  { name: 'G21', code: '#B88558', rgb: [184, 133, 88] },
  { name: 'H1', code: '#FDFBFF', rgb: [253, 251, 255] },
  { name: 'H2', code: '#FEFFFF', rgb: [254, 255, 255] },
  { name: 'H3', code: '#B6B1BA', rgb: [182, 177, 186] },
  { name: 'H4', code: '#89858C', rgb: [137, 133, 140] },
  { name: 'H5', code: '#48464E', rgb: [72, 70, 78] },
  { name: 'H6', code: '#2F2B2F', rgb: [47, 43, 47] },
  { name: 'H7', code: '#000000', rgb: [0, 0, 0] },
  { name: 'H8', code: '#E7D6DB', rgb: [231, 214, 219] },
  { name: 'H9', code: '#EDEDED', rgb: [237, 237, 237] },
  { name: 'H10', code: '#EEE9EA', rgb: [238, 233, 234] },
  { name: 'H11', code: '#CECDD5', rgb: [206, 205, 213] },
  { name: 'H12', code: '#FFF5ED', rgb: [255, 245, 237] },
  { name: 'H13', code: '#F5EDD2', rgb: [245, 236, 210] },
  { name: 'H14', code: '#CFD7D3', rgb: [207, 215, 211] },
  { name: 'H15', code: '#98A6A8', rgb: [152, 166, 168] },
  { name: 'H16', code: '#1D1414', rgb: [29, 20, 20] },
  { name: 'H17', code: '#F1EDED', rgb: [241, 237, 237] },
  { name: 'H18', code: '#FFFDF0', rgb: [255, 253, 240] },
  { name: 'H19', code: '#F6EFE2', rgb: [246, 239, 226] },
  { name: 'H20', code: '#949FA3', rgb: [148, 159, 163] },
  { name: 'H21', code: '#FFFBE1', rgb: [255, 251, 225] },
  { name: 'H22', code: '#CACAD4', rgb: [202, 202, 212] },
  { name: 'H23', code: '#9A9D94', rgb: [154, 157, 148] },
  { name: 'M1', code: '#BCC6B8', rgb: [188, 198, 184] },
  { name: 'M2', code: '#8AA386', rgb: [138, 163, 134] },
  { name: 'M3', code: '#697D80', rgb: [105, 125, 128] },
  { name: 'M4', code: '#E3D2BC', rgb: [227, 210, 188] },
  { name: 'M5', code: '#D0CCAA', rgb: [208, 204, 170] },
  { name: 'M6', code: '#B0A782', rgb: [176, 167, 130] },
  { name: 'M7', code: '#B4A497', rgb: [180, 164, 151] },
  { name: 'M8', code: '#B38281', rgb: [179, 130, 129] },
  { name: 'M9', code: '#A58767', rgb: [165, 135, 103] },
  { name: 'M10', code: '#C5B2BC', rgb: [197, 178, 188] },
  { name: 'M11', code: '#9F7594', rgb: [159, 117, 148] },
  { name: 'M12', code: '#644749', rgb: [100, 71, 73] },
  { name: 'M13', code: '#D19066', rgb: [209, 144, 102] },
  { name: 'M14', code: '#C77362', rgb: [199, 115, 98] },
  { name: 'M15', code: '#757D78', rgb: [117, 125, 120] },
  { name: 'P1', code: '#FCF7F8', rgb: [252, 247, 248] },
  { name: 'P2', code: '#B0A9AC', rgb: [176, 169, 172] },
  { name: 'P3', code: '#AFDCAB', rgb: [175, 220, 171] },
  { name: 'P4', code: '#FEA49F', rgb: [254, 164, 159] },
  { name: 'P5', code: '#EE8C3E', rgb: [238, 140, 62] },
  { name: 'P6', code: '#5FD0A7', rgb: [95, 208, 167] },
  { name: 'P7', code: '#EB9270', rgb: [235, 146, 112] },
  { name: 'P8', code: '#F0D958', rgb: [240, 217, 88] },
  { name: 'P9', code: '#D9D9D9', rgb: [217, 217, 217] },
  { name: 'P10', code: '#D9C7EA', rgb: [217, 199, 234] },
  { name: 'P11', code: '#F3ECC9', rgb: [243, 236, 201] },
  { name: 'P12', code: '#E6EEF2', rgb: [230, 238, 242] },
  { name: 'P13', code: '#AACBEF', rgb: [170, 203, 239] },
  { name: 'P14', code: '#337680', rgb: [51, 118, 128] },
  { name: 'P15', code: '#668575', rgb: [102, 133, 117] },
  { name: 'P16', code: '#FEBF45', rgb: [254, 191, 69] },
  { name: 'P17', code: '#FEA324', rgb: [254, 163, 36] },
  { name: 'P18', code: '#FEB89F', rgb: [254, 184, 159] },
  { name: 'P19', code: '#FFFEDC', rgb: [255, 254, 236] },
  { name: 'P20', code: '#FEBECF', rgb: [254, 190, 207] },
  { name: 'P21', code: '#ECBEBF', rgb: [236, 190, 191] },
  { name: 'P22', code: '#E4A89F', rgb: [228, 168, 159] },
  { name: 'P23', code: '#A56268', rgb: [165, 98, 104] },
  { name: 'Q1', code: '#F2A5E8', rgb: [242, 165, 232] },
  { name: 'Q2', code: '#E9EC91', rgb: [233, 236, 145] },
  { name: 'Q3', code: '#FFFF00', rgb: [255, 255, 0] },
  { name: 'Q4', code: '#FFEBFA', rgb: [255, 235, 250] },
  { name: 'Q5', code: '#76CEDE', rgb: [118, 206, 222] },
  { name: 'R1', code: '#D50D21', rgb: [213, 13, 33] },
  { name: 'R2', code: '#F92F83', rgb: [249, 47, 131] },
  { name: 'R3', code: '#FD8324', rgb: [253, 131, 36] },
  { name: 'R4', code: '#F8EC31', rgb: [248, 236, 49] },
  { name: 'R5', code: '#35C75B', rgb: [53, 199, 91] },
  { name: 'R6', code: '#238891', rgb: [35, 136, 145] },
  { name: 'R7', code: '#19779D', rgb: [25, 119, 157] },
  { name: 'R8', code: '#1A60C3', rgb: [26, 96, 195] },
  { name: 'R9', code: '#9A56B4', rgb: [154, 86, 180] },
  { name: 'R10', code: '#FFDB4C', rgb: [255, 219, 76] },
  { name: 'R11', code: '#FFEBFA', rgb: [255, 235, 250] },
  { name: 'R12', code: '#D8D5CE', rgb: [216, 213, 206] },
  { name: 'R13', code: '#55514C', rgb: [85, 81, 76] },
  { name: 'R14', code: '#9FE4DF', rgb: [159, 228, 223] },
  { name: 'R15', code: '#77CEE9', rgb: [119, 206, 233] },
  { name: 'R16', code: '#3ECFCA', rgb: [62, 207, 202] },
  { name: 'R17', code: '#4A867A', rgb: [74, 134, 122] },
  { name: 'R18', code: '#7FCD9D', rgb: [127, 205, 157] },
  { name: 'R19', code: '#CDE55D', rgb: [205, 229, 93] },
  { name: 'R20', code: '#E8C7B4', rgb: [232, 199, 180] },
  { name: 'R21', code: '#AD6F3C', rgb: [173, 111, 60] },
  { name: 'R22', code: '#6C372F', rgb: [108, 55, 47] },
  { name: 'R23', code: '#FEB872', rgb: [254, 184, 114] },
  { name: 'R24', code: '#F3C1C0', rgb: [243, 193, 192] },
  { name: 'R25', code: '#C9675E', rgb: [201, 103, 94] },
  { name: 'R26', code: '#D293BE', rgb: [210, 147, 190] },
  { name: 'R27', code: '#EA8CB1', rgb: [234, 140, 177] },
  { name: 'R28', code: '#9C87D6', rgb: [156, 135, 214] },
  { name: 'T1', code: '#FFFFFF', rgb: [255, 255, 255] },
  { name: 'Y1', code: '#FD6FB4', rgb: [253, 111, 180] },
  { name: 'Y2', code: '#FEB481', rgb: [254, 180, 129] },
  { name: 'Y3', code: '#D7FAA0', rgb: [215, 250, 160] },
  { name: 'Y4', code: '#8BDBFA', rgb: [139, 219, 250] },
  { name: 'Y5', code: '#E987EA', rgb: [233, 135, 234] },
  { name: 'ZG1', code: '#DAABB3', rgb: [218, 171, 179] },
  { name: 'ZG2', code: '#D6AA87', rgb: [214, 170, 135] },
  { name: 'ZG3', code: '#C1BD8D', rgb: [193, 189, 141] },
  { name: 'ZG4', code: '#96869F', rgb: [150, 134, 159] },
  { name: 'ZG5', code: '#8490A6', rgb: [132, 144, 166] },
  { name: 'ZG6', code: '#94BFE2', rgb: [148, 191, 226] },
  { name: 'ZG7', code: '#E2A9D2', rgb: [226, 169, 210] },
  { name: 'ZG8', code: '#AB91C0', rgb: [171, 145, 192] },
]

/** 通过色号快速查色 */
const colorCodeMap = new Map(PINDOU_COLORS.map((c) => [c.code, c]))

/** RGB 转 CIE Lab */
export function rgbToLab(rgb) {
  let r = rgb[0] / 255
  let g = rgb[1] / 255
  let b = rgb[2] / 255

  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92

  let x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375
  let y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750
  let z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041

  const refX = 95.047; const refY = 100.0; const refZ = 108.883
  x /= refX; y /= refY; z /= refZ

  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(x); const fy = f(y); const fz = f(z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

// 匹配度量开关：true = CIE Lab ΔE 感知距离（观感更接近原图，默认）；
// false = RGB 欧氏距离最近邻（更快、更“机械”）。
const MATCH_USE_LAB = true

// 各色号预计算 CIE Lab，避免匹配时重复转换
const colorLabCache = new Map(PINDOU_COLORS.map((c) => [c.code, rgbToLab(c.rgb)]))

/**
 * 最近颜色匹配（默认 CIE Lab ΔE 感知距离；MATCH_USE_LAB=false 时为 RGB 欧氏距离）
 */
export function findNearestColor(rgb) {
  let minDistance = Infinity
  let nearestColor = PINDOU_COLORS[0]
  const lab1 = MATCH_USE_LAB ? rgbToLab(rgb) : null

  for (const color of PINDOU_COLORS) {
    let distance
    if (MATCH_USE_LAB) {
      const lab2 = colorLabCache.get(color.code)
      distance = Math.sqrt(
        Math.pow(lab1[0] - lab2[0], 2) +
        Math.pow(lab1[1] - lab2[1], 2) +
        Math.pow(lab1[2] - lab2[2], 2)
      )
    } else {
      const dr = color.rgb[0] - rgb[0]
      const dg = color.rgb[1] - rgb[1]
      const db = color.rgb[2] - rgb[2]
      distance = dr * dr + dg * dg + db * db
    }

    if (distance < minDistance) {
      minDistance = distance
      nearestColor = color
    }
  }

  return { ...nearestColor, distance: minDistance }
}

/** 计算颜色亮度（0-255） */
export function getBrightness(hexColor) {
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000
}

/** 高斯模糊降噪（3x3 核） */
export function applyGaussianBlur(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  const output = new Uint8ClampedArray(data.length)
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1]
  const kernelSum = 16

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let r = 0; let g = 0; let b = 0
      for (let ky = 0; ky < 3; ky++) {
        for (let kx = 0; kx < 3; kx++) {
          const idx = ((y + ky - 1) * width + (x + kx - 1)) * 4
          const weight = kernel[ky * 3 + kx]
          r += data[idx] * weight
          g += data[idx + 1] * weight
          b += data[idx + 2] * weight
        }
      }
      const idx = (y * width + x) * 4
      output[idx] = r / kernelSum
      output[idx + 1] = g / kernelSum
      output[idx + 2] = b / kernelSum
      output[idx + 3] = data[idx + 3]
    }
  }
  for (let i = 0; i < data.length; i++) output[i] = output[i] || data[i]
  imageData.data.set(output)
  ctx.putImageData(imageData, 0, 0)
}

/** 边缘增强（Laplacian 锐化核） */
export function applyEdgeEnhance(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  const output = new Uint8ClampedArray(data.length)
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0]

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let r = 0; let g = 0; let b = 0
      for (let ky = 0; ky < 3; ky++) {
        for (let kx = 0; kx < 3; kx++) {
          const idx = ((y + ky - 1) * width + (x + kx - 1)) * 4
          const weight = kernel[ky * 3 + kx]
          r += data[idx] * weight
          g += data[idx + 1] * weight
          b += data[idx + 2] * weight
        }
      }
      const idx = (y * width + x) * 4
      output[idx] = Math.max(0, Math.min(255, r))
      output[idx + 1] = Math.max(0, Math.min(255, g))
      output[idx + 2] = Math.max(0, Math.min(255, b))
      output[idx + 3] = data[idx + 3]
    }
  }
  for (let i = 0; i < data.length; i++) output[i] = output[i] || data[i]
  imageData.data.set(output)
  ctx.putImageData(imageData, 0, 0)
}

/** Floyd–Steinberg 抖动 */
export function applyDithering(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  const tempData = new Uint8ClampedArray(data)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const nearest = findNearestColor([tempData[idx], tempData[idx + 1], tempData[idx + 2]])

      const errR = tempData[idx] - nearest.rgb[0]
      const errG = tempData[idx + 1] - nearest.rgb[1]
      const errB = tempData[idx + 2] - nearest.rgb[2]

      data[idx] = nearest.rgb[0]
      data[idx + 1] = nearest.rgb[1]
      data[idx + 2] = nearest.rgb[2]

      const distribute = (px, py, factor) => {
        if (px >= 0 && px < width && py >= 0 && py < height) {
          const i = (py * width + px) * 4
          tempData[i] = Math.max(0, Math.min(255, tempData[i] + errR * factor))
          tempData[i + 1] = Math.max(0, Math.min(255, tempData[i + 1] + errG * factor))
          tempData[i + 2] = Math.max(0, Math.min(255, tempData[i + 2] + errB * factor))
        }
      }

      distribute(x + 1, y, 7 / 16)
      distribute(x - 1, y + 1, 3 / 16)
      distribute(x, y + 1, 5 / 16)
      distribute(x + 1, y + 1, 1 / 16)
    }
  }
  ctx.putImageData(imageData, 0, 0)
}

/**
 * 颜色量化：按使用频次保留前 N 色，其余像素归并到最近保留色
 * （默认不限色 = MARD 全色；归并度量与颜色匹配一致，默认 Lab）。
 */
export function quantizeColors(pixels, maxColors) {
  if (maxColors === 0 || maxColors >= pixels.length) return pixels

  const colorMap = new Map()
  pixels.forEach((p) => {
    const key = p.code || p.color
    colorMap.set(key, (colorMap.get(key) || 0) + 1)
  })
  if (maxColors >= colorMap.size) return pixels

  // 按频次降序取前 maxColors 个色号
  const topCodes = Array.from(colorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxColors)
    .map((e) => e[0])
  const topObjs = topCodes.map((code) => colorCodeMap.get(code)).filter(Boolean)
  if (!topObjs.length) return pixels

  // 其它色号归并到距离最近的保留色（度量与颜色匹配一致：默认 Lab，可切 RGB）
  const mapping = new Map()
  PINDOU_COLORS.forEach((color) => {
    if (topCodes.includes(color.code)) {
      mapping.set(color.code, color)
      return
    }
    let minDist = Infinity
    let bestMatch = topObjs[0]
    for (const tc of topObjs) {
      let dist
      if (MATCH_USE_LAB) {
        const la = colorLabCache.get(color.code)
        const lb = colorLabCache.get(tc.code)
        dist = Math.sqrt(Math.pow(la[0] - lb[0], 2) + Math.pow(la[1] - lb[1], 2) + Math.pow(la[2] - lb[2], 2))
      } else {
        const dr = tc.rgb[0] - color.rgb[0]
        const dg = tc.rgb[1] - color.rgb[1]
        const db = tc.rgb[2] - color.rgb[2]
        dist = dr * dr + dg * dg + db * db
      }
      if (dist < minDist) {
        minDist = dist
        bestMatch = tc
      }
    }
    mapping.set(color.code, bestMatch)
  })

  return pixels.map((p) => {
    const lookupKey = p.code || p.color
    const mapped = mapping.get(lookupKey)
    if (mapped && mapped.code !== lookupKey) {
      return { color: mapped.code, name: mapped.name, label: mapped.name, code: mapped.code, rgb: mapped.rgb }
    }
    return p
  })
}

/** 相似度（平均 ΔE 换算为百分比） */
export function calculateSimilarity(originalPixels, pindouPixels) {
  let totalDeltaE = 0
  for (let i = 0; i < originalPixels.length; i++) {
    const lab1 = rgbToLab(originalPixels[i])
    const lab2 = rgbToLab(pindouPixels[i].rgb)
    totalDeltaE += Math.sqrt(
      Math.pow(lab1[0] - lab2[0], 2) +
      Math.pow(lab1[1] - lab2[1], 2) +
      Math.pow(lab1[2] - lab2[2], 2)
    )
  }
  const avgDeltaE = totalDeltaE / originalPixels.length
  return Math.max(0, Math.min(100, Math.round(100 - (avgDeltaE / 12) * 100)))
}

/**
 * 将图片转换为拼豆图纸（核心算法入口）
 * @param {string} imageSrc 图片地址（dataURL / blob URL / 同源或允许跨域的 URL）
 * @param {number} size 网格基准尺寸
 * @param {object} options { edgeEnhance, denoise, dithering, brightnessBoost, maxColors }
 * @returns {Promise<object>} { pixels, colorPalette, totalPixels, colorCount, estimatedTime, originalImage, similarity, gridWidth, gridHeight }
 */
export function convertImageToPindou(imageSrc, size, options = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'Anonymous'

    img.onerror = () => reject(new Error('图片加载失败，请尝试其他图片'))

    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')

      const imgRatio = img.width / img.height
      let gridWidth, gridHeight
      if (imgRatio > 1) {
        gridWidth = size
        gridHeight = Math.round(size / imgRatio)
      } else {
        gridHeight = size
        gridWidth = Math.round(size * imgRatio)
      }
      gridWidth = Math.max(gridWidth, 8)
      gridHeight = Math.max(gridHeight, 8)

      const processWidth = Math.max(gridWidth, 128)
      const processHeight = Math.max(gridHeight, 128)
      canvas.width = processWidth
      canvas.height = processHeight

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, processWidth, processHeight)

      if (options.brightnessBoost) {
        const imageData = ctx.getImageData(0, 0, processWidth, processHeight)
        const data = imageData.data
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, data[i] * 1.08)
          data[i + 1] = Math.min(255, data[i + 1] * 1.08)
          data[i + 2] = Math.min(255, data[i + 2] * 1.08)
        }
        ctx.putImageData(imageData, 0, 0)
      }

      if (options.denoise) applyGaussianBlur(ctx, processWidth, processHeight)
      if (options.edgeEnhance) applyEdgeEnhance(ctx, processWidth, processHeight)

      const finalCanvas = document.createElement('canvas')
      const finalCtx = finalCanvas.getContext('2d')
      finalCanvas.width = gridWidth
      finalCanvas.height = gridHeight
      finalCtx.imageSmoothingEnabled = true
      finalCtx.imageSmoothingQuality = 'high'
      finalCtx.drawImage(canvas, 0, 0, gridWidth, gridHeight)

      if (options.dithering) applyDithering(finalCtx, gridWidth, gridHeight)

      const imageData = finalCtx.getImageData(0, 0, gridWidth, gridHeight)
      const pixels = []
      const originalPixels = []

      for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
          const index = (y * gridWidth + x) * 4
          const r = imageData.data[index]
          const g = imageData.data[index + 1]
          const b = imageData.data[index + 2]
          const a = imageData.data[index + 3]

          originalPixels.push([r, g, b])

          if (a < 128) {
            pixels.push({ color: '#FFFFFF', name: 'T1', label: 'T1', code: '#FFFFFF', rgb: [255, 255, 255] })
          } else {
            const nearest = findNearestColor([r, g, b])
            pixels.push({ color: nearest.code, name: nearest.name, label: nearest.name, code: nearest.code, rgb: nearest.rgb })
          }
        }
      }

      let quantizedPixels = pixels
      if (options.maxColors && options.maxColors > 0 && options.maxColors < pixels.length && options.maxColors < 256) {
        quantizedPixels = quantizeColors(pixels, options.maxColors)
      }

      const finalColors = new Map()
      quantizedPixels.forEach((p) => {
        if (!finalColors.has(p.color)) {
          finalColors.set(p.color, { code: p.color, name: p.label || p.name })
        }
      })

      const similarity = calculateSimilarity(originalPixels, quantizedPixels)

      resolve({
        pixels: quantizedPixels,
        colorPalette: Array.from(finalColors.values()),
        totalPixels: gridWidth * gridHeight,
        colorCount: finalColors.size,
        estimatedTime: `${Math.round((gridWidth * gridHeight) / 400)}小时`,
        originalImage: imageSrc,
        similarity,
        gridWidth,
        gridHeight,
      })
    }
    img.src = imageSrc
  })
}

/**
 * 内部：在已就绪的 ctx 上绘制拼豆网格（供展示 / 下载 / 导出复用）
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} result { gridWidth, gridHeight, pixels }
 * @param {object} [options] { pixelSize, labelSize, style, offsetX, offsetY }
 *   style 'blueprint'（默认，施工图纸 / 格子纸）：
 *     色块 + 格内色号标注 + 蓝色网格线 + 每 10 格粉色粗分隔线 + 行列编号；
 *   style 'pixel'：无缝纯色像素图，无格线无标注。
 */
function paintPatternGrid(ctx, result, { pixelSize = 18, labelSize = 28, style = 'blueprint', offsetX = 0, offsetY = 0 } = {}) {
  const { gridWidth: width, gridHeight: height, pixels } = result

  // ---- 纯像素图：无缝色块，无格线 / 无标注 ----
  if (style === 'pixel') {
    pixels.forEach((pixel, index) => {
      const x = (index % width) * pixelSize
      const y = Math.floor(index / width) * pixelSize
      ctx.fillStyle = pixel.color
      ctx.fillRect(x, y, pixelSize, pixelSize)
    })
    return
  }

  // ---- 施工图纸（格子纸样式：蓝网格 + 每10格粉色粗线 + 行列编号 + 色号）----
  const startX = offsetX + labelSize
  const startY = offsetY + labelSize
  const right = startX + width * pixelSize
  const bottom = startY + height * pixelSize

  // 色块
  pixels.forEach((pixel, index) => {
    const x = (index % width) * pixelSize + startX
    const y = Math.floor(index / width) * pixelSize + startY
    ctx.fillStyle = pixel.color
    ctx.fillRect(x, y, pixelSize, pixelSize)
  })

  // 格内色号标注：所有格子都标注色号，文字自动缩小以适应格子宽度（不再跳过任何格子）
  if (pixelSize >= 8) {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const maxTextWidth = pixelSize - 3
    pixels.forEach((pixel, index) => {
      const label = pixel.label || pixel.name || ''
      if (!label) return
      const x = (index % width) * pixelSize + startX
      const y = Math.floor(index / width) * pixelSize + startY
      // 从尽量大的字号起逐级缩小，直到能放进格子（保底 5px，保证每个格子都有标注）
      let fontSize = Math.max(9, Math.round(pixelSize * 0.5))
      ctx.font = `bold ${fontSize}px Arial`
      while (fontSize > 5 && ctx.measureText(label).width > maxTextWidth) {
        fontSize -= 1
        ctx.font = `bold ${fontSize}px Arial`
      }
      const brightness = getBrightness(pixel.color)
      ctx.fillStyle = brightness > 128 ? '#333333' : '#ffffff'
      ctx.fillText(label, x + pixelSize / 2, y + pixelSize / 2)
    })
  }

  // 蓝色网格线（BLUE = rgb(100,140,220)）
  ctx.strokeStyle = 'rgb(100,140,220)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i <= width; i++) {
    const lx = startX + i * pixelSize
    ctx.moveTo(lx, startY)
    ctx.lineTo(lx, bottom)
  }
  for (let i = 0; i <= height; i++) {
    const ly = startY + i * pixelSize
    ctx.moveTo(startX, ly)
    ctx.lineTo(right, ly)
  }
  ctx.stroke()

  // 每 10 格粉色粗分隔线（PINK = rgb(240,160,180)）
  ctx.strokeStyle = 'rgb(240,160,180)'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let i = 0; i <= width; i += 10) {
    const lx = startX + i * pixelSize
    ctx.moveTo(lx, startY)
    ctx.lineTo(lx, bottom)
  }
  for (let i = 0; i <= height; i += 10) {
    const ly = startY + i * pixelSize
    ctx.moveTo(startX, ly)
    ctx.lineTo(right, ly)
  }
  ctx.stroke()

  // 行列编号
  ctx.fillStyle = '#555555'
  ctx.font = `${Math.max(9, Math.round(labelSize * 0.36))}px Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < width; i++) {
    ctx.fillText(String(i + 1), startX + i * pixelSize + pixelSize / 2, offsetY + labelSize / 2)
  }
  for (let i = 0; i < height; i++) {
    ctx.fillText(String(i + 1), offsetX + labelSize / 2, startY + i * pixelSize + pixelSize / 2)
  }
}

/**
 * 在 canvas 上绘制拼豆图纸
 * @param {HTMLCanvasElement} canvas
 * @param {object} result { gridWidth, gridHeight, pixels }
 * @param {object} [options] { pixelSize=18, labelSize=28, style='blueprint'|'pixel' }
 *   - 'blueprint'（默认）：施工图纸 / 格子纸样式（蓝网格 + 每10格粉色线 + 色号 + 行列编号）
 *   - 'pixel'：纯像素图（无格线、无标注），用于“只下载/保存像素图”
 */
export function drawPatternToCanvas(canvas, result, { pixelSize = 18, labelSize = 28, style = 'blueprint' } = {}) {
  const { gridWidth: width, gridHeight: height } = result
  const ctx = canvas.getContext('2d')

  if (style === 'pixel') {
    canvas.width = width * pixelSize
    canvas.height = height * pixelSize
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    paintPatternGrid(ctx, result, { pixelSize, style: 'pixel' })
    return canvas
  }

  canvas.width = width * pixelSize + labelSize
  canvas.height = height * pixelSize + labelSize
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  paintPatternGrid(ctx, result, { pixelSize, labelSize, style: 'blueprint' })
  return canvas
}

/** 下载施工图纸（默认格子纸样式；style='pixel' 时只导出纯像素图） */
export function downloadDesign(result, { pixelSize = 18, labelSize = 28, style = 'blueprint' } = {}) {
  const { gridWidth: width, gridHeight: height, colorPalette } = result

  const gridBottom = height * pixelSize + labelSize

  // 纯像素图：只下载像素图本身，不含配色表
  if (style === 'pixel') {
    const canvas = document.createElement('canvas')
    drawPatternToCanvas(canvas, result, { pixelSize, style: 'pixel' })
    const link = document.createElement('a')
    link.download = `pindou-pixel-${Date.now()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    return
  }

  const paletteRows = Math.ceil(colorPalette.length / 8)
  const paletteHeight = paletteRows * 30 + 40

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  const canvasWidth = width * pixelSize + labelSize + 20
  const canvasHeight = height * pixelSize + labelSize + paletteHeight + 20
  canvas.width = canvasWidth
  canvas.height = canvasHeight

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  // 格子纸（蓝图）区域
  paintPatternGrid(ctx, result, { pixelSize, labelSize, style: 'blueprint' })

  ctx.fillStyle = '#333'
  ctx.font = 'bold 14px Arial'
  ctx.textAlign = 'center'
  ctx.fillText(`拼豆图纸 ${width}×${height}`, canvasWidth / 2, gridBottom + 15)

  ctx.fillStyle = '#333'
  ctx.font = 'bold 12px Arial'
  ctx.textAlign = 'left'
  ctx.fillText('🎯 配色方案:', 10, gridBottom + 45)

  colorPalette.forEach((color, index) => {
    const row = Math.floor(index / 8)
    const col = index % 8
    const boxX = 10 + col * 80
    const boxY = gridBottom + 60 + row * 28
    ctx.fillStyle = color.code
    ctx.fillRect(boxX, boxY, 20, 20)
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 1
    ctx.strokeRect(boxX, boxY, 20, 20)
    ctx.fillStyle = '#333'
    ctx.font = '11px Arial'
    ctx.textAlign = 'left'
    ctx.fillText(color.name, boxX + 25, boxY + 15)
  })

  const statsY = gridBottom + 60 + paletteRows * 30 + 10
  ctx.fillStyle = '#666'
  ctx.font = '11px Arial'
  ctx.textAlign = 'center'
  ctx.fillText(
    `总豆豆数: ${result.totalPixels} | 颜色种类: ${result.colorCount} | 相似度: ${result.similarity}%`,
    canvasWidth / 2,
    statsY
  )

  const link = document.createElement('a')
  link.download = `pindou-design-${Date.now()}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

/** 下载纯像素图（无格线、无标注） */
export function downloadPixelOnly(result, { cellSize = 18 } = {}) {
  if (!result) return
  const canvas = document.createElement('canvas')
  drawPatternToCanvas(canvas, result, { pixelSize: cellSize, style: 'pixel' })
  const link = document.createElement('a')
  link.download = `pindou-pixel-${Date.now()}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

/** 下载网格圆点图（贴纸风格） */
export function downloadPattern(result, gridSize = 24) {
  const size = gridSize
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  canvas.width = size * 20
  canvas.height = size * 20

  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 1

  for (let i = 0; i <= size; i++) {
    ctx.beginPath()
    ctx.moveTo(i * 20, 0)
    ctx.lineTo(i * 20, canvas.height)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i * 20)
    ctx.lineTo(canvas.width, i * 20)
    ctx.stroke()
  }

  ctx.fillStyle = '#000000'
  ctx.font = 'bold 10px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < size; i++) {
    ctx.fillText(String(i + 1), i * 20 + 10, 10)
    ctx.fillText(String(i + 1), 10, i * 20 + 10)
  }

  result.pixels.forEach((pixel, index) => {
    const x = (index % size) * 20 + 2
    const y = Math.floor(index / size) * 20 + 2
    ctx.fillStyle = pixel.color
    ctx.beginPath()
    ctx.arc(x + 8, y + 8, 7, 0, Math.PI * 2)
    ctx.fill()
  })

  const link = document.createElement('a')
  link.download = `pindou-pattern-${Date.now()}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

/** 将像素结果序列化为紧凑字符串（用于存储/传输），如 "A1,B2,A1,..." */
export function serializePixels(pixels) {
  return pixels.map((p) => p.code || p.color).join(',')
}

/** 从紧凑字符串还原像素对象（需配合 palette） */
export function deserializePixels(codeString, palette = []) {
  const paletteMap = new Map(palette.map((p) => [p.code, p]))
  return String(codeString || '')
    .split(',')
    .filter(Boolean)
    .map((code) => {
      const base = paletteMap.get(code) || colorCodeMap.get(code)
      if (!base) return { color: '#FFFFFF', name: 'T1', label: 'T1', code: '#FFFFFF', rgb: [255, 255, 255] }
      return { color: base.code, name: base.name, label: base.name, code: base.code, rgb: base.rgb }
    })
}

export default {
  PINDOU_COLORS,
  rgbToLab,
  findNearestColor,
  getBrightness,
  applyGaussianBlur,
  applyEdgeEnhance,
  applyDithering,
  quantizeColors,
  calculateSimilarity,
  convertImageToPindou,
  drawPatternToCanvas,
  downloadDesign,
  downloadPixelOnly,
  downloadPattern,
  serializePixels,
  deserializePixels,
}
